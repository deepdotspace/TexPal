/**
 * EditorToolbar — formatting buttons + structure dropdown + compile button + utility buttons.
 *
 * Each button inserts a LaTeX snippet at the cursor position.
 * Structure levels use a dropdown (Overleaf-style).
 * Also hosts settings gear, symbol palette, and keyboard shortcuts triggers.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { TOOLBAR_ACTIONS, STRUCTURE_OPTIONS, type ToolbarAction } from '../../constants'
import type { CloudCompiler } from '../../constants'
import { SymbolPalette } from './SymbolPalette'
import { TableSizeSelector } from './TableSizeSelector'
import { Dropdown } from '../ui/Dropdown'

const TOOLTIP_DELAY = 250

function Tooltip({ text, children }: { text: string; children: React.ReactElement<React.HTMLAttributes<HTMLElement>> }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const show = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 4 })
    triggerRef.current = e.currentTarget as HTMLElement
    timerRef.current = setTimeout(() => setVisible(true), TOOLTIP_DELAY)
  }, [])

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setVisible(false)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <>
      {React.cloneElement(children, { onMouseEnter: show, onMouseLeave: hide })}
      {visible && (
        <div
          style={{
            position: 'fixed',
            top: pos.y,
            left: pos.x,
            transform: 'translateX(-50%)',
            zIndex: 99999,
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            lineHeight: 1.4,
            whiteSpace: 'nowrap' as const,
            pointerEvents: 'none' as const,
            backgroundColor: '#1f2937',
            color: '#f9fafb',
          }}
        >
          {text}
        </div>
      )}
    </>
  )
}

const ICON_PATHS: Record<string, string> = {
  Bold: 'M6 4h8a4 4 0 0 1 0 8H6z M6 12h9a4 4 0 0 1 0 8H6z',
  Italic: 'M19 4h-9 M14 20H5 M15 4L9 20',
  Underline: 'M6 3v7a6 6 0 0 0 12 0V3 M4 21h16',
  Sigma: 'M18 7V4H6l6 8-6 8h12v-3',
  SquareSigma: 'M3 3h18v18H3z M15 7H9l4 5-4 5h6',
  Equal: 'M5 9h14 M5 15h14',
  List: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  ListOrdered: 'M10 6h11 M10 12h11 M10 18h11 M4 6h1v4 M4 10h2 M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  Table: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
  Image: 'M21 15l-5-5L5 21 M3 3h18v18H3z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  Play: 'M5 3l14 9-14 9V3z',
  Link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  Hash: 'M4 9h16 M4 15h16 M10 3l-2 18 M16 3l-2 18',
  Quote: 'M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z',
}

function ToolbarIcon({ name, size = 16 }: { name: string; size?: number }) {
  const path = ICON_PATHS[name]
  if (!path) return null

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  )
}

function SvgIcon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  )
}

interface EditorToolbarProps {
  onInsertSnippet: (snippet: string, wrapSelection?: boolean) => void
  compiler: CloudCompiler
  onCompilerChange: (compiler: CloudCompiler) => void
  onOpenSettings?: () => void
  onOpenShortcuts?: () => void
}

function generateTableSnippet(rows: number, cols: number): string {
  const colSpec = '|' + 'c|'.repeat(cols)
  
  // Generate header row
  const headerRow = '    ' + Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(' & ') + ' \\\\\\\\'
  
  // Generate data rows (rows - 1 because header is first row)
  const dataRows = Array.from({ length: Math.max(0, rows - 1) }, (_, i) => {
    const cells = Array.from({ length: cols }, (_, j) => {
      // Generate placeholder content (A, B, C, etc.)
      return String.fromCharCode(65 + (i * cols + j) % 26)
    })
    return '    ' + cells.join(' & ') + ' \\\\\\\\'
  }).join('\n')

  // Build the table structure
  let tableContent = `    \\hline
${headerRow}
    \\hline`
  
  if (dataRows) {
    tableContent += `\n${dataRows}
    \\hline`
  } else {
    tableContent += `\n    \\hline`
  }

  return `\\begin{table}[h]
  \\centering
  \\begin{tabular}{${colSpec}}
${tableContent}
  \\end{tabular}
  \\caption{Caption}
  \\label{tab:label}
\\end{table}`
}

export function EditorToolbar({
  onInsertSnippet,
  compiler,
  onCompilerChange,
  onOpenSettings,
  onOpenShortcuts,
}: EditorToolbarProps) {
  const [symbolPaletteOpen, setSymbolPaletteOpen] = useState(false)
  const [tableSelectorOpen, setTableSelectorOpen] = useState(false)
  const [structureValue, setStructureValue] = useState('section')
  const tableButtonRef = useRef<HTMLButtonElement>(null)

  const groups = ['formatting', 'math', 'list', 'insert'] as const
  const grouped = groups.map(g => TOOLBAR_ACTIONS.filter(a => a.group === g))

  useEffect(() => {
    if (!tableSelectorOpen) return
 
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (tableButtonRef.current?.contains(target)) return
      const portalPanel = document.querySelector('[data-table-selector-portal]')
      if (portalPanel?.contains(target)) return
      setTableSelectorOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [tableSelectorOpen])

  const handleTableButtonClick = () => {
    setTableSelectorOpen(!tableSelectorOpen)
  }

  const handleTableSizeSelect = (rows: number, cols: number) => {
    const snippet = generateTableSnippet(rows, cols)
    onInsertSnippet(snippet, false)
    setTableSelectorOpen(false)
  }

  const handleStructureChange = (value: string) => {
    setStructureValue(value)
    const opt = STRUCTURE_OPTIONS.find(o => o.value === value)
    if (opt) {
      onInsertSnippet(opt.snippet, true)
    }
  }

  const structureDropdownOptions = STRUCTURE_OPTIONS.map(o => ({
    value: o.value,
    label: o.label,
  }))

  return (
    <>
      <div className="editor-toolbar">
        <div className="editor-toolbar-track">
          {/* Structure dropdown (Overleaf-style) */}
          <Dropdown
            value={structureValue}
            options={structureDropdownOptions}
            onChange={handleStructureChange}
            title="Section style"
            className="w-[100px] shrink-0"
          />

          <div className="toolbar-separator" />

          {grouped.map((actions, gi) => {
            const isInsertGroup = gi === grouped.length - 1 // 'insert' is the last group

            return (
              <React.Fragment key={gi}>
                {gi > 0 && <div className="toolbar-separator" />}

                {/* Symbol palette toggle - render before insert group */}
                {isInsertGroup && (
                  <>
                    <Tooltip text="Insert Symbol (Ω)">
                      <button
                        className={`toolbar-btn ${symbolPaletteOpen ? 'active' : ''}`}
                        onClick={() => setSymbolPaletteOpen(!symbolPaletteOpen)}
                      >
                        <SvgIcon d="M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z" />
                      </button>
                    </Tooltip>
                    <div className="toolbar-separator" />
                  </>
                )}

                {actions.map((action: ToolbarAction) => {
                  if (action.id === 'table') {
                    return (
                      <div key={action.id} className="relative">
                        <Tooltip text={action.label}>
                          <button
                            ref={tableButtonRef}
                            className={`toolbar-btn ${tableSelectorOpen ? 'active' : ''}`}
                            onClick={handleTableButtonClick}
                          >
                            <ToolbarIcon name={action.icon} />
                          </button>
                        </Tooltip>
                        {tableSelectorOpen && (
                          <TableSizeSelector
                            onSelect={handleTableSizeSelect}
                            onClose={() => setTableSelectorOpen(false)}
                            anchorRef={tableButtonRef}
                          />
                        )}
                      </div>
                    )
                  }
                  return (
                    <React.Fragment key={action.id}>
                      <Tooltip text={action.label}>
                        <button
                          className="toolbar-btn"
                          onClick={() => onInsertSnippet(action.snippet, action.wrapSelection)}
                        >
                          <ToolbarIcon name={action.icon} />
                        </button>
                      </Tooltip>
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            )
          })}

          {/* Keyboard shortcuts */}
          {onOpenShortcuts && (
            <Tooltip text="Keyboard shortcuts">
              <button
                className="toolbar-btn"
                onClick={onOpenShortcuts}
              >
                <SvgIcon d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
              </button>
            </Tooltip>
          )}

          {/* Settings gear */}
          {onOpenSettings && (
            <Tooltip text="Editor settings">
              <button
                className="toolbar-btn"
                onClick={onOpenSettings}
              >
                <SvgIcon d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
              </button>
            </Tooltip>
          )}

          <div className="toolbar-separator" />

          <Dropdown
            value={compiler}
            options={[
              { value: 'pdflatex', label: 'pdflatex' },
              { value: 'xelatex', label: 'xelatex' },
              { value: 'lualatex', label: 'lualatex' },
            ]}
            onChange={(value) => onCompilerChange(value as CloudCompiler)}
            title="Cloud compiler"
            className="w-[102px] shrink-0"
          />
        </div>
      </div>

      {/* Symbol palette (fixed bottom toolbar) */}
      <SymbolPalette
        open={symbolPaletteOpen}
        onClose={() => setSymbolPaletteOpen(false)}
        onInsert={(latex) => {
          onInsertSnippet(latex, false)
        }}
      />
    </>
  )
}
