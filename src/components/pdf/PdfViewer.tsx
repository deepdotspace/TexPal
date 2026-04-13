import React, { useState, useCallback } from 'react'
import { PdfToolbar } from './PdfToolbar'
import { PdfDisplay } from './PdfDisplay'
import type { VersionRecord } from '../../hooks'

interface PdfViewerProps {
  pdfUrl: string | null
  isCompiling: boolean
  onDownloadSource: () => void
  onShareClick?: () => void
  onCompile?: () => void
  versions?: VersionRecord[]
  selectedVersionId?: string | null
  onSelectVersion?: (id: string | null) => void
  documentTitle?: string
}

const ZOOM_STEP = 25
const ZOOM_MIN = 25
const ZOOM_MAX = 300
const ZOOM_FIT = 100

export function PdfViewer({ pdfUrl, isCompiling, onDownloadSource, onShareClick, onCompile, versions, selectedVersionId, onSelectVersion, documentTitle }: PdfViewerProps) {
  const [zoom, setZoom] = useState(ZOOM_FIT)

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_STEP))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_STEP))
  }, [])

  const handleFitWidth = useCallback(() => {
    setZoom(ZOOM_FIT)
  }, [])

  const handleSetZoom = useCallback((newZoom: number) => {
    setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(newZoom))))
  }, [])

  const handleDownloadPdf = useCallback(async () => {
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
  }, [pdfUrl, documentTitle])

  return (
    <div className="flex flex-col h-full bg-pdf-bg">
      <PdfToolbar
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitWidth={handleFitWidth}
        onDownloadPdf={handleDownloadPdf}
        onDownloadSource={onDownloadSource}
        hasPdf={!!pdfUrl}
        onShareClick={onShareClick}
        onCompile={onCompile}
        isCompiling={isCompiling}
        versions={versions}
        selectedVersionId={selectedVersionId}
        onSelectVersion={onSelectVersion}
      />

      {pdfUrl ? (
        <PdfDisplay pdfUrl={pdfUrl} zoom={zoom} onZoomChange={handleSetZoom} documentTitle={documentTitle} />
      ) : (
        <PdfEmptyState isCompiling={isCompiling} />
      )}
    </div>
  )
}

function PdfEmptyState({ isCompiling }: { isCompiling: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-xs">
        {isCompiling ? (
          <>
            <div className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-content-secondary text-sm">Compiling your document...</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-surface-elevated flex items-center justify-center text-content-tertiary">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            </div>
            <p className="text-content-secondary text-sm font-medium mb-1">No PDF yet</p>
            <p className="text-content-tertiary text-xs">
              Press <kbd className="px-1.5 py-0.5 rounded bg-surface-inset text-content-secondary font-mono text-[10px]">Ctrl+Enter</kbd> to compile
            </p>
          </>
        )}
      </div>
    </div>
  )
}
