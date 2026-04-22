# AI-Native LaTeX Editor — Implementation Summary

High-level summary of how TeXPal's AI chat works end to end. Read this first; follow the pointers at the bottom for depth.

## What the feature is

A collapsible, resizable chat sidebar on the left edge of the editor. The user types natural language ("write me a homework on integration by parts", "remove the Research Assistant entry from my resume", "fix my compile errors") and the AI edits the LaTeX files directly. The editor reflects the change in real time; the user hits Compile and gets the PDF.

The end-user experience is the same as the miyagi-era "AI-native widget" — what changed is where the plumbing lives.

## The two promises

1. **Every response is grounded in the user's actual current project state** — the agent never guesses what file is open, what files exist, or what went wrong in the last compile.
2. **Every edit survives the live co-editing layer cleanly** — the editor's Yjs buffer is rehydrated from the agent's changes without clobbering in-flight user edits.

Everything else is in service of those two guarantees.

## Architecture at a glance

```
Left sidebar (client)                       /api/ai/chat (worker)
───────────────────                         ─────────────────────
AiChatSidebar (collapse/resize)             1. verify JWT → userId
  └─ ChatPanel                              2. loadContext → query RecordRoom DO for
      useChat({                                projectFiles + latest compilationLog
        api: '/api/ai/chat',                   (under caller's RBAC)
        body: { documentId, activeFilePath }  3. buildLatexSystemPrompt(ctx)
        fetch: attach Bearer JWT              4. streamText({ model, system, messages,
      })                                         tools, maxSteps: 20 })
          │                                   5. return streaming response
          ▼                                          │
   ┌──────────────────┐  during generation,          │
   │ Rendered stream  │  the model calls tools:      │
   │  (messages,      │                              │
   │   tool pills)    │  records_create on agentEdits ◄── enforced by schema RBAC
   └──────────────────┘        │
          ▲                    │
          │                    ▼
useAgentEditsProcessor  ←  useQuery('agentEdits')  [SDK RecordRoom subscription]
          │
          ▼
Updates projectFiles (plainContent, agentRevision, path, deletedAt)
          │
          ▼
FileEditor sees agentRevision bump, rehydrates Yjs buffer
          │
          ▼
User sees new LaTeX, hits Compile, gets PDF
```

## Request lifecycle

1. **User types a message.** `useChat` POSTs `{ messages, documentId, activeFilePath }` to `/api/ai/chat` with a Bearer JWT.
2. **Worker verifies auth** and reads the body. If no `documentId`, returns 400.
3. **Worker loads context.** `loadContext` hits the app's own `RecordRoom` DO (scope `app:${APP_NAME}`), using the caller's `userId` so the SDK's schema RBAC applies. It fetches:
   - all non-deleted `projectFiles` for this `documentId`
   - the most recent `compilationLogs` row
4. **Worker assembles the system prompt.** Static behavioral rules + a `PROJECT STATE` block containing: the document ID, active file path, every file with size + type + entry flag, the full `plainContent` of the active file (truncated if >80 KB), and the last compile's errors if it failed within the last 30 minutes.
5. **Worker calls `streamText`.** `createDeepSpaceAI(env, 'anthropic', { authToken })` routes the LLM request through the DeepSpace proxy, billing the JWT subject. Tools are registered with Vercel AI SDK.
6. **Model generates.** For most requests (single-file edits) it emits a response immediately plus one `records_create` tool call. For multi-file work it emits several.
7. **Each tool call hits `/api/tools/execute`** on the same `RecordRoom` DO, with `userId` in the body. The DO enforces schema permissions — if the user can't create in `agentEdits`, the call fails and the model sees the error.
8. **Agent creates `agentEdits` rows** with `status: 'pending'` and an `action` of `update | create | rename | delete`.
9. **Client sees the new row** via its live `useQuery('agentEdits')` subscription.
10. **`useAgentEditsProcessor` applies it** to `projectFiles`: writes `plainContent`, bumps `agentRevision`, handles rename/delete, refuses to delete the entry file.
11. **`FileEditor` sees the revision bump** and rehydrates its Yjs buffer from `plainContent`.
12. **User sees the edit**, hits Compile, gets the PDF.

