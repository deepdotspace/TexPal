/**
 * FileTree — Redesigned file system UI with drag-and-drop, multi-selection,
 * search, keyboard shortcuts, rename, and enhanced context menus
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  hasValidProjectFileExtension,
  type ProjectFileRecord,
} from '../../hooks/useProjectFiles'
import { UploadDialog } from './UploadDialog'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

interface FileTreeProps {
  files: ProjectFileRecord[]
  activeFileId: string | null
  onSelect: (id: string) => void
  onAddFile: (path: string, content?: string, base64Content?: string) => void
  onDeleteFile: (id: string) => void
  onRenameFile: (id: string, newPath: string) => Promise<void>
  onMoveFile: (id: string, targetFolder: string) => Promise<void>
  onDuplicateFile: (id: string) => Promise<string | null>
  onDeleteFolder: (folderPath: string) => Promise<void>
  onSetAsMainFile: (id: string) => Promise<void>
  onCollapse: () => void
  getBaseName: (path: string) => string
  getDirName: (path: string) => string
  joinPath: (...parts: string[]) => string
  sanitizePath: (path: string) => string
  getFolderPaths: () => string[]
}

const FILE_TYPE_COLORS: Record<string, string> = {
  tex: '#427B3A',
  bib: '#B8860B',
  sty: '#7C3AED',
  cls: '#7C3AED',
  bst: '#7C3AED',
  png: '#0EA5E9',
  jpg: '#0EA5E9',
  jpeg: '#0EA5E9',
  gif: '#0EA5E9',
  svg: '#0EA5E9',
  eps: '#0EA5E9',
  pdf: '#DC2626',
  ttf: '#C2410C',
  otf: '#C2410C',
  woff: '#C2410C',
  woff2: '#C2410C',
  zip: '#6B7280',
}

interface TreeNode {
  name: string
  path: string
  folders: Map<string, TreeNode>
  files: ProjectFileRecord[]
}

function createTreeNode(name: string, path: string): TreeNode {
  return {
    name,
    path,
    folders: new Map(),
    files: [],
  }
}

function ensureFolderNode(root: TreeNode, folderPath: string): TreeNode {
  const segments = folderPath.split('/').filter(Boolean)
  let node = root

  for (const segment of segments) {
    const childPath = node.path ? `${node.path}/${segment}` : segment
    if (!node.folders.has(segment)) {
      node.folders.set(segment, createTreeNode(segment, childPath))
    }
    node = node.folders.get(segment)!
  }

  return node
}

function buildFileTree(files: ProjectFileRecord[]): TreeNode {
  const root = createTreeNode('', '')

  for (const file of files) {
    const normalizedPath = file.data.path
    const segments = normalizedPath.split('/').filter(Boolean)
    if (segments.length === 0) continue

    const folderPath = segments.slice(0, -1).join('/')
    const targetFolder = folderPath ? ensureFolderNode(root, folderPath) : root
    targetFolder.files.push(file)
  }

  return root
}

function sortTreeNode(node: TreeNode): TreeNode {
  const sortedFolders = [...node.folders.values()]
    .map(sortTreeNode)
    .sort((a, b) => a.name.localeCompare(b.name))

  const sortedFiles = [...node.files].sort((a, b) => {
    if (a.data.isEntryFile) return -1
    if (b.data.isEntryFile) return 1
    const aName = a.data.path.split('/').pop() || ''
    const bName = b.data.path.split('/').pop() || ''
    return aName.localeCompare(bName)
  })

  return {
    ...node,
    folders: new Map(sortedFolders.map(folder => [folder.name, folder])),
    files: sortedFiles,
  }
}

function FileTypeIcon({ type }: { type: string }) {
  const color = FILE_TYPE_COLORS[type] || '#6B7280'

  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'eps', 'pdf'].includes(type)) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="2" stroke={color} strokeWidth="1.2" />
        <circle cx="6" cy="6" r="1.3" stroke={color} strokeWidth="1" />
        <path d="M4 11l2.5-2.5 2 2 1.5-1.5L12 11" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (['ttf', 'otf', 'woff', 'woff2'].includes(type)) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M2.5 4.5h11M8 4.5v7M5.5 11.5h5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === 'zip') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke={color} strokeWidth="1.2" />
        <path d="M7 3h2M7 5h2M7 7h2M7 9h2M8 11.5h0" stroke={color} strokeWidth="1" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'bib') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="1" width="12" height="14" rx="1.5" stroke={color} strokeWidth="1.2" />
        <path d="M5 5h6M5 8h6M5 11h4" stroke={color} strokeWidth="1" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 1.5h5.5L13 5v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" stroke={color} strokeWidth="1.2" />
      <path d="M9.5 1.5V5H13" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface DragState {
  type: 'file' | 'folder'
  id: string
  path: string
  multiple: boolean
  ids: string[]
}

export function FileTree({
  files,
  activeFileId,
  onSelect,
  onAddFile,
  onDeleteFile,
  onRenameFile,
  onMoveFile,
  onDuplicateFile,
  onDeleteFolder,
  onSetAsMainFile,
  onCollapse,
  getBaseName,
  getDirName,
  joinPath,
  sanitizePath,
  getFolderPaths,
}: FileTreeProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [isAddingFile, setIsAddingFile] = useState(false)
  const [isAddingFolder, setIsAddingFolder] = useState(false)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [addError, setAddError] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string; type: 'file' | 'folder' } | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  // Filter files based on search
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files
    const query = searchQuery.toLowerCase()
    return files.filter(file => {
      const path = file.data.path.toLowerCase()
      const name = getBaseName(file.data.path).toLowerCase()
      return path.includes(query) || name.includes(query)
    })
  }, [files, searchQuery, getBaseName])

  // Build tree structure
  const treeRoot = useMemo(
    () => sortTreeNode(buildFileTree(filteredFiles)),
    [filteredFiles],
  )

  const folderPaths = useMemo(() => {
    const paths: string[] = []
    const walk = (node: TreeNode) => {
      for (const child of node.folders.values()) {
        paths.push(child.path)
        walk(child)
      }
    }
    walk(treeRoot)
    return paths
  }, [treeRoot])

  // Auto-expand folders when they contain files
  useEffect(() => {
    if (folderPaths.length === 0) return
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      for (const path of folderPaths) {
        if (!prev.has(path)) next.add(path)
      }
      return next
    })
  }, [folderPaths])

  // Focus inputs when they appear
  useEffect(() => {
    if (isAddingFile) fileInputRef.current?.focus()
  }, [isAddingFile])

  useEffect(() => {
    if (isAddingFolder) folderInputRef.current?.focus()
  }, [isAddingFolder])

  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [renamingId])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement) {
        if (e.key === 'Escape') {
          setIsAddingFile(false)
          setIsAddingFolder(false)
          setRenamingId(null)
          setSearchQuery('')
        }
        return
      }

      // Ctrl/Cmd + F: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        // Search will be handled by search input focus
        return
      }

      // Delete/Backspace: Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        for (const id of selectedIds) {
          const file = files.find(f => f.recordId === id)
          if (file && !file.data.isEntryFile) {
            onDeleteFile(id)
          }
        }
        setSelectedIds(new Set())
        return
      }

      // F2: Rename selected
      if (e.key === 'F2' && selectedIds.size === 1) {
        e.preventDefault()
        const id = Array.from(selectedIds)[0]
        const file = files.find(f => f.recordId === id)
        if (file) {
          setRenamingId(id)
          setRenamingValue(getBaseName(file.data.path))
        }
        return
      }

      // Ctrl/Cmd + A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && treeRef.current?.contains(document.activeElement)) {
        e.preventDefault()
        setSelectedIds(new Set(files.map(f => f.recordId)))
        return
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        setSelectedIds(new Set())
        setContextMenu(null)
        setDragState(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds, files, onDeleteFile, getBaseName])

  // Click outside to clear selection
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (treeRef.current && !treeRef.current.contains(e.target as Node)) {
        setSelectedIds(new Set())
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Validation and add file
  const validateAndAddFile = useCallback(() => {
    const name = sanitizePath(newFileName)
    if (!name) {
      setIsAddingFile(false)
      return
    }

    const hasExt = hasValidProjectFileExtension(name)
    if (!hasExt) {
      setAddError('Unsupported file type')
      return
    }

    if (files.some(f => f.data.path === name)) {
      setAddError('File already exists')
      return
    }

    onAddFile(name)
    setNewFileName('')
    setAddError('')
    setIsAddingFile(false)
  }, [newFileName, files, onAddFile, sanitizePath])

  // Validation and add folder
  const validateAndAddFolder = useCallback(() => {
    const folderPath = sanitizePath(newFolderName)
    if (!folderPath) {
      setIsAddingFolder(false)
      return
    }

    const folderAlreadyExists = folderPaths.includes(folderPath)
    if (folderAlreadyExists) {
      setAddError('Folder already exists')
      return
    }

    // Create a .gitkeep file to persist the folder
    const gitkeepPath = joinPath(folderPath, '.gitkeep')
    if (files.some(f => f.data.path === gitkeepPath)) {
      setAddError('Folder already exists')
      return
    }

    onAddFile(gitkeepPath, '')
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.add(folderPath)
      return next
    })
    setNewFolderName('')
    setAddError('')
    setIsAddingFolder(false)
  }, [newFolderName, folderPaths, files, sanitizePath, joinPath, onAddFile])

  // Rename handler
  const handleRename = useCallback(async () => {
    if (!renamingId || !renamingValue.trim()) {
      setRenamingId(null)
      setRenamingValue('')
      return
    }

    const file = files.find(f => f.recordId === renamingId)
    if (!file) {
      setRenamingId(null)
      setRenamingValue('')
      return
    }

    const currentDir = getDirName(file.data.path)
    const newPath = currentDir ? joinPath(currentDir, sanitizePath(renamingValue)) : sanitizePath(renamingValue)

    try {
      await onRenameFile(renamingId, newPath)
      setRenamingId(null)
      setRenamingValue('')
    } catch (error: any) {
      setAddError(error.message || 'Failed to rename')
    }
  }, [renamingId, renamingValue, files, onRenameFile, getDirName, joinPath, sanitizePath])

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, file: ProjectFileRecord) => {
    const isSelected = selectedIds.has(file.recordId)
    const idsToDrag = isSelected && selectedIds.size > 1 ? Array.from(selectedIds) : [file.recordId]

    setDragState({
      type: 'file',
      id: file.recordId,
      path: file.data.path,
      multiple: idsToDrag.length > 1,
      ids: idsToDrag,
    })

    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', file.recordId)
  }, [selectedIds])

  const handleDragOver = useCallback((e: React.DragEvent, folderPath: string) => {
    if (!dragState) return

    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(folderPath)
  }, [dragState])

  const handleDragLeave = useCallback(() => {
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault()
    if (!dragState) return

    try {
      for (const id of dragState.ids) {
        await onMoveFile(id, targetFolder)
      }
    } catch (error: any) {
      setAddError(error.message || 'Failed to move file')
    }

    setDragState(null)
    setDropTarget(null)
    setSelectedIds(new Set())
  }, [dragState, onMoveFile])

  // Toggle folder
  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
      } else {
        next.add(folderPath)
      }
      return next
    })
  }, [])

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, file: ProjectFileRecord | null, folderPath: string | null) => {
    e.preventDefault()
    e.stopPropagation()

    if (file) {
      // If right-clicking on a file that's not selected, select just that file
      // If right-clicking on a file that's already selected (with others), keep the selection
      if (!selectedIds.has(file.recordId)) {
        setSelectedIds(new Set([file.recordId]))
      }

      setContextMenu({ x: e.clientX, y: e.clientY, targetId: file.recordId, type: 'file' })
    } else if (folderPath) {
      const items: ContextMenuItem[] = [
        {
          label: 'New File',
          icon: (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 1.5h5.5L13 5v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" />
              <path d="M9.5 1.5V5H13" />
            </svg>
          ),
          onClick: () => {
            setIsAddingFile(true)
            setNewFileName('')
          },
        },
        {
          label: 'New Folder',
          icon: (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.25l1.2 1.2c.28.28.66.44 1.06.44H13a1.5 1.5 0 0 1 1.5 1.5V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4.5Z" />
            </svg>
          ),
          onClick: () => {
            setIsAddingFolder(true)
            setNewFolderName('')
          },
        },
        { separator: true },
        {
          label: 'Delete Folder',
          icon: (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4M6.5 7v4M9.5 7v4" />
            </svg>
          ),
          onClick: async () => {
            try {
              await onDeleteFolder(folderPath)
            } catch (error: any) {
              setAddError(error.message || 'Failed to delete folder')
            }
          },
          danger: true,
        },
      ]

      setContextMenu({ x: e.clientX, y: e.clientY, targetId: folderPath, type: 'folder' })
    }
  }, [selectedIds, setIsAddingFile, setIsAddingFolder, setNewFileName, setNewFolderName, onDeleteFolder])

  // Render file node
  const renderFileNode = useCallback((file: ProjectFileRecord, depth: number) => {
    const isActive = file.recordId === activeFileId
    const isSelected = selectedIds.has(file.recordId)
    const isRenaming = renamingId === file.recordId
    const ext = file.data.path.toLowerCase().split('.').pop() || file.data.fileType || 'tex'
    const displayName = getBaseName(file.data.path)

    return (
      <div
        key={file.recordId}
        className={`group relative ${
          isSelected ? 'bg-accent/15' : ''
        }`}
        draggable={!file.data.isEntryFile}
        onDragStart={(e) => handleDragStart(e, file)}
      >
        <button
          className={`flex items-center gap-2 w-full pr-3 py-[5px] text-[13px] leading-tight transition-colors ${
            isActive
              ? 'bg-accent/10 text-accent font-medium'
              : isSelected
                ? 'bg-accent/10 text-content'
                : 'text-content hover:bg-black/[0.04]'
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              // Multi-select
              setSelectedIds(prev => {
                const next = new Set(prev)
                if (next.has(file.recordId)) {
                  next.delete(file.recordId)
                } else {
                  next.add(file.recordId)
                }
                return next
              })
            } else if (e.shiftKey && selectedIds.size > 0) {
              // Range select (simplified - select all between)
              const allIds = files.map(f => f.recordId)
              const lastSelected = Array.from(selectedIds)[selectedIds.size - 1]
              const lastIndex = allIds.indexOf(lastSelected)
              const currentIndex = allIds.indexOf(file.recordId)
              const start = Math.min(lastIndex, currentIndex)
              const end = Math.max(lastIndex, currentIndex)
              const range = allIds.slice(start, end + 1)
              setSelectedIds(new Set(range))
            } else {
              setSelectedIds(new Set([file.recordId]))
              onSelect(file.recordId)
            }
          }}
          onDoubleClick={() => {
            if (!file.data.isEntryFile) {
              setRenamingId(file.recordId)
              setRenamingValue(displayName)
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, file, null)}
        >
          <FileTypeIcon type={ext} />
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              className="flex-1 min-w-0 px-1.5 py-0.5 text-[13px] bg-transparent border border-accent rounded outline-none"
              value={renamingValue}
              onChange={(e) => setRenamingValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleRename()
                } else if (e.key === 'Escape') {
                  setRenamingId(null)
                  setRenamingValue('')
                }
              }}
              onBlur={handleRename}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate flex-1 text-left">{displayName}</span>
          )}
          {file.data.isEntryFile && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-medium ${
              isActive
                ? 'bg-accent/15 text-accent'
                : 'bg-black/[0.05] text-content-tertiary'
            }`}>
              main
            </span>
          )}
        </button>
      </div>
    )
  }, [activeFileId, selectedIds, renamingId, renamingValue, files, onSelect, handleDragStart, handleContextMenu, handleRename, getBaseName])

  // Render folder node
  const renderFolderNode = useCallback((folder: TreeNode, depth: number): React.ReactNode => {
    const expanded = expandedFolders.has(folder.path)
    const children = [...folder.folders.values()]
    const hasChildren = children.length > 0 || folder.files.length > 0
    const isDropTarget = dropTarget === folder.path

    return (
      <div key={folder.path}>
        <div
          className={`relative ${
            isDropTarget ? 'bg-accent/20 border-l-2 border-accent' : ''
          }`}
          onDragOver={(e) => handleDragOver(e, folder.path)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, folder.path)}
        >
          <button
            className="flex items-center gap-2 w-full pr-3 py-[5px] text-[13px] text-content hover:bg-black/[0.04]"
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => hasChildren && toggleFolder(folder.path)}
            onContextMenu={(e) => handleContextMenu(e, null, folder.path)}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="currentColor"
              className={`transition-transform duration-150 shrink-0 ${expanded ? 'rotate-90' : ''}`}
            >
              <path d="M6 3l5 5-5 5z" />
            </svg>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.25l1.2 1.2c.28.28.66.44 1.06.44H13a1.5 1.5 0 0 1 1.5 1.5V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4.5Z" stroke="#D97706" strokeWidth="1.2" />
            </svg>
            <span className="truncate text-left">{folder.name}</span>
          </button>
        </div>

        {expanded && (
          <>
            {children.map(child => renderFolderNode(child, depth + 1))}
            {folder.files.map(file => renderFileNode(file, depth + 1))}
          </>
        )}
      </div>
    )
  }, [expandedFolders, dropTarget, toggleFolder, handleDragOver, handleDragLeave, handleDrop, handleContextMenu, renderFileNode])

  // Upload handler
  const handleUpload = useCallback(async (
    uploadFiles: Array<{ path: string; content?: string; base64Content?: string }>
  ) => {
    for (const file of uploadFiles) {
      const normalizedPath = sanitizePath(file.path)
      if (files.some(existing => existing.data.path === normalizedPath)) continue
      onAddFile(normalizedPath, file.content, file.base64Content)
    }
  }, [files, onAddFile, sanitizePath])

  const normalizedPaths = useMemo(
    () => files.map(file => file.data.path),
    [files],
  )

  // Context menu items based on selection
  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenu) return []

    if (contextMenu.type === 'file') {
      const file = files.find(f => f.recordId === contextMenu.targetId)
      if (!file) return []

      // Determine which files to operate on
      // If multiple files are selected and the right-clicked file is in the selection, operate on all selected files
      const isRightClickedFileSelected = selectedIds.has(contextMenu.targetId)
      const hasMultipleSelection = selectedIds.size > 1 && isRightClickedFileSelected
      const filesToOperateOn = hasMultipleSelection 
        ? Array.from(selectedIds).map(id => files.find(f => f.recordId === id)).filter(Boolean) as ProjectFileRecord[]
        : [file]

      // Filter out entry files from bulk operations
      const nonEntryFiles = filesToOperateOn.filter(f => !f.data.isEntryFile)
      const canOperateOnMultiple = hasMultipleSelection && nonEntryFiles.length > 0

      const isTexFile = file.data.path.toLowerCase().endsWith('.tex')
      const menuItems: ContextMenuItem[] = []

      // Set as Main File (only for .tex files that aren't already main)
      if (isTexFile && !file.data.isEntryFile && !hasMultipleSelection) {
        menuItems.push({
          label: 'Set as Main File',
          icon: (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2L3 7l5 5 5-5-5-5z" />
              <circle cx="8" cy="7" r="2" fill="currentColor" />
            </svg>
          ),
          onClick: async () => {
            try {
              await onSetAsMainFile(file.recordId)
            } catch (error: any) {
              setAddError(error.message || 'Failed to set as main file')
            }
          },
        })
        menuItems.push({ separator: true })
      }

      menuItems.push({
        label: 'Rename',
        icon: (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M11 2H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V5l-3-3z" />
            <path d="M9 2v3h3M7 9h2" />
          </svg>
        ),
        onClick: () => {
          setRenamingId(file.recordId)
          setRenamingValue(getBaseName(file.data.path))
        },
        disabled: file.data.isEntryFile || hasMultipleSelection,
      })

      menuItems.push({
        label: hasMultipleSelection ? `Duplicate (${nonEntryFiles.length})` : 'Duplicate',
          icon: (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="10" height="10" rx="1" />
              <path d="M6 1h6a1 1 0 0 1 1 1v6" />
            </svg>
          ),
          onClick: async () => {
            try {
              if (canOperateOnMultiple) {
                // Duplicate all selected non-entry files
                for (const f of nonEntryFiles) {
                  await onDuplicateFile(f.recordId)
                }
              } else {
                await onDuplicateFile(file.recordId)
              }
            } catch (error: any) {
              setAddError(error.message || 'Failed to duplicate')
            }
          },
          disabled: file.data.isEntryFile && !canOperateOnMultiple,
        })

      menuItems.push({
        label: 'Copy Path',
          icon: (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="10" height="10" rx="1" />
            </svg>
          ),
          onClick: () => {
            navigator.clipboard.writeText(file.data.path)
          },
          disabled: hasMultipleSelection,
        })

      menuItems.push({ separator: true })

      menuItems.push({
        label: hasMultipleSelection ? `Delete (${nonEntryFiles.length})` : 'Delete',
          icon: (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4M6.5 7v4M9.5 7v4" />
              <path d="M3.5 4l.5 9.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1L12.5 4" />
            </svg>
          ),
          onClick: () => {
            if (canOperateOnMultiple) {
              // Delete all selected non-entry files
              for (const f of nonEntryFiles) {
                onDeleteFile(f.recordId)
              }
              setSelectedIds(new Set())
            } else {
              onDeleteFile(file.recordId)
            }
          },
          danger: true,
          disabled: file.data.isEntryFile && !canOperateOnMultiple,
        })

      return menuItems
    } else {
      // Folder context menu
      return [
        {
          label: 'New File',
          icon: (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 1.5h5.5L13 5v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" />
              <path d="M9.5 1.5V5H13" />
            </svg>
          ),
          onClick: () => {
            setIsAddingFile(true)
            setNewFileName('')
          },
        },
        {
          label: 'New Folder',
          icon: (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.25l1.2 1.2c.28.28.66.44 1.06.44H13a1.5 1.5 0 0 1 1.5 1.5V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4.5Z" />
            </svg>
          ),
          onClick: () => {
            setIsAddingFolder(true)
            setNewFolderName('')
          },
        },
        { separator: true },
        {
          label: 'Delete Folder',
          icon: (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4M6.5 7v4M9.5 7v4" />
            </svg>
          ),
          onClick: async () => {
            try {
              await onDeleteFolder(contextMenu.targetId)
            } catch (error: any) {
              setAddError(error.message || 'Failed to delete folder')
            }
          },
          danger: true,
        },
      ]
    }
  }, [contextMenu, files, selectedIds, onDeleteFile, onDuplicateFile, onDeleteFolder, getBaseName])

  return (
    <div ref={treeRef} className="flex h-full min-h-0 flex-col">
      {/* Header with search */}
      <div className="flex flex-col border-b border-border/80">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] font-semibold tracking-wide text-content-secondary">FILE TREE</span>
          <div className="flex items-center gap-0.5">
            <button
              className="toolbar-btn !w-6 !h-6"
              title="New file (Ctrl+N)"
              onClick={() => {
                setIsAddingFolder(false)
                setIsAddingFile(true)
                setAddError('')
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 1.5h5.5L13 5v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" />
                <path d="M9.5 1.5V5H13" />
                <path d="M8 8v4M6 10h4" />
              </svg>
            </button>
            <button
              className="toolbar-btn !w-6 !h-6"
              title="New folder"
              onClick={() => {
                setIsAddingFile(false)
                setIsAddingFolder(true)
                setAddError('')
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.25l1.2 1.2c.28.28.66.44 1.06.44H13a1.5 1.5 0 0 1 1.5 1.5V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4.5Z" />
                <path d="M8 7.5v3M6.5 9h3" />
              </svg>
            </button>
            <button
              className="toolbar-btn !w-6 !h-6"
              title="Upload files or folder"
              onClick={() => setIsUploadOpen(true)}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 10V3M5.5 5.5 8 3l2.5 2.5" />
                <path d="M2 10.5v2A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-2" />
              </svg>
            </button>
            <button
              className="toolbar-btn !w-6 !h-6"
              title="Collapse sidebar"
              onClick={onCollapse}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-3 pb-2">
          <div className="relative">
            <input
              type="text"
              className="w-full px-2 py-1.5 pl-7 text-[12px] bg-black/[0.03] border border-border rounded outline-none focus:border-accent focus:bg-black/[0.05]"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-content-tertiary"
            >
              <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.2" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content"
                onClick={() => setSearchQuery('')}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 4l-8 8M4 4l8 8" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* File tree */}
      <div className="py-0.5 flex-1 overflow-y-auto">
        {[...treeRoot.folders.values()].map(folder => renderFolderNode(folder, 0))}
        {treeRoot.files.map(file => renderFileNode(file, 0))}

        {filteredFiles.length === 0 && files.length > 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-content-tertiary">
            No files match "{searchQuery}"
          </div>
        )}

        {files.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-content-tertiary">
            No files yet. Create a new file to get started.
          </div>
        )}
      </div>

      {/* Selection count */}
      {selectedIds.size > 1 && (
        <div className="px-3 py-1.5 border-t border-border bg-accent/5 text-[11px] text-content-secondary">
          {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
        </div>
      )}

      {/* Add file input */}
      {isAddingFile && (
        <div className="px-2 py-1 border-t border-border">
          <div className="flex items-center gap-1.5 px-1">
            <FileTypeIcon type="tex" />
            <input
              ref={fileInputRef}
              type="text"
              className="flex-1 min-w-0 px-1.5 py-1 text-[13px] bg-transparent border border-accent rounded outline-none"
              placeholder="filename.tex"
              value={newFileName}
              onChange={(e) => {
                setNewFileName(e.target.value)
                setAddError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  validateAndAddFile()
                } else if (e.key === 'Escape') {
                  setIsAddingFile(false)
                  setNewFileName('')
                  setAddError('')
                }
              }}
              onBlur={() => {
                if (!newFileName.trim()) {
                  setIsAddingFile(false)
                  setAddError('')
                }
              }}
            />
          </div>
          {addError && (
            <div className="text-[10px] text-danger mt-0.5 px-1 ml-5">{addError}</div>
          )}
        </div>
      )}

      {/* Add folder input */}
      {isAddingFolder && (
        <div className="px-2 py-1 border-t border-border">
          <div className="flex items-center gap-1.5 px-1">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.25l1.2 1.2c.28.28.66.44 1.06.44H13a1.5 1.5 0 0 1 1.5 1.5V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4.5Z" stroke="#D97706" strokeWidth="1.2" />
            </svg>
            <input
              ref={folderInputRef}
              type="text"
              className="flex-1 min-w-0 px-1.5 py-1 text-[13px] bg-transparent border border-accent rounded outline-none"
              placeholder="images/icons"
              value={newFolderName}
              onChange={(e) => {
                setNewFolderName(e.target.value)
                setAddError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  validateAndAddFolder()
                } else if (e.key === 'Escape') {
                  setIsAddingFolder(false)
                  setNewFolderName('')
                  setAddError('')
                }
              }}
              onBlur={() => {
                if (!newFolderName.trim()) {
                  setIsAddingFolder(false)
                  setAddError('')
                }
              }}
            />
          </div>
          {addError && (
            <div className="text-[10px] text-danger mt-0.5 px-1 ml-5">{addError}</div>
          )}
        </div>
      )}

      {/* Error message */}
      {addError && !isAddingFile && !isAddingFolder && (
        <div className="text-[10px] text-danger px-3 py-0.5 border-t border-border">{addError}</div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          items={getContextMenuItems()}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Upload dialog */}
      <UploadDialog
        isOpen={isUploadOpen}
        existingPaths={normalizedPaths}
        onUpload={handleUpload}
        onClose={() => setIsUploadOpen(false)}
      />
    </div>
  )
}
