/**
 * Context loader for the AI chat.
 *
 * Runs server-side on every /api/ai/chat request. Queries the app's own
 * RecordRoom DO for the current project state, under the caller's userId
 * so RBAC still applies. The result is passed to buildLatexSystemPrompt
 * which bakes it into the system prompt for this turn.
 *
 * Cheap: queries hit the DO's in-memory SQLite. No caching — state
 * must reflect the user's latest edits and compile runs.
 */

import { makeScopeId } from '../constants'

export interface ProjectFileSummary {
  recordId: string
  path: string
  fileType: string
  size: number
  isEntryFile: boolean
  /** Full plain content. Set on active file (possibly truncated) and undefined otherwise. */
  content?: string
  /** True iff `content` was truncated due to size. */
  truncated?: boolean
}

export interface CompileErrorSummary {
  message: string
  line?: number
  file?: string
}

export interface ChatContext {
  documentId: string
  activeFilePath: string | null
  files: ProjectFileSummary[]
  /** Last compile was a failure — these are its errors. Undefined if last compile succeeded or never ran. */
  recentErrors?: CompileErrorSummary[]
  /** How many seconds ago the last compile ran, if any. */
  lastCompileAgeSec?: number
  /**
   * Set when the projectFiles query failed (e.g. RBAC rejection, transient
   * DO error). When set, `files` is `[]` but the project is NOT empty — the
   * system prompt must block mutations to prevent clobbering real files.
   */
  filesLoadError?: string
}

const MAX_ACTIVE_FILE_BYTES = 80_000 // ~20K tokens of English; fine for LaTeX
const TRUNC_HEAD_BYTES = 40_000
const TRUNC_TAIL_BYTES = 10_000
const RECENT_COMPILE_WINDOW_SEC = 30 * 60 // 30 min — anything older isn't "recent"
const MAX_ERRORS_IN_PROMPT = 5

export interface ContextLoaderEnv {
  APP_NAME: string
  RECORD_ROOMS: DurableObjectNamespace
}

/**
 * Call the RecordRoom DO's tools endpoint with the caller's userId so RBAC
 * is enforced. Mirrors the chat tool executor — using the same transport for
 * both means we share the same auth model and the same bug surface.
 *
 * userId travels in the X-User-Id header (post-0.3.x SDK contract). Sending
 * it in the body — as we did during the 0.3.10 migration — silently routed
 * every call as anonymous and made RBAC return zero rows.
 */
async function callTool(
  env: ContextLoaderEnv,
  userId: string,
  tool: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const scopeId = makeScopeId(env.APP_NAME)
  const doId = env.RECORD_ROOMS.idFromName(scopeId)
  const stub = env.RECORD_ROOMS.get(doId)
  const res = await stub.fetch(new Request('https://internal/api/tools/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
    },
    body: JSON.stringify({ tool, params }),
  }))
  return res.json() as Promise<{ success: boolean; data?: unknown; error?: string }>
}

interface ProjectFileRecord {
  recordId: string
  data: {
    documentId?: string
    path?: string
    fileType?: string
    plainContent?: string
    isEntryFile?: number | boolean
    deletedAt?: number | null
  }
}

interface CompilationLogRecord {
  recordId: string
  data: {
    documentId?: string
    errorsCount?: number
    parsedErrors?: string
    compiledAt?: number
    compiled?: number | boolean
  }
}

