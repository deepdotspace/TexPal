/**
 * App Worker — Hono-based Cloudflare Worker for DeepSpace apps.
 *
 * Each app owns its RecordRoom DOs. Schemas are baked in at deploy time.
 *
 * Handles:
 *   - WebSocket → app's own RecordRoom DO (real-time data)
 *   - Auth proxy → auth-worker (same-origin cookies)
 *   - Integration proxy → api-worker (LLM, search, etc.)
 *   - AI chat (Vercel AI SDK + DeepSpace proxy)
 *   - Server actions (app-defined, bypass user RBAC)
 *   - Scoped R2 file storage
 *   - Scheduled cron tasks (CronRoom DO alarm)
 *   - Static asset serving with SPA fallback
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  verifyJwt,
  createDeepSpaceAI,
  capToolResultSize,
  apiWorkerFetch,
  authWorkerFetch,
} from 'deepspace/worker'
import type { JwtVerifierConfig, VerifyResult } from 'deepspace/worker'
import {
  RecordRoom as RecordRoomBase,
  YjsRoom as YjsRoomBase,
  CanvasRoom as CanvasRoomBase,
  PresenceRoom as PresenceRoomBase,
  CronRoom as CronRoomBase,
} from 'deepspace/worker'
import type { ActionTools, ActionResult, DOManifest, DOBindings } from 'deepspace/worker'
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from 'ai'
import { actions } from './src/actions/index.js'
import { tasks as cronTasks, runTask as runCronTask } from './src/cron.js'
import { schemas } from './src/schemas.js'
import { integrations } from './src/integrations.js'
import { buildChatTools } from './src/ai/tools.js'
import { buildLatexSystemPrompt } from './src/ai/latex-prompt.js'
import { loadContext } from './src/ai/context.js'
import { resolveModel } from './src/ai/models.js'
import { makeScopeId } from './src/constants.js'

// =============================================================================
// DO Manifest — declares all Durable Objects for dynamic deploy bindings
// =============================================================================

export const __DO_MANIFEST__ = [
  { binding: 'RECORD_ROOMS', className: 'RecordRoom', sqlite: true },
  { binding: 'YJS_ROOMS', className: 'YjsRoom', sqlite: true },
  { binding: 'CANVAS_ROOMS', className: 'CanvasRoom', sqlite: true },
  { binding: 'PRESENCE_ROOMS', className: 'PresenceRoom', sqlite: true },
  { binding: 'CRON_ROOMS', className: 'CronRoom', sqlite: true },
] as const satisfies DOManifest

// =============================================================================
// Durable Objects — extend to customize behavior
// =============================================================================

export class RecordRoom extends RecordRoomBase {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, schemas, { ownerUserId: env.OWNER_USER_ID })
  }
}

export class YjsRoom extends YjsRoomBase {}
export class CanvasRoom extends CanvasRoomBase {}
export class PresenceRoom extends PresenceRoomBase {}

/**
 * CronRoom — runs the scheduled tasks declared in src/cron.ts. The DO alarm
 * fires at each task's interval / cron-expression match, calls onTask(name),
 * and records the execution in its own cron_history table.
 */
export class CronRoom extends CronRoomBase<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, { tasks: cronTasks })
  }

  protected async onTask(taskName: string): Promise<void> {
    await runCronTask(taskName, this.env)
  }
}

// =============================================================================
// Types
// =============================================================================

interface Env extends DOBindings<typeof __DO_MANIFEST__> {
  ASSETS: Fetcher
  FILES: R2Bucket
  PLATFORM_WORKER: Fetcher
  APP_IDENTITY_TOKEN: string
  API_WORKER: Fetcher
  AUTH_JWT_PUBLIC_KEY: string
  AUTH_JWT_ISSUER: string
  AUTH_WORKER_URL: string
  APP_NAME: string
  ALLOW_DEBUG_ROUTES?: string
  DEEPSPACE_APP_ID: string
  OWNER_USER_ID: string
  /**
   * Long-lived JWT minted for the app owner at deploy time. Server-side
   * code (actions, cron, AI helpers) uses this to authenticate to the
   * api-worker for developer-billed calls — the owner is billed because
   * they are the JWT subject.
   */
  APP_OWNER_JWT: string
}

type AppContext = { Bindings: Env }

// =============================================================================
// App
// =============================================================================

