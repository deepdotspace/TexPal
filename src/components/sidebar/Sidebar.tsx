import React, { useCallback, useState } from 'react'
import { FileTree } from './FileTree'
import { TrashPanel } from './TrashPanel'
import { DocumentOutline } from './DocumentOutline'
import { ResizeDivider } from '../shared/ResizeDivider'
import type { OutlineItem } from '../../constants'
import type { ProjectFileRecord } from '../../hooks/useProjectFiles'

interface SidebarProps {
  documentTitle: string
  onRenameDocument?: (newTitle: string) => Promise<void>
  files: ProjectFileRecord[]
  trashFiles: ProjectFileRecord[]
  activeFileId: string | null
  onSelectFile: (id: string) => void
  onAddFile: (path: string, content?: string, base64Content?: string) => void
  onDeleteFile: (id: string) => void
  onRenameFile: (id: string, newPath: string) => Promise<void>
  onMoveFile: (id: string, targetFolder: string) => Promise<void>
  onDuplicateFile: (id: string) => Promise<string | null>
  onDeleteFolder: (folderPath: string) => Promise<void>
  onSetAsMainFile: (id: string) => Promise<void>
  onRestoreFile: (id: string) => Promise<void>
  onPermanentlyDeleteFile: (id: string) => Promise<void>
  outline: OutlineItem[]
  onJumpToLine: (line: number) => void
  collapsed: boolean
  onToggle: () => void
  onHome?: () => void
  getBaseName: (path: string) => string
  getDirName: (path: string) => string
  joinPath: (...parts: string[]) => string
  sanitizePath: (path: string) => string
  getFolderPaths: () => string[]
}

const MIN_TOP_SECTION_HEIGHT = 180
const MIN_OUTLINE_HEIGHT = 120
const DEFAULT_OUTLINE_HEIGHT = 220

function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      className="flex items-center gap-1.5 w-full px-3 py-2 text-[11px] font-semibold tracking-wide text-content-secondary hover:text-content transition-colors select-none"
      onClick={onToggle}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="currentColor"
        className={`transition-transform duration-150 shrink-0 ${open ? 'rotate-90' : ''}`}
      >
        <path d="M6 3l5 5-5 5z" />
      </svg>
      {label}
    </button>
  )
}

export function Sidebar({
  documentTitle,
  onRenameDocument,
  files,
  trashFiles,
  activeFileId,
  onSelectFile,
  onAddFile,
  onDeleteFile,
  onRenameFile,
  onMoveFile,
  onDuplicateFile,
  onDeleteFolder,
  onSetAsMainFile,
  onRestoreFile,
  onPermanentlyDeleteFile,
  outline,
  onJumpToLine,
  collapsed,
  onToggle,
  onHome,
  getBaseName,
  getDirName,
  joinPath,
  sanitizePath,
  getFolderPaths,
}: SidebarProps) {
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [outlinePanelHeight, setOutlinePanelHeight] = useState(DEFAULT_OUTLINE_HEIGHT)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(documentTitle)
  const titleInputRef = React.useRef<HTMLInputElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setEditTitle(documentTitle)
  }, [documentTitle])

  React.useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const handleTitleClick = () => {
    if (onRenameDocument) {
      setIsEditingTitle(true)
    }
  }

  const handleTitleBlur = async () => {
    if (!onRenameDocument) return
    const trimmedTitle = editTitle.trim()
    if (trimmedTitle && trimmedTitle !== documentTitle) {
      try {
        await onRenameDocument(trimmedTitle)
      } catch (err) {
        // Revert on error
        setEditTitle(documentTitle)
      }
    } else {
      setEditTitle(documentTitle)
    }
    setIsEditingTitle(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      titleInputRef.current?.blur()
    } else if (e.key === 'Escape') {
      setEditTitle(documentTitle)
      setIsEditingTitle(false)
    }
  }

  const handleOutlineResize = useCallback((clientY: number) => {
    if (!contentRef.current) return

    const containerRect = contentRef.current.getBoundingClientRect()
    const reservedSpace = MIN_TOP_SECTION_HEIGHT
    const maxOutlineHeight = Math.max(MIN_OUTLINE_HEIGHT, containerRect.height - reservedSpace)
    const nextOutlineHeight = containerRect.bottom - clientY
    const clampedHeight = Math.min(maxOutlineHeight, Math.max(MIN_OUTLINE_HEIGHT, nextOutlineHeight))

    setOutlinePanelHeight(clampedHeight)
  }, [])

  return (
    <div
      className={`flex flex-col h-full bg-surface-sidebar border-r border-border overflow-hidden ${
        collapsed ? 'w-0' : ''
      }`}
    >
      {!collapsed && (
        <>
          {/* Header */}
          <div className="flex items-center gap-1 px-2 h-toolbar border-b border-border shrink-0 group min-w-0 overflow-hidden">
            {onHome && (
              <button
                className="toolbar-btn !w-7 !h-7"
                onClick={onHome}
                title="Back to Home"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </button>
            )}
            <button
              className="toolbar-btn !w-7 !h-7"
              onClick={onToggle}
              title="Collapse sidebar (Ctrl+B)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKeyDown}
                className="flex-1 min-w-0 text-[12px] font-medium text-content bg-surface-overlay border border-accent rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
              />
            ) : (
              <span 
                className={`text-[12px] font-medium text-content truncate flex-1 ${onRenameDocument ? 'cursor-pointer hover:text-accent transition-colors' : ''}`}
                title={documentTitle}
                onClick={handleTitleClick}
              >
                {documentTitle}
              </span>
            )}
            {onRenameDocument && !isEditingTitle && (
              <button
                className="toolbar-btn !w-6 !h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditingTitle(true)
                }}
                title="Rename document"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </div>

          {/* Content with resizable File Tree / Outline split */}
          <div ref={contentRef} className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-[180px] overflow-hidden flex flex-col">
              <div className="flex-1 min-h-0 overflow-hidden">
                <FileTree
                  files={files}
                  activeFileId={activeFileId}
                  onSelect={onSelectFile}
                  onAddFile={onAddFile}
                  onDeleteFile={onDeleteFile}
                  onRenameFile={onRenameFile}
                  onMoveFile={onMoveFile}
                  onDuplicateFile={onDuplicateFile}
                  onDeleteFolder={onDeleteFolder}
                  onSetAsMainFile={onSetAsMainFile}
                  onCollapse={onToggle}
                  getBaseName={getBaseName}
                  getDirName={getDirName}
                  joinPath={joinPath}
                  sanitizePath={sanitizePath}
                  getFolderPaths={getFolderPaths}
                />
              </div>

              {/* Trash Panel */}
              <TrashPanel
                trashFiles={trashFiles}
                onRestore={onRestoreFile}
                onPermanentlyDelete={onPermanentlyDeleteFile}
                getBaseName={getBaseName}
              />
            </div>

            {outlineOpen && (
              <ResizeDivider
                orientation="horizontal"
                onResize={handleOutlineResize}
                className="mx-2"
              />
            )}

            {/* Outline Section */}
            <div
              className={`flex flex-col overflow-hidden border-t border-border/80 ${outlineOpen ? 'min-h-[120px]' : ''}`}
              style={outlineOpen ? { height: outlinePanelHeight } : undefined}
            >
              <SectionHeader label="OUTLINE" open={outlineOpen} onToggle={() => setOutlineOpen(o => !o)} />
              {outlineOpen && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <DocumentOutline
                    outline={outline}
                    onJumpToLine={onJumpToLine}
                  />
                </div>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  )
}
