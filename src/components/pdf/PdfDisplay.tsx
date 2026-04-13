import React, { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    pdfjsLib: any
  }
}

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs'
const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs'

interface PdfDisplayProps {
  pdfUrl: string | null
  zoom: number
  onZoomChange?: (zoom: number) => void
  documentTitle?: string
}

let pdfjsLoadPromise: Promise<any> | null = null

async function loadPdfJs(): Promise<any> {
  if (window.pdfjsLib) return window.pdfjsLib
  if (pdfjsLoadPromise) return pdfjsLoadPromise

  pdfjsLoadPromise = import(/* @vite-ignore */ PDFJS_CDN).then((mod) => {
    const lib = mod.default || mod
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN
    window.pdfjsLib = lib
    return lib
  })

  return pdfjsLoadPromise
}

export function PdfDisplay({ pdfUrl, zoom, onZoomChange, documentTitle }: PdfDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<HTMLCanvasElement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const renderTaskRef = useRef(0)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // ── Render PDF pages ─────────────────────────────────────────────
  useEffect(() => {
    if (!pdfUrl) {
      setPages([])
      setError(null)
      return
    }

    const taskId = ++renderTaskRef.current
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const pdfjsLib = await loadPdfJs()
        if (taskId !== renderTaskRef.current) return

        const loadingTask = pdfjsLib.getDocument(pdfUrl)
        const pdf = await loadingTask.promise
        if (taskId !== renderTaskRef.current) return

        const canvases: HTMLCanvasElement[] = []

        for (let i = 1; i <= pdf.numPages; i++) {
          if (taskId !== renderTaskRef.current) return

          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 2 })

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height

          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport }).promise

          canvases.push(canvas)
        }

        if (taskId !== renderTaskRef.current) return
        setPages(canvases)
        setLoading(false)
      } catch (err: any) {
        if (taskId !== renderTaskRef.current) return
        console.error('[PdfDisplay] render error:', err)
        setError(err.message || 'Failed to render PDF')
        setLoading(false)
      }
    })()

    return () => {
      renderTaskRef.current++
    }
  }, [pdfUrl])

  // ── Zoom-to-cursor helper ────────────────────────────────────────
  // Adjusts scroll so the point under the cursor stays fixed after zoom.
  function zoomToPoint(newZoom: number, clientX: number, clientY: number) {
    if (!onZoomChange || !scrollRef.current) return
    const el = scrollRef.current
    const oldZoom = zoomRef.current
    const scale = newZoom / oldZoom

    // Point in scrollable content under cursor before zoom
    const rect = el.getBoundingClientRect()
    const cursorXInView = clientX - rect.left
    const cursorYInView = clientY - rect.top
    const contentX = el.scrollLeft + cursorXInView
    const contentY = el.scrollTop + cursorYInView

    onZoomChange(newZoom)

    // After zoom, adjust scroll so the same content point stays under cursor
    requestAnimationFrame(() => {
      el.scrollLeft = contentX * scale - cursorXInView
      el.scrollTop = contentY * scale - cursorYInView
    })
  }

  // ── Ctrl+scroll / trackpad pinch zoom ────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onZoomChange) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()

      const factor = 1 - e.deltaY * 0.005
      const newZoom = Math.max(25, Math.min(300, zoomRef.current * factor))
      zoomToPoint(newZoom, e.clientX, e.clientY)
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [onZoomChange])

  // ── Touch pinch-to-zoom ──────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onZoomChange) return

    let initialDistance = 0
    let initialZoom = 100
    let centerX = 0
    let centerY = 0

    function getDistance(touches: TouchList): number {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    function getCenter(touches: TouchList): [number, number] {
      return [
        (touches[0].clientX + touches[1].clientX) / 2,
        (touches[0].clientY + touches[1].clientY) / 2,
      ]
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        initialDistance = getDistance(e.touches)
        initialZoom = zoomRef.current
        ;[centerX, centerY] = getCenter(e.touches)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDistance > 0) {
        e.preventDefault()
        const currentDistance = getDistance(e.touches)
        const scale = currentDistance / initialDistance
        const newZoom = Math.max(25, Math.min(300, initialZoom * scale))
        zoomToPoint(newZoom, centerX, centerY)
      }
    }

    const handleTouchEnd = () => {
      initialDistance = 0
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: false })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd)

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onZoomChange])

  if (!pdfUrl) return null

  // The inner div has real width/height scaled by zoom so the scrollbar
  // reflects the actual scrollable area — no CSS transform trickery.
  const scaleFactor = zoom / 100

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-pdf-bg">
      <div
        ref={innerRef}
        className="flex flex-col items-center origin-top-left"
        style={{
          width: `${scaleFactor * 100}%`,
          padding: `${16 * scaleFactor}px`,
          gap: `${16 * scaleFactor}px`,
        }}
      >
        {loading && pages.length === 0 && (
          <div className="flex items-center justify-center py-12" style={{ transform: `scale(${scaleFactor})`, transformOrigin: 'center' }}>
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm opacity-60">Rendering PDF...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3" style={{ transform: `scale(${scaleFactor})`, transformOrigin: 'center' }}>
            <p className="text-danger text-sm">{error}</p>
            <button
              onClick={async () => {
                if (!pdfUrl) return
                const safeName = (documentTitle || 'document').replace(/[^a-zA-Z0-9_\- ]/g, '_')
                try {
                  const res = await fetch(pdfUrl)
                  const blob = await res.blob()
                  const blobUrl = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = blobUrl
                  a.download = `${safeName}.pdf`
                  a.click()
                  URL.revokeObjectURL(blobUrl)
                } catch {
                  const a = document.createElement('a')
                  a.href = pdfUrl
                  a.download = `${safeName}.pdf`
                  a.click()
                }
              }}
              className="px-4 py-2 bg-accent text-white rounded text-sm hover:opacity-90"
            >
              Download PDF instead
            </button>
          </div>
        )}

        {pages.map((canvas, idx) => (
          <CanvasPage key={idx} canvas={canvas} pageNum={idx + 1} scaleFactor={scaleFactor} />
        ))}
      </div>
    </div>
  )
}

function CanvasPage({ canvas, pageNum, scaleFactor }: { canvas: HTMLCanvasElement; pageNum: number; scaleFactor: number }) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    canvas.style.width = '100%'
    canvas.style.height = 'auto'
    canvas.style.display = 'block'

    wrapper.innerHTML = ''
    wrapper.appendChild(canvas)

    return () => {
      if (wrapper.contains(canvas)) {
        wrapper.removeChild(canvas)
      }
    }
  }, [canvas])

  return (
    <div
      ref={wrapperRef}
      className="bg-white rounded shadow-md"
      style={{ width: `${Math.min(800 * scaleFactor, 100)}%`, maxWidth: `${800 * scaleFactor}px` }}
      data-page={pageNum}
    />
  )
}
