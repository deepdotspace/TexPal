/**
 * TableSizeSelector — Grid-based table size selector similar to Overleaf
 * 
 * Shows a grid where hovering/clicking selects the table dimensions.
 * The selected cell represents the bottom-right corner of the table.
 * 
 * Uses fixed positioning to escape the toolbar's overflow clipping.
 */

import React, { useState, useCallback, useLayoutEffect, useRef } from 'react'
import ReactDOM from 'react-dom'

interface TableSizeSelectorProps {
  onSelect: (rows: number, cols: number) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
}

const MAX_ROWS = 10
const MAX_COLS = 10

export function TableSizeSelector({ onSelect, onClose, anchorRef }: TableSizeSelectorProps) {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setPosition({ top: rect.bottom + 4, left: rect.left })
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!panelRef.current || !position) return
    const panelRect = panelRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth

    if (panelRect.right > viewportWidth) {
      setPosition(prev => prev ? { ...prev, left: Math.max(4, viewportWidth - panelRect.width - 4) } : prev)
    }
  }, [position])

  const handleCellHover = useCallback((row: number, col: number) => {
    setHoveredCell({ row, col })
  }, [])

  const handleCellClick = useCallback((row: number, col: number) => {
    onSelect(row + 1, col + 1)
    onClose()
  }, [onSelect, onClose])

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null)
  }, [])

  const selectedRows = hoveredCell ? hoveredCell.row + 1 : 0
  const selectedCols = hoveredCell ? hoveredCell.col + 1 : 0

  if (!position) return null

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      data-table-selector-portal
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }}
      className="bg-surface-elevated border border-border rounded-lg shadow-card p-3 min-w-[240px]"
    >
      <div className="mb-2.5 text-xs font-medium text-content text-center">
        {hoveredCell 
          ? `${selectedRows} × ${selectedCols} table`
          : 'Select table size'}
      </div>
      
      <div 
        className="grid gap-0.5 justify-center"
        style={{ gridTemplateColumns: `repeat(${MAX_COLS}, minmax(0, 1fr))` }}
        onMouseLeave={handleMouseLeave}
      >
        {Array.from({ length: MAX_ROWS }, (_, rowIdx) =>
          Array.from({ length: MAX_COLS }, (_, colIdx) => {
            const isSelected = hoveredCell 
              && rowIdx <= hoveredCell.row 
              && colIdx <= hoveredCell.col
            
            return (
              <button
                key={`${rowIdx}-${colIdx}`}
                className="w-5 h-5 rounded transition-all duration-75"
                style={isSelected
                  ? { backgroundColor: '#6366F1', border: '1px solid #6366F1', transform: 'scale(1.05)' }
                  : { backgroundColor: 'rgba(128, 128, 128, 0.1)', border: '1px solid rgba(128, 128, 128, 0.35)' }
                }
                onMouseEnter={() => handleCellHover(rowIdx, colIdx)}
                onClick={() => handleCellClick(rowIdx, colIdx)}
                aria-label={`${rowIdx + 1} rows, ${colIdx + 1} columns`}
              />
            )
          })
        )}
      </div>
    </div>,
    document.body
  )
}
