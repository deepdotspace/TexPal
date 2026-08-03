# AI Chat — Gotchas and SDK Quirks

Non-obvious things about the SDK that bit us, with the fix applied. Read this before editing `worker.ts`, `src/ai/context.ts`, `src/ai/latex-prompt.ts`, or `src/ai/tools.ts`.

## 1. `userId` goes in the `X-User-Id` header, not the body

The caller's userId travels in the `X-User-Id` HTTP **header** on every call to `/api/tools/execute`. The `RecordRoom` DO reads it from that header to identify the caller, look up their role, and enforce the schema's `permissions` block (RBAC).

If you put the userId in the JSON body instead of the header, the DO sees no caller identity and silently degrades the request to anonymous — RBAC then returns zero rows (reads come back empty, writes are rejected) with no error. The failure is quiet, which makes it easy to misdiagnose.

**Contract:** always set `X-User-Id: <callerUserId>` as a header. Both the chat tool executor (`worker.ts` `execTool`) and the context loader (`src/ai/context.ts` `callTool`) do this.

## 2. `activeLatexDocId` is NOT part of the chat flow

The prior implementation had the agent `records_query` this collection every turn. Under the SDK, RBAC + timing made it flaky. The current architecture **does not use it for chat**. The client is source of truth for "what document is active" — it passes `documentId` and `activeFilePath` in the chat request body, and the worker injects them directly into the system prompt. The collection may still exist in the schema for other purposes (e.g. "restore last opened doc" across sessions) but the agent must not touch it.

If you see a prompt or tool that references `activeLatexDocId`, it's a regression.

## 3. `stopWhen: stepCountIs(20)`

Kept at 20 even with rich context, because:

- Multi-file edits legitimately need 5–10 rounds (one `records_create` per file touched).
- Some requests do need a `records_get` round for a non-active file.
- 20 is headroom, not a target.

## 4. Tool name dot → underscore

Vercel AI SDK tool names can't contain dots. `src/ai/tools.ts` rewrites `records.create` → `records_create` when registering with the AI SDK. The DO-side executor still calls the dotted form (`records.create`). Don't "fix" one side without the other.

## 5. `DefaultChatTransport` needs dynamic body AND dynamic fetch

AI SDK v5 owns request mechanics in `DefaultChatTransport`. Keep the latest body fields in a ref and expose them through the transport's `body` callback. Attach a fresh `Authorization: Bearer <JWT>` on every send with the transport's `fetch` callback:

```ts
new DefaultChatTransport({
  api: '/api/ai/chat',
  body: () => ({ documentId: bodyRef.current.documentId, activeFilePath: bodyRef.current.activeFilePath }),
  fetch: async (url, init) => {
    const token = await getAuthToken()
    const headers = new Headers(init?.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(url, { ...init, headers })
  },
})
```

## 6. Remount `useChat` on document switch

The chat is scoped per-document. Key the inner chat by `documentId` so switching documents stops the prior stream and loads only the new document's persisted transcript:

```ts
<Chat key={documentId} documentId={documentId} />
```

Otherwise the model sees a conversation about doc A while the project state block says doc B — confusing and wasteful.

## 7. `agentEdits` does NOT use `teamId`

The original app's schema had `teamId` on every row. This app's `agentEdits` schema (`src/schemas/agent-edits-schema.ts`) does not declare it. Don't include it in the agent's payload — the DO will reject unknown fields.

## 8. Active file content comes from the CLIENT, not the DB

`FileEditor` debounces its `plainContent` sync at 2000ms (see `src/components/editor/FileEditor.tsx:19`). If the context loader read `plainContent` from the DB on every chat request, the agent would see content up to 2 seconds stale — a race that causes real data loss: the agent generates an `update` from the stale version, the processor applies it, and the user's last few typed characters get clobbered when `FileEditor` rehydrates its buffer from `plainContent`.

**Fix applied.** The client sends the live editor buffer (`activeFileContent`) in the chat request body. `loadContext` accepts it as an override and uses it for the active file in place of the DB copy. Non-active files still come from the DB. See `src/components/editor/EditorLayout.tsx` (passes `activeText`), `src/components/ai-chat/ChatPanel.tsx` (exposes it through `DefaultChatTransport`'s `body` callback), and `src/ai/context.ts` (`activeFileContentOverride` param).

The 80 KB truncation cap still applies — both to DB content and to the client-provided override — so a huge active file doesn't blow out the prompt.

## 9. Context load runs with the caller's RBAC

The context loader (`src/ai/context.ts`) hits the same `/api/tools/execute` endpoint as the chat tools, with `userId = auth.userId`. The DO applies the schema's `permissions` block. If the user can't read `projectFiles` for this document, the loader returns an empty set. That's the correct behavior — don't paper over it by using `APP_OWNER_JWT` or `?appAction=true`.

## 10. System prompt is assembled per turn

Every `/api/ai/chat` request triggers a fresh context load and a fresh prompt. This is cheap (the DO query is in-memory SQL) and correct — state changes (user just edited something, ran a compile, switched files) are reflected immediately. Don't cache the prompt.
