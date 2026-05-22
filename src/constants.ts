/**
 * App Constants — TeXPal LaTeX Editor
 */

/** App name */
export const APP_NAME = 'texpal'

/** Compute the scope ID for an app's RecordRoom DO. Shared between client and worker. */
export const makeScopeId = (appName: string) => `app:${appName}`

/** Primary scope ID for the app's RecordRoom DO (client-side — uses the build-time APP_NAME). */
export const SCOPE_ID = makeScopeId(APP_NAME)

/** Roles and display config — imported from SDK (single source of truth) */
export { ROLES, ROLE_CONFIG, type Role } from 'deepspace'

// ============================================================================
// Editor Defaults
// ============================================================================

export type CloudCompiler = 'pdflatex' | 'xelatex' | 'lualatex'
export type BibEngine = 'bibtex' | 'biber'

export const DEFAULT_EDITOR_SETTINGS = {
  fontSize: 14,
  theme: 'dark' as const,
  lineWrapping: true,
  lineNumbers: true,
  compiler: 'pdflatex' as CloudCompiler,
  bibEngine: 'bibtex' as BibEngine,
}

export const FONT_SIZE_OPTIONS = [12, 14, 16, 18] as const

export const AUTO_SAVE_DELAY = 1500

export const VERSION_CAP = 10

// ============================================================================
// Compilation
// ============================================================================

export type CompileStatus = 'idle' | 'compiling' | 'success' | 'error'

export type LogCategory = 'errors' | 'warnings' | 'badboxes' | 'missingRefs' | 'rawLog'

export interface LogItem {
  message: string
  type?: string
  package?: string
  line?: number
  file?: string
  context: string
}

export interface CompilationLog {
  compiled: boolean
  duration?: number
  summary: {
    errorsCount: number
    warningsCount: number
    badboxesCount: number
    missingRefsCount: number
    hasErrors: boolean
    hasWarnings: boolean
  }
  errors: LogItem[]
  warnings: LogItem[]
  badboxes: LogItem[]
  missingRefs: LogItem[]
  rawLog: string
  logFiles: Record<string, string>
}

export interface CompilationResult {
  success: boolean
  pdfUrl?: string
  pdfBlob?: Blob
  compilationLog: CompilationLog
}

export const EMPTY_COMPILATION_LOG: CompilationLog = {
  compiled: false,
  summary: {
    errorsCount: 0,
    warningsCount: 0,
    badboxesCount: 0,
    missingRefsCount: 0,
    hasErrors: false,
    hasWarnings: false,
  },
  errors: [],
  warnings: [],
  badboxes: [],
  missingRefs: [],
  rawLog: '',
  logFiles: {},
}

// ============================================================================
// Toolbar Config
// ============================================================================

export interface ToolbarAction {
  id: string
  label: string
  icon: string
  snippet: string
  wrapSelection?: boolean
  group: 'formatting' | 'structure' | 'math' | 'list' | 'insert'
}

export interface StructureOption {
  value: string
  label: string
  snippet: string
}

export const STRUCTURE_OPTIONS: StructureOption[] = [
  { value: 'section', label: 'Section', snippet: '\\section{$SEL}' },
  { value: 'subsection', label: 'Subsection', snippet: '\\subsection{$SEL}' },
  { value: 'subsubsection', label: 'Sub-subsection', snippet: '\\subsubsection{$SEL}' },
  { value: 'paragraph', label: 'Paragraph', snippet: '\\paragraph{$SEL}' },
  { value: 'subparagraph', label: 'Sub-paragraph', snippet: '\\subparagraph{$SEL}' },
]

