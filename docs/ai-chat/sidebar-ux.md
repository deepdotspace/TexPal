# AI Chat Sidebar — UX Spec

## Placement

Consolidated into the existing left sidebar. The editor no longer has two
sidebars — the file tree and the AI chat share a single framed container
on the left, and a narrow activity rail on the very left of that sidebar
selects which view fills the body.

```
[ rail | (Files | Assistant) | Editor | PDF ]
        ↕                    ↕         ↕
     resize               resize    resize
```

Mount point: `src/components/editor/EditorLayout.tsx`. The layout is wrapped
in an `.editor-shell` (tinted, 8px right/top/bottom padding) with the
sidebar as a flex sibling of a rounded `.editor-card`. This is the SDK
`AppSidebar.tsx` shell pattern — the sidebar is NOT an overlay; expanding
it pushes the card's left edge inward.

## The activity rail

44px wide. Two primary items today:

- **Files** (folder icon) — file tree + outline + trash.
- **Assistant** (sparkles icon) — the chat panel.

Plus a collapse button pinned at the bottom of the rail (keeps the sidebar
collapsible separately from view-switching).

Selecting a view swaps the body. Both views are always **mounted** — the
inactive one is hidden via CSS. That's how the chat's in-memory messages
survive switching to Files (and back) or collapsing the sidebar entirely.

## States

**Collapsed** — 0px wide. A tiny sidebar-restore toggle sits in the shell's
left gutter so the user can bring the rail back.

**Expanded (Files)** — 160–360px, default 220px. Fine for a file tree.

**Expanded (Assistant)** — 280–560px, default 360px. Chat needs more room
than the file tree, so the width range is separate per view. Switching
views swaps in the width appropriate to that view.

## Resize

A single drag handle on the right edge, implemented via the shared
`ResizeDivider` primitive. It resizes the **active** view's width,
persisted in `latex-editor-panel-sizes` as `sidebarWidthFiles` and
`sidebarWidthAssistant` respectively.

## Persistence

- `latex-editor-panel-sizes` — JSON `{ sidebarWidthFiles, sidebarWidthAssistant, editorRatio }`.
- `latex-editor-sidebar-view` — `'files' | 'assistant'`, default `'files'`.

Back-compat: the old flat `sidebarWidth` key is read once into
`sidebarWidthFiles` if present.

## Keyboard

Ctrl/Cmd+B toggles the whole sidebar (pre-existing). No dedicated
shortcut for view-switching yet.

## Auth (Assistant view)

If the user is signed out, the Assistant view shows a compact sign-in
prompt inside the sidebar body. Reuses `AuthOverlay` from `deepspace`.

## Loading and activity (Assistant view)

- Before the assistant opens a streaming turn: a small "thinking" dot is
  shown at the end of the transcript.
- Once the assistant turn is streaming: a tiny pulsing dot labelled
  "working" appears at the bottom of the streaming assistant message and
  stays visible for the entire `isLoading === true` window — including
  during tool-call gaps. It disappears cleanly when the stream closes.
- Tool invocations render inline **in the order the model produced them**,
  interleaved with the assistant's text. Each tool invocation is a row
  with a spinner while `state === 'call'` and a check once
  `state === 'result'`. The verb is humanized per tool/collection (see
  `describeTool` in `ChatPanel.tsx`).

## Error handling

- Network or streaming errors surface in a muted red banner above the
  composer, with a Retry button that calls `useChat.reload()`.
- If the session expired mid-turn, the 401 surfaces the same way; the user
  can re-auth and retry.

## Styling

Tokens from `src/styles.css`. The Assistant view uses a typographic,
bubble-less layout — user messages are right-aligned and slightly heavier;
assistant messages are plain prose. The composer is a ghost input: a
thin top hairline, a textarea, and a send button that only becomes
prominent when there's content.

