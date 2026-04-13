/**
 * usePreprocessor — flatten multi-file LaTeX projects into a single
 * self-contained .tex string before sending to the compilation API.
 *
 * Pipeline steps:
 *  1. Recursively inline \input{} and \include{} directives
 *  2. Wrap .bib files in filecontents* blocks (before \begin{document})
 *  3. Wrap .sty/.cls files in filecontents* blocks (before \documentclass)
 *  4. Return the flattened string
 *
 * In V1 the files array usually contains a single main.tex, but the
 * pipeline is fully functional for multi-file projects.
 */

import { useCallback } from 'react'

export interface ProjectFile {
  path: string
  content: string
}

// Max inline depth to guard against circular \input references
const MAX_INLINE_DEPTH = 10

// Commands that remote compilers reject for security reasons.
// \includegraphics is safe and must NOT be stripped.
const DANGEROUS_CMD_RE = /\\(include|input)\s*(?:\*\s*)?\{[^}]*\}/g

/**
 * Build a lookup map from normalised path → content.
 * Handles paths with and without extensions.
 */
function buildFileMap(files: ProjectFile[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const f of files) {
    const norm = f.path.replace(/^\.\//, '')
    map.set(norm, f.content)
    if (!norm.includes('.')) {
      map.set(norm + '.tex', f.content)
    }
  }
  return map
}

/**
 * Resolve a filename referenced in \input{} or \include{}.
 * LaTeX omits the .tex extension by convention, so we try both.
 */
function resolveFile(fileMap: Map<string, string>, ref: string): string | null {
  const norm = ref.replace(/^\.\//, '')
  if (fileMap.has(norm)) return fileMap.get(norm)!
  if (!norm.endsWith('.tex') && fileMap.has(norm + '.tex')) {
    return fileMap.get(norm + '.tex')!
  }
  return null
}

/**
 * Recursively replace \input{file} and \include{file} with the
 * referenced file's content. \include also adds \clearpage around it.
 */
function inlineInputs(
  content: string,
  fileMap: Map<string, string>,
  visited: Set<string>,
  depth: number,
): string {
  if (depth > MAX_INLINE_DEPTH) return content

  // Match \input{...} and \include{...} (with optional * variant and whitespace)
  return content.replace(
    /\\(input|include)\*?\s*\{([^}]+)\}/g,
    (_match, directive: string, ref: string) => {
      const trimRef = ref.trim()
      if (visited.has(trimRef)) {
        return `% [preprocessor] circular reference skipped: ${trimRef}`
      }

      const resolved = resolveFile(fileMap, trimRef)
      if (resolved === null) {
        return `% [preprocessor] file not found: ${trimRef}`
      }

      visited.add(trimRef)
      const inlined = inlineInputs(resolved, fileMap, visited, depth + 1)
      visited.delete(trimRef)

      if (directive === 'include') {
        return `\\clearpage\n${inlined}\n\\clearpage`
      }
      return inlined
    },
  )
}

/**
 * Wrap content in a filecontents* environment so that the compilation
 * engine sees the file as if it existed on disk.
 */
function wrapFilecontents(filename: string, content: string): string {
  return `\\begin{filecontents*}{${filename}}\n${content}\n\\end{filecontents*}`
}

/**
 * Core preprocessing pipeline.
 *
 * @param files      All project files (path + content)
 * @param entryFile  The main .tex entry point (default "main.tex")
 * @returns          A single flattened .tex string ready for the API
 */
/**
 * Final safety pass: strip any \include{} or \input{} commands that
 * survived inlining. Remote compilers (e.g. LaTeXLite) reject these
 * for security. This does NOT touch \includegraphics since the regex
 * requires the command to be exactly \include or \input.
 */
function sanitizeDangerousCommands(tex: string): string {
  return tex.replace(DANGEROUS_CMD_RE, (match) => {
    return `% [preprocessor] stripped server-blocked command: ${match}`
  })
}

function preprocessProject(files: ProjectFile[], entryFile: string): string {
  if (files.length === 0) return ''

  const entry = files.find(f => f.path === entryFile) ?? files[0]
  if (files.length === 1) {
    const fileMap = buildFileMap(files)
    const inlined = inlineInputs(entry.content, fileMap, new Set(), 0)
    return sanitizeDangerousCommands(inlined)
  }

  const fileMap = buildFileMap(files)

  // Separate auxiliary files by type
  const bibFiles = files.filter(f => f.path.endsWith('.bib'))
  const styFiles = files.filter(f => f.path.endsWith('.sty'))
  const clsFiles = files.filter(f => f.path.endsWith('.cls'))

  // Step 1: inline \input{} / \include{} recursively
  let result = inlineInputs(entry.content, fileMap, new Set([entry.path]), 0)

  // Step 2: wrap .sty and .cls files before \documentclass
  // These must be available before \documentclass references them
  const styBlocks = [
    ...clsFiles.map(f => wrapFilecontents(f.path, f.content)),
    ...styFiles.map(f => wrapFilecontents(f.path, f.content)),
  ]
  if (styBlocks.length > 0) {
    const docclassMatch = result.match(/^([\s\S]*?)(\\documentclass)/m)
    if (docclassMatch) {
      const beforeDocclass = docclassMatch[1]
      const rest = result.slice(beforeDocclass.length)
      result = beforeDocclass + styBlocks.join('\n') + '\n' + rest
    } else {
      // No \documentclass found — prepend anyway
      result = styBlocks.join('\n') + '\n' + result
    }
  }

  // Step 3: wrap .bib files before \begin{document}
  const bibBlocks = bibFiles.map(f => wrapFilecontents(f.path, f.content))
  if (bibBlocks.length > 0) {
    const beginDocIdx = result.indexOf('\\begin{document}')
    if (beginDocIdx !== -1) {
      result =
        result.slice(0, beginDocIdx) +
        bibBlocks.join('\n') + '\n' +
        result.slice(beginDocIdx)
    } else {
      // No \begin{document} — append bib blocks at the end of preamble
      result = result + '\n' + bibBlocks.join('\n')
    }
  }

  return sanitizeDangerousCommands(result)
}

export function usePreprocessor() {
  const preprocess = useCallback(
    (files: ProjectFile[], entryFile: string = 'main.tex'): string => {
      return preprocessProject(files, entryFile)
    },
    [],
  )

  return { preprocess }
}
