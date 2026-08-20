/**
 * Regression tests for the "New chat" button.
 *
 * The bug this guards against: clicking "New chat" bumped a counter that
 * remounted the inner chat, while the wipe of the persisted transcript sat in
 * a *parent* effect. React runs child renders (and `useChat` reads its initial
 * messages during render) long before a parent effect, and the outgoing chat
 * then re-persisted the transcript from its own unmount cleanup. Net effect:
 * the conversation survived the reset and the button looked dead.
 *
 * These tests drive the real `AiChatSidebar` / `ChatPanel` through the DOM and
 * deliberately do NOT import the transcript store, so they can be run against
 * the pre-fix components to confirm they actually catch the bug.
 *
 * `useChat` is faked, but faithfully: the real hook (`@ai-sdk/react` 2.0.227)
 * builds its `Chat` inside a `useRef` initializer and consumes `messages` in
 * the constructor, so the seed is taken once, during the first render, and
 * later prop changes are ignored. `useState(initial)` reproduces exactly that.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { AiChatSidebar } from './AiChatSidebar'

interface FakeChat {
  messages: unknown[]
  setMessages: (next: unknown[]) => void
  stopCalls: number
}

const mocks = vi.hoisted(() => ({
  chats: [] as Array<{
    messages: unknown[]
    setMessages: (next: unknown[]) => void
    stopCalls: number
  }>,
}))

vi.mock('@ai-sdk/react', async () => {
  const { useState, useRef } = await import('react')
  return {
    useChat: (options: { messages?: unknown[] }) => {
      // Seeded once, at construction — same as the real hook.
      const [messages, setMessages] = useState<unknown[]>(() => options.messages ?? [])
      const handleRef = useRef<FakeChat | null>(null)
      if (handleRef.current === null) {
        handleRef.current = { messages, setMessages, stopCalls: 0 }
        mocks.chats.push(handleRef.current)
      }
      const handle = handleRef.current
      handle.messages = messages
      handle.setMessages = setMessages
      return {
        messages,
        sendMessage: () => {},
        status: 'ready',
        error: undefined,
        regenerate: () => {},
        stop: () => { handle.stopCalls += 1 },
      }
    },
  }
})

vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(_options: unknown) { void _options }
  },
}))

vi.mock('deepspace', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  AuthOverlay: () => null,
  getAuthToken: async () => 'test-token',
}))

vi.mock('react-markdown', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ children }: { children?: unknown }) =>
      createElement('div', null, children as never),
  }
})

vi.mock('remark-gfm', () => ({ default: () => undefined }))

const key = (documentId: string) => `ai-chat-messages:${documentId}`

function userMessage(id: string, text: string) {
  return { id, role: 'user', parts: [{ type: 'text', text }] }
}

function sidebar(documentId: string) {
  return (
    <AiChatSidebar
      open
      width={360}
      documentId={documentId}
      activeFilePath={null}
      activeFileContent=""
    />
  )
}

const chatAt = (index: number): FakeChat => mocks.chats[index]

beforeAll(() => {
  // jsdom has no element scrolling; ChatPanel auto-scrolls on every render.
  Object.defineProperty(Element.prototype, 'scrollTo', {
    value: () => undefined,
    writable: true,
    configurable: true,
  })
})

beforeEach(() => {
  localStorage.clear()
  mocks.chats.length = 0
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('New chat', () => {
  it('empties the conversation, and nothing writes it back', () => {
    const DOC = 'doc-alpha'
    localStorage.setItem(key(DOC), JSON.stringify([userMessage('m1', 'remember me')]))

    render(sidebar(DOC))
    expect(screen.getByText('remember me')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    // The replacement chat must mount empty. Pre-fix this failed here: the new
    // mount rehydrated from localStorage during its render, before the parent
    // effect that was supposed to have wiped it.
    expect(screen.queryByText('remember me')).toBeNull()

    // ...and neither the outgoing chat's unmount flush nor either chat's
    // debounced persist may put the transcript back.
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.queryByText('remember me')).toBeNull()
    expect(localStorage.getItem(key(DOC)) ?? '').not.toContain('remember me')
  })

  it('survives an immediate reload — the chat it replaced may not write the transcript back', () => {
    const DOC = 'doc-alpha'
    localStorage.setItem(key(DOC), JSON.stringify([userMessage('m1', 'remember me')]))

    const first = render(sidebar(DOC))
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    // No timers advanced. The outgoing chat's unmount flush has already run;
    // the replacement's 250ms debounce has not. A reload landing in this
    // window must not bring the conversation back — so storage has to be
    // clean the instant the click returns, not merely 250ms later.
    expect(localStorage.getItem(key(DOC)) ?? '').not.toContain('remember me')

    first.unmount()
    render(sidebar(DOC))
    expect(screen.queryByText('remember me')).toBeNull()
  })

  it('aborts the in-flight stream of the chat it replaces', () => {
    const DOC = 'doc-alpha'
    render(sidebar(DOC))
    const outgoing = chatAt(0)
    expect(outgoing.stopCalls).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    expect(mocks.chats).toHaveLength(2)
    expect(outgoing.stopCalls).toBe(1)
  })

  it('only resets the document it was pressed on', () => {
    localStorage.setItem(key('doc-a'), JSON.stringify([userMessage('a1', 'alpha note')]))
    localStorage.setItem(key('doc-b'), JSON.stringify([userMessage('b1', 'beta note')]))

    const { rerender } = render(sidebar('doc-a'))
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    act(() => { vi.advanceTimersByTime(2000) })

    rerender(sidebar('doc-b'))
    expect(screen.getByText('beta note')).toBeTruthy()
  })
})

describe('document switching', () => {
  it('keeps each document transcript, including the delta the debounce has not flushed', () => {
    const { rerender } = render(sidebar('doc-a'))

    // A turn lands on doc-a...
    act(() => { chatAt(0).setMessages([userMessage('a1', 'alpha note')]) })
    expect(screen.getByText('alpha note')).toBeTruthy()

    // ...and the user switches documents inside the 250ms debounce window, so
    // only the unmount flush can save it. That flush must still be allowed.
    rerender(sidebar('doc-b'))
    expect(screen.queryByText('alpha note')).toBeNull()
    expect(localStorage.getItem(key('doc-a')) ?? '').toContain('alpha note')

    // Switching back restores it.
    rerender(sidebar('doc-a'))
    expect(screen.getByText('alpha note')).toBeTruthy()
  })

  it('does not leak one document transcript into another', () => {
    localStorage.setItem(key('doc-a'), JSON.stringify([userMessage('a1', 'alpha note')]))

    const { rerender } = render(sidebar('doc-a'))
    expect(screen.getByText('alpha note')).toBeTruthy()

    rerender(sidebar('doc-b'))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.queryByText('alpha note')).toBeNull()
    expect(localStorage.getItem(key('doc-a')) ?? '').toContain('alpha note')
  })
})
