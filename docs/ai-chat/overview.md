# AI Chat — Overview

## What it does

A resizable, collapsible chat sidebar on the left edge of the editor. A user types natural-language requests ("write a homework on integration by parts", "add a bibliography file", "fix the compile errors") and the AI:

1. Reads the active document context via tool calls.
2. Reads the relevant files in `projectFiles`.
3. Produces new/updated LaTeX content.
4. Inserts rows into the `agentEdits` collection with `status='pending'`.
5. The frontend's `useAgentEditsProcessor` hook picks them up and applies them to `projectFiles`.
6. The user's editor updates in real-time (via Yjs sync), and they hit Compile to render the PDF.

This is the same end-user experience that the app had under miyagi — the only thing that changed is where the plumbing lives.

## What the user sees

- A left-edge sidebar with a chat icon when collapsed (~52px wide).
- When expanded, a chat panel (~320px default, resizable 280–560px) with:
  - A message list (user bubbles right-aligned, assistant bubbles left-aligned).
  - Tool-invocation pills inline in assistant messages ("records.query — done").
  - A "Thinking..." indicator while a turn is in flight.
  - An input with send button at the bottom.
- A drag handle on the right edge of the sidebar, between the chat and the file-tree sidebar.
- State persistence: collapsed/expanded and width are stored in `localStorage`.

## What the developer changed vs. miyagi

| Concern | Miyagi | This app |
|---|---|---|
| Who renders the chat panel | platform shell | the app (`src/components/ai-chat/AiChatSidebar.tsx`) |
| How the agent learns the current doc | platform injected it | client passes `documentId` + `activeFilePath` in the chat body; worker builds a dynamic system prompt per turn |
| System prompt | static `agent-prompt.md` loaded by a runtime | static rules (`src/ai/latex-prompt.ts`) + dynamic project-state block built by `src/ai/context.ts` on every turn |
| Tool set | platform agent runtime | `src/ai/tools.ts` — reduced to writes + escape-hatch reads |
| Billing | platform billing | DeepSpace API worker proxy, billed to the caller's JWT |
| How records propagate to the UI | platform broadcast | SDK's RecordRoom → `useQuery` subscription |
| `agentEdits` schema + processor | app-level | app-level (unchanged) |

See `docs/ai-chat/architecture.md` for the full request lifecycle.

## Why we don't use tool calls for context discovery anymore

The earlier port made the agent query `activeLatexDocId` at the start of every turn. That was a miyagi-ism — it worked there because the platform shell populated the row and scoped the query implicitly. Under the SDK, the pattern fails: RBAC on the collection (`read: 'own'`) and the timing between "user opens document" and "agent queries" introduce races that produce false "no document open" responses.

The current architecture eliminates this entire class of failure by making the client — which already knows the active doc and file — put that information into the chat request body. The worker adds the project state to the system prompt before the model sees the message. No tool call, no race, no empty-result confusion.