const app = new Hono<AppContext>()
app.use('/api/*', cors())

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function jwtConfig(env: Env): JwtVerifierConfig {
  return { publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER }
}

async function resolveAuth(
  req: Request,
  env: Env,
): Promise<{ result: VerifyResult; token: string } | null> {
  const header = req.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const { result } = await verifyJwt(jwtConfig(env), token)
  if (!result) return null
  return { result, token }
}

// ---------------------------------------------------------------------------
// Social OAuth redirect + code exchange
// ---------------------------------------------------------------------------

app.get('/api/auth/social-redirect', (c) => {
  const provider = c.req.query('provider')
  if (!provider) return c.json({ error: 'Missing provider' }, 400)

  const appOrigin = new URL(c.req.url).origin
  const authOrigin = new URL(c.env.AUTH_WORKER_URL).origin

  return c.redirect(
    `${authOrigin}/login/social?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent(appOrigin)}`,
  )
})

app.get('/api/auth/oauth-complete', async (c) => {
  const code = c.req.query('code')
  const appOrigin = new URL(c.req.url).origin

  if (!code) return c.redirect(appOrigin)

  const res = await fetch(`${c.env.AUTH_WORKER_URL}/api/auth/exchange-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  if (!res.ok) return c.redirect(appOrigin)
  const data = (await res.json()) as { sessionToken?: string }
  if (!data.sessionToken) return c.redirect(appOrigin)
  const sessionToken = data.sessionToken

  return new Response(null, {
    status: 302,
    headers: {
      Location: appOrigin,
      'Set-Cookie': `__Secure-better-auth.session_token=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    },
  })
})

// ---------------------------------------------------------------------------
app.all('/api/auth/sign-out', async (c) => {
  try {
    await authWorkerFetch(c.env, '/api/auth/sign-out', {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
    })
  } catch {
    // Always expire the app-scoped cookie, even if auth-worker is unavailable.
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': '__Secure-better-auth.session_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
  })
})

// ---------------------------------------------------------------------------
// Auth proxy → auth-worker (same-origin cookies)
// ---------------------------------------------------------------------------

app.all('/api/auth/*', async (c) => {
  const url = new URL(c.req.url)
  const authUrl = new URL(url.pathname + url.search, c.env.AUTH_WORKER_URL)
  const res = await fetch(authUrl.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })
  const headers = new Headers(res.headers)
  const setCookie = headers.get('set-cookie')
  if (setCookie) {
    headers.set('set-cookie', setCookie.replace(/;\s*Domain=[^;]*/gi, ''))
  }
  return new Response(res.body, { status: res.status, headers })
})

// ---------------------------------------------------------------------------
// Debug routes are available only when explicitly enabled. Their Durable
// Object handlers are unauthenticated, so production remains closed by default.
app.all('/api/debug/*', async (c) => {
  if (c.env.ALLOW_DEBUG_ROUTES !== 'true') return c.notFound()
  const stub = c.env.RECORD_ROOMS.get(c.env.RECORD_ROOMS.idFromName(`app:${c.env.APP_NAME}`))
  return stub.fetch(c.req.raw)
})

// ---------------------------------------------------------------------------
// Integrations proxy → api-worker
// ---------------------------------------------------------------------------

app.get('/api/integrations', async (c) => {
  try {
    const res = await c.env.API_WORKER.fetch('https://api-worker/api/integrations')
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Failed to fetch integration catalog' }, 502)
  }
})

// OAuth connection management is always user-billed.
app.get('/api/integrations/status', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth) return c.json({ error: 'Sign in required' }, 401)
  const token = c.req.header('Authorization')?.slice(7)
  try {
    const res = await apiWorkerFetch(c.env, '/api/integrations/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Status proxy failed' }, 502)
  }
})

app.delete('/api/integrations/oauth/:provider/disconnect', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth) return c.json({ error: 'Sign in required' }, 401)
  const token = c.req.header('Authorization')?.slice(7)
  const provider = c.req.param('provider')
  try {
    const res = await apiWorkerFetch(
      c.env,
      `/api/integrations/oauth/${encodeURIComponent(provider)}/disconnect`,
      {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    )
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Disconnect proxy failed' }, 502)
  }
})

