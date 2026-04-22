# Code Review Fix Plan

Tracking file for the consolidated review cleanup pass. Items marked `[ ]` pending, `[x]` done, `[~]` partial/deferred-followup.

## Tier 1 — Correctness & high-value, low-risk

- [x] **F1** `src/ai/tools.ts` — `replace('.', '_')` → `replaceAll` (latent multi-dot bug)
- [x] **F2** `worker.ts:589` — `x-app-action` header → `?appAction=true` query (matches SDK)
- [x] **F3** `worker.ts:296,435` — `Authorization` header: use `startsWith('Bearer ')` check
- [x] **F4** `src/ai/context.ts` — propagate RBAC failure to prompt (stop "empty project" lie)
- [x] **F5** `src/hooks/useCompilation.ts` — fix `persistLog` duplicate-row race
- [x] **F6** `src/components/ai-chat/ChatPanel.tsx` — `key`-remount `<Chat>` by `${documentId}:${newChatSignal}`; delete `msgOwnerRef` dance
- [x] **F7** `src/components/ai-chat/ChatPanel.tsx` — debounce localStorage save; keep textarea editable during stream; add Stop button; smart auto-scroll; aria-live on assistant turn
- [x] **F8** `worker.ts` — per-tool-result size cap; plumb request AbortSignal into streamText
- [x] **F9** Consolidate `SCOPE_ID`/`app:${APP_NAME}` into one constant; import from `src/constants.ts`
- [x] **F10** Delete teamId plumbing: `useDocumentTeam`, `useDocumentCollaborators`, `teamId` props across hooks/components
- [x] **F11** Delete dead code: `usePreprocessor`, `legacyText`/`legacySynced` shim params, `.project/${documentId}` resource push, `usePanelResize` back-compat keys
- [x] **F12** Remove cosmetic `useAutoSave` timer (or tie to real persistence)
- [x] **F13** Slop sweep: redundant `as any` in `worker.ts:481` and `src/ai/tools.ts:52`; unused `resolveModelId`; duplicated `ICON_PATHS` in `EditorToolbar.tsx`; structured compile-error log (replace single-blob slice)

## Tier 2 — Valid, needs care

- [x] **F14** Agent edit safety: flush dirty buffer before `useAgentEditsProcessor` apply, add revision check
- [x] **F15** Compile pipeline: flush pending FileEditor sync promises on compile

## Tier 2 extensions (shipped)

- [x] **F16** `src/actions/index.ts`, `src/hooks/useDeleteDocument.ts` — cascading delete now runs
      server-side via a `deleteDocument` action; exercises the `/api/actions/*` path (and the
      F2 x-app-action fix); closes the atomicity gap when the tab closes mid-cascade.
- [x] **F17** `src/schemas/agent-edits-schema.ts`, `worker.ts`, `src/hooks/useAgentEditsProcessor.ts`
      — full agent-edit revision guard. Worker snapshots target file's `agentRevision` into the
      edit record on create; processor compares at apply time and rejects on mismatch. Closes
      the last "agent clobbers concurrent write" window.

## Tier 3 — Follow-up (document, don't block)

Refactors without test coverage = risk > reward; not broken:
- Split `useProjectFiles` (587 LOC god-hook) into query/crud/folders/pathUtils modules
- Split `EditorLayout` (636 LOC) into smaller hooks/components

Scope creep (working features, not code-quality bugs):
- Migrate chat message persistence from localStorage to `chatMessages` collection
  (gives cross-device sync but also introduces DO-roundtrip latency and offline failure modes)
- Promote `useGitHubTemplates` jsDelivr calls to an SDK integration

## Workflow per fix

1. Read surrounding code
2. Understand the issue
3. Consider alternatives
4. Implement the best fix
5. Verify (typecheck/build where sensible)
