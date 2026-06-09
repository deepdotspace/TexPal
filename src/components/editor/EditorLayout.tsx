/**
 * EditorLayout — top-level editor chrome that orchestrates multi-file editing,
 * compilation, settings, and panel layout.
 *
 * Multi-file strategy:
 *  - useProjectFiles manages the file list, migration, and CRUD.
 *  - FileEditor (keyed by activeFileId) holds the single live Yjs connection.
 *  - On every edit, FileEditor debounce-mirrors text → plainContent.
 *  - At compile time: active file uses live text, others use plainContent.
 */

import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMutations, useR2Files } from 'deepspace'
import { useCompilation, useDocumentOutline, usePanelResize, useEditorSettings, useVersionHistory, useAgentEditsProcessor } from '../../hooks'
import { useProjectFiles } from '../../hooks/useProjectFiles'
import type { ActiveDocumentContextValue } from '../../hooks/useActiveDocumentContext'
import { countWords } from './StatusBar'
import { useToast } from '../ui'

import { Sidebar } from '../sidebar/Sidebar'
import { EditorToolbar } from './EditorToolbar'
import { FileEditor } from './FileEditor'
import { ImagePreview, isImageFile } from './ImagePreview'
import type { CodeEditorHandle, CursorPosition } from './CodeEditor'
import { CompileLog } from './CompileLog'
import { StatusBar } from './StatusBar'
import { PdfViewer } from '../pdf/PdfViewer'
import { ResizeDivider } from '../shared/ResizeDivider'
import { EditorSettingsPanel } from '../settings/EditorSettingsPanel'
import { KeyboardShortcutsModal } from '../shared/KeyboardShortcutsModal'
import { ShareModal } from '../share/ShareModal'
import { AiChatSidebar, AiChatToggleButton } from '../ai-chat/AiChatSidebar'

interface EditorLayoutProps {
  documentId: string
  documentTitle: string
  templateId?: string
  onBack: () => void
  persistActiveDocumentContext: (nextContext: ActiveDocumentContextValue) => Promise<string>
}

const MIN_COMPILE_LOG_HEIGHT = 120
const DEFAULT_COMPILE_LOG_HEIGHT = 200
const MAX_COMPILE_LOG_HEIGHT = 400
const COMPILE_LOG_HEIGHT_STORAGE_KEY = 'latex-editor-compile-log-height'

