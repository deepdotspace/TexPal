# AI Chat — Implementation Plan (historical)

> This document records the plan that drove the initial AI-chat rollout. Kept for reference.

## Goal

Port the miyagi-era agentic LaTeX editor experience to the DeepSpace SDK: a resizable, collapsible left sidebar containing a chat panel. User asks for a homework → AI produces LaTeX → editor displays it → user compiles.

## Non-goals

- Multi-conversation persistence (messages reset per session).
- Slash commands / mentions.
- Markdown rendering in the chat panel.
- Floating-corner chat placement.
- Keyboard shortcut for toggle (may add later).

## What existed before this change

- `worker.ts` already had a stub `/api/ai/chat` route using `createDeepSpaceAI` + `streamText` + `buildReadOnlyTools`.
- `src/ai/tools.ts` existed but only exposed read tools.
- `src/schemas/agent-edits-schema.ts` and `src/hooks/useAgentEditsProcessor.ts` were already ported from miyagi.
- `@ai-sdk/anthropic`, `ai`, `zod` already installed.
- No chat UI. No `@ai-sdk/react` in package.json (though in node_modules transitively).

## What got built

1. **Knowledge base** — `docs/ai-chat/*.md` + `CLAUDE.md` at repo root.
2. **Fix**: `userId` in body, not header (`worker.ts`).
3. **`src/ai/tools.ts`** extended with `buildChatTools` (includes `records.create/update/delete` + reads).
4. **`src/ai/latex-prompt.ts`** — LaTeX-specific system prompt, ported from miyagi `agent-prompt.md`.
5. **`worker.ts`** updated: uses `buildChatTools`, `buildLatexSystemPrompt`, `maxSteps: 20`.
6. **`package.json`** gains `@ai-sdk/react`.
7. **`src/components/ai-chat/AiChatSidebar.tsx`** — the collapsible/resizable sidebar shell.
8. **`src/components/ai-chat/ChatPanel.tsx`** — message list + input + `useChat` wiring.
9. **`src/components/editor/EditorLayout.tsx`** — mounts `<AiChatSidebar>` on the left edge.

## Verification

- `pnpm type-check` — must pass.
- Manual UI/browser testing deferred to the user (cannot run the full dev stack here).

## Rollback

All changes are additive and touch well-delimited files. To revert, delete `src/components/ai-chat/`, `src/ai/latex-prompt.ts`, `docs/ai-chat/`, restore `src/ai/tools.ts` and `worker.ts` from the previous commit.