export const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { id: 'bold', label: 'Bold', icon: 'Bold', snippet: '\\textbf{$SEL}', wrapSelection: true, group: 'formatting' },
  { id: 'italic', label: 'Italic', icon: 'Italic', snippet: '\\textit{$SEL}', wrapSelection: true, group: 'formatting' },
  { id: 'underline', label: 'Underline', icon: 'Underline', snippet: '\\underline{$SEL}', wrapSelection: true, group: 'formatting' },
  { id: 'inline-math', label: 'Inline Math', icon: 'Sigma', snippet: '\\($SEL\\)', wrapSelection: true, group: 'math' },
  { id: 'display-math', label: 'Display Math', icon: 'SquareSigma', snippet: '\\[\n$SEL\n\\]', wrapSelection: true, group: 'math' },
  { id: 'equation', label: 'Equation', icon: 'Equal', snippet: '\\begin{equation}\n$SEL\n\\end{equation}', wrapSelection: true, group: 'math' },
  { id: 'itemize', label: 'Bullet List', icon: 'List', snippet: '\\begin{itemize}\n  \\item $SEL\n\\end{itemize}', wrapSelection: false, group: 'list' },
  { id: 'enumerate', label: 'Numbered List', icon: 'ListOrdered', snippet: '\\begin{enumerate}\n  \\item $SEL\n\\end{enumerate}', wrapSelection: false, group: 'list' },
  { id: 'table', label: 'Table', icon: 'Table', snippet: '\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{|c|c|c|}\n    \\hline\n    Col 1 & Col 2 & Col 3 \\\\\\\\\n    \\hline\n    A & B & C \\\\\\\\\n    \\hline\n  \\end{tabular}\n  \\caption{Caption}\n  \\label{tab:label}\n\\end{table}', wrapSelection: false, group: 'insert' },
  { id: 'figure', label: 'Figure', icon: 'Image', snippet: '\\begin{figure}[h]\n  \\centering\n  % \\includegraphics[width=0.8\\textwidth]{filename}\n  \\caption{Caption}\n  \\label{fig:label}\n\\end{figure}', wrapSelection: false, group: 'insert' },
  { id: 'link', label: 'Insert Link', icon: 'Link', snippet: '\\href{url}{$SEL}', wrapSelection: true, group: 'insert' },
  { id: 'ref', label: 'Cross Reference', icon: 'Hash', snippet: '\\ref{$SEL}', wrapSelection: true, group: 'insert' },
  { id: 'cite', label: 'Citation', icon: 'Quote', snippet: '\\cite{$SEL}', wrapSelection: true, group: 'insert' },
]

// ============================================================================
// Starter Templates
// ============================================================================

export interface StarterTemplate {
  id: string
  name: string
  description: string
  icon: string
  content?: string
}

const BLANK_ARTICLE_TEMPLATE = `\\documentclass[12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{geometry}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\geometry{a4paper, margin=1in}

\\title{Untitled Document}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}

This is a basic article template. You can start writing your content here.

\\end{document}`

export const BLANK_TEMPLATE: StarterTemplate = {
  id: 'blank-article',
  name: 'Blank Article',
  description: 'Minimal article with title and one section',
  icon: 'FileText',
  content: BLANK_ARTICLE_TEMPLATE,
}

export const STARTER_TEMPLATES: StarterTemplate[] = [BLANK_TEMPLATE]

// ============================================================================
// Document Outline
// ============================================================================

export interface OutlineItem {
  title: string
  level: number
  lineNumber: number
}

export const SECTION_LEVELS: Record<string, number> = {
  'part': 0,
  'chapter': 1,
  'section': 2,
  'subsection': 3,
  'subsubsection': 4,
  'paragraph': 5,
  'subparagraph': 6,
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

export interface KeyboardShortcut {
  action: string
  shortcut: string
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { action: 'Compile', shortcut: 'Ctrl/Cmd + Enter' },
  { action: 'Save (manual)', shortcut: 'Ctrl/Cmd + S' },
  { action: 'Find / Replace', shortcut: 'Ctrl/Cmd + F' },
  { action: 'Undo', shortcut: 'Ctrl/Cmd + Z' },
  { action: 'Redo', shortcut: 'Ctrl/Cmd + Shift + Z' },
  { action: 'Comment toggle', shortcut: 'Ctrl/Cmd + /' },
  { action: 'Indent', shortcut: 'Tab' },
  { action: 'Unindent', shortcut: 'Shift + Tab' },
  { action: 'Autocomplete', shortcut: 'Ctrl/Cmd + Space' },
  { action: 'Toggle sidebar', shortcut: 'Ctrl/Cmd + B' },
  { action: 'Toggle compile log', shortcut: 'Ctrl/Cmd + J' },
]
