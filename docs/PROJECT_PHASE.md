# Lonely Assistant Obsidian Plugin - Project Phases & WBS

### Phase 0: Walking Skeleton (MVP)
**Scope**
- Minimal sidebar view + single "Ask model" command wired to Ollama host from settings.
- Streamed text to output pane; cancel button.
- Basic error handling and settings persistence.

**Tasks**
- [x] Update main.ts to implement Lonely Assistant plugin structure with Ollama settings interface
- [x] Create basic sidebar view using Obsidian View API for chat interface
- [x] Implement Ollama API client for basic chat completion requests
- [x] Add 'Ask model' command that sends selected text or current note to Ollama
- [x] Implement streaming response display in sidebar with cancel button
- [x] Add basic error handling and connection testing
- [x] Test plugin installation and basic functionality in fresh vault

**Exit Criteria**
- Plugin installable in a fresh vault and can produce a streamed response or actionable error.
- Settings persist across reloads with no console errors.
- CPU idle <20% after stream ends.

**Metrics**
- Time to first token (TTFB)
- Cancel responsiveness
- Failure rate

## Overview
Lonely Assistant is an advanced Obsidian plugin that provides a persistent AI chat sidebar with full vault awareness and context-aware editing capabilities. The plugin integrates with Ollama for local AI processing and offers GitHub Copilot-style "ask and agent" modes for intelligent note editing.

## Key Features
- **Persistent Chat Sidebar**: Right sidebar interface for continuous AI conversations
- **Vault Awareness**: AI has access to entire Obsidian vault content for contextual responses
- **Context-Aware Editing**: Can read current note content and suggest/propose edits (like GitHub Copilot)
- **Dynamic Model Selection**: Auto-detects available Ollama models with in-chat model switching
- **Ask vs Agent Modes**: Question-answering mode vs. proactive editing assistance mode

## Work Breakdown Structure (WBS)

### Phase 1: Core Chat Infrastructure (Foundation)
1. **Plugin Architecture & Sidebar Setup**
   - Create `src/` folder structure with modular components
   - Implement right sidebar view using Obsidian's View API
   - Set up basic chat UI with message history and input field
   - Integrate sidebar toggle in ribbon and command palette

2. **Basic Ollama Integration**
   - Create Ollama API client with model listing capabilities
   - Implement basic chat completion requests
   - Add connection testing and error handling
   - Set up streaming responses for real-time chat

3. **Settings & Model Management**
   - Create settings tab with Ollama host configuration
   - Implement automatic model detection from Ollama API
   - Add model selection dropdown with refresh capability
   - Store user preferences (temperature, max tokens, etc.)

**Exit Criteria**
- Phase 1: No console errors after 10 sidebar open/close cycles; persistent settings and stable streaming.

### Phase 2: Context Awareness & File Integration
4. **Current Note Context Integration**
   - Implement active file content reading
   - Add cursor position and selection awareness
   - Create context extraction for relevant note sections
   - Integrate context into chat prompts automatically

5. **Vault Indexing System**
   - Build vault file scanner and indexer
   - Implement search functionality across all notes
   - Create relevance ranking for context retrieval
   - Add caching system for performance optimization

6. **File Editing Capabilities**
   - Implement safe file modification APIs
   - Add diff preview for proposed changes
   - Create undo/redo integration with Obsidian
   - Add user confirmation dialogs for edits

**Exit Criteria**
- Phase 2: Context injection visible and reviewable before send; indexer yields during idle.

### Phase 3: Advanced AI Features
7. **Ask vs Agent Mode Implementation**
   - Implement "Ask Mode": Pure Q&A with vault context
   - Implement "Agent Mode": Proactive editing suggestions
   - Add mode switching in chat interface
   - Create intelligent prompt engineering for each mode

8. **Smart Context Management**
   - Implement conversation memory and context retention
   - Add relevant vault content injection based on queries
   - Create context summarization for long conversations
   - Optimize token usage with intelligent truncation

9. **Enhanced UI/UX**
   - Add chat message types (user, assistant, system, suggestions)
   - Implement syntax highlighting for code suggestions
   - Add conversation export/import capabilities
   - Create keyboard shortcuts and quick actions

**Exit Criteria**
- Phase 3: Diff apply/undo cycle works without data loss; all edits previewed safely.

