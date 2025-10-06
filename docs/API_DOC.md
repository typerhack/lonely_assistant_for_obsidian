# Lonely Assistant Internal API Reference

This document describes the public surface area of the Lonely Assistant plugin codebase. Any new modules, commands, or services must be documented here before merging.

## Module Overview

| Module | Responsibility | Exports |
| --- | --- | --- |
| `main.ts` | Obsidian plugin entry point. Registers views, commands, and settings. | `LonelyAssistantPlugin` (default) |
| `src/LonelyAssistantView.ts` | Sidebar UI for conversations, context preview, and streaming display. | `LonelyAssistantView`, `VIEW_TYPE_LONELY_ASSISTANT` |
| `src/OllamaClient.ts` | Thin wrapper around the Ollama HTTP API for streaming chat and model metadata. | `OllamaClient`, `OllamaMessage`, `OllamaResponse` |
| `src/settings.ts` | Shared settings interface, defaults, and merge helper. | `LonelyAssistantSettings`, `DEFAULT_SETTINGS`, `mergeSettings` |
| `src/rag.ts` | Retrieval-Augmented Generation service: chunking, indexing, retrieval, and prompt formatting. | `RAGService`, `RAGContext`, `RetrievedChunk`, `VaultChunk` |
| `src/editing.ts` | Edit preview modal, diff helpers, and safe apply utilities. | `openEditPreview`, `previewAndApplySelection` |

## Plugin Lifecycle (main.ts)

### `LonelyAssistantPlugin`
- **Properties**
  - `settings: LonelyAssistantSettings` – persisted plugin configuration.
  - `ollamaClient: OllamaClient` – shared HTTP client for chat requests.
  - `ragService: RAGService` – vault indexing and context retrieval.
  - `availableModels: string[]` / `modelLoadError: string | null` – cached Ollama model information.
- **Lifecycle**
  1. `onload`
     - Loads settings (`mergeSettings`).
     - Instantiates `OllamaClient` and loads the model list (`refreshModels`).
     - Instantiates `RAGService` and calls `initialize` (builds index if enabled).
     - Registers the Lonely Assistant view, ribbon icon, and `ask-model` command.
     - Adds the settings tab.
  2. `onunload`
     - Detaches sidebar leaves.
- **Commands**
  - `ask-model`: opens the sidebar and streams a response using either the current selection or full note.
  - `apply-last-response-to-selection`: opens a diff preview before replacing the current selection (or entire note) with the latest assistant answer.
- **Utilities**
  - `activateView()` – ensures the sidebar view exists on the right pane.
  - `refreshModels(options?)` – re-fetches available Ollama models and updates defaults.

## Sidebar View (src/LonelyAssistantView.ts)

### Rendering
- Header with status label and New Chat button.
- Context preview panel (toggleable per message) showing active note, retrieved snippets, and `@Note` mentions.
- Message history list with chat bubbles (user/assistant).
- Assistant messages are rendered as Markdown with syntax highlighting for code blocks.
- Input card with textarea, Send, Cancel, and inline `@` mention suggestions.

### Key Methods
- `sendMessage()` – reads textarea, gathers context (if enabled), appends messages, and starts streaming.
- `askModel(content)` – helper for the command that streams analysis of provided text.
- `clearChat()` – clears conversation history and resets UI to empty state.
- `streamCompletion(userContent)` – orchestrates:
  1. Gather RAG context via `ragService.getContextForMessage` (skip if disabled).
  2. Append user and assistant placeholder bubbles.
  3. Build Ollama message array `[default system prompt, optional context prompt, history...]`.
  4. Stream response, updating the assistant bubble with each chunk.
  5. On completion, attach a context provenance footnote listing snippet sources and update the preview panel.
- `cancelStream()` – aborts the current fetch via `AbortController` and updates UI state.
- `getLastAssistantResponse()` – returns the last assistant message text for applying to editor.

### Context Preview API
- `renderContextPreview(context, state)` renders the panel states (`idle`, `pending`, `ready`, `empty`, `disabled`).
- `attachContextFootnote(message, context)` decorates the assistant bubble with the snippet provenance used for the response.

