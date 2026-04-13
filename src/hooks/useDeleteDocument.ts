/**
 * useDeleteDocument — cascading delete for a LaTeX document.
 *
 * Removes all child data before deleting the document record itself.
 */

import { useCallback } from 'react'
import { useQuery, useMutations, useR2Files } from 'deepspace'

export function useDeleteDocument() {
  const { records: versionRecords } = useQuery('documentVersions')
  const { remove: removeVersion } = useMutations('documentVersions')

  const { records: projectFileRecords } = useQuery('projectFiles')
  const { remove: removeProjectFile } = useMutations('projectFiles')

  const { records: compilationLogRecords } = useQuery('compilationLogs')
  const { remove: removeCompilationLog } = useMutations('compilationLogs')

  const { records: agentEditRecords } = useQuery('agentEdits')
  const { remove: removeAgentEdit } = useMutations('agentEdits')

  const { removeConfirmed: removeDocument } = useMutations('documents')
  const { deleteFile } = useR2Files()

  const deleteDocument = useCallback(async (docId: string): Promise<void> => {
    const docVersions = versionRecords.filter((r: any) => r.data.documentId === docId)

    // Best-effort R2 file cleanup
    for (const version of docVersions) {
      if ((version as any).data.pdfKey) {
        deleteFile((version as any).data.pdfKey).catch(() => {})
      }
    }

    for (const version of docVersions) removeVersion(version.recordId)

    const docProjectFiles = projectFileRecords.filter((r: any) => r.data.documentId === docId)
    for (const file of docProjectFiles) removeProjectFile(file.recordId)

    const docLogs = compilationLogRecords.filter((r: any) => r.data.documentId === docId)
    for (const log of docLogs) removeCompilationLog(log.recordId)

    const docAgentEdits = agentEditRecords.filter((r: any) => r.data.documentId === docId)
    for (const edit of docAgentEdits) removeAgentEdit(edit.recordId)

    await removeDocument(docId)
  }, [
    versionRecords, projectFileRecords, compilationLogRecords, agentEditRecords,
    removeVersion, removeProjectFile, removeCompilationLog, removeAgentEdit, removeDocument,
  ])

  return { deleteDocument }
}