export async function loadContext(
  env: ContextLoaderEnv,
  userId: string,
  documentId: string,
  activeFilePath: string | null,
  /**
   * Override for the active file's content — when provided, used in place of
   * the DB copy. The client passes its live editor buffer here so the agent
   * sees what's on the user's screen RIGHT NOW, not the debounced-synced DB
   * copy (which can lag by up to 2s and cause clobber). Only applied to the
   * active file; non-active files still come from the DB.
   */
  activeFileContentOverride?: string,
): Promise<ChatContext> {
  // --- Project files -------------------------------------------------------
  const filesRes = await callTool(env, userId, 'records.query', {
    collection: 'projectFiles',
    where: { documentId },
    limit: 500,
  })

  // Distinguish "query succeeded, no files" from "query failed, we don't
  // know what's there." The latter must block mutations — otherwise the
  // agent sees an empty file list and confidently creates files that
  // already exist, clobbering user work via agentEdits.
  let filesLoadError: string | undefined
  if (!filesRes.success) {
    filesLoadError = filesRes.error || 'projectFiles query failed'
    console.error('[loadContext] projectFiles query failed:', filesLoadError)
  }

  const rawFiles = extractRecords<ProjectFileRecord>(filesRes)
  const liveFiles = rawFiles.filter((r) => !r.data.deletedAt)

  // Diagnostic surface for "AI confidently claimed the project is empty"
  // bug reports. We can't tail logs from the SDK surface, but Cloudflare
  // captures console output and the user can also relay this if asked.
  if (liveFiles.length === 0 && !filesLoadError) {
    console.error('[loadContext] zero-files snapshot', {
      userId,
      documentId,
      activeFilePath,
      rawRecordCount: rawFiles.length,
      // rawRecordCount > 0 + liveFiles == 0 means everything was soft-deleted.
      // rawRecordCount == 0 means either truly empty OR RBAC silently filtered
      // (read:'own' returning [] when createdBy doesn't match userId).
    })
  }

  // Pick which file's content to inline. Prefer the client-declared active
  // file; fall back to the entry file; if neither exists, skip.
  const active = activeFilePath
    ? liveFiles.find((f) => f.data.path === activeFilePath)
    : liveFiles.find((f) => !!f.data.isEntryFile)

  const files: ProjectFileSummary[] = liveFiles.map((f) => {
    const isActive = active && f.recordId === active.recordId
    // Prefer the client's live editor buffer for the active file — it's what
    // the user is looking at RIGHT NOW. The DB copy may lag by up to 2s.
    const content = (isActive && activeFileContentOverride !== undefined)
      ? activeFileContentOverride
      : (f.data.plainContent ?? '')
    const base: ProjectFileSummary = {
      recordId: f.recordId,
      path: f.data.path ?? '(unknown)',
      fileType: f.data.fileType ?? '',
      size: content.length,
      isEntryFile: !!f.data.isEntryFile,
    }
    if (isActive) {
      const { body, truncated } = truncate(content)
      base.content = body
      if (truncated) base.truncated = true
    }
    return base
  })

  // --- Latest compile log --------------------------------------------------
  const logsRes = await callTool(env, userId, 'records.query', {
    collection: 'compilationLogs',
    where: { documentId },
    orderBy: 'compiledAt',
    orderDir: 'desc',
    limit: 1,
  })
  const logs = extractRecords<CompilationLogRecord>(logsRes)
  const latest = logs[0]

  let recentErrors: CompileErrorSummary[] | undefined
  let lastCompileAgeSec: number | undefined
  if (latest) {
    const compiledAt = typeof latest.data.compiledAt === 'number' ? latest.data.compiledAt : 0
    if (compiledAt > 0) {
      lastCompileAgeSec = Math.round((Date.now() - compiledAt) / 1000)
    }
    const failed = (latest.data.errorsCount ?? 0) > 0 || !latest.data.compiled
    const recent = lastCompileAgeSec !== undefined && lastCompileAgeSec < RECENT_COMPILE_WINDOW_SEC
    if (failed && recent) {
      recentErrors = parseErrors(latest.data.parsedErrors).slice(0, MAX_ERRORS_IN_PROMPT)
    }
  }

  return {
    documentId,
    activeFilePath: active?.data.path ?? null,
    files,
    recentErrors,
    lastCompileAgeSec,
    filesLoadError,
  }
}

// ---------------------------------------------------------------------------

function truncate(content: string): { body: string; truncated: boolean } {
  if (content.length <= MAX_ACTIVE_FILE_BYTES) return { body: content, truncated: false }
  const head = content.slice(0, TRUNC_HEAD_BYTES)
  const tail = content.slice(content.length - TRUNC_TAIL_BYTES)
  return {
    body: `${head}\n\n…[truncated ${content.length - TRUNC_HEAD_BYTES - TRUNC_TAIL_BYTES} bytes — call records_get for the full file]…\n\n${tail}`,
    truncated: true,
  }
}

function extractRecords<T>(res: { success: boolean; data?: unknown }): T[] {
  if (!res.success || !res.data) return []
  const data = res.data as { records?: T[] }
  return Array.isArray(data.records) ? data.records : []
}

function parseErrors(raw: string | undefined): CompileErrorSummary[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Array<{ message?: string; line?: number; file?: string }>
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e) => typeof e.message === 'string')
      .map((e) => ({
        message: e.message as string,
        ...(typeof e.line === 'number' ? { line: e.line } : {}),
        ...(typeof e.file === 'string' ? { file: e.file } : {}),
      }))
  } catch {
    return []
  }
}
