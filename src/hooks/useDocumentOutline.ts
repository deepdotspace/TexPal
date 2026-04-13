/**
 * useDocumentOutline — parse LaTeX section headings from content.
 *
 * Returns an outline tree with title, indentation level, and line number.
 * Debounced at 500ms to avoid re-parsing on every keystroke.
 *
 * Supports all LaTeX sectioning commands:
 * - \part, \chapter, \section, \subsection, \subsubsection, \paragraph, \subparagraph
 * - Starred versions: \section*{title}
 * - Optional TOC titles: \section[toc-title]{title}
 * - Nested braces in titles: \section{Title with {nested} braces}
 */

import { useState, useEffect, useRef } from 'react'
import { SECTION_LEVELS, type OutlineItem } from '../constants'

// Regex to match sectioning commands: \command, \command*, or \command[...]
const SECTION_COMMAND_REGEX = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*)?(?:\[([^\]]*)\])?/g

/**
 * Extract balanced braces content starting at position pos in text.
 * Returns the content and the position after the closing brace.
 */
function extractBraces(text: string, pos: number): { content: string; endPos: number } | null {
  if (pos >= text.length || text[pos] !== '{') {
    return null
  }

  let depth = 0
  let start = pos + 1
  let i = pos

  for (; i < text.length; i++) {
    if (text[i] === '{') {
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        return {
          content: text.substring(start, i),
          endPos: i + 1,
        }
      }
    }
  }

  return null // Unmatched braces
}

function parseOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = []
  const lines = content.split('\n')

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]
    SECTION_COMMAND_REGEX.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = SECTION_COMMAND_REGEX.exec(line)) !== null) {
      const command = match[1]
      const isStarred = !!match[2] // * form (for potential future use)
      const optionalArg = match[3] // [toc-title] if present (for potential future use)
      const commandEndPos = match.index + match[0].length

      // Skip whitespace and comments (% ...) to find the opening brace
      let searchPos = commandEndPos
      while (searchPos < line.length) {
        const char = line[searchPos]
        if (char === '%') {
          // Comment - no brace found on this line
          break
        } else if (char === '{') {
          // Found opening brace
          break
        } else if (char === ' ' || char === '\t') {
          // Skip whitespace
          searchPos++
        } else {
          // Unexpected character - likely not a valid section command
          break
        }
      }

      // Extract the title from braces
      const braceResult = extractBraces(line, searchPos)
      if (!braceResult) {
        continue // No valid braces found
      }

      const title = braceResult.content.trim()
      if (!title) {
        continue // Empty title
      }

      const level = SECTION_LEVELS[command] ?? 2
      items.push({
        title,
        level,
        lineNumber: lineNum + 1,
      })
    }
  }

  return items
}

export function useDocumentOutline(content: string): OutlineItem[] {
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      setOutline(parseOutline(content))
    }, 500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [content])

  return outline
}
