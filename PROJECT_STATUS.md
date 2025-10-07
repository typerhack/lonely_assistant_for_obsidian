# Project Status

## v0.0.4

### Changelog

- Version bump to 0.0.4 in `manifest.json` and `package.json`.
- Major input UX refactor in `src/LonelyAssistantView.ts`:
  - Switched input from `<textarea>` to a contenteditable `<div>`, enabling richer mention handling and improved UI.
  - Added new methods for caret and text management (`getInputText`, `setInputText`, `getCaretPosition`, `setCaretPosition`, `renderInputContent`).
  - Improved mention parsing, insertion, and deletion logic for double-space-terminated mentions.
  - Updated mention rendering and styling logic for both input and chat display.
  - Enhanced event handling for input, blur, and mention suggestion updates.
  - Refined regex patterns for mention detection and extraction.
  - Improved handling of input state and caret restoration.
- Style improvements in `styles.css`:
  - Updated `.lonely-assistant-input-mention` for better appearance, spacing, and interaction.
  - Added placeholder styling for empty contenteditable input.
  - Adjusted font, padding, border, and background for mentions and input.
- Other:
  - Minor code cleanups and improved maintainability in `src/LonelyAssistantView.ts`.

## v0.0.3

### Changelog

- Version bump to 0.0.3 in `manifest.json` and `package.json`.
- UI/UX Improvements:
  - Replaced file icon emoji with SVG icon in mention suggestions and context items (`src/LonelyAssistantView.ts`).
  - Refined mention suggestion dropdown styles for better positioning, padding, and appearance (`styles.css`).
  - Improved mention item layout, spacing, and file/path display for clarity and consistency (`styles.css`).
  - Removed unused `.lonely-assistant-file-icon` styles and related markup.
- Refactoring:
  - Cleaned up redundant code and improved structure in `src/LonelyAssistantView.ts`.
- Other:
  - Minor style and layout adjustments for context and mention UI.

## v0.0.2

### Changelog

- Documentation and API:
  - Added `docs/API_DOC.md` for documenting code-level API changes.
  - Updated `AGENTS.md` to require API documentation before shipping new APIs.
  - Expanded and clarified Phase 2 (RAG) and editing capabilities in `docs/PROJECT_PHASE.md`.
  - Updated `docs/SYSTEM_DESIGN.md` with new context and mention UI/UX details.

- Features and Enhancements:
  - Implemented `src/rag.ts` for retrieval-augmented generation (RAG) logic.
  - Added `src/editing.ts` for safe editing workflow and helper APIs.
  - Improved context preview, mention suggestions, and provenance tracking in the UI.
  - Enhanced styles in `styles.css` for context, mentions, diff modals, and chat bubbles.

- Refactoring and Maintenance:
  - Updated `main.ts`, `manifest.json`, `package.json`, and `src/settings.ts` for new features and settings.
  - Modified `src/LonelyAssistantView.ts` for context preview and editing integration.

- Other:
  - Added/modified files in `src/` and `docs/` as part of Phase 2 and editing workflow.

## v0.0.1

### Changelog

- Added Phase 2 RAG baseline:
  - Implemented vault indexer with incremental updates and exclusion list support.
  - Added context retrieval service with active note snippets + vault ranking.
  - Integrated context preview panel, per-message toggle, and provenance footnotes in the sidebar view.
  - Persisted index data under `.lonely-assistant/index/` with rebuild/clear controls in settings.
- Delivered safe editing workflow:
  - Added diff preview modal with explicit confirm before applying changes.
  - Introduced command to apply the last assistant response to the current selection or entire note with undo support.
  - Implemented editing helper API for future automated proposals.
- Chat enhancements:
  - Added `@Note` mentions with live suggestions, mention-based context retrieval, and provenance tracking.
  - Context preview now merges active, retrieved, and mention snippets while allowing per-message toggles.
- Updated `docs/PROJECT_PHASE.md`:
  - Clarified scope wording and added detailed task checklist for Phase 0 (MVP).
- Major refactor of `main.ts`:
  - Implemented `LonelyAssistantPlugin` class structure.
  - Added Ollama settings interface and model selection.
  - Integrated sidebar view using Obsidian View API.
  - Added Ollama API client for chat completions.
  - Implemented streaming response, cancel button, and error handling.
  - Improved settings UI for host, model, temperature, max tokens, and prompt.
- Updated `manifest.json`:
  - Bumped version to `0.0.1`.
- Updated `package.json`:
  - Bumped version to `0.0.1`.
- Updated `package-lock.json`:
  - Synced version to `0.0.0` (matches package.json).
- Overhauled `styles.css`:
  - Added full Lonely Assistant plugin styles for sidebar, chat bubbles, input, and buttons.
- Added/modified files in `src/`:
  - (See source for new/updated TypeScript modules.)
