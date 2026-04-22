# TODO

Running list of changes we want to make. We'll batch and do them together.

## AI chat

- [x] **Model selector dropdown.** Three Claude models shipped (Sonnet 4, Opus 4, Haiku 3.5). Catalog in `src/ai/models.ts` (single source of truth). Worker validates `modelId` from body against the catalog (rejects unknown strings). Client stores selection in `localStorage['ai-chat-model']`. Picker lives in the composer footer next to the "↵ send" hint, opens as a small popover with label + hint per option. Currently Anthropic-only — can add other providers later by extending the catalog.

- [x] **Preserve chat on collapse.** Resolved by Phase 1's architectural change — `ChatPanel` is now always mounted inside the consolidated sidebar (hidden via CSS when Files view is active, or when the sidebar is collapsed to 0 width). Messages survive view-switches and collapse/expand.

- [x] **Persist chat per document to `localStorage`.** Messages now survive page reloads. Key: `ai-chat-messages:${documentId}`. Uses a `msgOwnerRef` + deliberate effect ordering (SAVE declared first, LOAD second) to avoid the classic "old messages get written to the new doc's key" race during document switches. On doc change, loads the target doc's messages (or `[]`); on every `messages` change, writes under the current doc's key.

- [x] **Use the SDK-style shell layout for the chat sidebar + merge the open mechanism into the existing sidebar.** Two coupled changes:

  1. **Adopt the SDK sidebar's shell pattern.** The SDK's `features/sidebar/AppSidebar.tsx` wraps the app in an `.app-shell` flex container with a tinted background and a rounded `.app-content` card (border-radius 12px, 1px border, inner background). The sidebar is a flex sibling — NOT an overlay — so when it expands, flex reclaims space and the card's left edge shifts right. Exactly the "box moves, sidebar doesn't overlay" behavior we want for the chat. Right now our `AiChatSidebar` sits inside `EditorLayout` as a plain left column with no outer framing. To adopt the pattern, we'd need to wrap the editor chrome in an `app-shell` + `app-content` structure and put the chat sidebar as a flex sibling outside the card.

  2. **One sidebar, not two.** Currently the editor has the AI chat sidebar + the file-tree/outline sidebar side by side, which is visually heavy. The right call is to consolidate: the chat-open control should live INSIDE the existing file-tree sidebar, not as a separate chrome element. Placement options to brainstorm (do not pick yet — this needs a real round):
     - A dedicated "Assistant" button in the file-tree sidebar's top icon row, next to the existing new-file / new-folder / upload / close icons.
     - A persistent entry at the bottom of the file-tree sidebar (pinned, sticky), sort of like how VS Code pins "Run and Debug" or "Source Control".
     - A floating button in one of the sidebar corners.
     - A mode toggle at the top of the sidebar ("Files" / "Assistant") that swaps what the sidebar renders.
     - A tab strip on the very left (a narrow icon rail outside the sidebar) that picks which panel the sidebar shows.
     - Something else — this list is a starting point, not a menu.

     Constraints that matter for the choice: the file-tree is the default/primary view; opening the assistant should feel low-friction but not interrupt file work; closing the assistant should return you cleanly to the file tree; the chat UI needs real estate when open. Do a proper brainstorm before coding — consider each option's tradeoffs against these constraints, iterate, and only then implement.

- [x] **Redesign the chat UI to feel premium.** The current panel is text-heavy and AI-generated-looking. Empty state has a paragraph of help text ("Ask anything about your document" + two example prompts). Input is a plain rounded box. Message bubbles are generic blue/gray. It does the job but lacks taste.

  Targets: Apple-level restraint — sparse, typographic, negative space over explanation, one or two affordances max in the empty state instead of a paragraph, an input that feels composed not assembled. Still functional — no sacrificing clarity for style.

  Approach: use the `impeccable` skill family for this. The relevant entry points are `/impeccable craft` (full shape-then-build), `/impeccable critique` for scoring the current state against design quality heuristics, and `/impeccable distill` / `/impeccable quieter` / `/impeccable typeset` for the specific axes we need (less text, less noise, better type). Start with a `/impeccable critique` pass on the current ChatPanel so we have a baseline, then iterate through a few design directions before committing. Do not skip the iteration — first-draft "premium" UIs from a single pass always look like one model's idea of premium. Aim for 2–3 real alternatives before picking.

  Scope for the redesign: the chat sidebar itself (empty state, message bubbles, input area, send affordance, tool-invocation pills, error banner, auth gate). Keep behavioral contract identical (useChat wiring, body payload, reset-on-doc-switch). Style only.

- [x] **Show live agent activity during tool calls — fix the "frozen bubble" UX.** Right now the chat goes visually dead during tool-call gaps. Two scenarios the user hit:
  1. Agent writes some text → pauses 10–30s while executing tools → eventually writes more text. During the pause, nothing moves.
  2. Agent calls a tool first (no opening text) → shows an empty bubble for 10–30s → eventually writes the text. User has no idea if anything is happening.

  Root cause: the AI SDK already streams `message.parts[]` in the actual order the model produces them (text → tool-call → text → tool-call → text), but `MessageBubble` collapses all text into `message.content` and appends tool pills at the end, losing the temporal sequence. It also only shows "Thinking…" when the last message is from the user, so once the assistant has streamed one character of text, the progress indicator disappears for the rest of the turn.

  Three changes, stacked — all needed to fully solve it, all on `ChatPanel.tsx`:

  1. **Render `message.parts[]` in order.** Walk the parts array and render each `type: 'text'` as a text span and each `type: 'tool-invocation'` as a tool card, interleaved. No more "text first, pills after".
  2. **Tool cards show live state.** The part has a `state` field: `'call'` (executing) or `'result'` (done). Render a subtle spinner + humanized action while `state === 'call'` ("Creating `chapter1.tex`…", "Reading `main.tex`…", "Queueing edit…"), and a checkmark/"done" once it flips to `'result'`. Map raw tool names (`records_create`, `records_query`) to human phrasing based on the `collection` param.
  3. **Turn-level activity indicator.** Keep a pulsing dot (or similar minimal indicator) visible at the bottom of the streaming assistant bubble for the entire `isLoading === true` window, not just before first text. When the stream closes cleanly, the dot disappears.

  Prompt engineering is a weak lever here — asking the model to "narrate before tool calls" helps a little but doesn't cover the empty-bubble case and burns tokens. Fix the rendering first; only add a narration hint to the system prompt if gaps still feel dead after the three UI changes.

  Needs iteration. Good progress UI is a feel-in-motion thing — the right amount of motion, the right amount of restraint, the right words on the tool cards. Do not implement in one pass. Prototype 2–3 variations (different indicator styles, different tool-card formats, different humanizations), see them actually animate on real tool-call timings, then pick. Coordinate with the broader premium UI redesign above — the activity indicator and the tool cards are part of the same visual system and should be designed together, not separately.
