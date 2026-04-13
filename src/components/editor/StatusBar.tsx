/**
 * StatusBar — bottom bar showing word count, cursor position, compile status, save status.
 */

import React from 'react'
import type { CursorPosition } from './CodeEditor'
import type { CompileStatus, CloudCompiler } from '../../constants'
import type { SaveStatus } from '../../hooks/useAutoSave'

interface StatusBarProps {
  cursor: CursorPosition
  wordCount: number
  compileStatus: CompileStatus
  saveStatus: SaveStatus
  lastCompiledAt: number | null
  compiler?: CloudCompiler
  compileDuration?: number
}

function stripLatexCommands(text: string): string {
  return text
    .replace(/\\[a-zA-Z]+\*?(\{[^}]*\})?/g, ' ')
    .replace(/[{}\\$%&_^~#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function countWords(text: string): number {
  const cleaned = stripLatexCommands(text)
  if (!cleaned) return 0
  return cleaned.split(/\s+/).filter(w => w.length > 0).length
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function StatusBar({
  cursor,
  wordCount,
  compileStatus,
  saveStatus,
  lastCompiledAt,
  compiler,
  compileDuration,
}: StatusBarProps) {
  const durationStr = compileDuration != null && compileDuration > 0
    ? ` (${compileDuration.toFixed(1)}s)`
    : ''

  const compileLabel = (() => {
    switch (compileStatus) {
      case 'compiling': return 'Compiling...'
      case 'success': return lastCompiledAt ? `Compiled at ${formatTime(lastCompiledAt)}${durationStr}` : 'Compiled'
      case 'error': return `Compile error${durationStr}`
      default: return 'Ready'
    }
  })()

  const compileColor = compileStatus === 'error'
    ? 'text-danger'
    : compileStatus === 'success'
      ? 'text-success'
      : 'text-content-secondary'

  const saveLabel = saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''
  const engineLabel = compiler || 'pdflatex'

  return (
    <div className="status-bar">
      <div className="flex items-center gap-4">
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span>{wordCount} words</span>
        {saveLabel && (
          <span className={saveStatus === 'saving' ? 'text-accent' : 'text-success'}>
            {saveLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-content-secondary opacity-60">{engineLabel}</span>
        <span className={compileColor}>
          {compileStatus === 'compiling' && (
            <span className="inline-block w-2 h-2 bg-accent rounded-full mr-1.5 animate-pulse" />
          )}
          {compileStatus === 'error' && (
            <span className="inline-block w-2 h-2 bg-danger rounded-full mr-1.5" />
          )}
          {compileStatus === 'success' && (
            <span className="inline-block w-2 h-2 bg-success rounded-full mr-1.5" />
          )}
          {compileLabel}
        </span>
      </div>
    </div>
  )
}
