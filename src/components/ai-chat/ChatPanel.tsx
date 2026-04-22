/**
 * ChatPanel — the assistant conversation surface.
 *
 * Design direction: "minimal mono-column with ghost input".
 * Typography does the work. No bubbles. User messages sit right, slightly
 * heavier. Assistant text flows like reading. Tool activity surfaces inline,
 * in the order the model produced it, with a live/done state. A single
 * pulsing dot lives on the streaming turn the entire time `isLoading` is
 * true — solving the "frozen bubble" perception during tool-call gaps.
 *
 * Behavioral contracts preserved:
 *   - useChat({ api: '/api/ai/chat', body: { documentId, activeFilePath,
 *     activeFileContent }, fetch: <bearer-wrapper> })
 *   - messages reset on documentId change
 *   - auth gate shows AuthOverlay on sign-in
 *
 * Item-6 specifics: we render `message.parts[]` in their produced order. Each
 * `type: 'text'` is printed inline; each `type: 'tool-invocation'` becomes a
 * tool row that tracks its state (`call` → `result`). Tool names and their
 * `collection`+`data` params are humanized (see `describeTool`).
 */

import { useState, useRef, useEffect, useMemo, type FormEvent, type KeyboardEvent } from 'react'
import { useChat } from '@ai-sdk/react'
import { useAuth, AuthOverlay, getAuthToken } from 'deepspace'
import { ArrowUp, AlertCircle, RefreshCw, Check, ChevronDown, Square } from 'lucide-react'
import type { Message } from '@ai-sdk/ui-utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CHAT_MODELS, DEFAULT_MODEL_ID, type ChatModelProvider } from '../../ai/models'

// ============================================================================
// localStorage keys
// ============================================================================

const MESSAGES_KEY_PREFIX = 'ai-chat-messages:'
const MODEL_KEY = 'ai-chat-model'

function loadModelId(): string {
  try {
    const v = localStorage.getItem(MODEL_KEY)
    if (v && CHAT_MODELS.some((m) => m.id === v)) return v
  } catch { /* ignore */ }
  return DEFAULT_MODEL_ID
}

interface ChatPanelProps {
  /** The document the user is currently editing. Required — messages scoped per document. */
  documentId: string
  /** The path of the file currently open in the editor, or null if none. */
  activeFilePath: string | null
  /** Live editor buffer for the active file. See docs/ai-chat/gotchas.md #8. */
  activeFileContent: string
  /**
   * Monotonically-increasing counter. When this value changes, ChatPanel
   * clears the current conversation (stops any in-flight stream, wipes
   * messages state, removes the doc's localStorage entry, focuses input).
   * The initial value is ignored — only actual changes trigger a reset.
   */
  newChatSignal?: number
}

export function ChatPanel({ documentId, activeFilePath, activeFileContent, newChatSignal }: ChatPanelProps) {
  const { isLoaded, isSignedIn } = useAuth()
  const [showAuth, setShowAuth] = useState(false)

  // Wipe the persisted transcript when the user triggers "New chat" — runs
  // before the inner Chat component remounts under its new key, so the fresh
  // mount loads an empty conversation instead of rehydrating the old one.
  const lastSignalRef = useRef<number | undefined>(newChatSignal)
  useEffect(() => {
    if (newChatSignal === undefined) return
    if (lastSignalRef.current === newChatSignal) return
    lastSignalRef.current = newChatSignal
    try { localStorage.removeItem(MESSAGES_KEY_PREFIX + documentId) } catch { /* ignore */ }
  }, [newChatSignal, documentId])

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-content-tertiary text-xs tracking-wide">
        <span className="animate-pulse">…</span>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <>
        <div className="flex h-full items-center justify-center px-6">
          <div className="max-w-[260px] space-y-4 text-center">
            <p className="text-[15px] text-content leading-relaxed">
              Sign in to use the assistant.
            </p>
            <p className="text-[12px] text-content-tertiary leading-relaxed">
              It reads your project and edits files with your permissions.
            </p>
            <button
              onClick={() => setShowAuth(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-medium text-content hover:bg-surface-inset transition-colors"
            >
              Sign in
            </button>
          </div>
        </div>
        {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
      </>
    )
  }

  // Key the Chat by documentId + newChatSignal so useChat remounts (and its
  // internal stream/stop machinery fully resets) on doc switch or "New chat".
  // This replaces a racy msgOwnerRef dance with the canonical remount pattern.
  const chatKey = `${documentId}:${newChatSignal ?? 0}`
  return (
    <Chat
      key={chatKey}
      documentId={documentId}
      activeFilePath={activeFilePath}
      activeFileContent={activeFileContent}
    />
  )
}

function loadPersistedMessages(documentId: string): Message[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY_PREFIX + documentId)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Message[]) : []
  } catch {
    return []
  }
}

