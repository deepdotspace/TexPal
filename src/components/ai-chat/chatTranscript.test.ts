/**
 * Unit tests for the transcript store's version gate — the mechanism that
 * makes "New chat" independent of React's commit ordering.
 *
 * Each test uses its own documentId because the version counter is
 * module-level state that intentionally outlives a single component mount.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { UIMessage } from 'ai'
import { readTranscript, saveTranscript, clearTranscript } from './chatTranscript'

const key = (documentId: string) => `ai-chat-messages:${documentId}`

function userMessage(id: string, text: string): UIMessage {
  return { id, role: 'user', parts: [{ type: 'text', text }] }
}

beforeEach(() => {
  localStorage.clear()
})

describe('chatTranscript', () => {
  it('round-trips a transcript for the session that read it', () => {
    const doc = 'store-roundtrip'
    const session = readTranscript(doc)
    expect(session.messages).toEqual([])

    expect(saveTranscript(doc, session.version, [userMessage('m1', 'hello')])).toBe(true)
    expect(readTranscript(doc).messages).toEqual([userMessage('m1', 'hello')])
  })

  it('refuses writes from a session that a clear has superseded', () => {
    const doc = 'store-superseded'
    localStorage.setItem(key(doc), JSON.stringify([userMessage('m1', 'old turn')]))

    // The outgoing chat mounted before the reset.
    const outgoing = readTranscript(doc)
    expect(outgoing.messages).toHaveLength(1)

    clearTranscript(doc)

    // Its unmount flush and its pending debounce both arrive after the reset.
    expect(saveTranscript(doc, outgoing.version, outgoing.messages)).toBe(false)
    expect(saveTranscript(doc, outgoing.version, outgoing.messages)).toBe(false)
    expect(localStorage.getItem(key(doc))).toBeNull()

    // The chat that mounted after the reset is the one allowed to write.
    const incoming = readTranscript(doc)
    expect(incoming.messages).toEqual([])
    expect(saveTranscript(doc, incoming.version, [])).toBe(true)
    expect(readTranscript(doc).messages).toEqual([])
  })

  it('scopes the clear to one document', () => {
    const a = 'store-scope-a'
    const b = 'store-scope-b'
    const sessionA = readTranscript(a)
    const sessionB = readTranscript(b)

    clearTranscript(a)

    expect(saveTranscript(a, sessionA.version, [userMessage('a1', 'a')])).toBe(false)
    expect(saveTranscript(b, sessionB.version, [userMessage('b1', 'b')])).toBe(true)
    expect(readTranscript(b).messages).toHaveLength(1)
  })

  it('retires each generation in turn when reset twice', () => {
    const doc = 'store-twice'
    const first = readTranscript(doc)
    clearTranscript(doc)
    const second = readTranscript(doc)
    clearTranscript(doc)
    const third = readTranscript(doc)

    expect(saveTranscript(doc, first.version, [userMessage('m1', 'x')])).toBe(false)
    expect(saveTranscript(doc, second.version, [userMessage('m1', 'x')])).toBe(false)
    expect(saveTranscript(doc, third.version, [userMessage('m1', 'x')])).toBe(true)
  })

  it('drops malformed entries instead of throwing', () => {
    const doc = 'store-malformed'
    localStorage.setItem(key(doc), '{ not json')
    expect(readTranscript(doc).messages).toEqual([])

    localStorage.setItem(key(doc), JSON.stringify([{ nope: true }, userMessage('m1', 'ok')]))
    expect(readTranscript(doc).messages).toEqual([userMessage('m1', 'ok')])
  })
})
