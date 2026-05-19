/**
 * TrashPanel — Manages deleted files with restore and permanent delete
 */

import React, { useState, useMemo } from 'react'
import type { ProjectFileRecord } from '../../hooks/useProjectFiles'

interface TrashPanelProps {
  trashFiles: ProjectFileRecord[]
  onRestore: (id: string) => Promise<void>
  onPermanentlyDelete: (id: string) => Promise<void>
  getBaseName: (path: string) => string
}

export function TrashPanel({
  trashFiles,
  onRestore,
  onPermanentlyDelete,
  getBaseName,
}: TrashPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [restoring, setRestoring] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<Set<string>>(new Set())

  const groupedByDate = useMemo(() => {
    const groups: { label: string; files: ProjectFileRecord[] }[] = []
    const today: ProjectFileRecord[] = []
    const yesterday: ProjectFileRecord[] = []
    const older: ProjectFileRecord[] = []

    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000

    for (const file of trashFiles) {
      const deletedAt = file.data.deletedAt || 0
      const diff = now - deletedAt

      if (diff < oneDay) {
        today.push(file)
      } else if (diff < 2 * oneDay) {
        yesterday.push(file)
      } else {
        older.push(file)
      }
    }

    if (today.length > 0) groups.push({ label: 'Today', files: today })
    if (yesterday.length > 0) groups.push({ label: 'Yesterday', files: yesterday })
    if (older.length > 0) groups.push({ label: 'Older', files: older })

    return groups
  }, [trashFiles])

  const handleRestore = async (id: string) => {
    setRestoring(prev => new Set(prev).add(id))
    try {
      await onRestore(id)
    } catch (error) {
      console.error('Failed to restore file:', error)
    } finally {
      setRestoring(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this file? This cannot be undone.')) return

    setDeleting(prev => new Set(prev).add(id))
    try {
      await onPermanentlyDelete(id)
    } catch (error) {
      console.error('Failed to delete file:', error)
    } finally {
      setDeleting(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleEmptyTrash = async () => {
    if (!confirm(`Permanently delete all ${trashFiles.length} file(s) in trash? This cannot be undone.`)) {
      return
    }

    try {
      // Delete all files permanently
      for (const file of trashFiles) {
        await onPermanentlyDelete(file.recordId)
      }
    } catch (error) {
      console.error('Failed to empty trash:', error)
    }
  }

  if (trashFiles.length === 0) {
    return null
  }

  return (
    <div className="border-t border-border">
      <button
        className="flex items-center justify-between w-full px-3 py-2 text-[11px] font-semibold tracking-wide text-content-secondary hover:text-content transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5">
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`transition-transform duration-150 shrink-0 ${expanded ? 'rotate-90' : ''}`}
          >
            <path d="M6 3l5 5-5 5z" />
          </svg>
          <span>TRASH</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-danger/15 text-danger font-medium">
            {trashFiles.length}
          </span>
        </div>
        {expanded && trashFiles.length > 0 && (
          <button
            className="text-[9px] text-danger hover:text-danger/80 px-1.5 py-0.5 rounded hover:bg-danger/5"
            onClick={(e) => {
              e.stopPropagation()
              handleEmptyTrash()
            }}
            title="Empty trash"
          >
            Empty
          </button>
        )}
      </button>

      {expanded && (
        <div className="pb-2">
          {groupedByDate.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="px-3 py-1 text-[10px] font-medium text-content-tertiary uppercase">
                {group.label}
              </div>
              {group.files.map((file) => {
                const isRestoring = restoring.has(file.recordId)
                const isDeleting = deleting.has(file.recordId)
                const displayPath = file.data.originalPath || file.data.path
                const displayName = getBaseName(displayPath)

                return (
                  <div
                    key={file.recordId}
                    className="group flex items-center gap-2 px-3 py-1.5 text-[12px] text-content-secondary hover:bg-black/[0.04]"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0 opacity-60">
                      <path
                        d="M4 1.5h5.5L13 5v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <path d="M9.5 1.5V5H13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="flex-1 truncate text-left" title={displayPath}>
                      {displayName}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1 rounded hover:bg-accent/10 text-accent"
                        onClick={() => handleRestore(file.recordId)}
                        disabled={isRestoring || isDeleting}
                        title="Restore"
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M3 8l3-3 3 3M6 8v5M10 5h3a1 1 0 0 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
                        </svg>
                      </button>
                      <button
                        className="p-1 rounded hover:bg-danger/10 text-danger"
                        onClick={() => handleDelete(file.recordId)}
                        disabled={isRestoring || isDeleting}
                        title="Delete permanently"
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2 4h12M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4M6.5 7v4M9.5 7v4" />
                          <path d="M3.5 4l.5 9.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1L12.5 4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
