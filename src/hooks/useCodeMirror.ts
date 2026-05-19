/**
 * useCodeMirror — manages the CM6 EditorView lifecycle within React.
 *
 * Creates the view on mount, destroys on unmount. Uses Compartments to
 * allow dynamic reconfiguration of fontSize, lineWrapping, readOnly,
 * and lineNumbers without recreating the editor.
 *
 * A `remoteUpdate` flag prevents onChange from firing when content is
 * pushed in externally (e.g. from Yjs).
 */

import { useRef, useEffect, useCallback, type RefObject } from 'react'

import {
  EditorState,
  EditorView,
  Compartment,
  keymap,
  lineNumbers as lineNumbersExt,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentUnit,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  search,
  searchKeymap,
  highlightSelectionMatches,
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
  lintKeymap,
  lintGutter,
  latex,
  oneDark,
} from '../lib/codemirror'

export interface CursorPosition {
  line: number
  col: number
}

interface UseCodeMirrorOptions {
  parentRef: RefObject<HTMLDivElement | null>
  initialDoc: string
  onChange: (value: string) => void
  onCursorChange?: (pos: CursorPosition) => void
  onCompile?: () => void
  readOnly?: boolean
  fontSize?: number
  lineWrapping?: boolean
  showLineNumbers?: boolean
  theme?: 'light' | 'dark'
}

export function useCodeMirror({
  parentRef,
  initialDoc,
  onChange,
  onCursorChange,
  onCompile,
  readOnly = false,
  fontSize = 14,
  lineWrapping = true,
  showLineNumbers = true,
  theme = 'light',
}: UseCodeMirrorOptions) {
  const viewRef = useRef<any>(null)
  const remoteUpdateRef = useRef(false)

  // Stable callback refs to avoid re-creating the editor on every render
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onCursorChangeRef = useRef(onCursorChange)
  onCursorChangeRef.current = onCursorChange
  const onCompileRef = useRef(onCompile)
  onCompileRef.current = onCompile

  // Compartments for dynamic config
  const readOnlyComp = useRef(new Compartment())
  const fontSizeComp = useRef(new Compartment())
  const lineWrappingComp = useRef(new Compartment())
  const lineNumbersComp = useRef(new Compartment())
  const themeComp = useRef(new Compartment())

  useEffect(() => {
    const parent = parentRef.current
    if (!parent) return

    const fontSizeTheme = EditorView.theme({
      '.cm-content': { fontSize: fontSize + 'px' },
      '.cm-gutters': { fontSize: fontSize + 'px' },
    })

    const extensions = [
      // Dynamic compartments
      readOnlyComp.current.of(EditorState.readOnly.of(readOnly)),
      fontSizeComp.current.of(fontSizeTheme),
      lineWrappingComp.current.of(lineWrapping ? EditorView.lineWrapping : []),
      lineNumbersComp.current.of(showLineNumbers ? [lineNumbersExt(), highlightActiveLineGutter()] : []),
      themeComp.current.of(theme === 'dark' && oneDark ? oneDark : []),

      // Core editing
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      indentUnit.of('  '),

      // Search
      search(),

      // LaTeX language + linting
      latex(),
      lintGutter(),

      // Key bindings — custom first, then standard
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => { onCompileRef.current?.(); return true },
        },
        {
          key: 'Mod-s',
          run: () => true, // prevent default save
          preventDefault: true,
        },
      ]),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),

      // Update listener for onChange / onCursorChange
      EditorView.updateListener.of((update: any) => {
        if (update.docChanged && !remoteUpdateRef.current) {
          onChangeRef.current(update.state.doc.toString())
        }
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          onCursorChangeRef.current?.({
            line: line.number,
            col: head - line.from + 1,
          })
        }
      }),
    ]

    const state = EditorState.create({
      doc: initialDoc,
      extensions,
    })

    const view = new EditorView({ state, parent })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only mount/unmount — dynamic changes handled via compartment dispatches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentRef])

  // Dynamic: readOnly
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyComp.current.reconfigure(EditorState.readOnly.of(readOnly)),
    })
  }, [readOnly])

  // Dynamic: fontSize
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: fontSizeComp.current.reconfigure(
        EditorView.theme({
          '.cm-content': { fontSize: fontSize + 'px' },
          '.cm-gutters': { fontSize: fontSize + 'px' },
        })
      ),
    })
  }, [fontSize])

  // Dynamic: lineWrapping
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: lineWrappingComp.current.reconfigure(
        lineWrapping ? EditorView.lineWrapping : []
      ),
    })
  }, [lineWrapping])

  // Dynamic: showLineNumbers
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: lineNumbersComp.current.reconfigure(
        showLineNumbers ? [lineNumbersExt(), highlightActiveLineGutter()] : []
      ),
    })
  }, [showLineNumbers])

  // Dynamic: theme (light / dark)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeComp.current.reconfigure(
        theme === 'dark' && oneDark ? oneDark : []
      ),
    })
  }, [theme])

  /**
   * Push content from an external source (Yjs) into the editor
   * without triggering the onChange callback.
   */
  const setContent = useCallback((newContent: string) => {
    const view = viewRef.current
    if (!view) return
    const currentContent = view.state.doc.toString()
    if (newContent === currentContent) return

    remoteUpdateRef.current = true
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newContent },
    })
    remoteUpdateRef.current = false
  }, [])

  return {
    view: viewRef,
    setContent,
  }
}
