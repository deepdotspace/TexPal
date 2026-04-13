/**
 * FileEditor — plain-content wrapper around CodeEditor for a single project file.
 *
 * Key design:
 *  - Mounted with `key={fileId}` so switching files remounts and re-initialises content.
 *  - Uses `initialContent` prop directly as the starting editor value (no Yjs).
 *  - On every edit, calls `onTextChange` immediately and debounces `onPlainContentSync`.
 *
 * Agent-write protocol:
 *  - External agents write `plainContent` + increment `agentRevision` in one CRUD call.
 *  - When `agentRevision` increases, `agentPlainContent` is pushed into the editor once.
 *  - The debounced sync only writes `plainContent` (never `agentRevision`), so the
 *    plain write-back does NOT re-trigger this effect — no loop possible.
 */

import React, { useRef, useState, useCallback, useEffect, forwardRef } from 'react'
import { CodeEditor, type CodeEditorHandle, type CursorPosition } from './CodeEditor'

const PLAIN_CONTENT_SYNC_DELAY = 2000

export interface FileEditorProps {
  fileId: string
  initialContent: string
  agentRevision: number
  agentPlainContent: string
  onTextChange: (text: string) => void
  onPlainContentSync: (fileId: string, content: string) => void
  onCursorChange?: (pos: CursorPosition) => void
  onCompile?: () => void
  readOnly?: boolean
  fontSize?: number
  lineWrapping?: boolean
  showLineNumbers?: boolean
  theme?: 'light' | 'dark'
}

export const FileEditor = forwardRef<CodeEditorHandle, FileEditorProps>(function FileEditor(
  {
    fileId,
    initialContent,
    agentRevision,
    agentPlainContent,
    onTextChange,
    onPlainContentSync,
    onCursorChange,
    onCompile,
    readOnly = false,
    fontSize,
    lineWrapping,
    showLineNumbers,
    theme,
  },
  ref,
) {
  const [text, setText] = useState(initialContent)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSeenAgentRevision = useRef<number>(agentRevision)

  // Refs to capture latest values for the unmount flush without making it a dep.
  const textRef = useRef(text)
  textRef.current = text
  const onPlainContentSyncRef = useRef(onPlainContentSync)
  onPlainContentSyncRef.current = onPlainContentSync

  // ── Apply agent writes: agentRevision bump → replace editor content ──
  // Guard: only fires when agentRevision strictly increases. The debounced sync
  // below writes `plainContent` only (never `agentRevision`), so it cannot
  // re-trigger this effect — the loop is structurally impossible.
  useEffect(() => {
    if (agentRevision > lastSeenAgentRevision.current) {
      lastSeenAgentRevision.current = agentRevision
      if (agentPlainContent !== textRef.current) {
        setText(agentPlainContent)
      }
    }
  }, [agentRevision, agentPlainContent])

  // ── Lift text to parent ────────────────────────────────────────
  useEffect(() => {
    onTextChange(text)
  }, [text, onTextChange])

  // ── Debounced plainContent sync (editor → CRUD, write-only) ───
  // Fires 2s after the last change; cleanup clears the timer so rapid
  // typing results in one write, not many.
  useEffect(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      onPlainContentSync(fileId, text)
    }, PLAIN_CONTENT_SYNC_DELAY)

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [text, fileId, onPlainContentSync])

  // ── Flush plainContent on actual unmount only ──────────────────
  // Empty deps (+ fileId for safety) ensures cleanup fires ONLY when the
  // component is destroyed (file switch / doc close), not on every keystroke.
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
        syncTimerRef.current = null
      }
      onPlainContentSyncRef.current(fileId, textRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId])

  const handleChange = useCallback((value: string) => {
    setText(value)
  }, [])

  return (
    <CodeEditor
      ref={ref}
      value={text}
      onChange={handleChange}
      onCursorChange={onCursorChange}
      onCompile={onCompile}
      readOnly={readOnly}
      fontSize={fontSize}
      lineWrapping={lineWrapping}
      showLineNumbers={showLineNumbers}
      theme={theme}
    />
  )
})
