# AI Chat — Architecture

## One-line version

The client sends the agent *everything it needs to know about the current project* in the system prompt. The agent only uses tools to **write** — it does not go fishing for context.

## Why this shape

The original miyagi pattern had the agent query `activeLatexDocId` + `projectFiles` at the start of every turn. That pattern failed under the SDK because:

- The SDK has no platform shell implicitly propagating context.
- `activeLatexDocId` is RBAC-gated (`read: 'own'`) and timing-sensitive — races between "user opened doc" and "agent queried" return empty results.
- It wastes tool-call budget on context re-discovery, for facts the React app already knows.

In the SDK we control both ends of the chat route. So we push context directly.

## Request lifecycle

```
Browser                                              Server (app worker)
------                                               -------------------
AiChatSidebar(documentId, activeFilePath, activeFileContent)
 └─ ChatPanel
     └─ useChat({
          api: '/api/ai/chat',
          body: {                                     ─►  POST /api/ai/chat
            documentId,                                    body: { messages, documentId,
            activeFilePath,                                        activeFilePath,
            activeFileContent,  // live editor buffer            activeFileContent }
          },
          fetch: attaches Bearer JWT,
        })
                                                      │
                                                      │ 1. verifyJwt → userId
                                                      │ 2. loadContext(env, userId, documentId, activeFilePath)
                                                      │      ─► records.query projectFiles  where documentId=X  (under user's RBAC)
                                                      │      ─► records.query compilationLogs where documentId=X order desc limit 1
                                                      │      ─► returns { files, activeFile, latestLog }
                                                      │ 3. system = buildLatexSystemPrompt(context)
                                                      │ 4. tools = buildChatTools(executor)      ─ writes + escape-hatch reads
                                                      │ 5. createDeepSpaceAI(env, 'anthropic', { authToken })
                                                      │ 6. streamText({ model, system, messages, tools, maxSteps: 20 })
                                                      │
         ◄─── SSE data stream (AI SDK format) ────────┤
         tool calls run during generation:             │
           executor('records.create', { collection: 'agentEdits', data: {...} })
                                                      │
           DO /api/tools/execute — body carries userId, tool, params — RBAC applied
```

Client side, `useAgentEditsProcessor` is already listening to `agentEdits`. When the agent's tool call creates a pending row, the subscription fires and the processor applies it to `projectFiles`. FileEditor sees the `agentRevision` bump and rehydrates its Yjs buffer. The user sees the edit and hits Compile.

## The context block

At each turn, the server builds a prompt that contains:

- **Static rules** — behavior, boundaries, the `agentEdits` action table (update/create/rename/delete).
- **Project state** (dynamic):
  - Document ID and active file path.
  - List of all files with their paths, sizes, and which is the entry file.
  - Full `plainContent` of the active file (truncated with a notice if >80 KB).
  - Last compile result — status + first few errors, ONLY if the last compile failed within a recent window. If the last compile succeeded or there was none, this section is omitted.
- **Tool usage hint** — use `records_create` on `agentEdits` for writes; use `records_get` if you need the full content of a non-active file.

The prompt is assembled fresh on every turn. When the user switches files within the same document, the next turn's prompt reflects the new active file automatically.

## Scope rules

- Both the frontend's `<RecordScope roomId={SCOPE_ID}>` and all tool calls target `scopeId = 'app:${APP_NAME}'`. Same DO instance on both ends — records created via the agent's tool calls show up in the user's live `useQuery('agentEdits')` subscription.
- If this ever changes (per-doc or per-team rooms), the tool executor and context loader in `worker.ts` must compute the same scope the frontend connects to.

## RBAC

The worker forwards `userId: auth.userId` in the body of `/api/tools/execute`. The DO reads `userId` from the body (not from headers — this was a bug in the starter; see gotchas.md #1), looks up the user's role, and enforces the schema's `permissions` block.

Context loading happens under the **same userId**. If the user can't read `projectFiles` for this document, the worker can't either — so the context block is honest about what this user actually has access to.

Tools are scoped for writes that go through RBAC. There is no `?appAction=true` bypass for the chat path.

## Conversation scope

- **Per document, in-memory.** Messages live only in `useChat`'s React state.
- **Reset on document switch.** `ChatPanel` watches `documentId` and calls `setMessages([])` when it changes. Rationale: a conversation about doc A doesn't carry sensible context for doc B.
- **Preserved across file switches within the same document.** The context block in the system prompt updates to the new active file on the next turn; the history stays, so the agent has continuity ("earlier we were discussing main.tex, now the user is on refs.bib").
- **Not persisted across browser sessions.** Not in scope.

## Tool surface

| Tool | Purpose | Frequency |
|---|---|---|
| `records_create` | Insert `agentEdits` pending row | Every write |
| `records_update` | Retry or adjust a still-pending `agentEdits` row | Rare |
| `records_delete` | Abort a pending `agentEdits` row | Rare |
| `records_get` | Fetch full content of a non-active file | Rare — only when multi-file edit |
| `records_query` | Fetch older compile logs or version history | Rare — only when context is insufficient |

Dropped tools vs. the original starter set:

- `schema.list` / `schema.describe` — the schema summary is already in the system prompt.
- `user.current` — the worker knows the user; no need to go look them up.

## Billing

`createDeepSpaceAI(env, 'anthropic', { authToken: jwt })` attaches the caller's JWT to every upstream LLM request. Proxy bills the JWT subject. Same as before.

## Streaming

Unchanged. `result.toDataStreamResponse()` → AI SDK data stream → `useChat` on the client. Tool invocation pills render inline in assistant messages.

## Edge cases and how they're handled

- **No `documentId` in body** → 400 with a clear error. Client shouldn't ever omit it when the chat is rendered; if it does, the bug is client-side.
- **`documentId` exists but has no `projectFiles`** → context block says "project is empty." Agent asks what the user wants to create.
- **Active file not in the file list** → fall back to the entry file. If there's no entry file either, say so in the prompt.
- **Active file >80KB** → preload first 40KB + last 10KB with an explicit marker; the agent can `records_get` the full content if needed.
- **Last compile succeeded** → omit the "errors" block entirely (don't pollute the prompt).
- **User switches documents mid-turn** → the in-flight turn completes against the old docId; the next turn runs against the new one; messages clear.
- **User signed out** → 401; client shows auth prompt.

## What stays the same from the previous version

- `agentEdits` schema + `useAgentEditsProcessor` hook — the dual-content rehydration pipeline is load-bearing and correct.
- `createDeepSpaceAI` + Vercel AI SDK + Anthropic Sonnet.
- The left-sidebar UI (collapsible rail + resize).
- Per-user JWT billing.
- The `userId`-in-body fix.
