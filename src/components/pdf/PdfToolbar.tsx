import React from 'react'
import { Share2 } from 'lucide-react'
import type { VersionRecord } from '../../hooks'

interface PdfToolbarProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFitWidth: () => void
  onDownloadPdf: () => void
  onDownloadSource: () => void
  hasPdf: boolean
  onShareClick?: () => void
  onCompile?: () => void
  isCompiling?: boolean
  versions?: VersionRecord[]
  selectedVersionId?: string | null
  onSelectVersion?: (id: string | null) => void
}

function ToolbarIcon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  )
}

export function PdfToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onDownloadPdf,
  onDownloadSource,
  hasPdf,
  onShareClick,
  onCompile,
  isCompiling = false,
  versions = [],
  selectedVersionId,
  onSelectVersion,
}: PdfToolbarProps) {
  return (
    <div className="pdf-toolbar shrink-0">
      <div className="pdf-toolbar-track">
        {onCompile && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs font-medium transition-colors
                ${isCompiling
                  ? 'bg-accent/70 text-content-inverse cursor-wait compile-loading'
                  : 'bg-accent text-content-inverse hover:bg-accent-hover'
                }`}
              onClick={onCompile}
              disabled={isCompiling}
              title="Compile (Ctrl+Enter)"
            >
              {isCompiling ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ToolbarIcon d="M5 3l14 9-14 9V3z" size={14} />
              )}
              {isCompiling ? 'Compiling...' : 'Compile'}
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
          </div>
        )}

        {versions.length > 0 && onSelectVersion && (
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={selectedVersionId ?? ''}
              onChange={e => onSelectVersion(e.target.value || null)}
              className="text-xs px-2 py-1 rounded-lg border border-border bg-surface-elevated text-content min-w-[72px]"
              title="Version history"
            >
              <option value="">Latest</option>
              {versions.map(v => (
                <option key={v.recordId} value={v.recordId}>
                  v{v.data.versionNum} — {new Date(v.data.compiledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </option>
              ))}
            </select>
            <div className="w-px h-5 bg-border shrink-0" />
          </div>
        )}

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            className="toolbar-btn"
            onClick={onZoomOut}
            title="Zoom out"
            disabled={zoom <= 50}
          >
            <ToolbarIcon d="M5 12h14" />
          </button>
          <span className="text-xs w-10 text-center select-none opacity-70 shrink-0">
            {zoom}%
          </span>
          <button
            className="toolbar-btn"
            onClick={onZoomIn}
            title="Zoom in"
            disabled={zoom >= 200}
          >
            <ToolbarIcon d="M12 5v14 M5 12h14" />
          </button>
          <button
            className="toolbar-btn"
            onClick={onFitWidth}
            title="Fit to width"
          >
            <ToolbarIcon d="M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7" />
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {onShareClick && (
            <button
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-button text-xs font-medium transition-colors bg-primary/10 text-primary hover:bg-primary/20"
              onClick={onShareClick}
              title="Share document"
            >
              <Share2 size={14} />
              Share
            </button>
          )}
          <button
            className="download-btn shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-button text-xs font-medium transition-colors"
            onClick={onDownloadSource}
            title="Download source (.zip)"
          >
            <ToolbarIcon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3" size={14} />
            Source
          </button>
          {hasPdf && (
            <button
              className="download-btn-primary shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-button text-xs font-medium transition-colors"
              onClick={onDownloadPdf}
              title="Download PDF"
            >
              <ToolbarIcon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3" size={14} />
              PDF
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
