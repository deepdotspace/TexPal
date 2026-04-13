/**
 * ContextMenu — Enhanced right-click menu for files and folders
 */

import React, { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  position: { x: number; y: number }
  onClose: () => void
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  useEffect(() => {
    // Adjust position if menu would go off-screen
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let x = position.x
      let y = position.y

      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 8
      }
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 8
      }

      menuRef.current.style.left = `${x}px`
      menuRef.current.style.top = `${y}px`
    }
  }, [position])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-surface-elevated border border-border rounded-md shadow-lg py-1 min-w-[160px]"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={index} className="h-px bg-border my-1" />
        }

        return (
          <button
            key={index}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
              item.disabled
                ? 'text-content-tertiary cursor-not-allowed'
                : item.danger
                  ? 'text-danger hover:bg-danger/5'
                  : 'text-content-secondary hover:bg-black/[0.04]'
            }`}
            onClick={() => {
              if (!item.disabled) {
                item.onClick()
                onClose()
              }
            }}
            disabled={item.disabled}
          >
            {item.icon && <span className="w-3 h-3 shrink-0">{item.icon}</span>}
            <span className="flex-1 text-left">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