All state changes flow through the SDK's normal real-time channels — no custom messaging, no polling.

## Key design choices

### Push context, don't let the agent fish for it

The miyagi-era prompt told the agent: "query `activeLatexDocId` first to find the active doc, then query `projectFiles`…". Under the SDK this pattern fails because:
- `activeLatexDocId` is `read: 'own'`-gated, so timing and ownership races produce empty results.
- Every turn wastes 2–3 tool-call rounds rediscovering state the client already knows.

The current architecture eliminates that failure mode. The React component that renders the chat already knows `documentId` and `activeFilePath` — it sends them in the request body, and the worker injects them into the prompt. No tool call, no race.

### Keep the `agentEdits` pipeline

`agentEdits` + `useAgentEditsProcessor` is not a miyagi crutch — it's load-bearing. The LaTeX editor has a dual-content architecture: files live as both `plainContent` (used for compilation) and a live Yjs buffer (used for real-time co-editing). The processor is what turns an agent-authored change into an atomic, reviewable mutation that the Yjs layer can rehydrate from cleanly. Writing directly via `yjs.setText` would bypass the entry-file protection, revision tracking, and batch handling that the processor provides.

### Tool surface is minimal

Five tools exposed: `records_query`, `records_get`, `records_create`, `records_update`, `records_delete`. `schema.*` and `user.current` were dropped — the schema is already in the prompt, the user is already known. Fewer tools means tighter budgeting and clearer behavior.

### Conversation is scoped per document

Messages reset on `documentId` change. Rationale: the system prompt's project state block would otherwise describe a different document than the conversation history discusses — confusing for the model, wasteful in tokens. Switching files *within* the same document is fine — the context block updates on the next turn, history stays.

### Fresh context every turn

No caching. Every chat turn reloads project state from the DO. This is cheap (in-memory SQL on the same DO) and correct (reflects whatever the user just edited or compiled). The only cost is when the project has many large files; the 80 KB active-file cap and the bounded `MAX_ERRORS_IN_PROMPT` keep the prompt within sensible limits.

## The components, at a glance

### Server (worker.ts + src/ai/)

| File | Purpose |
|---|---|
| `worker.ts` (`/api/ai/chat`) | Auth gate, context loading, prompt assembly, `streamText` call, tool wiring |
| `src/ai/context.ts` | `loadContext` — queries the RecordRoom DO for files + latest compile log, truncates large active-file content, returns a typed `ChatContext` |
| `src/ai/latex-prompt.ts` | `buildLatexSystemPrompt(ctx)` — combines static rules with a formatted `PROJECT STATE` block |
| `src/ai/tools.ts` | `buildChatTools` — turns the SDK's `BUILT_IN_TOOLS` into Vercel AI SDK tool definitions; filters to the minimal allowed set |

### Client (src/components/)

| File | Purpose |
|---|---|
| `ai-chat/AiChatSidebar.tsx` | Collapsible icon rail (52px) ↔ expanded panel (280–560px, default 320px), drag-to-resize, localStorage persistence |
| `ai-chat/ChatPanel.tsx` | `useChat` binding, auth gate, message rendering, tool-invocation pills, input with auto-grow, error/retry banner, reset on doc change |
| `editor/EditorLayout.tsx` | Mounts the sidebar leftmost; passes `documentId` + `activeFilePath` |
| `hooks/useAgentEditsProcessor.ts` | Subscribes to `agentEdits`; applies each pending row to `projectFiles`; marks applied/failed. Unchanged from the original port. |

### Schemas (src/schemas/)

| Collection | Role |
|---|---|
| `projectFiles` | Actual files. Agent never writes here directly. |
| `agentEdits` | Queue of pending agent mutations. Processor consumes it. |
| `compilationLogs` | Latest compile result — read into the prompt when it was a recent failure. |
| `documents`, `documentVersions`, `editorSettings` | Other app state, unused by the chat. |
| `activeLatexDocId` | Still present in the schema for non-chat uses; the AI chat does not touch it. |

