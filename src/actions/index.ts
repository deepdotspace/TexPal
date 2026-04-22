import type { ActionHandler } from 'deepspace/worker'
import { APP_NAME, makeScopeId } from '../constants'

/**
 * deleteDocument — cascading delete for a document and all its child records.
 *
 * Runs with the app-owner identity (x-app-action bypass) so a single failed
 * row doesn't leave orphans the caller's role can no longer see. Child
 * collections cleaned up: projectFiles, documentVersions, compilationLogs,
 * agentEdits. The document row itself is removed last.
 *
 * Note: R2-backed PDF blobs are cleaned up client-side via useR2Files —
 * the action-tools surface doesn't expose R2, and those are best-effort
 * anyway.
 */
const deleteDocument: ActionHandler = async ({ params, tools }) => {
  const documentId = params.documentId
  if (typeof documentId !== 'string' || !documentId) {
    return { success: false, error: 'documentId is required' }
  }
  // The action handler doesn't receive env; the scope is deterministic from
  // the build-time APP_NAME (which must match the runtime env var — enforced
  // by being a single source of truth in src/constants.ts).
  const scopeId = makeScopeId(APP_NAME)

  const cascadeCollections = [
    'projectFiles',
    'documentVersions',
    'compilationLogs',
    'agentEdits',
  ] as const

  for (const collection of cascadeCollections) {
    const result = await tools.query(scopeId, collection, { where: { documentId }, limit: 500 })
    if (!result.success) {
      return { success: false, error: `Failed to query ${collection}: ${result.error ?? 'unknown'}` }
    }
    const records = (result.data as { records?: Array<{ recordId: string }> } | undefined)?.records ?? []
    for (const record of records) {
      const removal = await tools.remove(scopeId, collection, record.recordId)
      if (!removal.success) {
        return {
          success: false,
          error: `Failed to remove ${collection}/${record.recordId}: ${removal.error ?? 'unknown'}`,
        }
      }
    }
  }

  const docRemoval = await tools.remove(scopeId, 'documents', documentId)
  if (!docRemoval.success) {
    return { success: false, error: `Failed to remove document: ${docRemoval.error ?? 'unknown'}` }
  }

  return { success: true }
}

export const actions: Record<string, ActionHandler> = {
  deleteDocument,
}
