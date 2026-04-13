/**
 * CodeMirror barrel — re-exports everything the editor needs from
 * the various @codemirror/* packages so useCodeMirror.ts only has
 * a single import path.
 */

// State
export { EditorState, Compartment } from '@codemirror/state'

// View
export {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from '@codemirror/view'

// Language
export {
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentUnit,
} from '@codemirror/language'

// Commands
export {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'

// Search
export { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'

// Autocomplete
export {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete'

// Lint
export { lintKeymap, lintGutter } from '@codemirror/lint'

// LaTeX language support
export { latex } from 'codemirror-lang-latex'

// Theme
export { oneDark } from '@codemirror/theme-one-dark'