### Message Management
- `appendMessage(message)` and `updateMessage(message)` maintain `messages` history and bubble DOM references (`WeakMap`).
- `setBubbleContent(message, content, options)` – renders message content as plain text (user) or Markdown (assistant).
- `trimHistory()` caps stored messages to 40 (keeps UI responsive).

## Ollama Client (src/OllamaClient.ts)

### `OllamaClient`
- Constructor accepts `baseUrl` and normalises trailing slash.
- `chat(messages, model, options, signal?)`
  - Streams chat completion results from `/api/chat`.
  - Yields incremental message content (`AsyncGenerator<string>`).
  - Supports cancellation via `AbortSignal`.
- `testConnection()` – checks `/api/tags` for reachability.
- `listModels()` – returns an array of available model names.

## Settings (src/settings.ts)

### `LonelyAssistantSettings`
```
interface LonelyAssistantSettings {
  ollamaHost: string
  model: string
  temperature: number
  maxTokens: number
  defaultPrompt: string
  ragEnabled: boolean
  ragMaxContext: number
  ragExcludeFolders: string[]
}
```
- `DEFAULT_SETTINGS` provides defaults.
- `mergeSettings(loaded)` normalises stored data, especially `ragExcludeFolders` (accepts string or array).

## RAG Service (src/rag.ts)

### `RAGService`
Handles vault chunking, indexing, and retrieval for context injection, plus explicit note mentions via `@Note`.

- **Initialization**
  - `new RAGService(plugin)` wires vault events (`modify`, `delete`, `rename`).
  - `initialize()` loads the on-disk index (`.lonely-assistant/index/index.json`) and triggers a rebuild if enabled and empty.

- **Public helpers**
  - `getContextForMessage(query)` → retrieves active note + retrieved chunks and builds a base prompt.
  - `getChunksForFiles(filePaths)` → returns chunks for specific files (used by mentions).
  - `buildPrompt(active, retrieved, mentions?)` → generates the merged context block appended to the system prompt.
- **Indexing**
  - `rebuildIndex()` scans all Markdown files (respecting `ragExcludeFolders`), chunks them by headings/size, and persists metadata.
  - `handleFileChange(file)` re-chunks a single file on modify/rename/delete; debounced saves (`SAVE_DEBOUNCE_MS`).
  - `clearIndex()` removes cached data from memory and disk.
- **Chunk Format** (`VaultChunk`)
  - `id`, `file`, `headings[]`, `content`, `contentLower`, `updated`, `start`, `end` offsets.
- **Retrieval**
  - `getContextForMessage(query)` returns `RAGContext` containing:
    - `active`: chunk(s) from the current note near cursor or selection.
    - `retrieved`: top chunks from the index scored via token frequency + heading matches.
    - `mentions`: explicit note references resolved from `@Note` mentions.
    - `prompt`: formatted system message with enumerated snippets.
  - `retrieveChunks(tokens, excludeFiles)` – simple scoring function (token occurrences weighted, heading hits boosted).
  - `buildPrompt(active, retrieved, mentions?)` – constructs the system context string appended before conversations.

### Storage
- Index stored as JSON array in `.lonely-assistant/index/index.json`.
- Debounced writes ensure rebuilds and incremental updates do not thrash the disk.

## Adding New APIs
1. Define module responsibilities and exports clearly.
2. Document new functions/classes in this file (section headers + signature/usage).
3. Update `AGENTS.md` to reference this file if responsibilities change.
4. Ensure settings or commands have corresponding documentation in both `docs/API_DOC.md` and user-facing docs (README/PROJECT_PHASE as needed).

Keep this doc as the authoritative reference for internal integration points. Changes without documentation updates are not allowed.

## Editing Helpers (src/editing.ts)

Provides reusable UI and diff utilities for applying edits safely.

- `openEditPreview(app, options)` – renders the diff modal and resolves to `true` when the user accepts the changes.
- `previewAndApplySelection(app, editor, revised, title?)` – captures the current selection (or entire document if empty), shows the diff preview, and applies the new text using the editor so undo/redo works naturally.
- Diff rendering uses a lightweight line-based LCS implementation and semantic CSS classes (`lonely-assistant-diff-*`).

**Expected flow:** gather assistant output → call `previewAndApplySelection` → handle the boolean result to report success or keep the original text.

