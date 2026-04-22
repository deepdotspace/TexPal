/**
 * useProjectFiles — manages multi-file LaTeX project lifecycle.
 *
 * Responsibilities:
 *  - Query projectFiles for the current document
 *  - Migrate from legacy documents.content on first load
 *  - Track active file selection
 *  - CRUD: add / delete files
 *  - Mirror active text to plainContent (debounced)
 *  - Assemble files for compilation
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutations } from 'deepspace'
import { BLANK_TEMPLATE } from '../constants'
import { useGitHubTemplates } from './useGitHubTemplates'
import type { CompilationProjectFile } from './useCompilation'

export interface ProjectFileRecord {
  recordId: string
  data: {
    documentId: string
    path: string
    fileType: string
    isEntryFile?: boolean
    plainContent?: string
    agentRevision?: number
    base64Content?: string
    deletedAt?: number
    originalPath?: string
  }
}

interface UseProjectFilesOptions {
  templateId?: string
}

const TEXT_FILE_TYPES: Record<string, string> = {
  '.tex': 'tex',
  '.bib': 'bib',
  '.sty': 'sty',
  '.cls': 'cls',
  '.bst': 'bst',
  '.dtx': 'dtx',
  '.ins': 'ins',
  '.def': 'def',
  '.cfg': 'cfg',
  '.fd': 'fd',
  '.ldf': 'ldf',
  '.bbx': 'bbx',
  '.cbx': 'cbx',
  '.dbx': 'dbx',
  '.lbx': 'lbx',
  '.txt': 'txt',
  '.md': 'md',
  '.csv': 'csv',
  '.tsv': 'tsv',
  '.lua': 'lua',
  '.py': 'py',
}

const BINARY_FILE_TYPES: Record<string, string> = {
  '.png': 'png',
  '.jpg': 'jpg',
  '.jpeg': 'jpeg',
  '.gif': 'gif',
  '.svg': 'svg',
  '.eps': 'eps',
  '.pdf': 'pdf',
  '.ttf': 'ttf',
  '.otf': 'otf',
  '.woff': 'woff',
  '.woff2': 'woff2',
  '.zip': 'zip',
}

export const VALID_PROJECT_FILE_EXTENSIONS = [
  ...Object.keys(TEXT_FILE_TYPES),
  ...Object.keys(BINARY_FILE_TYPES),
]

export const BLOCKED_PROJECT_FILE_EXTENSIONS = [
  '.aux',
  '.bbl',
  '.toc',
  '.lof',
  '.lot',
  '.out',
  '.log',
  '.synctex.gz',
  '.fls',
  '.fdb_latexmk',
  '.run.xml',
  '.bcf',
]

function getPathExtension(path: string): string {
  const lowerPath = path.toLowerCase()

  // Preserve multi-part generated extensions so we can explicitly block them.
  for (const ext of BLOCKED_PROJECT_FILE_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) return ext
  }

  const dotIndex = lowerPath.lastIndexOf('.')
  if (dotIndex === -1) return ''
  return lowerPath.slice(dotIndex)
}

export function hasValidProjectFileExtension(path: string): boolean {
  // Allow .gitkeep files for folder creation
  if (path.endsWith('.gitkeep')) return true
  
  const extension = getPathExtension(path)
  if (!extension) return false
  if (BLOCKED_PROJECT_FILE_EXTENSIONS.includes(extension)) return false
  return VALID_PROJECT_FILE_EXTENSIONS.includes(extension)
}

export function isBinaryFile(path: string): boolean {
  const extension = getPathExtension(path)
  return Object.prototype.hasOwnProperty.call(BINARY_FILE_TYPES, extension)
}

function inferFileType(path: string): string {
  // Handle .gitkeep files
  if (path.endsWith('.gitkeep')) return 'txt'
  
  const extension = getPathExtension(path)
  if (Object.prototype.hasOwnProperty.call(TEXT_FILE_TYPES, extension)) {
    return TEXT_FILE_TYPES[extension]
  }
  if (Object.prototype.hasOwnProperty.call(BINARY_FILE_TYPES, extension)) {
    return BINARY_FILE_TYPES[extension]
  }
  return 'tex'
}

export function useProjectFiles(documentId: string, options: UseProjectFilesOptions = {}) {
  const { templateId } = options

  const { records, status, error } = useQuery('projectFiles', {
    where: { documentId },
  })
  const { create, put, remove, createConfirmed } = useMutations('projectFiles')
  const { loadTemplateContent, loadTemplateFiles } = useGitHubTemplates()

  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const initRef = useRef(false)
  const initFailedRef = useRef(false)

  // Filter out deleted files from main list
  const files = useMemo<ProjectFileRecord[]>(() => {
    if (status !== 'ready') return []
    return [...(records as ProjectFileRecord[])]
      .filter(f => !f.data.deletedAt) // Exclude deleted files
      .sort((a, b) => {
        if (a.data.isEntryFile) return -1
        if (b.data.isEntryFile) return 1
        return a.data.path.localeCompare(b.data.path)
      })
  }, [records, status])

  // Trash files (deleted)
  const trashFiles = useMemo<ProjectFileRecord[]>(() => {
    if (status !== 'ready') return []
    return [...(records as ProjectFileRecord[])]
      .filter(f => f.data.deletedAt)
      .sort((a, b) => (b.data.deletedAt || 0) - (a.data.deletedAt || 0))
  }, [records, status])

  // ── Initialisation / migration ────────────────────────────────────
  useEffect(() => {
    if (status === 'error') {
      setInitError(error || 'Failed to load project files.')
      return
    }
    if (status !== 'ready' || initRef.current || initFailedRef.current) return

    if (files.length > 0) {
      initRef.current = true
      initFailedRef.current = false
      const entry = files.find(f => f.data.isEntryFile) || files[0]
      setActiveFileId(prev => prev ?? entry.recordId)
      setIsReady(true)
      setInitError(null)
      return
    }

    initRef.current = true
    setInitError(null)

    // Fetch template content (blank template is local, others from GitHub)
    async function initializeContent() {
      const existingRecords = (records as ProjectFileRecord[]).filter(f => !f.data.deletedAt)
      const existingPaths = new Set(existingRecords.map(f => f.data.path))
      try {
        // Multi-file template: load all files from jsDelivr
        if (templateId) {
          const fileSet = await loadTemplateFiles(templateId)
          if (fileSet && fileSet.files.length > 0) {
            let entryFileId: string | null = null
            for (const f of fileSet.files) {
              if (existingPaths.has(f.path)) {
                const existingFile = existingRecords.find(r => r.data.path === f.path)
                if (existingFile && f.path === fileSet.mainTexPath) {
                  entryFileId = existingFile.recordId
                }
                continue
              }

              const isEntry = f.path === fileSet.mainTexPath
              const binary = !!f.base64Content
              const id = await createConfirmed({
                documentId,
                path: f.path,
                fileType: inferFileType(f.path),
                isEntryFile: isEntry,
                plainContent: binary ? '' : (f.content ?? ''),
                base64Content: binary ? f.base64Content : undefined,
              })
              if (id) {
                existingPaths.add(f.path)
                if (isEntry) entryFileId = id
              }
            }
            if (entryFileId) setActiveFileId(entryFileId)
            return
          }
        }

        // Single-file or blank template
        let initialContent = ''
        if (templateId) {
          if (templateId === BLANK_TEMPLATE.id && BLANK_TEMPLATE.content) {
            initialContent = BLANK_TEMPLATE.content
          } else {
            try {
              initialContent = await loadTemplateContent(templateId)
            } catch (error) {
              console.error(`Failed to load template ${templateId}:`, error)
            }
          }
        }
        const existingMain = existingRecords.find(r => r.data.path === 'main.tex')
        if (existingMain) {
          setActiveFileId(existingMain.recordId)
          return
        }

        const id = await createConfirmed({
          documentId,
          path: 'main.tex',
          fileType: 'tex',
          isEntryFile: true,
          plainContent: typeof initialContent === 'string' ? initialContent : '',
        })
        if (id) setActiveFileId(id)
      } catch (error: any) {
        console.error('Failed to initialize project files:', error)
        initFailedRef.current = true
        setInitError(error.message || 'Failed to create initial file. Please reload the page to retry.')
      }
    }

    void initializeContent()
  }, [status, error, records, files, templateId, documentId, createConfirmed, loadTemplateContent, loadTemplateFiles])

  // After migration, the query updates with the new record
  useEffect(() => {
    if (initRef.current && files.length > 0 && !isReady) {
      if (!activeFileId) {
        const entry = files.find(f => f.data.isEntryFile) || files[0]
        setActiveFileId(entry.recordId)
      }
      setInitError(null)
      setIsReady(true)
    }
  }, [files, isReady, activeFileId])

  // ── Derived state ─────────────────────────────────────────────────

  const activeFile = useMemo(
    () => files.find(f => f.recordId === activeFileId) ?? null,
    [files, activeFileId],
  )

  const entryFilePath = useMemo(
    () => files.find(f => f.data.isEntryFile)?.data.path || 'main.tex',
    [files],
  )

  // ── CRUD ──────────────────────────────────────────────────────────

  const addFile = useCallback(async (
    path: string,
    content: string = '',
    base64Content?: string,
  ) => {
    const duplicate = files.find(f => f.data.path === path)
    if (duplicate) return null

    if (!hasValidProjectFileExtension(path)) return null

    const binaryFile = isBinaryFile(path)
    const fileType = inferFileType(path)
    const id = await create({
      documentId,
      path,
      fileType,
      isEntryFile: false,
      plainContent: binaryFile ? '' : content,
      base64Content: binaryFile ? base64Content ?? '' : undefined,
    })
    if (id) setActiveFileId(id)
    return id
  }, [files, documentId,  create])

  // Path manipulation utilities
  const getDirName = useCallback((path: string): string => {
    const parts = path.split('/').filter(Boolean)
    if (parts.length <= 1) return ''
    return parts.slice(0, -1).join('/')
  }, [])

  const getBaseName = useCallback((path: string): string => {
    const parts = path.split('/').filter(Boolean)
    return parts[parts.length - 1] || path
  }, [])

  const joinPath = useCallback((...parts: string[]): string => {
    return parts.filter(Boolean).join('/')
  }, [])

  const sanitizePath = useCallback((path: string): string => {
    return path
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .map(segment => segment.trim().replace(/\s+/g, '_'))
      .join('/')
  }, [])

  // ── Enhanced CRUD operations ────────────────────────────────────────

  const deleteFile = useCallback(async (id: string) => {
    const file = files.find(f => f.recordId === id)
    if (!file || file.data.isEntryFile) return

    // Move to trash (soft delete)
    await put(id, {
      deletedAt: Date.now(),
      originalPath: file.data.path,
    })

    if (activeFileId === id) {
      const entry = files.find(f => f.data.isEntryFile) || files[0]
      setActiveFileId(entry?.recordId ?? null)
    }
  }, [files, activeFileId, put])

  const restoreFile = useCallback(async (id: string) => {
    const file = trashFiles.find(f => f.recordId === id)
    if (!file || !file.data.deletedAt) return

    const restorePath = file.data.originalPath || file.data.path
    // Check if path already exists
    const existing = files.find(f => f.data.path === restorePath)
    if (existing) {
      throw new Error(`File "${restorePath}" already exists`)
    }

    await put(id, {
      deletedAt: undefined,
      originalPath: undefined,
      path: restorePath,
    })
  }, [trashFiles, files, put])

  const permanentlyDeleteFile = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  const renameFile = useCallback(async (id: string, newPath: string) => {
    const file = files.find(f => f.recordId === id)
    if (!file) return

    const normalizedPath = sanitizePath(newPath)
    if (!normalizedPath) {
      throw new Error('Invalid path')
    }

    // Check for duplicates
    const duplicate = files.find(f => f.recordId !== id && f.data.path === normalizedPath)
    if (duplicate) {
      throw new Error(`File "${normalizedPath}" already exists`)
    }

    // Validate extension for files (not folders)
    if (normalizedPath.includes('.')) {
      if (!hasValidProjectFileExtension(normalizedPath)) {
        throw new Error('Unsupported file type')
      }
    }

    await put(id, { path: normalizedPath })
  }, [files, sanitizePath, put])

  const moveFile = useCallback(async (id: string, targetFolder: string) => {
    const file = files.find(f => f.recordId === id)
    if (!file) return

    const baseName = getBaseName(file.data.path)
    const newPath = targetFolder ? joinPath(targetFolder, baseName) : baseName
    const normalizedPath = sanitizePath(newPath)

    // Check for duplicates
    const duplicate = files.find(f => f.recordId !== id && f.data.path === normalizedPath)
    if (duplicate) {
      throw new Error(`File "${normalizedPath}" already exists`)
    }

    await put(id, { path: normalizedPath })
  }, [files, getBaseName, joinPath, sanitizePath, put])

  const duplicateFile = useCallback(async (id: string) => {
    const file = files.find(f => f.recordId === id)
    if (!file) return null

    const baseName = getBaseName(file.data.path)
    const dir = getDirName(file.data.path)
    const ext = baseName.includes('.') ? baseName.substring(baseName.lastIndexOf('.')) : ''
    const nameWithoutExt = ext ? baseName.substring(0, baseName.lastIndexOf('.')) : baseName

    // Find unique name
    let counter = 1
    let newPath = dir ? joinPath(dir, `${nameWithoutExt}_copy${ext}`) : `${nameWithoutExt}_copy${ext}`
    while (files.some(f => f.data.path === newPath)) {
      newPath = dir ? joinPath(dir, `${nameWithoutExt}_copy${counter}${ext}`) : `${nameWithoutExt}_copy${counter}${ext}`
      counter++
    }

    const binaryFile = isBinaryFile(file.data.path)
    const fileType = inferFileType(newPath)
    const newId = await create({
      documentId,
      path: newPath,
      fileType,
      isEntryFile: false,
      plainContent: binaryFile ? '' : (file.data.plainContent || ''),
      base64Content: binaryFile ? file.data.base64Content : undefined,
    })

    return newId
  }, [files, getBaseName, getDirName, joinPath, documentId,  create])

  // Fresh-content overrides keyed by recordId. Populated synchronously when
  // `updatePlainContent` fires (including FileEditor's unmount flush on file
  // switch) so compile sees the latest text even before the DO roundtrip has
  // updated the useQuery-backed `files` array. Entries self-expire once the
  // real record catches up.
  const freshContentRef = useRef<Record<string, string>>({})

  const updatePlainContent = useCallback((id: string, plainContent: string) => {
    freshContentRef.current[id] = plainContent
    put(id, { plainContent })
  }, [put])

  useEffect(() => {
    const overrides = freshContentRef.current
    const typedRecords = records as ProjectFileRecord[]
    for (const [id, overrideText] of Object.entries(overrides)) {
      const file = typedRecords.find((r) => r.recordId === id)
      if (file && (file.data.plainContent ?? '') === overrideText) {
        delete overrides[id]
      }
    }
  }, [records])

  // ── Compilation helper ────────────────────────────────────────────

  const getFilesForCompilation = useCallback((activeText: string): CompilationProjectFile[] => {
    const resolveText = (f: ProjectFileRecord) => {
      if (f.recordId === activeFileId) return activeText
      const override = freshContentRef.current[f.recordId]
      if (override !== undefined) return override
      return f.data.plainContent || ''
    }

    return files
      .filter(f => {
        // Skip .gitkeep files (UI-only folder placeholders)
        if (f.data.path.endsWith('.gitkeep')) return false

        // Skip empty binary files
        if (isBinaryFile(f.data.path)) {
          return f.data.base64Content && f.data.base64Content.length > 0
        }

        // Skip empty text files
        return resolveText(f).length > 0
      })
      .map(f => ({
        path: f.data.path,
        ...(isBinaryFile(f.data.path)
          ? {
              base64Content: f.data.base64Content || '',
            }
          : {
              content: resolveText(f),
            }),
      }))
  }, [files, activeFileId])

  // ── Folder operations ────────────────────────────────────────────────

  const getFolderPaths = useCallback((): string[] => {
    const folders = new Set<string>()
    for (const file of files) {
      const dir = getDirName(file.data.path)
      if (dir) {
        const parts = dir.split('/')
        let currentPath = ''
        for (const part of parts) {
          currentPath = currentPath ? joinPath(currentPath, part) : part
          folders.add(currentPath)
        }
      }
    }
    return Array.from(folders).sort()
  }, [files, getDirName, joinPath])

  const deleteFolder = useCallback(async (folderPath: string) => {
    const filesInFolder = files.filter(f => {
      const dir = getDirName(f.data.path)
      return dir === folderPath || dir.startsWith(folderPath + '/')
    })

    // Move all files in folder to trash
    for (const file of filesInFolder) {
      if (file.data.isEntryFile) continue // Don't delete entry file
      await put(file.recordId, {
        deletedAt: Date.now(),
        originalPath: file.data.path,
      })
    }
  }, [files, getDirName, put])

  const setAsMainFile = useCallback(async (id: string) => {
    const targetFile = files.find(f => f.recordId === id)
    if (!targetFile) return

    // Only .tex files can be entry files
    if (!targetFile.data.path.toLowerCase().endsWith('.tex')) {
      throw new Error('Only .tex files can be set as main file')
    }

    // Find current entry file
    const currentEntryFile = files.find(f => f.data.isEntryFile)
    
    // Remove isEntryFile from current entry file
    if (currentEntryFile && currentEntryFile.recordId !== id) {
      await put(currentEntryFile.recordId, { isEntryFile: false })
    }

    // Set new entry file
    await put(id, { isEntryFile: true })
  }, [files, put])

  return {
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
    // Utility functions
    getDirName,
    getBaseName,
    joinPath,
    sanitizePath,
  }
}
