# CLAUDE.md — TeXPal LaTeX Editor (DeepSpace SDK port)

This file orients future Claude sessions to the repo. For feature-specific knowledge, follow the pointers to `docs/`.

## What this app is

**TeXPal** — a collaborative, AI-native LaTeX editor built on the DeepSpace SDK. Ported to the SDK from an earlier implementation of the same app. Users write LaTeX in a CodeMirror editor, compile to PDF via a cloud compiler, and can ask an AI assistant to create/edit files for them — the assistant writes through an `agentEdits` pipeline that a client hook applies automatically.

## Architecture at a glance

- **Single-scope app**: frontend and all tool calls target `SCOPE_ID = app:${APP_NAME}` (see `src/constants.ts`). There is no team or doc room — everything lives in one RecordRoom DO.
- **Routing**: `@generouted/react-router`. Root in `src/pages/_app.tsx`, pages under `src/pages/`.
- **Real-time data**: `useQuery` / `useMutations` from `deepspace`; provider in `_app.tsx` via `<RecordProvider>` + `<RecordScope>`.
- **Editor**: CodeMirror in `src/components/editor/`; `EditorLayout.tsx` composes the three panels (file tree sidebar | editor | PDF). `usePanelResize` handles horizontal resize state.
- **Worker**: `worker.ts` at the repo root. Hono app. Routes: `/api/auth/*`, `/api/integrations/*`, `/api/actions/*`, `/api/ai/chat`, `/api/files/*`, `/ws/*`.
- **Cron**: tasks live in `src/cron.ts` as `tasks: CronTask[]` plus a `runTask(name, env)` dispatcher, run by a `CronRoom` Durable Object (not an HTTP route). The app currently defines no tasks.
- **Schemas**: declared in `src/schemas/*.ts`, registered in `src/schemas.ts`, baked into `RecordRoom` at construction time.
- **AI chat**: `/api/ai/chat` in `worker.ts` uses `createDeepSpaceAI` from `deepspace/worker` + `streamText` from `ai`. Tools defined in `src/ai/tools.ts`. Client UI lives in `src/components/ai-chat/`.
- **Agent edits pipeline**: agent never writes files directly. It inserts rows into the `agentEdits` collection (`status='pending'`). `useAgentEditsProcessor` watches the collection and applies each edit to `projectFiles` (handles base64, agentRevision bumps, soft-delete). See `src/hooks/useAgentEditsProcessor.ts` and `src/schemas/agent-edits-schema.ts`.

## Common commands

- `pnpm dev` — start `deepspace dev` (worker + vite + tunneled)
- `pnpm build` — vite production build
- `pnpm type-check` — `tsc --noEmit` (run this before declaring work done)
- `pnpm deploy` — deploy via `deepspace deploy`
- `pnpm test:unit` — vitest (passes with no tests)

## Key files to read first

- `src/pages/_app.tsx` — providers, scope
- `src/constants.ts` — APP_NAME, SCOPE_ID, roles
- `src/schemas.ts` + `src/schemas/*.ts` — data model
- `src/components/editor/EditorLayout.tsx` — main chrome
- `src/hooks/useAgentEditsProcessor.ts` — AI → editor bridge
- `src/ai/tools.ts` — tool exposure for the AI chat
- `worker.ts` — all server routes

## Where documentation lives

Feature-level knowledge lives in `docs/`. These are wiki-style notes intended to survive across sessions — read them before touching the relevant feature:

- `docs/ai-chat/overview.md` — what the AI chat does end to end
- `docs/ai-chat/architecture.md` — plumbing, request lifecycle, scope reasoning
- `docs/ai-chat/agent-instructions.md` — the system prompt (ported from the original app's agent-prompt.md)
- `docs/ai-chat/sidebar-ux.md` — UX decisions for the left chat sidebar
- `docs/ai-chat/gotchas.md` — SDK quirks and fixes already applied

## Non-obvious conventions

- **`teamId` is always `null`** in the current app. Multi-team support was stubbed but not used; don't add branching that assumes a team context without checking with the user.
- **`activeLatexDocId` is a singleton record**: the app writes a single row (not one-per-user) to a collection named `activeLatexDocId` that tracks which document the user has open. The AI reads this to know the "active" document/file.
- **File content has two representations**: `plainContent` (string) for compilation and base64/yjs for live editing. `useAgentEditsProcessor` writes through `plainContent` + bumps `agentRevision` so `FileEditor` knows to replace its Yjs buffer.
- **Entry file protection**: the file with `isEntryFile: true` cannot be deleted by the agent. The processor enforces this; the system prompt should still steer the agent away from trying.
