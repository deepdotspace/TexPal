/**
 * CodeEditor — CodeMirror 6 based LaTeX editor.
 *
 * Preserves the same CodeEditorHandle API (insertSnippet, jumpToLine,
 * getContent, getCursorPosition, focus) so EditorLayout integration
 * remains unchanged.
 */

import React, { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react'
import { useCodeMirror, type CursorPosition } from '../../hooks/useCodeMirror'

export type { CursorPosition }
 
export interface CodeEditorHandle {
  insertSnippet: (snippet: string, wrapSelection?: boolean) => void
  jumpToLine: (line: number) => void
  getContent: () => string 
  getCursorPosition: () => CursorPosition
  focus: () => void
}

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  onCursorChange?: (pos: CursorPosition) => void
  onCompile?: () => void
  readOnly?: boolean
  fontSize?: number
  lineWrapping?: boolean
  showLineNumbers?: boolean
  theme?: 'light' | 'dark'
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  { value, onChange, onCursorChange, onCompile, readOnly = false, fontSize = 14, lineWrapping = true, showLineNumbers = true, theme = 'light' },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialDocRef = useRef(value)

  const { view, setContent } = useCodeMirror({
    parentRef: containerRef,
    initialDoc: initialDocRef.current,
    onChange,
    onCursorChange,
    onCompile,
    readOnly,
    fontSize,
    lineWrapping,
    showLineNumbers,
    theme,
  })

  // Sync external content changes (from Yjs) into CM6
  useEffect(() => {
    const v = view.current
    if (!v) return 
    const currentContent = v.state.doc.toString()
    if (value !== currentContent) {
      setContent(value) 
    } 
  }, [value, view, setContent])

  const insertSnippet = useCallback((snippet: string, wrapSelection = false) => {
    const v = view.current
    if (!v) return

    const { from, to } = v.state.selection.main
    const selectedText = v.state.sliceDoc(from, to)
    const replacement = wrapSelection && selectedText
      ? snippet.replace('$SEL', selectedText)
      : snippet.replace('$SEL', '')

    // Calculate cursor position
    // If replacement contains empty curly braces {}, position cursor inside them
    let cursorPosition = from + replacement.length
    if (!selectedText) {
      // Find the first occurrence of {} in the replacement
      const emptyBracesIndex = replacement.indexOf('{}')
      if (emptyBracesIndex !== -1) {
        // Position cursor after the opening brace
        cursorPosition = from + emptyBracesIndex + 1
      }
    }

    v.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: cursorPosition },
    })
    v.focus()
  }, [view])

  const jumpToLine = useCallback((line: number) => {
    const v = view.current
    if (!v) return

    const totalLines = v.state.doc.lines
    const targetLine = Math.max(1, Math.min(line, totalLines))
    const lineInfo = v.state.doc.line(targetLine)

    v.dispatch({
      selection: { anchor: lineInfo.from },
      scrollIntoView: true,
    })
    v.focus()
  }, [view])

  useImperativeHandle(ref, () => ({
    insertSnippet,
    jumpToLine,
    getContent: () => view.current?.state.doc.toString() ?? '',
    getCursorPosition: () => {
      const v = view.current
      if (!v) return { line: 1, col: 1 }
      const head = v.state.selection.main.head
      const lineObj = v.state.doc.lineAt(head)
      return { line: lineObj.number, col: head - lineObj.from + 1 }
    },
    focus: () => view.current?.focus(),
  }), [insertSnippet, jumpToLine, view])

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 bg-editor-bg overflow-hidden"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace" }}
    />
  )
})
