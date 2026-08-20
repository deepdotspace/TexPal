/**
 * chatTranscript — per-document persistence for the assistant transcript.
 *
 * ChatPanel keeps exactly one `Chat` on screen, but during a remount (document
 * switch, or "New chat") two of them briefly coexist: React renders and mounts
 * the incoming instance before it runs the outgoing instance's cleanup. Both
 * write the same localStorage key. Whichever writes last wins, and "last" is a
 * property of React's commit phases — not something this feature should be
 * built on.
 *
 * So the store versions each document's transcript instead:
 *
 *   - `readTranscript` hands a session the messages AND the version it read.
 *   - `saveTranscript` only accepts a write from the version that is still
 *     current, and drops (returns false) anything older.
 *   - `clearTranscript` bumps the version, which retires every session holding
 *     the old one — permanently, not just for the next few milliseconds.
 *
 * A "New chat" therefore cannot be undone by the outgoing chat's unmount flush,
 * by its pending debounce, or by a re-read that happened to land first. A
 * document switch bumps nothing, so the outgoing chat still flushes its final
 * delta under its own document's key.
 *
 * `clearTranscript` must run in the click handler, before React re-renders —
 * see `useNewChat` in ChatPanel.tsx. The incoming `Chat` reads storage during
 * its render pass (`useChat` builds its state from `messages` in a ref
 * initializer), which is earlier than any effect can be.
 */

import type { UIMessage } from 'ai'

const KEY_PREFIX = 'ai-chat-messages:'

/**
 * documentId -> transcript version. Absent means 0. Bumped only by
 * `clearTranscript`; bounded by the number of documents opened this session.
 */
const versions = new Map<string, number>()

function versionOf(documentId: string): number {
  return versions.get(documentId) ?? 0
}

export interface TranscriptSession {
  /** Messages the chat should mount with. */
  messages: UIMessage[]
  /** Token this session has to present to `saveTranscript` to be allowed to write. */
  version: number
}

function isPersistedMessage(value: unknown): value is UIMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return (
    typeof message.id === 'string' &&
    typeof message.role === 'string' &&
    Array.isArray(message.parts)
  )
}

/** Read the stored transcript and claim the version that goes with it. */
export function readTranscript(documentId: string): TranscriptSession {
  const version = versionOf(documentId)
  try {
    const raw = localStorage.getItem(KEY_PREFIX + documentId)
    if (!raw) return { messages: [], version }
    const parsed = JSON.parse(raw)
    return {
      messages: Array.isArray(parsed) ? parsed.filter(isPersistedMessage) : [],
      version,
    }
  } catch {
    return { messages: [], version }
  }
}

/**
 * Persist a session's transcript.
 *
 * Returns false — and writes nothing — when `version` is stale, i.e. the
 * transcript was cleared after this session read it.
 */
export function saveTranscript(
  documentId: string,
  version: number,
  messages: UIMessage[],
): boolean {
  if (version !== versionOf(documentId)) return false
  try {
    localStorage.setItem(KEY_PREFIX + documentId, JSON.stringify(messages))
  } catch { /* storage full or disabled */ }
  return true
}

/**
 * Discard a document's transcript and retire every session that read it.
 *
 * Call this synchronously from the event handler that starts a new chat, so
 * the wipe is already done before React renders the replacement.
 */
export function clearTranscript(documentId: string): void {
  versions.set(documentId, versionOf(documentId) + 1)
  try { localStorage.removeItem(KEY_PREFIX + documentId) } catch { /* ignore */ }
}
