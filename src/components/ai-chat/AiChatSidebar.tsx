/**
 * AiChatSidebar — chat surface OUTSIDE the editor card, on the RIGHT of the shell.
 *
 * Slides between 0-width and `width` based on `open`. The toggle button lives
 * SEPARATELY in an always-present 52px rail to the right of this component
 * (see `AiChatToggleButton`) — that way the toggle sits at a fixed viewport
 * position in both states and the card just slides left/right to make room.
 *
 * When closed, the sidebar renders 0-width invisible but ChatPanel stays
 * mounted so useChat state / localStorage messages / model selection survive.
 *
 * See docs/ai-chat/sidebar-ux.md.
 */

import { useState } from 'react'
import { SquarePen } from 'lucide-react'
import { ChatPanel } from './ChatPanel'

/**
 * AssistantFace — dot-dot-curve persona icon for the assistant.
 */
function AssistantFace({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.25" strokeWidth="1.25" />
      <circle cx="6" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <path d="M6 10 Q8 11 10 10" strokeWidth="1.5" />
    </svg>
  )
}

interface AiChatSidebarProps {
  open: boolean
  width: number
  documentId: string
  activeFilePath: string | null
  activeFileContent: string
}

export function AiChatSidebar({
  open,
  width,
  documentId,
  activeFilePath,
  activeFileContent,
}: AiChatSidebarProps) {
  const effectiveWidth = open ? width : 0

  // Monotonic counter. Bumping it signals ChatPanel to reset — stop stream,
  // clear messages state, wipe the doc's localStorage entry, focus the input.
  const [newChatSignal, setNewChatSignal] = useState(0)

  return (
    <aside
      aria-label="AI assistant"
      style={{ width: effectiveWidth, minWidth: effectiveWidth, maxWidth: effectiveWidth }}
      className={`shrink-0 h-full flex flex-col overflow-hidden bg-surface transition-[width] duration-200 ease-out ${
        open ? '' : 'invisible'
      }`}
    >
      <header className="shrink-0 flex items-center justify-between px-3 h-toolbar border-b border-border">
        <span className="text-[12px] font-medium text-content tracking-tight truncate">
          Assistant
        </span>
        <button
          type="button"
          onClick={() => setNewChatSignal((n) => n + 1)}
          title="New chat"
          aria-label="New chat"
          className="toolbar-btn !w-6 !h-6 text-content-secondary hover:text-content transition-colors"
        >
          <SquarePen size={13} />
        </button>
      </header>

      <div className="flex-1 min-h-0">
        <ChatPanel
          documentId={documentId}
          activeFilePath={activeFilePath}
          activeFileContent={activeFileContent}
          newChatSignal={newChatSignal}
        />
      </div>
    </aside>
  )
}

/**
 * Always-present toggle button in the shell's right gutter. Stays at the
 * same viewport position whether the chat is open or closed — clicking it
 * toggles the sidebar. The editor card slides to make room when opening /
 * closing; the smiley itself does not move.
 *
 * Bounces gently when closed (attention-getter). Still and accent-tinted
 * when open (indicates "pressed" / active state).
 */
export function AiChatToggleButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? 'Close assistant' : 'Open assistant'}
      aria-label={open ? 'Close assistant' : 'Open assistant'}
      aria-pressed={open}
      className={[
        'group shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors',
        open
          ? 'text-accent bg-surface-inset'
          : 'text-content-secondary hover:text-accent hover:bg-surface-inset',
      ].join(' ')}
    >
      <AssistantFace
        size={22}
        className={open ? '' : 'assistant-face-bounce'}
      />
    </button>
  )
}