function Chat({
  documentId,
  activeFilePath,
  activeFileContent,
}: {
  documentId: string
  activeFilePath: string | null
  activeFileContent: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Model selection — persisted globally (not per-doc). User preference.
  const [modelId, setModelId] = useState<string>(loadModelId)
  useEffect(() => {
    try { localStorage.setItem(MODEL_KEY, modelId) } catch { /* ignore */ }
  }, [modelId])

  // Lazy-init initialMessages from localStorage so the first render already
  // contains the persisted transcript. Because this component is keyed by
  // `${documentId}:${newChatSignal}` in its parent, a new mount always reads
  // fresh storage — no need for a separate LOAD effect.
  const initialMessages = useMemo(() => loadPersistedMessages(documentId), [documentId])

  const {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    reload,
    stop,
  } = useChat({
    api: '/api/ai/chat',
    initialMessages,
    body: { documentId, activeFilePath, activeFileContent, modelId },
    fetch: async (url, init) => {
      const token = await getAuthToken()
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const headers = new Headers(init?.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return fetch(url, { ...init, headers })
    },
  })

  // Persist transcript to localStorage. Debounced to coalesce the bursty
  // per-token updates during streaming — JSON.stringify of a long history on
  // every token is a main-thread tax. The write also happens on unmount so
  // we don't lose the final delta.
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(MESSAGES_KEY_PREFIX + documentId, JSON.stringify(messagesRef.current))
      } catch { /* storage full or disabled */ }
    }, 250)
    return () => clearTimeout(t)
  }, [messages, documentId])
  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(MESSAGES_KEY_PREFIX + documentId, JSON.stringify(messagesRef.current))
      } catch { /* ignore */ }
    }
  }, [documentId])

  // Auto-scroll: only if the user was already near the bottom. Otherwise they
  // scrolled up to re-read something and we shouldn't yank them back on
  // every streamed token.
  const stickToBottomRef = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottomRef.current = gap < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickToBottomRef.current) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Auto-grow textarea (cap ~ 200px so it never dominates the panel).
  //
  // When empty, release the inline height so the native `rows={1}` + CSS
  // default render a true single-line box. Measuring scrollHeight on a
  // freshly-mounted textarea — or one sitting inside a parent whose width
  // transition hasn't finished — can latch an inflated value that sticks
  // until the user types and re-triggers the effect.
  //
  // For non-empty content, defer to rAF so measurement happens after the
  // current frame's layout commit.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    if (!input) {
      el.style.height = ''
      return
    }
    const raf = requestAnimationFrame(() => {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    })
    return () => cancelAnimationFrame(raf)
  }, [input])

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) {
        handleSubmit(e as unknown as FormEvent<HTMLFormElement>)
      }
    }
  }

  const lastMessage = messages[messages.length - 1]
  const streamingAssistantId =
    isLoading && lastMessage?.role === 'assistant' ? lastMessage.id : null
  const waitingForAssistant = isLoading && lastMessage?.role === 'user'

  return (
    <div className="flex h-full flex-col min-h-0 bg-surface">
      {/* Scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-5 py-6"
      >
        {messages.length === 0 ? (
          <EmptyState
            onSuggest={(text) => {
              setInput(text)
              inputRef.current?.focus()
            }}
          />
        ) : (
          <div
            className="flex flex-col gap-4"
            role="log"
            aria-live="polite"
            aria-atomic="false"
            aria-label="Assistant conversation"
          >
            {messages.map((m, idx) => (
              <MessageRow
                key={m.id}
                message={m as Message}
                isStreaming={m.id === streamingAssistantId}
                showDivider={idx > 0}
              />
            ))}

            {waitingForAssistant && <PendingIndicator />}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[12px] text-danger">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span className="flex-1 break-words leading-relaxed">{error.message}</span>
          <button
            onClick={() => reload()}
            className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-danger/10 transition-colors"
            title="Retry"
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}

      {/* Composer — ghost input. Thin top hairline, textarea, submit appears
          only when there's text. Apple-style restraint. */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-border/60 px-3 pt-3 pb-3"
      >
        <div className="relative flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2 focus-within:border-content-tertiary/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder={activeFilePath ? `Ask about ${shortBase(activeFilePath)}…` : 'Ask anything…'}
            rows={1}
            className="flex-1 resize-none bg-transparent text-[14px] leading-[1.55] text-content placeholder:text-content-tertiary outline-none"
            style={{ maxHeight: 200 }}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={() => stop()}
              aria-label="Stop generating"
              title="Stop"
              className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-content text-background transition-all duration-150"
            >
              <Square size={11} strokeWidth={2.5} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send"
              title="Send (Enter)"
              className={[
                'shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full',
                'transition-all duration-150',
                input.trim()
                  ? 'bg-content text-background opacity-100 scale-100'
                  : 'bg-surface-inset text-content-tertiary opacity-60 scale-90',
                'disabled:cursor-not-allowed',
              ].join(' ')}
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-content-tertiary/80">
          <ModelPicker modelId={modelId} onChange={setModelId} />
          {activeFilePath && (
            <span className="truncate font-mono max-w-[55%]" title={activeFilePath}>
              {shortBase(activeFilePath)}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

function shortBase(p: string) {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(i + 1) : p
}

// ============================================================================
// Model picker — small popover in the composer footer. Groups by provider.
// ============================================================================

const PROVIDER_ORDER: ChatModelProvider[] = ['anthropic', 'openai', 'cerebras']
const PROVIDER_LABELS: Record<ChatModelProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  cerebras: 'Cerebras',
}


function ModelPicker({
  modelId,
  onChange,
}: {
  modelId: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = CHAT_MODELS.find((m) => m.id === modelId) ?? CHAT_MODELS[0]

  return (
    <div ref={containerRef} className="relative inline-flex min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 truncate hover:text-content transition-colors"
        title="Change model"
      >
        <span className="truncate">{current.label}</span>
        <ChevronDown size={10} className="shrink-0 opacity-70" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-2 z-20 w-64 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-surface shadow-lg"
        >
          {PROVIDER_ORDER.map((prov, pIdx) => {
            const models = CHAT_MODELS.filter((m) => m.provider === prov)
            if (models.length === 0) return null
            return (
              <div key={prov}>
                {pIdx > 0 && <div className="border-t border-border/60" />}
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-content-tertiary uppercase">
                  {PROVIDER_LABELS[prov]}
                </div>
                {models.map((m) => {
                  const active = m.id === modelId
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onChange(m.id)
                        setOpen(false)
                      }}
                      className={[
                        'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors',
                        active ? 'bg-surface-inset' : 'hover:bg-surface-inset',
                      ].join(' ')}
                    >
                      <div className="min-w-0">
                        <div className="text-[12.5px] leading-tight text-content truncate">
                          {m.label}
                        </div>
                        {m.hint && (
                          <div className="text-[11px] leading-tight text-content-tertiary mt-0.5">
                            {m.hint}
                          </div>
                        )}
                      </div>
                      {active && <Check size={12} className="shrink-0 text-accent" strokeWidth={2.5} />}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Empty state — sparse, typographic.
// ============================================================================

const SUGGESTIONS: Array<{ label: string; text: string }> = [
  { label: 'Draft a homework on integration by parts', text: 'Write me a homework on integration by parts.' },
  { label: 'Add a bibliography', text: 'Add a bibliography with a few example references.' },
  { label: 'Fix the compile errors', text: 'Look at my latest compile errors and fix them.' },
]

function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-5">
      <div className="w-full max-w-[300px] space-y-2.5 text-left">
        <div className="text-[10.5px] font-medium tracking-[0.08em] text-content-tertiary uppercase">
          Try
        </div>
        <div className="flex flex-col">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => onSuggest(s.text)}
              className="group flex items-center gap-2 text-left text-[13px] text-content-secondary hover:text-content transition-colors py-1"
            >
              <span className="inline-block h-px w-3 bg-border group-hover:bg-content-tertiary transition-colors shrink-0" />
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Message row — parts-ordered rendering.
// ============================================================================

type Part = NonNullable<Message['parts']>[number]

function MessageRow({
  message,
  isStreaming,
  showDivider,
}: {
  message: Message
  isStreaming: boolean
  showDivider: boolean
}) {
  const isUser = message.role === 'user'

  // Walk parts in order. For user messages, the content IS the text — there
  // won't be tool parts. For assistants, parts interleave text + tools.
  const parts: Part[] = useMemo(() => {
    const p = message.parts
    if (p && p.length > 0) return p
    // Fallback for older messages without parts: synthesize a single text part.
    if (message.content) return [{ type: 'text', text: message.content }] as Part[]
    return []
  }, [message.parts, message.content])

  if (isUser) {
    return (
      <div>
        {showDivider && <div className="chat-turn-divider" />}
        <div className="flex justify-end">
          <div className="max-w-[85%] text-[13.5px] leading-[1.55] text-content font-medium text-left whitespace-pre-wrap break-words">
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {showDivider && <div className="chat-turn-divider" />}
      <div className="space-y-2">
        {parts.map((p, i) => {
          if (p.type === 'text') {
            return (
              <div key={i} className="chat-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {p.text}
                </ReactMarkdown>
              </div>
            )
          }
          if (p.type === 'tool-invocation') {
            return <ToolRow key={i} part={p} />
          }
          // reasoning / source / file / step-start — ignore for now.
          return null
        })}

        {/* Streaming activity indicator — always visible on the active
            assistant turn until the stream closes. Solves the empty-bubble
            and mid-turn-tool-gap perception. */}
        {isStreaming && <LiveDot />}
      </div>
    </div>
  )
}

// ============================================================================
// Tool invocation rendering — humanized, live state.
// ============================================================================

type ToolPart = Extract<Part, { type: 'tool-invocation' }>

function ToolRow({ part }: { part: ToolPart }) {
  const inv = part.toolInvocation
  const { label, path } = describeTool(inv.toolName, inv.args as Record<string, unknown> | undefined)
  const isDone = inv.state === 'result'

  return (
    <div
      className={[
        'relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 -mx-1',
        'text-[12.5px] leading-tight',
        isDone
          ? 'text-content-secondary'
          : 'text-content',
        !isDone && 'chat-tool-shimmer',
      ].filter(Boolean).join(' ')}
    >
      <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center">
        {isDone ? (
          <Check size={12} className="text-success" strokeWidth={2.5} />
        ) : (
          <ToolSpinner />
        )}
      </span>
      <span className="truncate">
        <span className={isDone ? '' : 'text-content'}>{label}</span>
        {path && (
          <>
            {' '}
            <code className="font-mono text-[12px] text-content-secondary">
              {path}
            </code>
          </>
        )}
        {!isDone && <EllipsisDots />}
      </span>
    </div>
  )
}

function ToolSpinner() {
  // Hairline ring spinner — 12px, 1.5px stroke, restrained.
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className="animate-spin">
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
      <path d="M10.5 6 A 4.5 4.5 0 0 1 6 10.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function EllipsisDots() {
  return (
    <span className="ml-0.5 inline-flex items-center gap-[2px] align-middle">
      <span className="chat-dot-1 inline-block h-[2px] w-[2px] rounded-full bg-content-secondary" />
      <span className="chat-dot-2 inline-block h-[2px] w-[2px] rounded-full bg-content-secondary" />
      <span className="chat-dot-3 inline-block h-[2px] w-[2px] rounded-full bg-content-secondary" />
    </span>
  )
}

function LiveDot() {
  return (
    <div
      className="mt-1 inline-flex items-center gap-2 text-[11px] text-content-tertiary"
      aria-live="polite"
    >
      <span className="chat-live-dot h-1.5 w-1.5 rounded-full bg-accent" />
      <span className="tracking-wide">working</span>
    </div>
  )
}

function PendingIndicator() {
  // Shown when the user's last message is still waiting for the first
  // assistant token — i.e. the stream hasn't opened a new assistant message
  // yet. Once the assistant turn appears, `LiveDot` takes over inside it.
  return (
    <div className="flex items-center gap-2 text-[12px] text-content-tertiary">
      <span className="chat-live-dot h-1.5 w-1.5 rounded-full bg-accent" />
      <span>thinking</span>
    </div>
  )
}

// ============================================================================
// Humanize tool names.
// ============================================================================
//
// The agent calls five tools (all go through /api/tools/execute):
//   - records_query   (records.query)
//   - records_get     (records.get)
//   - records_create  (records.create)
//   - records_update  (records.update)
//   - records_delete  (records.delete)
//
// Phrasing depends on the `collection` param and, for `records_create` on
// `agentEdits`, on `data.action` (create | update | rename | delete | ...).
// Keep this aligned with the backend tool names if they ever change.

interface ToolDescription {
  /** The verb phrase shown inline. */
  label: string
  /** An optional `path` or identifier shown after the label in monospace. */
  path?: string
}

function describeTool(
  rawName: string | undefined,
  args: Record<string, unknown> | undefined,
): ToolDescription {
  const name = rawName ?? ''
  const collection =
    typeof args?.collection === 'string' ? (args.collection as string) : undefined
  const data = (args?.data ?? undefined) as Record<string, unknown> | undefined
  const filePath =
    (typeof data?.filePath === 'string' && data.filePath)
      || (typeof data?.path === 'string' && data.path)
      || (typeof args?.id === 'string' && args.id)
      || undefined
  const action = typeof data?.action === 'string' ? (data.action as string) : undefined

  // records.create — the common case: agentEdits (queue a file mutation).
  if (name === 'records_create' && collection === 'agentEdits') {
    switch (action) {
      case 'create':
        return { label: 'Creating', path: String(filePath ?? 'file') }
      case 'update':
        return { label: 'Editing', path: String(filePath ?? 'file') }
      case 'rename': {
        const from = typeof data?.filePath === 'string' ? data.filePath : ''
        const to = typeof data?.newPath === 'string' ? data.newPath : ''
        return { label: 'Renaming', path: from && to ? `${from} → ${to}` : (from || to || 'file') }
      }
      case 'delete':
        return { label: 'Deleting', path: String(filePath ?? 'file') }
      default:
        return { label: 'Queueing edit', path: filePath ? String(filePath) : undefined }
    }
  }

  if (name === 'records_create') {
    return { label: 'Creating record in', path: collection }
  }

  if (name === 'records_update' && collection === 'agentEdits') {
    return { label: 'Adjusting edit' }
  }
  if (name === 'records_update') {
    return { label: 'Updating record', path: collection }
  }

  if (name === 'records_delete' && collection === 'agentEdits') {
    return { label: 'Canceling edit' }
  }
  if (name === 'records_delete') {
    return { label: 'Deleting record', path: collection }
  }

  if (name === 'records_query') {
    if (collection === 'projectFiles') return { label: 'Reading project files' }
    if (collection === 'compilationLogs') return { label: 'Checking compile log' }
    return { label: 'Reading', path: collection }
  }

  if (name === 'records_get') {
    if (collection === 'projectFiles' && filePath) {
      return { label: 'Reading', path: String(filePath) }
    }
    return { label: 'Fetching record', path: collection }
  }

  // Fallback — show the raw name, mono-styled.
  return { label: 'Running', path: name || 'tool' }
}