app.all('/api/integrations/:name/:endpoint', async (c) => {
  const integrationName = c.req.param('name')
  const billingMode = integrations[integrationName]?.billing ?? 'developer'

  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth && billingMode === 'user') {
    return c.json({ error: 'Sign in required for this integration' }, 401)
  }

  const target = `/api/integrations/${integrationName}/${c.req.param('endpoint')}`

  const headers: Record<string, string> = {
    'Content-Type': c.req.header('Content-Type') ?? 'application/json',
  }

  // Pick the JWT whose subject is the user we want billed:
  //   - developer-billed → the app owner (via APP_OWNER_JWT)
  //   - user-billed      → the caller (forward their verified Bearer token)
  // The api-worker bills the JWT subject; it does not accept any
  // client-supplied billing override.
  if (billingMode === 'developer') {
    headers['Authorization'] = `Bearer ${c.env.APP_OWNER_JWT}`
  } else if (auth) {
    headers['Authorization'] = `Bearer ${auth.token}`
  }

  const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD'
  const body = hasBody ? await c.req.text() : undefined

  try {
    const res = await c.env.API_WORKER.fetch(`https://api-worker${target}`, {
      method: c.req.method,
      headers,
      body,
    })
    return new Response(res.body, { status: res.status, headers: res.headers })
  } catch {
    return c.json({ error: 'Integration proxy failed' }, 502)
  }
})

// ---------------------------------------------------------------------------
// WebSocket routes
// ---------------------------------------------------------------------------

function wsRoute(
  doNamespace: (env: Env) => DurableObjectNamespace,
  extraParams?: (auth: VerifyResult) => Record<string, string>,
) {
  return async (c: any) => {
    const id = c.req.param('roomId') ?? c.req.param('docId') ?? c.req.param('scopeId')
    const url = new URL(c.req.url)
    const token = url.searchParams.get('token')
    const auth = token ? (await verifyJwt(jwtConfig(c.env), token)).result : null

    const doUrl = new URL(c.req.url)
    if (auth) {
      doUrl.searchParams.set('userId', auth.userId)
      if (extraParams) {
        for (const [k, v] of Object.entries(extraParams(auth))) {
          doUrl.searchParams.set(k, v)
        }
      }
    }
    doUrl.searchParams.delete('token')

    const ns = doNamespace(c.env)
    const stub = ns.get(ns.idFromName(id))
    return stub.fetch(new Request(doUrl.toString(), c.req.raw))
  }
}

app.get('/ws/:roomId', wsRoute((env) => env.RECORD_ROOMS))

app.get('/ws/yjs/:docId', wsRoute((env) => env.YJS_ROOMS, () => ({ role: 'member' })))

app.get('/ws/canvas/:docId', wsRoute((env) => env.CANVAS_ROOMS, () => ({ role: 'member' })))

app.get('/ws/presence/:scopeId', wsRoute(
  (env) => env.PRESENCE_ROOMS,
  (auth) => ({
    ...(auth.claims.name ? { userName: auth.claims.name } : {}),
    ...(auth.claims.email ? { userEmail: auth.claims.email } : {}),
    ...(auth.claims.image ? { userImageUrl: auth.claims.image } : {}),
  }),
))

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

app.post('/api/actions/:name', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  const name = c.req.param('name')
  const action = actions[name]
  if (!action) return c.json({ error: 'Action not found' }, 404)
  const params = await c.req.json<Record<string, unknown>>()
  const tools = createActionTools(c.env, auth.result.userId, auth.token)
  const result = await action({
    userId: auth.result.userId,
    params,
    tools,
    env: c.env as unknown as Record<string, unknown>,
    callerJwt: auth.token,
  })
  return c.json(result as unknown as Record<string, unknown>)
})

// ---------------------------------------------------------------------------
// AI chat — multi-turn tool-use via Vercel AI SDK + DeepSpace proxy
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Context-management helpers for /api/ai/chat
// ---------------------------------------------------------------------------

/**
 * Keep full tool calls and results for this many most-recent messages. AI SDK
 * v5's pruneMessages removes older tool payloads without leaving orphaned
 * call/result pairs. The agent can always re-fetch data it still needs.
 */
const KEEP_RECENT_TOOL_RESULTS = 5

/**
 * Hard cap on total message-history character count before sliding-window
 * trimming kicks in. ~4 chars per token × 240K chars ≈ 60K input tokens from
 * history alone. Well under every supported model's context window.
 */
