/**
 * usePanelResize — manage resizable panel widths for the editor card.
 *
 * The file-tree sidebar and the editor/PDF split live INSIDE the card.
 * The AI chat sidebar lives OUTSIDE the card (to the left) and is managed
 * separately by EditorLayout.
 */

import { useState, useCallback, useRef } from 'react'

interface PanelSizes {
  sidebarWidth: number
  editorRatio: number
}

const SIDEBAR_MIN = 160
const SIDEBAR_MAX = 360
const SIDEBAR_DEFAULT = 220

const EDITOR_RATIO_MIN = 0.25
const EDITOR_RATIO_MAX = 0.75
const EDITOR_RATIO_DEFAULT = 0.5

const STORAGE_KEY = 'latex-editor-panel-sizes'

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function loadSizes(): PanelSizes {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const width = typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : SIDEBAR_DEFAULT
      return {
        sidebarWidth: clamp(width, SIDEBAR_MIN, SIDEBAR_MAX),
        editorRatio: clamp(parsed.editorRatio ?? EDITOR_RATIO_DEFAULT, EDITOR_RATIO_MIN, EDITOR_RATIO_MAX),
      }
    }
  } catch { /* ignore */ }
  return {
    sidebarWidth: SIDEBAR_DEFAULT,
    editorRatio: EDITOR_RATIO_DEFAULT,
  }
}

function saveSizes(sizes: PanelSizes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes))
  } catch { /* ignore */ }
}

export function usePanelResize() {
  const [sizes, setSizes] = useState<PanelSizes>(loadSizes)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const handleSidebarResize = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const raw = clientX - rect.left
    setSizes(prev => {
      const next = { ...prev, sidebarWidth: clamp(raw, SIDEBAR_MIN, SIDEBAR_MAX) }
      saveSizes(next)
      return next
    })
  }, [])

  const handleEditorResize = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const sidebarW = sidebarCollapsed ? 0 : sizes.sidebarWidth
    const dividerWidth = 6
    const availableWidth = rect.width - sidebarW - dividerWidth * 2
    const editorStart = rect.left + sidebarW + dividerWidth
    const relativeX = clientX - editorStart

    const ratio = clamp(relativeX / availableWidth, EDITOR_RATIO_MIN, EDITOR_RATIO_MAX)

    setSizes(prev => {
      const next = { ...prev, editorRatio: ratio }
      saveSizes(next)
      return next
    })
  }, [sidebarCollapsed, sizes.sidebarWidth])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev)
  }, [])

  return {
    sidebarWidth: sidebarCollapsed ? 0 : sizes.sidebarWidth,
    sidebarCollapsed,
    editorRatio: sizes.editorRatio,
    containerRef,
    handleSidebarResize,
    handleEditorResize,
    toggleSidebar,
  }
}