### Phase 3.5: Memory System (Short- & Long-Term)
**Scope**
- Implement short-term memory as working conversation memory with summarization to maintain context across turns.
- Implement long-term memory for fact storage and recall using embeddings or BM25 retrieval methods.
- Emphasize local privacy and require user opt-in for long-term memory features.

**Tasks**
- Implement working memory to store last N conversation turns plus a running summary.
- Create a summary checkpoint system to condense conversation history.
- Implement long-term memory storage in the `.lonely-assistant/memory/` folder within the vault.
- Add a Memory Inspector view to allow users to review and manage stored memories.
- Integrate memory-related settings such as maximum tokens for summaries, summarizer model selection, and opt-in toggles for long-term memory.

**Exit Criteria**
- Summarization functions correctly after N conversation turns.
- Memory persists across plugin reloads and restarts.
- Long-term memory usage is optional and only enabled with explicit user consent.
- Injected memory context is visible to the user before sending messages.

### Phase 4: Advanced Features & Polish
10. **Multi-Modal Support**
    - Add support for OpenAI-compatible APIs as fallback
    - Implement API provider switching
    - Add API key management for external services
    - Create unified interface for different AI providers

11. **Performance & Caching**
    - Implement response caching for repeated queries
    - Add background vault indexing
    - Optimize context retrieval algorithms
    - Implement rate limiting and request queuing

12. **Testing & Quality Assurance**
    - Set up comprehensive test suite (unit, integration, e2e)
    - Add performance benchmarking
    - Implement automated testing for Ollama integration
    - Create user acceptance testing scenarios

13. **Documentation & Deployment**
    - Complete user documentation with tutorials
    - Add video demonstrations and screenshots
    - Create troubleshooting guides
    - Prepare for Obsidian community plugin release

**Exit Criteria**
- Phase 4: Provider switch works seamlessly; secrets stored securely; plugin remains responsive.

### Phase 4.5: MCP Integration
**Scope**
- Support integration with external Model Context Protocol (MCP) providers, enabling users to add and manage external tool servers.

**Tasks**
- Create ToolProvider and ProviderManager interfaces to standardize tool integration.
- Implement MCP client adapters for both local and remote MCP servers.
- Build settings UI to manage MCP server configurations.
- Add per-tool user consent prompts and execution preview functionality.
- Integrate MCP tools into Agent Mode for enhanced proactive editing and assistance.

**Exit Criteria**
- At least one MCP provider can be registered and successfully queried.
- MCP tools are listed with appropriate metadata in the UI.
- User consent UI is shown before any tool is used.
- Tool execution completes successfully and returns structured results.

### Phase 5: Performance, QA, and Release
- Response caching and background indexing optimizations
- Rate limiting and request queuing
- Comprehensive test suite (unit, integration, e2e)
- CI/CD setup with lint/typecheck before release
- Prepare for community plugin release

**Exit Criteria**
- 95% green tests locally and in CI
- No unhandled promise rejections
- Smooth reload with no memory leaks

## Current Status
- Phase 1: Plugin architecture and sidebar foundation (Ready to Start)
- All other phases: Planned

## Technical Architecture
- **Frontend**: React-based chat interface within Obsidian sidebar
- **Backend**: Ollama API client with fallback to OpenAI-compatible APIs
- **Storage**: Obsidian's data API for settings, indexed vault cache
- **Context Engine**: Custom relevance-based retrieval system
- **Editing Engine**: Safe file modification with diff preview and undo support

## Key Dependencies
- Ollama server with model management API
- Obsidian View API for sidebar integration
- File system access for vault indexing
- Real-time streaming for chat responses
- Secure API key storage for external providers

## Risk Factors
- Obsidian API limitations for file editing
- Performance impact of full vault indexing
- Token limits and context window constraints
- Ollama server stability and model availability
- Privacy concerns with vault content access

## Success Criteria
- Seamless chat experience in Obsidian sidebar
- Intelligent context-aware responses using vault content
- Safe and intuitive file editing suggestions
- Fast model switching and configuration
- Comprehensive vault awareness without performance degradation
- GitHub Copilot-style editing assistance
- Robust error handling and user feedback

## Non-Goals for v1
- Mobile UI parity
- Multi-model orchestration beyond Ollama/OpenAI fallback
- Advanced RAG or embeddings
- Telemetry/analytics collection

## Next Actions
1. Implement Phase 0 and verify MVP checklist.
2. Add per-phase checkbox lists for tracking.
3. Document folder privacy defaults (allow/deny lists).
4. Draft README integration with this WBS.