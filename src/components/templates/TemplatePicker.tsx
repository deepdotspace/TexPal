import React, { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { APP_NAME, STARTER_TEMPLATES, type StarterTemplate } from '../../constants'
import { useGitHubTemplates, type GitHubTemplate } from '../../hooks/useGitHubTemplates'
import { useEditorSettings } from '../../hooks/useEditorSettings'
import { TemplateCard } from './TemplateCard'
import { Modal, ConfirmModal } from '../ui/Modal'
import { Button } from '../ui/Button'

/**
 * Animated wordmark for the home-page brand. Letters fade + rise in on mount
 * with a small per-letter stagger; on hover the whole mark scales gently and
 * the favicon mark rotates a hair. Wrapped in a Link that targets the landing
 * page (?landing=1 bypasses the "already-seen-landing" auto-redirect in
 * src/pages/index.tsx so returning signed-in users actually see the landing
 * instead of being bounced back to /home).
 */
function HomeBrand() {
  const letters = APP_NAME.toUpperCase().split('')
  return (
    <Link
      to="/?landing=1"
      aria-label="Go to the TeXPal landing page"
      className="group inline-flex flex-col items-center gap-3 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-4 focus-visible:ring-offset-surface rounded-2xl"
    >
      <motion.span
        className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0f0f0f] text-[#f5f0e6] shadow-sm"
        initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
        whileHover={{ rotate: 4, scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
      >
        <motion.span
          aria-hidden="true"
          className="font-serif text-[34px] leading-none font-bold"
          animate={{ y: [0, -1.5, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          T
        </motion.span>
      </motion.span>

      <h1 className="flex items-baseline gap-[0.04em] text-content text-[34px] font-serif font-bold tracking-[0.18em] leading-none">
        {letters.map((char, i) => (
          <motion.span
            key={i}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.12 + i * 0.05, duration: 0.45, ease: [0.2, 0.65, 0.3, 1] }}
            className="inline-block transition-colors duration-200 group-hover:text-accent"
          >
            {char}
          </motion.span>
        ))}
      </h1>
    </Link>
  )
}

interface DocumentRecord {
  recordId: string
  createdBy?: string
  createdAt?: string
  updatedAt?: string
  data: {
    title: string
    templateId?: string
    lastCompiledAt?: number
  }
}

interface TemplatePickerProps {
  onSelectTemplate: (template: StarterTemplate | GitHubTemplate) => void
  onOpenDocument: (doc: DocumentRecord) => void
  onRenameDocument?: (docId: string, newTitle: string) => Promise<void>
  onDeleteDocument?: (docId: string) => Promise<void>
  isCreating: boolean
  recentDocuments: DocumentRecord[]
  currentUserId: string | null
}

function formatRelativeTime(value?: string | number): string {
  if (!value) return ''
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function getTemplateLabel(templateId?: string, githubTemplates?: GitHubTemplate[]): string {
  if (!templateId) return 'Document'
  const tpl = STARTER_TEMPLATES.find(t => t.id === templateId)
  if (tpl) return tpl.name
  const githubTpl = githubTemplates?.find(t => t.id === templateId)
  return githubTpl?.name || 'Document'
}

function getDocumentActivityTime(doc: DocumentRecord): number {
  const compiledAt = doc.data.lastCompiledAt
  if (typeof compiledAt === 'number' && Number.isFinite(compiledAt) && compiledAt > 0) {
    return compiledAt
  }

  const fallbackDate = doc.updatedAt || doc.createdAt
  if (!fallbackDate) return 0

  const fallbackTime = new Date(fallbackDate).getTime()
  return Number.isFinite(fallbackTime) ? fallbackTime : 0
}

const TEMPLATE_ICON_PATHS: Record<string, string> = {
  'blank-article': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  'ieee-conference': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  'jakes-resume': 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  'acm-conference': 'M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5',
  'acm-journal': 'M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5',
  'apa7': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  'gatech-thesis': 'M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5',
  'icck-journal': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  'newspaper': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  'acm-article': 'M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5',
  'resume-cv': 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  'modern-cv': 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  'formal-letter': 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  'homework': 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  'book-report': 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  'thesis': 'M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5',
  'beamer-presentation': 'M2 3h20 M10 11l4 3-4 3 M2 3v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V3',
}
const DEFAULT_DOC_ICON = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8'

function DocIcon({ templateId, size = 18 }: { templateId?: string; size?: number }) {
  const d = (templateId && TEMPLATE_ICON_PATHS[templateId]) || DEFAULT_DOC_ICON
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  )
}

type HomeTab = 'templates' | 'my' | 'shared'

export function TemplatePicker({ 
  onSelectTemplate, 
  onOpenDocument, 
  onRenameDocument,
  onDeleteDocument,
  isCreating,
  recentDocuments,
  currentUserId,
}: TemplatePickerProps) {
  const hasDocuments = recentDocuments.length > 0
  const hasMyDocuments = recentDocuments.some((doc) => !doc.createdBy || doc.createdBy === currentUserId)
  const [activeTab, setActiveTab] = useState<HomeTab>(hasMyDocuments ? 'my' : hasDocuments ? 'shared' : 'templates')
  const { templates: githubTemplates, loading: templatesLoading, error: templatesError } = useGitHubTemplates()
  const { settings, updateSetting } = useEditorSettings()
  const [renameDocId, setRenameDocId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUserInitiatedTabChange, setIsUserInitiatedTabChange] = useState(false)

  // Dark mode is managed at route level to prevent flash during navigation

  const handleThemeToggle = () => {
    const newTheme = settings.theme === 'light' ? 'dark' : 'light'
    updateSetting('theme', newTheme)
  }

  const sortedDocs = useMemo(() =>
    [...recentDocuments].sort((a, b) => {
      return getDocumentActivityTime(b) - getDocumentActivityTime(a)
    }),
    [recentDocuments],
  )
  const myDocuments = useMemo(
    () => sortedDocs.filter((doc) => !doc.createdBy || doc.createdBy === currentUserId),
    [sortedDocs, currentUserId],
  )
  const sharedDocuments = useMemo(
    () => sortedDocs.filter((doc) => !!doc.createdBy && doc.createdBy !== currentUserId),
    [sortedDocs, currentUserId],
  )
  const visibleDocuments = activeTab === 'my' ? myDocuments : sharedDocuments

  // Only auto-switch tabs when documents change, not when user manually clicks tabs
  useEffect(() => {
    // Skip auto-switching if the user manually changed the tab
    if (isUserInitiatedTabChange) {
      return
    }
    
    if (activeTab === 'my' && myDocuments.length === 0) {
      setActiveTab(sharedDocuments.length > 0 ? 'shared' : 'templates')
    } else if (activeTab === 'shared' && sharedDocuments.length === 0) {
      setActiveTab(myDocuments.length > 0 ? 'my' : 'templates')
    }
  }, [activeTab, myDocuments.length, sharedDocuments.length, isUserInitiatedTabChange])

  // Reset user-initiated flag when documents change
  useEffect(() => {
    setIsUserInitiatedTabChange(false)
  }, [myDocuments.length, sharedDocuments.length])

  // Combine local templates (blank) with GitHub templates
  const allTemplates = useMemo(() => {
    return [...STARTER_TEMPLATES, ...githubTemplates]
  }, [githubTemplates])

  const handleRenameClick = (e: React.MouseEvent, doc: DocumentRecord) => {
    e.stopPropagation()
    setRenameDocId(doc.recordId)
    setRenameTitle(doc.data.title || 'Untitled')
  }

  const handleDeleteClick = (e: React.MouseEvent, doc: DocumentRecord) => {
    e.stopPropagation()
    setDeleteDocId(doc.recordId)
  }

  const handleRenameConfirm = async () => {
    if (!renameDocId || !onRenameDocument || !renameTitle.trim()) return
    setIsRenaming(true)
    try {
      await onRenameDocument(renameDocId, renameTitle.trim())
      setRenameDocId(null)
      setRenameTitle('')
    } catch (err) {
      console.error('Failed to rename document:', err)
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteDocId || !onDeleteDocument) return
    setIsDeleting(true)
    try {
      await onDeleteDocument(deleteDocId)
      setDeleteDocId(null)
    } catch (err) {
      console.error('Failed to delete document:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div data-testid="home-page" className="relative flex-1 flex flex-col items-center p-6 pt-10 overflow-y-auto bg-surface dark:bg-dark-surface">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={handleThemeToggle}
          className="p-2 rounded-lg hover:bg-surface-overlay text-content-secondary hover:text-content transition-colors"
          title={settings.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {settings.theme === 'light' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42" />
            </svg>
          )}
        </button>
      </div>

      {/* Brand mark — animated, capitalized, links to the landing page. */}
      <div className="max-w-3xl w-full text-center mb-8 flex flex-col items-center">
        <HomeBrand />
        <p className="text-content-secondary text-sm mt-4">
          Create a new document or continue where you left off.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-surface-inset rounded-lg p-1">
        <button
          className={`home-tab ${activeTab === 'my' ? 'active' : ''}`}
          onClick={() => {
            setIsUserInitiatedTabChange(true)
            setActiveTab('my')
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          My Documents ({myDocuments.length})
        </button>
        <button
          className={`home-tab ${activeTab === 'shared' ? 'active' : ''}`}
          onClick={() => {
            setIsUserInitiatedTabChange(true)
            setActiveTab('shared')
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <path d="M20 8v6" />
            <path d="M23 11h-6" />
          </svg>
          Shared with Me ({sharedDocuments.length})
        </button>
        <button
          className={`home-tab ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => {
            setIsUserInitiatedTabChange(true)
            setActiveTab('templates')
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14 M5 12h14" />
          </svg>
          New Document
        </button>
      </div>

      {/* Content */}
      <div className="w-full max-w-3xl">
        {activeTab === 'templates' && (
          <>
            {templatesLoading && (
              <div className="text-center py-8 text-content-secondary text-sm">
                Loading templates...
              </div>
            )}
            {templatesError && (
              <div className="text-center py-8">
                <div className="text-content-danger text-sm mb-2">Failed to load templates</div>
                <div className="text-content-tertiary text-xs">{templatesError}</div>
              </div>
            )}
            {!templatesLoading && !templatesError && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {allTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={onSelectTemplate}
                    disabled={isCreating}
                  />
                ))}
              </div> 
            )}
          </>
        )}

        {(activeTab === 'my' || activeTab === 'shared') && (
          <>
            {visibleDocuments.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-inset flex items-center justify-center text-content-tertiary">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </div>
                <p className="text-content-secondary text-sm mb-3">
                  {activeTab === 'my' ? 'No documents yet' : 'No shared documents yet'}
                </p>
                {activeTab === 'my' ? (
                  <button
                    className="text-accent text-sm font-medium hover:underline"
                    onClick={() => {
                      setIsUserInitiatedTabChange(true)
                      setActiveTab('templates')
                    }}
                  >
                    Create your first document
                  </button>
                ) : (
                  <p className="text-content-tertiary text-xs">
                    Documents shared with you will appear here.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {visibleDocuments.map((doc) => {
                  const isMyTab = activeTab === 'my'
                  const ownerName = !isMyTab && doc.createdBy ? (doc.data.title || 'Unknown') : null

                  return (
                    <div
                      key={doc.recordId}
                      className="recent-doc-row"
                    >
                      {/* Edit button - first */}
                      {onRenameDocument && (
                        <button
                          onClick={(e) => handleRenameClick(e, doc)}
                          className="p-1.5 rounded hover:bg-surface-overlay hover:text-content transition-colors shrink-0"
                          style={{ color: '#9CA3AF' }}
                          title="Rename"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      )}
                      
                      {/* Document content - clickable */}
                      <button
                        className="flex-1 flex items-center gap-3 min-w-0"
                        onClick={() => onOpenDocument(doc)}
                      >
                        <div className="w-9 h-9 rounded-lg bg-accent-light dark:bg-accent/20 flex items-center justify-center text-accent dark:text-accent-muted shrink-0">
                          <DocIcon templateId={doc.data.templateId} />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-content truncate">
                              {doc.data.title || 'Untitled'}
                            </span>
                          </div>
                          <div className="text-xs text-content-tertiary flex items-center gap-1.5">
                            <span>{getTemplateLabel(doc.data.templateId, githubTemplates)}</span>
                            {!isMyTab && ownerName && (
                              <>
                                <span className="text-content-tertiary">·</span>
                                <span>by {ownerName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Timestamp */}
                      <div className="text-xs text-content-tertiary shrink-0">
                        {formatRelativeTime(doc.data.lastCompiledAt || doc.updatedAt || doc.createdAt)}
                      </div>

                      {/* Delete button - last */}
                      {onDeleteDocument && (
                        <button
                          onClick={(e) => handleDeleteClick(e, doc)}
                          className="p-1.5 rounded hover:bg-surface-overlay hover:text-danger transition-colors shrink-0"
                          style={{ color: '#9CA3AF' }}
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}

                      {/* Arrow icon */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-content-tertiary shrink-0">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Rename Modal */}
      <Modal
        open={renameDocId !== null}
        onClose={() => {
          setRenameDocId(null)
          setRenameTitle('')
        }}
        size="sm"
      >
        <Modal.Header onClose={() => {
          setRenameDocId(null)
          setRenameTitle('')
        }}>
          <Modal.Title>Rename Document</Modal.Title>
          <Modal.Description>Enter a new name for this document.</Modal.Description>
        </Modal.Header>
        <Modal.Body>
          <input
            type="text"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleRenameConfirm()
              }
              if (e.key === 'Escape') {
                setRenameDocId(null)
                setRenameTitle('')
              }
            }}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-content placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            placeholder="Document name"
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="ghost" onClick={() => {
            setRenameDocId(null)
            setRenameTitle('')
          }} disabled={isRenaming}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleRenameConfirm} loading={isRenaming} disabled={!renameTitle.trim()}>
            Rename
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={deleteDocId !== null}
        onClose={() => setDeleteDocId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Document"
        description="Are you sure you want to delete this document? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        loading={isDeleting}
      />
    </div>
  )
}
