/**
 * useCompilation — compile LaTeX via the compile integration (cloud)
 *
 * Uses the integration proxy at /api/integrations/latex-compiler/compile.
 * Persists the latest compilation log to the compilationLogs collection.
 */

import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutations } from 'deepspace'
import type {
  CompilationResult,
  CompilationLog,
  CompileStatus,
  CloudCompiler,
  BibEngine,
  LogItem,
} from '../constants'
import { EMPTY_COMPILATION_LOG } from '../constants'

export interface CompilationProjectFile {
  path: string
  content?: string
  base64Content?: string
}

export interface UseCompilationOptions {
  compiler: CloudCompiler
  bibEngine: BibEngine
  documentId: string
}

interface UseCompilationReturn {
  compile: (files: CompilationProjectFile[], entryFilePath: string) => Promise<CompilationResult>
  isCompiling: boolean
  status: CompileStatus
  pdfUrl: string | null
  compilationLog: CompilationLog
  error: string | null
  lastCompiledAt: number | null
}

function base64ToBlob(base64: string, contentType = 'application/pdf'): Blob {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return new Blob([bytes], { type: contentType })
}

function normalizeBase64(data: string): string {
  const commaIndex = data.indexOf(',')
  if (data.startsWith('data:') && commaIndex !== -1) {
    return data.slice(commaIndex + 1)
  }
  return data
}

function textToBase64(text: string): string {
  const utf8Bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < utf8Bytes.length; i += chunkSize) {
    const chunk = utf8Bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...Array.from(chunk))
  }
  return btoa(binary)
}

function mapApiLogItem(item: any): LogItem {
  const info = item.info || {}
  return {
    message: info.message || info.type || 'Unknown',
    type: info.type,
    package: info.package,
    line: info.lines?.[0] ?? info.line,
    file: info.file,
    context: item.context || '',
  }
}

function buildCompilationLog(data: any): CompilationLog {
  const parsed = data?.parsedLog
  if (!parsed) {
    const rawLog = data?.compilationLog || ''
    return {
      ...EMPTY_COMPILATION_LOG,
      compiled: !!data?.compiled,
      duration: data?.duration,
      rawLog,
      errors: rawLog ? [{ message: rawLog.slice(0, 1000), context: '' }] : [],
      summary: {
        errorsCount: rawLog ? 1 : 0, warningsCount: 0, badboxesCount: 0,
        missingRefsCount: 0, hasErrors: !!rawLog, hasWarnings: false,
      },
    }
  }

  const errors = (parsed.errors || []).map(mapApiLogItem)
  const warnings = (parsed.warnings || []).map(mapApiLogItem)
  const badboxes = (parsed.badboxes || []).map(mapApiLogItem)
  const missingRefs = (parsed.missing_refs || []).map(mapApiLogItem)

  return {
    compiled: !!data.compiled,
    duration: data.duration,
    summary: {
      errorsCount: parsed.errors_count ?? errors.length,
      warningsCount: parsed.warnings_count ?? warnings.length,
      badboxesCount: parsed.badboxes_count ?? badboxes.length,
      missingRefsCount: missingRefs.length,
      hasErrors: parsed.has_errors ?? errors.length > 0,
      hasWarnings: parsed.has_warnings ?? warnings.length > 0,
    },
    errors, warnings, badboxes, missingRefs,
    rawLog: data.compilationLog || '',
    logFiles: data.logFiles || {},
  }
}

