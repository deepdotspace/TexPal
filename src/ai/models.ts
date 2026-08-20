/**
 * Chat model catalog — shared between client (dropdown) and worker (validation + provider routing).
 *
 * Every model lists its provider so the worker knows which `createDeepSpaceAI`
 * family to spin up.
 *
 * Two rules govern what may appear here, and both are enforced by
 * `models.test.ts`:
 *
 *  1. The provider must still serve the id. The DeepSpace proxy does NOT
 *     validate model ids — its chat-completion integrations declare
 *     `model: z.string()` and forward the value untouched, so a retired id
 *     surfaces to the user as a raw provider 404. That is not hypothetical:
 *     `claude-sonnet-4-20250514` broke resume upload in a sibling app, and
 *     `claude-sonnet-4-5` and `claude-haiku-4-5-20251001` sat in this list
 *     until the same sweep found them.
 *  2. The proxy must price the id. Its `CHAT_MODEL_MULTIPLIERS` table charges
 *     a known model at its real rate and everything else at the `'*'` fallback
 *     of 5.0, so an unpriced model still runs but silently over-bills.
 *
 * Rule 2 is why `claude-opus-5` is absent despite being a current Anthropic
 * model that the SDK's own `DEEPSPACE_AI_MODELS` lists: it has no multiplier
 * row, so it would bill at 5.0x = $75/MTok against a real rate of $25. Add it
 * only once the proxy table carries it.
 *
 * Never append a date suffix to a Claude id. Current ids are complete as-is;
 * a dated id names a snapshot, and snapshots get retired.
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
    // Replaces `claude-sonnet-4-5`, which Anthropic has retired. Same 1.0
    // multiplier at the proxy, so the swap costs the user nothing. Left out of
    // the default slot deliberately: Sonnet 5 reasons before answering, so a
    // `thinking` block shares the output budget with the answer on the long
    // multi-file edits this app runs.
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'anthropic',
    hint: 'Newest · reasons first',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    provider: 'anthropic',
    hint: 'Most capable',
  },
  {
    // Undated. `claude-haiku-4-5-20251001` shipped here once; the proxy priced
    // it correctly by stripping the suffix, but the dated snapshot itself is
    // not guaranteed to resolve at Anthropic.
    id: 'claude-haiku-4-5',
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
