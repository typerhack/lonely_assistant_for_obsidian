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

### Phase 1: Core Chat Infrastructure (Foundation)
**Scope**
- Establish production-ready chat sidebar with stable streaming and model management.
- Persist conversations and settings reliably across reloads.

**Tasks**
1. **Plugin Architecture & Sidebar Setup**
   - [x] Create `src/` folder structure with modular components
   - [x] Implement right sidebar view using Obsidian's View API
   - [x] Set up chat UI with message history, typing indicator, and action buttons
   - [x] Integrate sidebar toggle in ribbon and command palette
2. **Ollama Integration**
   - [x] Create Ollama API client with model listing capabilities
   - [x] Implement chat completion streaming with AbortController support
   - [x] Add connection testing and surfaced errors in UI
   - [x] Handle cancellations cleanly without leaving UI stuck
3. **Settings & Model Management**
   - [x] Create settings tab with Ollama host configuration card
   - [x] Implement automatic model detection & refresh control
   - [x] Add validated inputs for temperature, max tokens, and prompt
   - [x] Persist settings & update client when host/model changes

**Exit Criteria**
- No console errors after 10 sidebar open/close cycles; persistent settings and stable streaming.
- Model dropdown reflects Ollama list with refresh, and selection drives new chats.
- Cancel/resume flows leave UI responsive with history intact.

### Phase 2: Context Awareness & File Integration (RAG)
4. **Current Note Context Integration**
   - [x] Implement active file content reading and selection awareness
   - [x] Extract semantic chunks (headings/blocks) for note-level context
   - [x] Surface a preview drawer showing what will be sent with the prompt
   - [x] Allow users to opt-in/out of contextual injection per message

5. **Vault Indexing & Retrieval (RAG Core)**
   - [x] Build incremental vault indexer that respects ignore lists and hidden folders
   - [x] Choose retrieval strategy (BM25/search baseline with optional embeddings)
   - [x] Chunk Markdown with metadata (path, heading, updated timestamp)
   - [x] Persist index/embeddings under `.lonely-assistant/index/`
   - [x] Implement retrieval scoring and top-N selection for prompts
   - [x] Add refresh queue and background throttling to keep RAG current

6. **Context Injection & Safety**
   - [x] Merge active note context with retrieved snippets into prompt templates
   - [x] Display injected context to the user before sending (editable toggle)
   - [x] Log retrieval provenance in chat history for auditing
   - [x] Provide per-vault privacy controls (allow/deny folders, clear index)

7. **File Editing Capabilities**
   - [x] Implement safe file modification APIs
   - [x] Add diff preview for proposed changes
   - [x] Create undo/redo integration with Obsidian
   - [x] Add user confirmation dialogs for edits

**Exit Criteria**
- Context preview shows active note + retrieved RAG snippets before send
- Vault index refresh completes without blocking UI and respects privacy settings
- Users can clear/disable RAG indexing at any time without leftover artifacts
- Streamed responses reference retrieved snippets (provenance metadata available)

### Phase 2.5: Tool System for AI Agent Capabilities
**Scope**
- Provide the AI chat with a structured tool system to operate autonomously within the vault.
- Enable the AI to find files, search content, apply edits, and access external knowledge.
- All tools require user consent and provide preview/confirmation workflows for safety.

**Tasks**
8. **Tool Provider Architecture**
   - [x] Create `ToolProvider` interface for registering tools with metadata
   - [x] Implement `ToolRegistry` to manage available tools and their execution
   - [x] Add tool discovery and capability negotiation for AI context
   - [x] Implement tool execution with logging and user consent workflows
   - [x] Create `BuiltInToolProvider` bundling all 6 core tools
   - [x] Integrate `ToolRegistry` lifecycle in plugin (initialize, shutdown, settings updates)

9. **Vault Operation Tools**
   - [x] **Find Tool**: Search for files by name/path pattern using glob/fuzzy matching
   - [x] **Grep Tool**: Search file contents using regex patterns with context
   - [x] **Read Tool**: Retrieve full or partial file contents safely
   - [x] **Apply Patch Tool**: Propose and apply file edits with diff preview

10. **External Knowledge Tools**
    - [x] **Web Search Tool**: Integrate Ollama's web search API for external queries
    - [x] **Web Fetch Tool**: Retrieve and parse web page content via Ollama API
    - [x] Add API key management for Ollama web search features
    - [x] Implement result caching and rate limiting

11. **Tool UI & Safety**
    - [x] Add comprehensive tool settings UI with 6 sections (Tool Management, External APIs, Network Security, Performance, Privacy & Audit, Tool-Specific Settings)
    - [ ] Display available tools in chat interface with descriptions
    - [ ] Show tool execution previews before actions
    - [ ] Implement consent dialogs for tool execution approval/denial
    - [ ] Log all tool invocations with results for auditing
    - [ ] Implement rollback mechanisms for reversible operations

**Exit Criteria**
- All vault operation tools work reliably with file system operations
- Web search integration successfully fetches and presents external knowledge
- User consent workflow prevents unauthorized tool usage
- Tool execution logs provide complete audit trail
- AI agent can use tools in combination to accomplish complex tasks

**Documentation**
- See `docs/TOOLS_DOC.md` for detailed tool specifications and implementation guide

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
- Phase 0: Complete ✅
- Phase 1: Complete ✅
- Phase 2: Complete ✅
- Phase 2.5: Planned (Tool System)
- Phases 3+: Planned

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
1. Document folder privacy defaults (allow/deny lists).
2. Draft README integration with this WBS.
3. Start Phase 2 discovery work (context ingestion prototypes).
