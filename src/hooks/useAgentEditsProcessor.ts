/**
 * useAgentEditsProcessor — watches the agentEdits collection for pending edits
 * and applies them to projectFiles.
 *
 * The agent creates records in agentEdits with status="pending". This hook
 * picks them up, applies each action to projectFiles (handling agentRevision,
 * yjsContent sync, soft-deletes, etc. internally), then marks them "applied"
 * or "failed". The agent never needs to know about the dual-content architecture.
 *
 * Content can be provided via `newContent` (plain string) or `newContentBase64`
 * (base64-encoded). Base64 is preferred for LaTeX because it avoids shell/JSON
 * escaping issues with backslashes. When both are present, base64 wins.
 *
 * Supported actions:
 *   "update" — rewrite a file's plainContent and bump agentRevision
 *   "create" — create a new projectFiles record
 *   "rename" — update a file's path field
 *   "delete" — soft-delete a file (entry file is protected)
 */

import { useEffect, useRef } from 'react'
import { useQuery, useMutations } from 'deepspace'
import type { ProjectFileRecord } from './useProjectFiles'

interface AgentEditData {
  documentId?: string
  filePath: string
  newContent?: string
  newContentBase64?: string
  action: 'update' | 'create' | 'rename' | 'delete'
  newPath?: string
  status: 'pending' | 'applied' | 'failed'
  errorMessage?: string
  /**
   * Snapshot of target file's agentRevision at the moment the worker
   * received the edit. Injected server-side (see worker.ts). The processor
   * compares it against the current revision and rejects on mismatch to
   * prevent clobbering concurrent writes. Stored as a string because the
   * column is text-typed; parse with Number.
   */
  baseAgentRevision?: string
}

interface AgentEditRecord {
  recordId: string
  createdAt?: string | number
  updatedAt?: string | number
  data: AgentEditData
}

interface UseAgentEditsProcessorOptions {
  documentId: string
  files: ProjectFileRecord[]
}

const normalizePath = (path: string): string =>
  path
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/')

const resolveContent = (data: AgentEditData): string => {
  if (data.newContentBase64) {
    try {
      return atob(data.newContentBase64)
    } catch {
      throw new Error('Invalid base64 in newContentBase64')
    }
  }
  return data.newContent ?? ''
}

const getRecordTime = (record: AgentEditRecord): number => {
  const createdAt = record.createdAt ? new Date(record.createdAt).getTime() : 0
  const updatedAt = record.updatedAt ? new Date(record.updatedAt).getTime() : 0
  return Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : createdAt
}

export function useAgentEditsProcessor({
  documentId,
  files,
}: UseAgentEditsProcessorOptions) {
  const { records: agentEdits } = useQuery('agentEdits', {
    where: { documentId },
  })
  const { put: putAgentEdit } = useMutations('agentEdits')
  const { put: putFile, create: createFile } = useMutations('projectFiles')

  // Prevent overlapping processing loops and avoid reapplying edits if status writeback fails.
  const processingRef = useRef(false)
  const processedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (processingRef.current) return

    const allRecords = (agentEdits as AgentEditRecord[]) ?? []
    const pendingRecords = allRecords.filter((r) => r.data.status === 'pending')
    const pendingIds = new Set(pendingRecords.map((r) => r.recordId))

    // Keep the guard set bounded while preserving ids that are still pending.
    for (const id of [...processedRef.current]) {
      if (!pendingIds.has(id)) {
        processedRef.current.delete(id)
      }
    }

    const queue = pendingRecords
      .filter((r) => !processedRef.current.has(r.recordId))
      .sort((a, b) => getRecordTime(a) - getRecordTime(b))

    if (queue.length === 0) return

    processingRef.current = true
    let cancelled = false

    const runQueue = async () => {
      try {
        for (const edit of queue) {
          if (cancelled) break

          const { action, filePath, newPath } = edit.data
          const normalizedFilePath = normalizePath(filePath)
          let applied = false

          try {
            if (action === 'update') {
              const file = files.find(
                f => !f.data.deletedAt && normalizePath(f.data.path) === normalizedFilePath,
              )
              if (!file) throw new Error(`File not found: ${filePath}`)

              // Optimistic-concurrency check: if the worker captured a
              // baseAgentRevision and it no longer matches the live file,
              // something wrote between the agent reading and now. Reject
              // rather than silently clobber the newer state.
              const currentRevision = file.data.agentRevision ?? 0
              const base = edit.data.baseAgentRevision
              if (base !== undefined && Number(base) !== currentRevision) {
                throw new Error(
                  `Conflict: file "${filePath}" changed since the agent read it ` +
                  `(base revision ${base}, current ${currentRevision}). Ask again.`,
                )
              }

              const content = resolveContent(edit.data)
              putFile(file.recordId, {
                plainContent: content,
                agentRevision: currentRevision + 1,
              })
            } else if (action === 'create') {
              const exists = files.find(
                f => !f.data.deletedAt && normalizePath(f.data.path) === normalizedFilePath,
              )
              if (exists) throw new Error(`File already exists: ${filePath}`)

              const content = resolveContent(edit.data)
              const ext = normalizedFilePath.includes('.') ? normalizedFilePath.split('.').pop() || 'tex' : 'tex'
              createFile({
                documentId,
                path: normalizedFilePath,
                fileType: ext,
                isEntryFile: false,
                plainContent: content,
                agentRevision: 1,
              })
            } else if (action === 'rename') {
              const normalizedNewPath = normalizePath(newPath || '')
              if (!normalizedNewPath) throw new Error('newPath is required for rename action')

              const file = files.find(
                f => !f.data.deletedAt && normalizePath(f.data.path) === normalizedFilePath,
              )
              if (!file) throw new Error(`File not found: ${filePath}`)

              const duplicate = files.find(
                f =>
                  !f.data.deletedAt &&
                  f.recordId !== file.recordId &&
                  normalizePath(f.data.path) === normalizedNewPath,
              )
              if (duplicate) throw new Error(`File already exists at: ${newPath}`)

              putFile(file.recordId, { path: normalizedNewPath })
            } else if (action === 'delete') {
              const file = files.find(
                f => !f.data.deletedAt && normalizePath(f.data.path) === normalizedFilePath,
              )
              if (!file) throw new Error(`File not found: ${filePath}`)
              if (file.data.isEntryFile) throw new Error('Cannot delete the entry file')

              putFile(file.recordId, {
                deletedAt: Date.now(),
                originalPath: file.data.path,
              })
            } else {
              throw new Error(`Unknown action: ${action}`)
            }

            putAgentEdit(edit.recordId, { status: 'applied' })
            applied = true
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error'
            putAgentEdit(edit.recordId, {
              status: 'failed',
              errorMessage,
            })
            applied = true
          }

          // Only add to the guard AFTER we've written a terminal status so a
          // transient failure earlier in the try can be retried on a later
          // query tick. If we never got that far, leave the id out so the
          // next tick picks the record up again.
          if (applied) processedRef.current.add(edit.recordId)
        }
      } finally {
        processingRef.current = false
      }
    }

    void runQueue()

    return () => {
      cancelled = true
    }
  }, [agentEdits, files, documentId, putFile, createFile, putAgentEdit])
}
