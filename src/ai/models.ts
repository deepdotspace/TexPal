/**
 * Chat model catalog — shared between client (dropdown) and worker (validation + provider routing).
 *
 * Every model lists its provider so the worker knows which `createDeepSpaceAI`
 * family to spin up. Model IDs match the DeepSpace API proxy's pricing table
 * — if you add a model, confirm it's priced there, otherwise users will be
 * over-billed at the generic Opus-rate fallback.
 *
 * The first entry is the default — used when the client doesn't send a
 * model ID or sends one not in this catalog.
 */

export type ChatModelProvider = 'anthropic' | 'openai' | 'cerebras'

export interface ChatModel {
  /** Exact model id passed to the provider SDK. */
  id: string
  /** Short display name shown in the dropdown. */
  label: string
  /** Which `createDeepSpaceAI` provider to route through. */
  provider: ChatModelProvider
  /** One-word hint under the label. */
  hint?: string
}

export const CHAT_MODELS: ReadonlyArray<ChatModel> = [
  // ───── Anthropic ─────────────────────────────────────────────────────
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    hint: 'Balanced · default',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    provider: 'anthropic',
    hint: 'Most capable',
  },
  {
    id: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    hint: 'Stable agent default',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    hint: 'Fast',
  },

  // ───── OpenAI ────────────────────────────────────────────────────────
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    provider: 'openai',
    hint: 'Capable',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    hint: 'Multimodal',
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    provider: 'openai',
    hint: 'Efficient',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'openai',
    hint: 'Cheap',
  },
  {
    id: 'gpt-4.1-nano',
    label: 'GPT-4.1 Nano',
    provider: 'openai',
    hint: 'Cheapest OpenAI',
  },

  // ───── Cerebras (open-weight, very fast) ─────────────────────────────
  {
    id: 'llama-3.3-70b',
    label: 'Llama 3.3 70B',
    provider: 'cerebras',
    hint: 'Very fast',
  },
  {
    id: 'qwen-3-235b-a22b-instruct-2507',
    label: 'Qwen 3 235B',
    provider: 'cerebras',
    hint: 'Large open',
  },
  {
    id: 'gpt-oss-120b',
    label: 'GPT-OSS 120B',
    provider: 'cerebras',
    hint: 'Open, fast',
  },
  {
    id: 'qwen-3-32b',
    label: 'Qwen 3 32B',
    provider: 'cerebras',
    hint: 'Efficient open',
  },
  {
    id: 'llama3.1-8b',
    label: 'Llama 3.1 8B',
    provider: 'cerebras',
    hint: 'Fastest',
  },
] as const

export const DEFAULT_MODEL_ID = CHAT_MODELS[0].id

/**
 * Look up a model by id against the catalog. Returns the default if the
 * input is null/missing/unknown. Used server-side to prevent arbitrary
 * model strings from reaching the provider, and client-side to rehydrate
 * a stale localStorage value safely.
 */
export function resolveModel(input: string | null | undefined): ChatModel {
  if (!input) return CHAT_MODELS[0]
  return CHAT_MODELS.find((m) => m.id === input) ?? CHAT_MODELS[0]
}