const HISTORY_CHAR_CAP = 240_000

/**
 * Don't trim below this many messages — preserves a floor of recent context
 * even if a single turn blew past the cap.
 */
const MIN_KEPT_MESSAGES = 10

function capModelMessageHistory(
  messages: ModelMessage[],
  charCap: number,
  minKept: number,
): ModelMessage[] {
  let chars = 0
  let start = messages.length

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    chars += JSON.stringify(messages[i]).length
    start = i
    if (chars > charCap && messages.length - i >= minKept) break
  }

  if (start === 0) return messages

  // Start at a complete user turn so the retained history never begins with
  // an assistant/tool continuation whose matching user request was trimmed.
  while (start < messages.length && messages[start]?.role !== 'user') start += 1
  return start < messages.length ? messages.slice(start) : messages.slice(-minKept)
}

/**
 * Max bytes of a single tool invocation's result that we'll hand back to the
 * model. A records.query with no `where` can easily return hundreds of KB;
 * feeding that into the next step's prompt destroys the context budget and
 * slows every subsequent turn. When exceeded, we return a truncation marker
 * with guidance to narrow the query.
 */
const TOOL_RESULT_BYTE_CAP = 30_000

/**
 * When the agent creates an agentEdits row with action="update", we look up
 * the target projectFiles record and snapshot its current agentRevision as
 * `baseAgentRevision` on the edit. The processor compares this against the
 * live revision at apply time; a mismatch means something wrote to the file
 * between the agent reading and the agent applying, and the edit is
 * rejected as a conflict rather than clobbering.
 *
 * This is a best-effort interception — if the lookup fails (e.g. file not
 * found by path), we let the edit through without a base; the processor's
 * existing "file not found" branch handles that case.
 */
async function maybeInjectAgentEditRevision(
  toolName: string,
  params: Record<string, unknown>,
  exec: (t: string, p: Record<string, unknown>) => Promise<unknown>,
): Promise<Record<string, unknown>> {
  if (toolName !== 'records.create') return params
  const collection = params.collection
  const data = params.data as Record<string, unknown> | undefined
  if (collection !== 'agentEdits' || !data) return params
  if (data.action !== 'update') return params
  if (typeof data.filePath !== 'string' || typeof data.documentId !== 'string') return params
  if ('baseAgentRevision' in data) return params

  const query = (await exec('records.query', {
    collection: 'projectFiles',
    where: { documentId: data.documentId },
    limit: 500,
  })) as { success?: boolean; data?: { records?: Array<{ data: { path?: string; agentRevision?: number; deletedAt?: number } }> } }

  if (!query.success || !query.data?.records) return params
  const normalized = data.filePath.replace(/\\/g, '/').split('/').filter(Boolean).join('/')
  const match = query.data.records.find((r) => {
    const p = (r.data.path ?? '').replace(/\\/g, '/').split('/').filter(Boolean).join('/')
    return p === normalized && !r.data.deletedAt
  })
  if (!match) return params

  return {
    ...params,
    data: { ...data, baseAgentRevision: String(match.data.agentRevision ?? 0) },
  }
}

// ---------------------------------------------------------------------------

