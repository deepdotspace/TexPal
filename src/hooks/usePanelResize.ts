/**
 * usePanelResize — manage resizable panel widths for the three-panel layout.
 *
 * Stores sidebar width and editor/PDF split ratio.
 * Handles drag events on ResizeDivider components.
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

function loadSizes(): PanelSizes {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        sidebarWidth: Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, parsed.sidebarWidth || SIDEBAR_DEFAULT)),
        editorRatio: Math.max(EDITOR_RATIO_MIN, Math.min(EDITOR_RATIO_MAX, parsed.editorRatio || EDITOR_RATIO_DEFAULT)),
      }
    }
  } catch { /* ignore */ }
  return { sidebarWidth: SIDEBAR_DEFAULT, editorRatio: EDITOR_RATIO_DEFAULT }
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
    const newWidth = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, clientX - rect.left))
    setSizes(prev => {
      const next = { ...prev, sidebarWidth: newWidth }
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

    const ratio = Math.max(EDITOR_RATIO_MIN, Math.min(EDITOR_RATIO_MAX, relativeX / availableWidth))

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
