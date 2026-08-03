/**
 * AI Tool Definitions — converts DeepSpace BUILT_IN_TOOLS to Vercel AI SDK tools.
 *
 * Only `buildChatTools` is used. It exposes:
 *   - records.query / records.get — escape hatches when the prompt's
 *     injected context is insufficient (e.g. full content of a non-active
 *     file, older compile logs).
 *   - records.create / records.update / records.delete — used by the agent
 *     to drive the `agentEdits` pipeline.
 *
 * `schema.*` and `user.current` tools are intentionally not exposed — the
 * schema summary is in the system prompt and the user is known server-side.
 *
 * Tool names that contain a dot (`records.create`) are rewritten to
 * underscore form (`records_create`) for the AI SDK, which forbids dots in
 * tool names. The DO-side executor still receives the dotted form.
 */

import { tool, type Tool } from 'ai'
import { z } from 'zod'
import { BUILT_IN_TOOLS } from 'deepspace/worker'
import type { ToolSchema } from 'deepspace/worker'

type ToolExecutor = (toolName: string, params: Record<string, unknown>) => Promise<unknown>

/**
 * Chat tools for TeXPal. Focused on writes; reads are escape hatches.
 * RBAC is enforced server-side against the caller's role — the agent cannot
 * escalate permissions here.
 */
const CHAT_TOOL_NAMES = [
  'records.query',
  'records.get',
  'records.create',
  'records.update',
  'records.delete',
]

export function buildChatTools(executor: ToolExecutor): Record<string, Tool> {
  const tools: Record<string, Tool> = {}

  for (const def of BUILT_IN_TOOLS) {
    if (!CHAT_TOOL_NAMES.includes(def.name)) continue
    const safeName = def.name.replaceAll('.', '_')
    tools[safeName] = tool({
      description: def.description,
      inputSchema: buildZodSchema(def),
      execute: async (params) => executor(def.name, params as Record<string, unknown>),
    })
  }

  return tools
}

// ============================================================================
// ToolSchema params → Zod object schema
// ============================================================================

function buildZodSchema(def: ToolSchema) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [name, param] of Object.entries(def.params)) {
    let s: z.ZodTypeAny
    switch (param.type) {
      case 'string':  s = z.string(); break
      case 'number':  s = z.number(); break
      case 'boolean': s = z.boolean(); break
      case 'object':  s = z.record(z.unknown()); break
      case 'array':   s = z.array(z.unknown()); break
      default:        s = z.unknown(); break
    }
    if (param.description) s = s.describe(param.description)
    if (!param.required) s = s.optional()
    shape[name] = s
  }

  return z.object(shape)
}