function loadCompileLogHeight(): number {
  try {
    const stored = localStorage.getItem(COMPILE_LOG_HEIGHT_STORAGE_KEY)
    if (stored) {
      const height = parseInt(stored, 10)
      if (!isNaN(height) && height >= MIN_COMPILE_LOG_HEIGHT && height <= MAX_COMPILE_LOG_HEIGHT) {
        return height
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_COMPILE_LOG_HEIGHT
}

function saveCompileLogHeight(height: number) {
  try {
    localStorage.setItem(COMPILE_LOG_HEIGHT_STORAGE_KEY, height.toString())
  } catch { /* ignore */ }
}

export function EditorLayout({
  documentId,
  documentTitle,
  templateId,
  onBack,
  persistActiveDocumentContext,
}: EditorLayoutProps) {
  const editorRef = useRef<CodeEditorHandle>(null)
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, col: 1 })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [currentTitle, setCurrentTitle] = useState(documentTitle)
  const [compileLogHeight, setCompileLogHeight] = useState(loadCompileLogHeight)
  const [compileLogOpen, setCompileLogOpen] = useState(false)
  const { putConfirmed } = useMutations('documents')
  const toast = useToast()

  // Sync title when prop changes
  useEffect(() => {
    setCurrentTitle(documentTitle)
  }, [documentTitle])

  // Live text buffer for the active file, lifted from FileEditor.
  const [activeText, setActiveText] = useState('')

  const {
    files,
    trashFiles,
    activeFileId,
    activeFile,
    setActiveFileId,
    entryFilePath,
    isReady,
    initError,
    addFile,
    deleteFile,
    restoreFile,
    permanentlyDeleteFile,
    renameFile,
    moveFile,
    duplicateFile,
    deleteFolder,
    setAsMainFile,
    getFolderPaths,
    updatePlainContent,
    getFilesForCompilation,
    getBaseName,
    getDirName,
    joinPath,
    sanitizePath,
  } = useProjectFiles(documentId, { templateId })

  useAgentEditsProcessor({ documentId, files })

  // ── Other hooks ─────────────────────────────────────────────────
  const { settings, updateSetting } = useEditorSettings()
  const { upload: r2Upload } = useR2Files()

  async function uploadFile(blob: Blob, filename: string): Promise<{ success: boolean; url?: string; key?: string }> {
    const result = await r2Upload(blob, filename)
    return { success: result.success, url: result.url, key: result.key }
  }

  const { compile, isCompiling, status: compileStatus, pdfUrl, compilationLog, lastCompiledAt } = useCompilation({
    compiler: settings.compiler,
    bibEngine: settings.bibEngine,
    documentId,
  })
  const { versions, addVersion, getPdfUrl } = useVersionHistory(documentId)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const outline = useDocumentOutline(activeText)
  const {
    sidebarWidth,
    sidebarCollapsed,
    editorRatio,
    containerRef,
    handleSidebarResize,
    handleEditorResize,
    toggleSidebar,
  } = usePanelResize()
  const activeFilePath = activeFile?.data?.path || ''

  // ── AI chat sidebar (outside the card, on the left of the shell) ────────
  const [chatOpen, setChatOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('ai-chat-open') !== '0' } catch { return true }
  })
  const [chatWidth, setChatWidth] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem('ai-chat-width') || '', 10)
      if (!isNaN(v) && v >= 320 && v <= 640) return v
    } catch { /* ignore */ }
    return 420
  })
  useEffect(() => {
    try { localStorage.setItem('ai-chat-open', chatOpen ? '1' : '0') } catch { /* ignore */ }
  }, [chatOpen])
  useEffect(() => {
    try { localStorage.setItem('ai-chat-width', String(chatWidth)) } catch { /* ignore */ }
  }, [chatWidth])

  const handleChatResize = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    // Chat lives on the RIGHT. Width = distance from mouse to the shell's
    // right edge. Dragging LEFT makes the chat wider.
    const raw = rect.right - clientX
    const clamped = Math.max(320, Math.min(640, raw))
    setChatWidth(clamped)
  }, [containerRef])

  // ── Keep activeFilePath in sync when the user switches files ────────────────
  useEffect(() => {
    void persistActiveDocumentContext({
      activeDocumentId: documentId,
      activeDocumentTitle: currentTitle || documentTitle || 'Untitled',
      activeFilePath,
    }).catch((error: unknown) => {
      console.error('Failed to sync active file path:', error)
    })
  }, [
    documentId,
    documentTitle,
    currentTitle,
    activeFilePath,
    persistActiveDocumentContext,
  ])

  // Dark mode is managed at route level to prevent flash during navigation

  // ── Callbacks ───────────────────────────────────────────────────

  const handleTextChange = useCallback((text: string) => {
    setActiveText(text)
  }, [])

  const handlePlainContentSync = useCallback((fileId: string, content: string) => {
    updatePlainContent(fileId, content)
  }, [updatePlainContent])

  const handleCompile = useCallback(async () => {
    if (isCompiling) return

    const isEntryFileActive = activeFile?.data.path === entryFilePath
    const entryFileContent = isEntryFileActive 
      ? activeText.trim() 
      : files.find(f => f.data.path === entryFilePath)?.data.plainContent?.trim() || ''
    
    if (entryFileContent === '') {
      toast.error(`Entry file "${entryFilePath}" is empty. Please add content before compiling.`)
      return
    }

    const compilationFiles = getFilesForCompilation(activeText)
    const result = await compile(compilationFiles, entryFilePath)

    if (result.success && result.pdfBlob) {
      const entrySource = isEntryFileActive
        ? activeText
        : files.find(f => f.data.path === entryFilePath)?.data.plainContent || ''

      const uploadResult = await uploadFile(result.pdfBlob, `compiled-${documentId}-${Date.now()}.pdf`)
      if (uploadResult.success && uploadResult.url) {
        await addVersion({
          pdfUrl: uploadResult.url,
          pdfKey: uploadResult.key,
          latexSource: entrySource,
          compiler: settings.compiler,
        })
        setSelectedVersionId(null)
      } else {
        toast.error('Failed to save PDF to storage. The preview is temporary.')
      }
    }
  }, [activeText, activeFile, entryFilePath, files, getFilesForCompilation, compile, toast, isCompiling, addVersion, documentId, settings.compiler])

  const handleInsertSnippet = useCallback((snippet: string, wrapSelection?: boolean) => {
    editorRef.current?.insertSnippet(snippet, wrapSelection)
  }, [])

  const handleJumpToLine = useCallback((line: number) => {
    editorRef.current?.jumpToLine(line)
  }, [])

  const handleRenameDocument = useCallback(async (newTitle: string) => {
    try {
      await putConfirmed(documentId, { title: newTitle })
      setCurrentTitle(newTitle)
      toast.success(`Renamed to "${newTitle}"`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to rename document')
      throw err
    }
  }, [documentId, putConfirmed, toast])

  const loadJSZip = useCallback((): Promise<any> => {
    if ((window as any).JSZip) return Promise.resolve((window as any).JSZip)
    return new Promise((resolve, reject) => {
      const doc = window.document
      const script = doc.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js'
      script.onload = () => resolve((window as any).JSZip)
      script.onerror = () => reject(new Error('Failed to load JSZip'))
      doc.head.appendChild(script)
    })
  }, [])

  const handleDownloadSource = useCallback(async () => {
    try {
      const JSZip = await loadJSZip()
      const zip = new JSZip()

      for (const file of files) {
        if (file.data.path.endsWith('.gitkeep')) continue

        const isBinary = !!(file.data.base64Content && file.data.base64Content.length > 0)

        if (isBinary) {
          zip.file(file.data.path, file.data.base64Content!, { base64: true })
        } else {
          const content = file.recordId === activeFileId
            ? activeText
            : (file.data.plainContent || '')
          zip.file(file.data.path, content)
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      const projectName = currentTitle || 'latex-project'
      a.download = `${projectName.replace(/[^a-zA-Z0-9_\- ]/g, '_')}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Download source failed:', err)
      toast.error('Failed to create zip file')
    }
  }, [files, activeFileId, activeText, currentTitle, toast, loadJSZip])

  const handleCompileLogResize = useCallback((clientY: number) => {
    if (!containerRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const maxHeight = Math.max(MIN_COMPILE_LOG_HEIGHT, containerRect.height - 200)
    const nextHeight = containerRect.bottom - clientY
    const clampedHeight = Math.min(maxHeight, Math.max(MIN_COMPILE_LOG_HEIGHT, nextHeight))

    setCompileLogHeight(clampedHeight)
    saveCompileLogHeight(clampedHeight)
  }, [])

  // ── Keyboard shortcuts ──────────────────────────────────────────
  const handleCompileRef = useRef(handleCompile)
  handleCompileRef.current = handleCompile

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key === 'Enter' && !e.defaultPrevented) {
      e.preventDefault()
      handleCompileRef.current()
    }
    if (mod && e.key === 'b') {
      e.preventDefault()
      toggleSidebar()
    }
    if (mod && e.key === ',' && !e.shiftKey) {
      e.preventDefault()
      setSettingsOpen(prev => !prev)
    }
  }, [toggleSidebar])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const wordCount = useMemo(() => countWords(activeText), [activeText])

  // ── Version history derived state ─────────────────────────────
  const selectedVersion = useMemo(() => {
    if (!selectedVersionId) return null
    return versions.find(v => v.recordId === selectedVersionId) ?? null
  }, [selectedVersionId, versions])

  const [displayPdfUrl, setDisplayPdfUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    async function resolve() {
      if (selectedVersion) {
        const url = await getPdfUrl(selectedVersion)
        if (!cancelled) setDisplayPdfUrl(url)
      } else if (pdfUrl) {
        setDisplayPdfUrl(pdfUrl)
      } else if (versions.length > 0) {
        const url = await getPdfUrl(versions[0])
        if (!cancelled) setDisplayPdfUrl(url)
      } else {
        setDisplayPdfUrl(null)
      }
    }
    resolve()
    return () => { cancelled = true }
  }, [selectedVersion, getPdfUrl, pdfUrl, versions])

  // ── Loading state ───────────────────────────────────────────────
  if (!isReady || !activeFileId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface dark:bg-dark-surface">
        <div className="text-center">
          {initError ? (
            <>
              <div className="w-8 h-8 mx-auto mb-3 text-danger">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="text-content-danger dark:text-dark-content-danger text-sm font-medium mb-1">
                Initialization Error
              </div>
              <div className="text-content-secondary dark:text-dark-content-secondary text-sm mb-3">
                {initError}
              </div>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors"
              >
                Reload Page
              </button>
            </>
          ) : (
            <>
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
              <div className="text-content-secondary dark:text-dark-content-secondary text-sm">
                Loading project files...
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────
  // Shell layout adopted from the SDK sidebar feature — an outer tinted
  // flex container (`.editor-shell`) wraps a flex sibling sidebar and a
  // rounded `.editor-card`. Expanding the sidebar pushes the card's left
  // edge right; there is no overlay. See docs/ai-chat/sidebar-ux.md.
  const effectiveSidebarWidth = sidebarCollapsed ? 0 : sidebarWidth

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top app-bar — TeXPal brand on the left + doc title in the middle +
          "Back to TeXPal" link on the right. Both brand and right-link route
          to /?landing=1 so a returning signed-in user actually sees the
          landing page instead of being bounced to /home. */}
      <header className="texpal-topbar shrink-0">
        <Link to="/?landing=1" className="texpal-topbar-brand" aria-label="Back to TeXPal landing">
          <img src="/favicon.svg" alt="" width="20" height="20" />
          <span>TeXPal</span>
        </Link>
        <span className="texpal-topbar-title" title={currentTitle || documentTitle}>
          {currentTitle || documentTitle || 'Untitled'}
        </span>
        <Link to="/?landing=1" className="texpal-topbar-back">
          ← Back to TeXPal
        </Link>
      </header>
    <div ref={containerRef} className="editor-shell flex-1 min-h-0">
      <div className="editor-shell-row">
        {/* Card — the rounded rectangle that holds the "app": file-tree
            sidebar, editor, PDF. Visually distinct from the chat on the right. */}
        <div className="editor-card">
          {/* Compile-error banner */}
          {compileStatus === 'error' && compilationLog.summary.hasErrors && (
            <div className="px-3 py-1.5 bg-danger-light border-b border-border flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 bg-danger rounded-full shrink-0" />
              <span className="text-xs text-danger truncate">
                Compilation failed — {compilationLog.errors[0]?.message || 'check the compile log for details'}
              </span>
            </div>
          )}

          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* File-tree sidebar — INSIDE the card. */}
            <div style={{ width: effectiveSidebarWidth, minWidth: effectiveSidebarWidth, maxWidth: effectiveSidebarWidth }} className="shrink-0 overflow-hidden">
              <Sidebar
                documentTitle={currentTitle}
                onRenameDocument={handleRenameDocument}
                files={files}
                trashFiles={trashFiles}
                activeFileId={activeFileId}
                onSelectFile={setActiveFileId}
                onAddFile={(path, content, base64Content) => addFile(path, content, base64Content)}
                onDeleteFile={(id) => deleteFile(id)}
                onRenameFile={renameFile}
                onMoveFile={moveFile}
                onDuplicateFile={duplicateFile}
                onDeleteFolder={deleteFolder}
                onSetAsMainFile={setAsMainFile}
                onRestoreFile={restoreFile}
                onPermanentlyDeleteFile={permanentlyDeleteFile}
                outline={outline}
                onJumpToLine={handleJumpToLine}
                collapsed={sidebarCollapsed}
                onToggle={toggleSidebar}
                onHome={onBack}
                getBaseName={getBaseName}
                getDirName={getDirName}
                joinPath={joinPath}
                sanitizePath={sanitizePath}
                getFolderPaths={getFolderPaths}
              />
            </div>

            {sidebarCollapsed && (
              <button
                className="toolbar-btn shrink-0 self-start mt-2 ml-1"
                onClick={toggleSidebar}
                title="Show files (Ctrl+B)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>
            )}

            {!sidebarCollapsed && (
              <ResizeDivider orientation="vertical" onResize={handleSidebarResize} />
            )}

            {/* Editor Panel */}
            <div className="flex flex-col min-h-0 min-w-0" style={{ flex: editorRatio }}>
          <EditorToolbar
            onInsertSnippet={handleInsertSnippet}
            compiler={settings.compiler}
            onCompilerChange={(compiler) => updateSetting('compiler', compiler)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {activeFile && isImageFile(activeFile.data.path) ? (
              <ImagePreview
                fileName={activeFile.data.path}
                base64Content={activeFile.data.base64Content}
              />
            ) : (
              <FileEditor
                key={activeFileId}
                ref={editorRef}
                fileId={activeFileId}
                initialContent={activeFile?.data.plainContent || ''}
                agentRevision={activeFile?.data.agentRevision ?? 0}
                agentPlainContent={activeFile?.data.plainContent || ''}
                onTextChange={handleTextChange}
                onPlainContentSync={handlePlainContentSync}
                onCursorChange={setCursor}
                onCompile={handleCompile}
                readOnly={false}
                fontSize={settings.fontSize}
                lineWrapping={settings.lineWrapping}
                showLineNumbers={settings.lineNumbers}
                theme={settings.theme}
              />
            )}
          </div>
        </div>

            {/* Editor / PDF resize divider */}
            <ResizeDivider orientation="vertical" onResize={handleEditorResize} />

            {/* PDF Panel */}
            <div className="flex flex-col min-h-0 min-w-0" style={{ flex: 1 - editorRatio }}>
              <PdfViewer
                pdfUrl={displayPdfUrl}
                isCompiling={isCompiling}
                onDownloadSource={handleDownloadSource}
                onShareClick={() => setShareOpen(true)}
                onCompile={handleCompile}
                versions={versions}
                selectedVersionId={selectedVersionId}
                onSelectVersion={setSelectedVersionId}
                documentTitle={currentTitle}
              />
            </div>
          </div>

          {/* Bottom section — compile log + status bar, inside the card. */}
          <div className="flex flex-col shrink-0 min-h-0 w-full">
            {compileLogOpen && (
              <ResizeDivider
                orientation="horizontal"
                onResize={handleCompileLogResize}
                className="mx-0 shrink-0"
              />
            )}
            <CompileLog
              compilationLog={compilationLog}
              onJumpToLine={handleJumpToLine}
              forceOpen={compileStatus === 'error'}
              height={compileLogOpen ? compileLogHeight : undefined}
              onOpenChange={setCompileLogOpen}
            />

            <div className="shrink-0">
              <StatusBar
                cursor={cursor}
                wordCount={wordCount}
                compileStatus={compileStatus}
                lastCompiledAt={lastCompiledAt}
                compiler={settings.compiler}
                compileDuration={compilationLog.duration}
              />
            </div>
          </div>
        </div>
        {/* end editor-card */}

        {/* Resize handle for chat — only when chat is open, sits between the
            editor card and the chat panel. */}
        {chatOpen && (
          <ResizeDivider orientation="vertical" onResize={handleChatResize} />
        )}

        {/* AI chat sidebar — OUTSIDE the editor card, slides between 0 and
            `chatWidth` based on `chatOpen`. When closed renders 0-width
            (invisible) so ChatPanel stays mounted and useChat/localStorage
            state survive. */}
        <AiChatSidebar
          open={chatOpen}
          width={chatWidth}
          documentId={documentId}
          activeFilePath={activeFilePath || null}
          activeFileContent={activeText}
        />

        {/* Always-present toggle rail — the smiley stays at this fixed
            viewport position in both open and closed states. Clicking
            toggles the sidebar; the editor card slides left to make room
            when opening, slides back right when closing. Smooth anchor. */}
        <div className="shrink-0 flex flex-col items-center pt-3" style={{ width: 52 }}>
          <AiChatToggleButton open={chatOpen} onToggle={() => setChatOpen((v) => !v)} />
        </div>
      </div>
      {/* end editor-shell-row */}

      {/* Settings slide-over */}
      <EditorSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSetting={updateSetting}
      />

      {/* Keyboard shortcuts modal */}
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* Share modal */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        documentTitle={currentTitle}
      />
    </div>
    </div>
  )
}
