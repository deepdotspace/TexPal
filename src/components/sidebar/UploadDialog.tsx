import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  hasValidProjectFileExtension,
  isBinaryFile,
} from '../../hooks/useProjectFiles'

interface UploadPayloadItem {
  path: string
  content?: string
  base64Content?: string
}

interface UploadDialogProps {
  isOpen: boolean
  existingPaths: string[]
  onUpload: (files: UploadPayloadItem[]) => Promise<void> | void
  onClose: () => void
}

interface QueuedUploadFile {
  id: string
  path: string
  file: File
  size: number
}

interface CollectedFile {
  file: File
  relativePath: string
}

interface WebkitFileEntry {
  isFile: true
  isDirectory: false
  name: string
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void
  ) => void
}

interface WebkitDirectoryReader {
  readEntries: (
    successCallback: (entries: WebkitEntry[]) => void,
    errorCallback?: (error: DOMException) => void
  ) => void
}

interface WebkitDirectoryEntry {
  isFile: false
  isDirectory: true
  name: string
  createReader: () => WebkitDirectoryReader
}

type WebkitEntry = WebkitFileEntry | WebkitDirectoryEntry

function sanitizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(segment => segment.trim().replace(/\s+/g, '_'))
    .join('/')
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}" as text.`))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}" as binary.`))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })
}

async function readAllDirectoryEntries(reader: WebkitDirectoryReader): Promise<WebkitEntry[]> {
  const entries: WebkitEntry[] = []

  while (true) {
    const batch = await new Promise<WebkitEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    if (batch.length === 0) break
    entries.push(...batch)
  }

  return entries
}

async function walkWebkitEntry(entry: WebkitEntry, parentPath: string): Promise<CollectedFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject)
    })
    const filePath = sanitizePath(parentPath ? `${parentPath}/${file.name}` : file.name)
    return [{ file, relativePath: filePath }]
  }

  const directoryPath = sanitizePath(parentPath ? `${parentPath}/${entry.name}` : entry.name)
  const directoryEntries = await readAllDirectoryEntries(entry.createReader())
  const nestedFiles = await Promise.all(
    directoryEntries.map(child => walkWebkitEntry(child, directoryPath))
  )
  return nestedFiles.flat()
}

export function UploadDialog({
  isOpen,
  existingPaths,
  onUpload,
  onClose,
}: UploadDialogProps) {
  const [queuedFiles, setQueuedFiles] = useState<QueuedUploadFile[]>([])
  const [error, setError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)

  const filesInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const existingPathSet = useMemo(
    () => new Set(existingPaths.map(path => sanitizePath(path.toLowerCase()))),
    [existingPaths]
  )

  const queuedPathSet = useMemo(
    () => new Set(queuedFiles.map(item => sanitizePath(item.path.toLowerCase()))),
    [queuedFiles]
  )

  const appendToQueue = useCallback((items: CollectedFile[]) => {
    if (items.length === 0) return

    const nextQueued = [...queuedFiles]
    const nextPathSet = new Set(queuedPathSet)
    let skippedCount = 0
    let invalidCount = 0

    for (const item of items) {
      const safePath = sanitizePath(item.relativePath)
      const lowered = safePath.toLowerCase()
      if (!safePath || !hasValidProjectFileExtension(lowered)) {
        invalidCount += 1
        continue
      }

      const normalizedLookupPath = sanitizePath(lowered)
      if (existingPathSet.has(normalizedLookupPath) || nextPathSet.has(normalizedLookupPath)) {
        skippedCount += 1
        continue
      }

      nextPathSet.add(normalizedLookupPath)
      nextQueued.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        path: safePath,
        file: item.file,
        size: item.file.size,
      })
    }

    setQueuedFiles(nextQueued)

    if (invalidCount > 0 || skippedCount > 0) {
      const messages: string[] = []
      if (invalidCount > 0) messages.push(`${invalidCount} unsupported file(s) ignored`)
      if (skippedCount > 0) messages.push(`${skippedCount} duplicate file(s) ignored`)
      setError(messages.join(' • '))
    } else {
      setError('')
    }
  }, [queuedFiles, queuedPathSet, existingPathSet])

  const collectInputFiles = useCallback((files: FileList | null): CollectedFile[] => {
    if (!files) return []
    return Array.from(files).map(file => ({
      file,
      relativePath: file.webkitRelativePath || file.name,
    }))
  }, [])

  const handleChooseFiles = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    appendToQueue(collectInputFiles(event.target.files))
    event.target.value = ''
  }, [appendToQueue, collectInputFiles])

  const openFolderPicker = useCallback(() => {
    const input = folderInputRef.current
    if (!input) return
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    input.click()
  }, [])

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)

    const dropItems = event.dataTransfer.items
    if (!dropItems || dropItems.length === 0) {
      appendToQueue(collectInputFiles(event.dataTransfer.files))
      return
    }

    try {
      const droppedFiles: CollectedFile[] = []
      for (const item of Array.from(dropItems)) {
        const getEntry = (item as DataTransferItem & { webkitGetAsEntry?: () => WebkitEntry | null }).webkitGetAsEntry
        if (!getEntry) {
          const plainFile = item.getAsFile()
          if (plainFile) {
            droppedFiles.push({ file: plainFile, relativePath: plainFile.name })
          }
          continue
        }

        const rootEntry = getEntry()
        if (!rootEntry) continue
        const nestedFiles = await walkWebkitEntry(rootEntry, '')
        droppedFiles.push(...nestedFiles)
      }
      appendToQueue(droppedFiles)
    } catch (dropError) {
      console.error('Failed to process dropped files', dropError)
      setError('Failed to read dropped files. Please use file/folder picker.')
    }
  }, [appendToQueue, collectInputFiles])

  const handleUpload = useCallback(async () => {
    if (queuedFiles.length === 0 || uploading) return

    setUploading(true)
    setError('')
    try {
      const payload: UploadPayloadItem[] = []
      for (const queued of queuedFiles) {
        const path = sanitizePath(queued.path)
        if (isBinaryFile(path)) {
          const dataUrl = await readFileAsDataURL(queued.file)
          payload.push({ path, base64Content: dataUrl })
        } else {
          const text = await readFileAsText(queued.file)
          payload.push({ path, content: text })
        }
      }

      await onUpload(payload)
      setQueuedFiles([])
      onClose()
    } catch (uploadError) {
      console.error('Upload failed', uploadError)
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed'
      setError(message)
    } finally {
      setUploading(false)
    }
  }, [queuedFiles, uploading, onUpload, onClose])

  const closeDialog = useCallback(() => {
    if (uploading) return
    setQueuedFiles([])
    setError('')
    onClose()
  }, [onClose, uploading])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-[620px] rounded-lg border border-border bg-surface-elevated shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-content">Upload files</h3>
          <button
            className="rounded p-1 text-content-secondary hover:bg-black/[0.06] hover:text-content"
            onClick={closeDialog}
            disabled={uploading}
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <div
            className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
              dragActive
                ? 'border-accent bg-accent/5'
                : 'border-border bg-surface'
            }`}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setDragActive(false)
            }}
            onDrop={handleDrop}
          >
            <div className="mb-2 text-sm font-medium text-content">
              Drag and drop files or folders
            </div>
            <div className="text-xs text-content-secondary">
              Supported LaTeX sources, images, fonts, and package files.
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-button border border-border bg-surface px-3 py-1.5 text-xs font-medium text-content hover:bg-black/[0.04]"
              onClick={() => filesInputRef.current?.click()}
              disabled={uploading}
            >
              Choose files
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-button border border-border bg-surface px-3 py-1.5 text-xs font-medium text-content hover:bg-black/[0.04]"
              onClick={openFolderPicker}
              disabled={uploading}
            >
              Choose folder
            </button>
          </div>

          <input
            ref={filesInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleChooseFiles}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleChooseFiles}
          />

          <div className="mt-4 max-h-56 overflow-y-auto rounded border border-border bg-surface">
            {queuedFiles.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-content-secondary">
                No files queued yet.
              </div>
            ) : (
              queuedFiles.map((queued) => (
                <div
                  key={queued.id}
                  className="flex items-center gap-2 border-b border-border/70 px-3 py-2 text-xs last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-content">{queued.path}</div>
                    <div className="text-content-secondary">{formatFileSize(queued.size)}</div>
                  </div>
                  <button
                    className="rounded p-1 text-content-secondary hover:bg-black/[0.06] hover:text-danger"
                    onClick={() => {
                      setQueuedFiles(prev => prev.filter(item => item.id !== queued.id))
                    }}
                    disabled={uploading}
                    title={`Remove ${queued.path}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {error && (
            <div className="mt-2 text-xs text-danger">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            className="rounded-button border border-border px-3 py-1.5 text-xs font-medium text-content hover:bg-black/[0.04]"
            onClick={closeDialog}
            disabled={uploading}
          >
            Cancel
          </button>
          <button
            className={`rounded-button px-3 py-1.5 text-xs font-medium text-white ${
              queuedFiles.length === 0 || uploading
                ? 'cursor-not-allowed bg-accent/60'
                : 'bg-accent hover:bg-accent-hover'
            }`}
            onClick={handleUpload}
            disabled={queuedFiles.length === 0 || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
