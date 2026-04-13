/**
 * KeyboardShortcutsModal — reference dialog showing all available shortcuts.
 */

import React from 'react'
import { Modal } from '../ui'
import { KEYBOARD_SHORTCUTS } from '../../constants'

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 rounded bg-surface-inset text-content-secondary font-mono text-[11px] border border-border">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header onClose={onClose}>
        <Modal.Title>Keyboard Shortcuts</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="space-y-1">
          {KEYBOARD_SHORTCUTS.map(({ action, shortcut }) => (
            <div
              key={action}
              className="flex items-center justify-between py-1.5 text-sm"
            >
              <span className="text-content">{action}</span>
              <div className="flex items-center gap-1">
                {shortcut.split(' + ').map((key, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-content-tertiary text-xs">+</span>}
                    <Kbd>{key.replace('Ctrl/Cmd', navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl')}</Kbd>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal.Body>
    </Modal>
  )
}
