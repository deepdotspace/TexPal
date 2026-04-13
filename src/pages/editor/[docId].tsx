/**
 * Editor page — renders the full editor for a specific document.
 * Route: /editor/:docId (generouted dynamic segment)
 */

import { useCallback, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { useQuery } from 'deepspace'
import { useEditorSettings } from '../../hooks/useEditorSettings'
import { useThemeSync } from '../../hooks/useThemeSync'
import { useActiveDocumentContext } from '../../hooks/useActiveDocumentContext'
import { EditorLayout } from '../../components/editor/EditorLayout'

export default function EditorRoute() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const { settings } = useEditorSettings()
  const {
    upsertActiveDocumentContext,
    clearActiveDocumentContext,
  } = useActiveDocumentContext()

  const { records: documents, status } = useQuery('documents', {
    orderBy: 'updatedAt',
    orderDir: 'desc',
    limit: 200,
  })

  const docRecord = useMemo(
    () => (documents as any[])?.find((d: any) => d.recordId === docId),
    [documents, docId],
  )

  const documentTitle = docRecord?.data?.title || 'Untitled'
  const templateId = docRecord?.data?.templateId

  useThemeSync(settings.theme)

  // Bounce to /home if the document was deleted
  useEffect(() => {
    if (!docId || status !== 'ready') return
    const docStillExists = (documents as any[]).some((d: any) => d.recordId === docId)
    if (!docStillExists) {
      let cancelled = false
      const resetAfterRemoval = async () => {
        try { await clearActiveDocumentContext() } catch {}
        if (!cancelled) navigate('/home', { replace: true })
      }
      void resetAfterRemoval()
      return () => { cancelled = true }
    }
  }, [docId, documents, status, clearActiveDocumentContext, navigate])

  const handleBack = useCallback(async () => {
    try { await clearActiveDocumentContext() } catch {}
    navigate('/home')
  }, [clearActiveDocumentContext, navigate])

  if (!docId) return <Navigate to="/home" replace />

  if (status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-content-secondary text-sm">Loading document...</div>
        </div>
      </div>
    )
  }

  if (status === 'ready' && !docRecord) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <div className="text-content-danger text-sm font-medium mb-2">Document not found</div>
          <div className="text-content-secondary text-sm mb-4">
            This document may have been deleted or you don't have access.
          </div>
          <button
            onClick={() => navigate('/home')}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <EditorLayout
      documentId={docId}
      documentTitle={documentTitle}
      templateId={templateId}
      onBack={handleBack}
      persistActiveDocumentContext={upsertActiveDocumentContext}
    />
  )
}