async function compileCloud(
  files: CompilationProjectFile[],
  entryFilePath: string,
  compiler: CloudCompiler,
  bibEngine: BibEngine,
  documentId: string,
): Promise<CompilationResult> {
  const entryFile = files.find(file => file.path === entryFilePath)

  if (!entryFile) {
    const msg = `Entry file "${entryFilePath}" not found in project resources.`
    return {
      success: false,
      compilationLog: {
        ...EMPTY_COMPILATION_LOG,
        errors: [{ message: msg, file: entryFilePath, context: '' }],
        rawLog: msg,
        summary: { ...EMPTY_COMPILATION_LOG.summary, errorsCount: 1, hasErrors: true },
      },
    }
  }

  if ((entryFile.content?.trim() || '') === '') {
    const msg = `Entry file "${entryFilePath}" is empty. Please add content before compiling.`
    return {
      success: false,
      compilationLog: {
        ...EMPTY_COMPILATION_LOG,
        errors: [{ message: msg, file: entryFilePath, context: '' }],
        rawLog: msg,
        summary: { ...EMPTY_COMPILATION_LOG.summary, errorsCount: 1, hasErrors: true },
      },
    }
  }

  const resources = files.map((file) => {
    if (file.path === entryFilePath) {
      return { main: true, content: file.content ?? '' }
    }
    const filePayload = file.base64Content
      ? normalizeBase64(file.base64Content)
      : textToBase64(file.content ?? '')
    return { path: file.path, file: filePayload }
  })

  resources.push({ path: `.project/${documentId}`, content: ' ' })

  const res = await fetch('/api/integrations/latex-compiler/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ compiler, resources, options: { bibliography: { command: bibEngine } } }),
  })

  const response: any = await res.json()

  if (response?.success && response?.data?.pdfBase64) {
    const pdfBlob = base64ToBlob(response.data.pdfBase64)
    const blobUrl = URL.createObjectURL(pdfBlob)
    return { success: true, pdfUrl: blobUrl, pdfBlob, compilationLog: buildCompilationLog(response.data) }
  }

  const compilationLog = response?.data
    ? buildCompilationLog(response.data)
    : {
        ...EMPTY_COMPILATION_LOG,
        rawLog: response?.error || 'Compilation failed',
        errors: [{ message: response?.error || 'Compilation failed', context: '' }],
        summary: { ...EMPTY_COMPILATION_LOG.summary, errorsCount: 1, hasErrors: true },
      }

  return { success: false, compilationLog }
}

export function useCompilation({
  compiler, bibEngine, documentId,
}: UseCompilationOptions): UseCompilationReturn {
  const [status, setStatus] = useState<CompileStatus>('idle')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compilationLog, setCompilationLog] = useState<CompilationLog>(EMPTY_COMPILATION_LOG)
  const [error, setError] = useState<string | null>(null)
  const [lastCompiledAt, setLastCompiledAt] = useState<number | null>(null)
  const prevBlobUrlRef = useRef<string | null>(null)

  const { records: logRecords } = useQuery('compilationLogs')
  const { create, put } = useMutations('compilationLogs')
  const { put: putDocument } = useMutations('documents')

  const persistLog = useCallback(async (log: CompilationLog) => {
    const existing = logRecords.find((r: any) => r.data.documentId === documentId)
    const payload: Record<string, any> = {
      documentId, compiled: log.compiled, duration: log.duration ?? 0,
      errorsCount: log.summary.errorsCount, warningsCount: log.summary.warningsCount,
      badboxesCount: log.summary.badboxesCount, missingRefsCount: log.summary.missingRefsCount,
      rawLog: log.rawLog.slice(0, 50000),
      parsedErrors: JSON.stringify(log.errors), parsedWarnings: JSON.stringify(log.warnings),
      parsedBadboxes: JSON.stringify(log.badboxes), parsedMissingRefs: JSON.stringify(log.missingRefs),
      logFiles: JSON.stringify(log.logFiles), compiledAt: Date.now(),
    }
    if (existing) { put(existing.recordId, payload) } else { create(payload) }
  }, [logRecords, documentId, create, put])

  const compile = useCallback(async (
    files: CompilationProjectFile[], entryFilePath: string,
  ): Promise<CompilationResult> => {
    setStatus('compiling')
    setError(null)
    setCompilationLog(EMPTY_COMPILATION_LOG)

    try {
      const result = await compileCloud(files, entryFilePath, compiler, bibEngine, documentId)
      if (result.success && result.pdfUrl) {
        const compiledAt = Date.now()
        if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current)
        prevBlobUrlRef.current = result.pdfUrl
        setPdfUrl(result.pdfUrl)
        setStatus('success')
        setLastCompiledAt(compiledAt)
        putDocument(documentId, { lastCompiledAt: compiledAt })
      } else {
        setError(result.compilationLog.errors[0]?.message || 'Compilation failed')
        setStatus('error')
      }
      setCompilationLog(result.compilationLog)
      persistLog(result.compilationLog)
      return result
    } catch (err: any) {
      const message = err.message || 'Compilation error'
      const failLog: CompilationLog = {
        ...EMPTY_COMPILATION_LOG, rawLog: message,
        errors: [{ message, context: '' }],
        summary: { ...EMPTY_COMPILATION_LOG.summary, errorsCount: 1, hasErrors: true },
      }
      setCompilationLog(failLog)
      setError(message)
      setStatus('error')
      persistLog(failLog)
      return { success: false, compilationLog: failLog }
    }
  }, [compiler, bibEngine, documentId, persistLog, putDocument])

  return { compile, isCompiling: status === 'compiling', status, pdfUrl, compilationLog, error, lastCompiledAt }
}