app.post('/api/ai/chat', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  // The client passes documentId + activeFilePath + the LIVE buffer of the
  // active file so the worker can inject fresh project state into the system
  // prompt each turn. Sending activeFileContent from the client bypasses the
  // ~2s debounce on plainContent writes — the agent sees what's on screen
  // right now, not a stale DB copy. See docs/ai-chat/architecture.md.
  const body = await c.req.json<{
    messages: UIMessage[]
    documentId?: string
    activeFilePath?: string | null
    activeFileContent?: string | null
    modelId?: string | null
  }>()
  const { messages: rawMessages, documentId, activeFilePath, activeFileContent, modelId } = body
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return c.json({ error: 'messages array is required' }, 400)
  }
  if (!documentId || typeof documentId !== 'string') {
    return c.json({ error: 'documentId is required in the request body' }, 400)
  }

  // Validate modelId against the catalog. Never pass a raw client string to
  // the provider — could be a malicious or nonexistent id. The resolved model
  // also carries the provider name, so we route to the right DeepSpace AI
  // factory below.
  const resolvedModel = resolveModel(modelId)

  // Load project state under the caller's RBAC. Fresh per turn — no caching.
  const context = await loadContext(
    c.env,
    auth.result.userId,
    documentId,
    activeFilePath ?? null,
    typeof activeFileContent === 'string' ? activeFileContent : undefined,
  )

  // Provider picked from the resolved model — one of anthropic / openai /
  // cerebras. All three route through the DeepSpace proxy and bill the JWT
  // subject, so per-user billing is unchanged regardless of choice.
  const providerFactory = createDeepSpaceAI(c.env, resolvedModel.provider, { authToken: auth.token })

  // Tools execute against the app's RecordRoom DO. Scope matches the
  // frontend's <RecordScope roomId={SCOPE_ID}> so agent-created records
  // appear in the user's live useQuery subscription.
  const scopeId = makeScopeId(c.env.APP_NAME)
  const callerUserId = auth.result.userId

  async function execTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const doId = c.env.RECORD_ROOMS.idFromName(scopeId)
    const stub = c.env.RECORD_ROOMS.get(doId)
    // Identity travels in the X-User-Id header — the DO's tool executor reads
    // it from there to match the WS / /api/* identity-strip security model.
    // Putting it in the body silently degrades to anonymous and RBAC returns
    // nothing.
    const res = await stub.fetch(new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': callerUserId,
      },
      body: JSON.stringify({ tool: toolName, params }),
    }))
    return res.json()
  }

  const tools = buildChatTools(async (toolName, params) => {
    const augmented = await maybeInjectAgentEditRevision(toolName, params, execTool)
    const payload = await execTool(toolName, augmented)
    return capToolResultSize(payload, TOOL_RESULT_BYTE_CAP)
  })

  // Context management: strip bulky tool result payloads from old turns,
  // then apply a sliding-window safety cap. Both are no-ops on short
  // sessions; kick in on long ones to keep cost bounded and avoid
  // context-window overflow on cheaper models.
  const processedMessages = capModelMessageHistory(
    pruneMessages({
      messages: convertToModelMessages(rawMessages),
      reasoning: 'before-last-message',
      toolCalls: `before-last-${KEEP_RECENT_TOOL_RESULTS}-messages`,
    }),
    HISTORY_CHAR_CAP,
    MIN_KEPT_MESSAGES,
  )

  const result = streamText({
    model: providerFactory(resolvedModel.id),
    system: buildLatexSystemPrompt(context),
    messages: processedMessages,
    tools,
    // Rich context means most turns resolve in 1–3 tool calls. Keep a generous
    // ceiling for legitimate multi-file edits.
    stopWhen: stepCountIs(20),
    // Cancel the upstream provider call when the HTTP client disconnects
    // (tab close, navigation, or explicit `stop()` from useChat).
    abortSignal: c.req.raw.signal,
    onError: ({ error }) => {
      console.error('[ai-chat] streamText error:', error)
    },
  })

  return result.toUIMessageStreamResponse({
    sendReasoning: false,
    onError: (error: unknown): string => {
      console.error('[ai-chat] response error:', error)
      return error instanceof Error ? error.message : String(error)
    },
  })
})

// ---------------------------------------------------------------------------
// Scoped R2 files → platform-worker
// ---------------------------------------------------------------------------

app.all('/api/files/*', async (c) => {
  const auth = await resolveAuth(c.req.raw, c.env)
  const userId = auth?.result.userId ?? null

  const url = new URL(c.req.url)
  const platformUrl = new URL(c.req.url)
  platformUrl.pathname = url.pathname.replace('/api/files', '/internal/files')

  const headers = new Headers(c.req.raw.headers)
  headers.set('x-app-identity-token', c.env.APP_IDENTITY_TOKEN)
  headers.set('x-app-id', c.env.DEEPSPACE_APP_ID)
  if (userId) headers.set('x-user-id', userId)

  const resp = await c.env.PLATFORM_WORKER.fetch(
    new Request(platformUrl.toString(), {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
    }),
  )

  // Rewrite URLs in JSON responses to use the app's origin
  const contentType = resp.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await resp.json()) as Record<string, unknown>
    const rewriteUrl = (u: string) => u.replace(/^https?:\/\/[^/]+/, url.origin)
    if (typeof body.url === 'string') body.url = rewriteUrl(body.url)
    if (Array.isArray(body.files)) {
      for (const f of body.files as Array<Record<string, unknown>>) {
        if (typeof f.url === 'string') f.url = rewriteUrl(f.url)
      }
    }
    return c.json(body, resp.status as any)
  }

  return new Response(resp.body, { status: resp.status, headers: resp.headers })
})

