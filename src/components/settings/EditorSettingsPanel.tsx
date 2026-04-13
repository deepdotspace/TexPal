/**
 * EditorSettingsPanel — slide-over panel for editor preferences.
 *
 * Controls: font size, theme (light/dark), line wrapping, line numbers.
 */

import React from 'react'
import { FONT_SIZE_OPTIONS } from '../../constants'
import type { EditorSettings } from '../../hooks/useEditorSettings'

interface EditorSettingsPanelProps {
  open: boolean
  onClose: () => void
  settings: EditorSettings
  onUpdateSetting: <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => void
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 cursor-pointer group">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-content font-medium">{label}</div>
        {description && <div className="text-xs text-content-secondary mt-0.5">{description}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-accent' : ''
        }`}
        style={checked ? undefined : { backgroundColor: 'rgba(156, 163, 175, 0.4)' }}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  )
}

export function EditorSettingsPanel({ open, onClose, settings, onUpdateSetting }: EditorSettingsPanelProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative w-72 max-w-full h-full bg-surface-elevated border-l border-border shadow-panel overflow-y-auto fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-surface-elevated z-10">
          <h2 className="text-sm font-semibold text-content">Settings</h2>
          <button className="toolbar-btn" onClick={onClose} title="Close settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Font Size */}
          <div>
            <label className="text-xs font-medium text-content-secondary uppercase tracking-wider">Font Size</label>
            <div className="flex gap-1.5 mt-2">
              {FONT_SIZE_OPTIONS.map(size => (
                <button
                  key={size}
                  className={`flex-1 py-1.5 text-xs rounded-button transition-colors font-medium ${
                    settings.fontSize === size
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-surface-inset text-content-secondary hover:text-content hover:bg-surface-inset/80'
                  }`}
                  onClick={() => onUpdateSetting('fontSize', size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div>
            <label className="text-xs font-medium text-content-secondary uppercase tracking-wider">Theme</label>
            <div className="flex gap-1.5 mt-2">
              {(['light', 'dark'] as const).map(theme => (
                <button
                  key={theme}
                  className={`flex-1 py-1.5 text-xs rounded-button transition-colors capitalize font-medium ${
                    settings.theme === theme
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-surface-inset text-content-secondary hover:text-content hover:bg-surface-inset/80'
                  }`}
                  onClick={() => onUpdateSetting('theme', theme)}
                >
                  {theme === 'light' ? (
                    <span className="inline-flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="5" />
                        <path d="M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42" />
                      </svg>
                      Light
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                      Dark
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Toggles */}
          <div className="space-y-1">
            <Toggle
              checked={settings.lineWrapping}
              onChange={v => onUpdateSetting('lineWrapping', v)}
              label="Line Wrapping"
              description="Wrap long lines instead of scrolling"
            />
            <Toggle
              checked={settings.lineNumbers}
              onChange={v => onUpdateSetting('lineNumbers', v)}
              label="Line Numbers"
              description="Show line numbers in the gutter"
            />
          </div>

          <div className="h-px bg-border" />

          <div>
            <label className="text-xs font-medium text-content-secondary uppercase tracking-wider">Bibliography Engine</label>
            <div className="flex gap-1.5 mt-2">
              {(['bibtex', 'biber'] as const).map((bibEngine) => (
                <button
                  key={bibEngine}
                  className={`flex-1 py-1.5 text-xs rounded-button transition-colors font-medium ${
                    settings.bibEngine === bibEngine
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-surface-inset text-content-secondary hover:text-content hover:bg-surface-inset/80'
                  }`}
                  onClick={() => onUpdateSetting('bibEngine', bibEngine)}
                >
                  {bibEngine}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-content-secondary mt-1.5 leading-tight">
              Used for cloud bibliography processing during compilation.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
