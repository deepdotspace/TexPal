/**
 * Guards the class of bug this catalog exists to prevent: a model id the
 * provider has retired, sitting in the code as a literal until a user picks it
 * out of the dropdown and gets a raw 404.
 *
 *   Anthropic API error 404: {"type":"error","error":{"type":"not_found_error",
 *   "message":"model: claude-sonnet-4-20250514"}}
 *
 * The DeepSpace proxy cannot catch this for us. Its chat-completion
 * integrations declare `model: z.string()` and forward the value to the
 * provider untouched — the provider is the only authority on what is servable.
 * What the proxy *does* own is billing: a model with no row in its pricing
 * tables still runs, but is charged at the worst-case `'*'` fallback of 5.0.
 *
 * So the accepted sets below are the intersection of "the provider still
 * serves it" and "the proxy prices it". Notably absent: `claude-opus-5`.
 * Anthropic serves it and the SDK's own `DEEPSPACE_AI_MODELS` lists it, but
 * the proxy has no multiplier row, so it would bill at 5.0 = $75/MTok against
 * a real rate of $25 — a silent 3x overcharge. Add it here only once the proxy
 * tables carry it.
 *
 * When this test fails after a provider release, re-read the proxy's pricing
 * tables rather than editing the expectations from memory.
 */

import { describe, it, expect } from 'vitest'
import { CHAT_MODELS, DEFAULT_MODEL_ID, resolveModel } from './models'

/** Served by the provider AND priced by the proxy. */
const ACCEPTED_IDS: Record<string, ReadonlySet<string>> = {
  anthropic: new Set([
    'claude-fable-5',
    'claude-sonnet-5',
    'claude-sonnet-4-6',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-haiku-4-5',
  ]),
  openai: new Set([
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
  ]),
  cerebras: new Set([
    'gpt-oss-120b',
    'llama3.1-8b',
    'llama-3.3-70b',
    'qwen-3-32b',
    'qwen-3-235b-a22b-instruct-2507',
  ]),
}

/** Ids that were in this catalog and are no longer servable. */
const RETIRED_IDS = [
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5',
  'claude-haiku-4-5-20251001',
]

describe('CHAT_MODELS catalog', () => {
  it.each(CHAT_MODELS.map((m) => [m.provider, m.id]))(
    '%s model "%s" is served by the provider and priced by the proxy',
    (provider, id) => {
      expect(ACCEPTED_IDS[provider]).toBeDefined()
      expect(ACCEPTED_IDS[provider].has(id)).toBe(true)
    },
  )

  it('carries no dated Claude snapshot suffixes', () => {
    // `claude-haiku-4-5-20251001` shipped here once. Current Claude ids are
    // complete without a date; a suffix names a snapshot that gets retired.
    // Anthropic dates are `-YYYYMMDD`, OpenAI's are `-YYYY-MM-DD`.
    const dated = CHAT_MODELS.filter(
      (m) => /-\d{8}$/.test(m.id) || /-\d{4}-\d{2}-\d{2}$/.test(m.id),
    )
    expect(dated.map((m) => m.id)).toEqual([])
  })

  it('never lists claude-opus-5, which the proxy would bill at 5x', () => {
    expect(CHAT_MODELS.map((m) => m.id)).not.toContain('claude-opus-5')
  })

  it.each(RETIRED_IDS)('no longer offers the retired id "%s"', (id) => {
    expect(CHAT_MODELS.map((m) => m.id)).not.toContain(id)
  })

  it('has unique ids and a non-empty label for each', () => {
    const ids = CHAT_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of CHAT_MODELS) expect(m.label.trim()).not.toBe('')
  })
})

describe('DEFAULT_MODEL_ID', () => {
  it('is the first catalog entry', () => {
    expect(DEFAULT_MODEL_ID).toBe(CHAT_MODELS[0].id)
  })

  it('does not reason by default', () => {
    // Sonnet 5 / Opus 5 / Fable 5 emit a `thinking` block before any answer
    // text, which shares the output budget with the answer. Fine as an opt-in
    // choice in the dropdown; a poor default for a 20-step editing agent.
    expect(['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5']).not.toContain(
      DEFAULT_MODEL_ID,
    )
  })
})

describe('resolveModel', () => {
  it('defaults when the id is missing or unknown', () => {
    expect(resolveModel(null).id).toBe(DEFAULT_MODEL_ID)
    expect(resolveModel(undefined).id).toBe(DEFAULT_MODEL_ID)
    expect(resolveModel('').id).toBe(DEFAULT_MODEL_ID)
    expect(resolveModel('definitely-not-a-model').id).toBe(DEFAULT_MODEL_ID)
  })

  it.each(RETIRED_IDS)(
    'falls back to the default for the retired id "%s"',
    (id) => {
      // A client with a stale localStorage selection must not be able to send
      // a retired id straight through to the provider.
      expect(resolveModel(id).id).toBe(DEFAULT_MODEL_ID)
    },
  )

  it('returns the requested model when the id is in the catalog', () => {
    for (const m of CHAT_MODELS) expect(resolveModel(m.id)).toEqual(m)
  })
})