## Auth, RBAC, and billing

- **Auth**: The client attaches a Bearer JWT (from `getAuthToken()`) on every chat request. `useChat`'s static `headers` can't do dynamic tokens, so we wrap `fetch`. The worker rejects missing/invalid tokens with 401.
- **RBAC**: The worker forwards `userId: auth.userId` in the body of `/api/tools/execute` and `/api/tools/execute` for context loading. The DO reads `userId` from the body (a known SDK quirk — see gotchas.md #1), looks up the user's role in `c_users`, and enforces the schema's `permissions` block. No `?appAction=true` bypass.
- **Billing**: `createDeepSpaceAI(env, 'anthropic', { authToken })` sends the user's JWT as `X-Auth-Token` on the upstream LLM call. The DeepSpace API proxy meters token usage and bills the JWT subject. Every chat turn is billed to the user who sent it.

## Edge cases handled

- **No document open** (`documentId` missing) — worker returns 400; client shouldn't emit this (chat only renders inside `EditorLayout`), but it's a defensive guard.
- **Empty project** — context block explicitly says "project has no files yet"; agent asks what to create.
- **Active file missing** — falls back to entry file; if neither exists, the block says so.
- **Large active file (>80 KB)** — truncated with explicit head/tail markers; agent can call `records_get` for the full content.
- **Last compile succeeded** — errors block omitted from the prompt (no noise).
- **User switches files mid-conversation** — next turn's context block reflects the new active file; history is preserved.
- **User switches documents mid-conversation** — `ChatPanel` clears messages via `setMessages([])` on `documentId` change.
- **Session expired mid-turn** — 401 surfaces as a red banner with a retry button.
- **Tool call RBAC failure** — the model sees the structured error and can retry or explain to the user.

## What came from miyagi, what's new, what's gone

| | Status |
|---|---|
| `agentEdits` schema + processor pipeline | **Kept** unchanged — the dual-content rehydration model is correct. |
| Agent-edits action table (update/create/rename/delete) | **Kept** — same semantics. |
| Behavioral rules for LaTeX (file path conventions, binary-file caveat, entry-file protection) | **Kept** — ported into `latex-prompt.ts`. |
| Floating-corner platform chat widget | **Gone** — the SDK has no platform shell. Each app renders its own chat. |
| Runtime-loaded `agent-prompt.md` / `agent-description.md` | **Gone** — prompts are code strings now. The MD files in this folder are developer docs, not runtime artifacts. |
| "Agent must query `activeLatexDocId` first" ritual | **Gone** — replaced by client-pushed context. |
| `schema.list` / `user.current` tool exposure | **Dropped** — baked into the prompt or not needed. |
| Resizable left sidebar UI | **New** — built on the app's existing `ResizeDivider` primitive; state persisted in localStorage. |
| Server-side dynamic context loading per turn | **New** — `src/ai/context.ts`. |
| Per-user JWT billing through the DeepSpace proxy | **New** (architecturally) — miyagi billed at the platform level. |

## Failure modes that are now structurally impossible

- "You don't have a document open" when you do — the agent can't mis-read a collection that's no longer part of the loop.
- Silent write rejection because `userId` didn't reach the DO — the `x-user-id`-as-header bug is fixed; `userId` is always in the body.
- Agent creating records in a different scope than the client subscribes to — same `SCOPE_ID` on both ends.
- Stale context — no caching; every turn reloads state.

## Where to look for more

- **Deeper architecture + full request lifecycle diagram** → `architecture.md`
- **The exact system prompt rules** → `agent-instructions.md` (keeps in sync with `src/ai/latex-prompt.ts`)
- **Sidebar UX spec (collapse/expand, min/max widths, persistence)** → `sidebar-ux.md`
- **SDK quirks and applied fixes** → `gotchas.md`
- **Historical implementation plan** → `implementation-plan.md`
- **Repo orientation for new Claude sessions** → `../../CLAUDE.md`
