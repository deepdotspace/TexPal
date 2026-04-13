import React from 'react'
import { Modal } from '../ui'

interface ShareModalProps {
  open: boolean
  onClose: () => void
  documentTitle: string
  teamId: string | null
}

export function ShareModal({ open, onClose, documentTitle }: ShareModalProps) {
  return (
    <Modal open={open} onClose={onClose} size="md">
      <Modal.Header onClose={onClose}>
        <Modal.Title>Share "{documentTitle}"</Modal.Title>
        <Modal.Description>Collaboration settings</Modal.Description>
      </Modal.Header>

      <Modal.Body>
        <div className="py-8 text-center">
          <p className="text-content-secondary text-sm">
            Sharing and collaboration are managed at the app level.
          </p>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-content-secondary hover:text-content transition-colors"
        >
          Done
        </button>
      </Modal.Footer>
    </Modal>
  )
}