// ---------------------------------------------------------------------------
// Same-origin browser proxy for authenticated DeepSpace billing hooks.
const BROWSER_PROXY_ROUTES = [
  ['GET', '/_deepspace/subscriptions/me'],
  ['POST', '/_deepspace/subscriptions/checkout'],
  ['POST', '/_deepspace/subscriptions/portal'],
  ['POST', '/_deepspace/charges/create'],
  ['GET', '/_deepspace/charges/me'],
] as const

app.all('/_deepspace/*', async (c) => {
  const url = new URL(c.req.url)
  const method = c.req.method
  const allowed = BROWSER_PROXY_ROUTES.some(
    ([allowedMethod, path]) => allowedMethod === method && path === url.pathname,
  )
  if (!allowed) return c.json({ error: 'not_found' }, 404)

  const auth = await resolveAuth(c.req.raw, c.env)
  const userId = auth?.result.userId
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const forwardedParams = new URLSearchParams(url.search)
  forwardedParams.set('appId', c.env.DEEPSPACE_APP_ID)
  const queryString = forwardedParams.toString()
  const apiPath =
    url.pathname.replace('/_deepspace/', '/api/') + (queryString ? `?${queryString}` : '')

  const headers = new Headers(c.req.raw.headers)
  headers.delete('x-user-id')
  headers.delete('x-app-identity-token')
  headers.delete('x-app-id')
  if (c.env.APP_IDENTITY_TOKEN) {
    headers.set('x-app-identity-token', c.env.APP_IDENTITY_TOKEN)
    headers.set('x-app-id', c.env.DEEPSPACE_APP_ID)
  }
  headers.set('x-user-id', userId)

  return apiWorkerFetch(c.env, apiPath, {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) ? undefined : c.req.raw.body,
  })
})

// ---------------------------------------------------------------------------
// Static assets (SPA fallback)
// ---------------------------------------------------------------------------

app.get('*', async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw)
  if (response.status === 404) {
    const url = new URL(c.req.url)
    url.pathname = '/index.html'
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw))
  }
  return response
})

// =============================================================================
// Action Tools — route to app's own RecordRoom DO
// =============================================================================

function createActionTools(env: Env, userId: string, callerJwt: string): ActionTools {
  const scopeId = makeScopeId(env.APP_NAME)

  // Generic over the data shape so callers below get precise ActionResult<T>
  // back instead of the wide unknown — the new SDK tightened ActionTools'
  // method signatures and the cast at the boundary is safe because the wire
  // shape is set by the SDK's tools-api handler.
  async function execTool<TData>(
    tool: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult<TData>> {
    const doId = env.RECORD_ROOMS.idFromName(scopeId)
    const stub = env.RECORD_ROOMS.get(doId)
    const res = await stub.fetch(new Request('https://internal/api/tools/execute?appAction=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ tool, params }),
    }))
    return res.json() as Promise<ActionResult<TData>>
  }

  async function callIntegration<T = unknown>(
    endpoint: string,
    data?: unknown,
  ): Promise<ActionResult<T>> {
    const integrationName = endpoint.split('/')[0]
    const billingMode = integrations[integrationName]?.billing ?? 'developer'

    // Use the owner JWT for developer-billed calls, the caller's JWT otherwise.
    // The api-worker bills the JWT subject — no client-supplied override.
    const jwt = billingMode === 'developer' ? env.APP_OWNER_JWT : callerJwt

    const res = await env.API_WORKER.fetch(`https://api-worker/api/integrations/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: data != null ? JSON.stringify(data) : undefined,
    })
    return res.json() as Promise<ActionResult<T>>
  }

  return {
    create: (collection, data) => execTool('records.create', { collection, data }),
    update: (collection, recordId, data) =>
      execTool('records.update', { collection, recordId, data }),
    remove: (collection, recordId) => execTool('records.delete', { collection, recordId }),
    get: (collection, recordId) => execTool('records.get', { collection, recordId }),
    query: (collection, options) => execTool('records.query', { collection, ...options }),
    integration: callIntegration,
    registerUser: (opts) =>
      execTool('users.register', { userId: opts.userId ?? userId, ...opts }),
  }
}

export default app
