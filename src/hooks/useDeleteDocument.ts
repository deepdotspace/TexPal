/**
 * useDeleteDocument — cascading delete for a LaTeX document.
 *
 * The collection cascade runs server-side via the `deleteDocument` action
 * (see src/actions/index.ts). The action bypasses user RBAC so a partial
 * failure doesn't leave rows the caller can't reach.
 *
 * R2-backed PDF blobs are cleaned up best-effort from the client, since
 * the action-tools surface doesn't expose R2.
 */

import { useCallback } from 'react'
import { useQuery, useR2Files, getAuthToken } from 'deepspace'

export function useDeleteDocument() {
  const { records: versionRecords } = useQuery('documentVersions')
  const { deleteFile } = useR2Files()

  const deleteDocument = useCallback(async (docId: string): Promise<void> => {
    // Best-effort R2 cleanup for any PDF blobs owned by this document's
    // versions. Fire-and-forget — orphaned R2 objects are not user-visible
    // and can be swept later.
    const docVersions = (versionRecords as Array<{ data: { documentId?: string; pdfKey?: string } }>)
      .filter((r) => r.data.documentId === docId)
    for (const version of docVersions) {
      if (version.data.pdfKey) {
        deleteFile(version.data.pdfKey).catch(() => {})
      }
    }

    const token = await getAuthToken()
    const res = await fetch('/api/actions/deleteDocument', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ documentId: docId }),
    })
    const result = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
    if (!result.success) {
      throw new Error(result.error || `Failed to delete document (status ${res.status})`)
    }
  }, [versionRecords, deleteFile])

  return { deleteDocument }
}
