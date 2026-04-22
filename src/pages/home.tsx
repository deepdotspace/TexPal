/**
 * Home page — document list + template picker.
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser, useQuery, useMutations } from 'deepspace'
import { useToast } from '../components/ui'
import type { StarterTemplate } from '../constants'
import type { GitHubTemplate } from '../hooks/useGitHubTemplates'
import { TemplatePicker } from '../components/templates/TemplatePicker'
import { useEditorSettings } from '../hooks/useEditorSettings'
import { useThemeSync } from '../hooks/useThemeSync'
import { useDeleteDocument } from '../hooks/useDeleteDocument'
import { useActiveDocumentContext } from '../hooks/useActiveDocumentContext'

export default function HomeRoute() {
  const { user } = useUser()
  const navigate = useNavigate()
  const { settings } = useEditorSettings()
  const { records: documents, status, error: documentsError } = useQuery('documents', {
    orderBy: 'updatedAt',
    orderDir: 'desc',
    limit: 200,
  })
  const { createConfirmed, putConfirmed } = useMutations('documents')
  const { deleteDocument } = useDeleteDocument()
  const toast = useToast()
  const {
    upsertActiveDocumentContext,
  } = useActiveDocumentContext()

  const [isCreating, setIsCreating] = useState(false)

  useThemeSync(settings.theme)

  const handleSelectTemplate = useCallback(async (template: StarterTemplate | GitHubTemplate) => {
    if (!user) return
    setIsCreating(true)
    try {
      const title = template.name === 'Blank Article' ? 'Untitled Document' : template.name
      const recordId = await createConfirmed({
        title,
        templateId: template.id,
      })

      await upsertActiveDocumentContext({
        activeDocumentId: recordId,
        activeDocumentTitle: title,
        activeFilePath: '',
      })

      toast.success(`Created "${title}"`)
      navigate(`/editor/${recordId}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create document')
    } finally {
      setIsCreating(false)
    }
  }, [user, createConfirmed, upsertActiveDocumentContext, toast, navigate])

  const handleOpenDocument = useCallback(async (
    doc: { recordId: string; data: { title: string; templateId?: string } },
  ) => {
    if (!user) return
    try {
      await upsertActiveDocumentContext({
        activeDocumentId: doc.recordId,
        activeDocumentTitle: doc.data.title || 'Untitled',
        activeFilePath: '',
      })
      navigate(`/editor/${doc.recordId}`)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to open the document context')
    }
  }, [user, upsertActiveDocumentContext, navigate, toast])

  const handleRenameDocument = useCallback(async (docId: string, newTitle: string) => {
    try {
      await putConfirmed(docId, { title: newTitle })
      toast.success(`Renamed to "${newTitle}"`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to rename document')
      throw err
    }
  }, [putConfirmed, toast])

  const handleDeleteDocument = useCallback(async (docId: string) => {
    try {
      await deleteDocument(docId)
      toast.success('Document deleted')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete document')
      throw err
    }
  }, [deleteDocument, toast])

  if (status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-content-secondary text-sm">Loading documents...</div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <div className="text-content-danger text-sm font-medium mb-2">Failed to load documents</div>
          <div className="text-content-secondary text-sm">{documentsError || 'Please refresh the page and try again.'}</div>
        </div>
      </div>
    )
  }

  return (
    <TemplatePicker
      onSelectTemplate={handleSelectTemplate}
      onOpenDocument={handleOpenDocument}
      onRenameDocument={handleRenameDocument}
      onDeleteDocument={handleDeleteDocument}
      isCreating={isCreating}
      recentDocuments={documents as any[]}
      currentUserId={user?.id || null}
    />
  )
}
