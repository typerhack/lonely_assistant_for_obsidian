# Lonely Assistant Tools Documentation

## Overview

The Tool System provides the AI agent with structured capabilities to autonomously interact with the vault and external knowledge sources. All tools follow a consent-first design where user approval is required before execution.

## Architecture

### ToolProvider Interface

```typescript
interface ToolProvider {
  id: string
  name: string
  description: string
  version: string
  tools: Tool[]
  
  initialize(): Promise<void>
  shutdown(): Promise<void>
}
```

### Tool Interface

```typescript
interface Tool {
  name: string
  description: string
  parameters: ToolParameter[]
  requiresConsent: boolean
  canUndo: boolean
  
  execute(params: Record<string, any>): Promise<ToolResult>
  preview?(params: Record<string, any>): Promise<string>
  undo?(executionId: string): Promise<void>
}

interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required: boolean
  default?: any
}

interface ToolResult {
  success: boolean
  data?: any
  error?: string
  executionId?: string
  metadata?: Record<string, any>
}
```

### ToolRegistry

```typescript
class ToolRegistry {
  registerProvider(provider: ToolProvider): void
  unregisterProvider(providerId: string): void
  getAvailableTools(): Tool[]
  getTool(name: string): Tool | undefined
  executeWithConsent(toolName: string, params: Record<string, any>): Promise<ToolResult>
}
```

## Built-in Tools

### 1. Find Tool

**Purpose**: Search for files in the vault by name or path pattern.

**Parameters**:
- `pattern` (string, required): Glob pattern or fuzzy search query
- `includeHidden` (boolean, optional, default: false): Include hidden files
- `maxResults` (number, optional, default: 50): Maximum number of results

**Example Usage**:
```json
{
  "pattern": "**/*.md",
  "maxResults": 10
}
```

**Returns**:
```json
{
  "success": true,
  "data": [
    {"path": "Notes/Meeting.md", "modified": "2025-01-15T10:30:00Z"},
    {"path": "Projects/Ideas.md", "modified": "2025-01-14T09:00:00Z"}
  ]
}
```

**Implementation Notes**:
- Use Obsidian's `vault.getAllLoadedFiles()` for base file list
- Support glob patterns via minimatch library
- Implement fuzzy matching using Fuse.js or similar
- Respect vault privacy settings and ignore patterns

### 2. Grep Tool

**Purpose**: Search file contents using regex patterns with surrounding context.

**Parameters**:
- `pattern` (string, required): Regex pattern to search
- `filePattern` (string, optional): Limit search to files matching this glob
- `contextLines` (number, optional, default: 2): Lines of context around matches
- `maxMatches` (number, optional, default: 100): Maximum number of matches

**Example Usage**:
```json
{
  "pattern": "TODO|FIXME",
  "filePattern": "src/**/*.ts",
  "contextLines": 3
}
```

**Returns**:
```json
{
  "success": true,
  "data": [
    {
      "file": "src/editing.ts",
      "line": 45,
      "match": "// TODO: Add validation",
      "context": "...\nfunction applyPatch() {\n  // TODO: Add validation\n  return patch;\n}\n..."
    }
  ]
}
```

**Implementation Notes**:
- Read files incrementally to avoid memory issues
- Use safe regex execution with timeouts
- Cache frequently searched patterns
- Return line numbers for navigation

### 3. Read Tool

**Purpose**: Retrieve full or partial file contents safely.

**Parameters**:
- `path` (string, required): File path relative to vault root
- `startLine` (number, optional): Start reading from this line
- `endLine` (number, optional): Stop reading at this line
- `maxBytes` (number, optional, default: 1MB): Maximum bytes to read

**Example Usage**:
```json
{
  "path": "Notes/Meeting.md",
  "startLine": 10,
  "endLine": 50
}
```

**Returns**:
```json
{
  "success": true,
  "data": {
    "content": "# Meeting Notes\n\n...",
    "path": "Notes/Meeting.md",
    "size": 2048,
    "modified": "2025-01-15T10:30:00Z"
  }
}
```

**Implementation Notes**:
- Use Obsidian's `vault.read()` for file access
- Enforce size limits to prevent memory exhaustion
- Return metadata for verification
- Handle binary files gracefully

### 4. Apply Patch Tool

**Purpose**: Propose and apply file edits with diff preview and undo support.

**Parameters**:
- `path` (string, required): File path to modify
- `patches` (array, required): Array of edit operations
  - `startLine` (number): Starting line for edit
  - `endLine` (number): Ending line for edit
  - `newContent` (string): Replacement content

**Example Usage**:
```json
{
  "path": "Notes/Ideas.md",
  "patches": [
    {
      "startLine": 5,
      "endLine": 7,
      "newContent": "## Updated Section\n\nNew content here."
    }
  ]
}
```

**Preview Response**:
```diff
--- Notes/Ideas.md
+++ Notes/Ideas.md
@@ -5,3 +5,3 @@
-## Old Section
-
-Old content here.
+## Updated Section
+
+New content here.
```

**Returns**:
```json
{
  "success": true,
  "executionId": "patch-abc123",
  "data": {
    "modified": true,
    "diff": "...",
    "backupPath": ".lonely-assistant/backups/patch-abc123.md"
  }
}
```

**Implementation Notes**:
- Create backup before modification
- Generate unified diff for preview
- Use Obsidian's `vault.modify()` for safe writes
- Track undo stack with execution IDs
- Implement atomic operations with rollback

### 5. Web Search Tool

**Purpose**: Query external knowledge using Ollama's web search API.

**Parameters**:
- `query` (string, required): Search query
- `maxResults` (number, optional, default: 5): Maximum search results
- `freshness` (string, optional): Time range filter ('day', 'week', 'month', 'year')

**Example Usage**:
```json
{
  "query": "Obsidian plugin development best practices",
  "maxResults": 5,
  "freshness": "month"
}
```

**Returns**:
```json
{
  "success": true,
  "data": [
    {
      "title": "Building Obsidian Plugins - Developer Guide",
      "url": "https://example.com/guide",
      "snippet": "Learn the best practices for...",
      "relevance": 0.95
    }
  ],
  "metadata": {
    "cached": false,
    "searchTime": 234
  }
}
```

**Implementation Notes**:
- Integrate with Ollama's `/api/chat` endpoint with tool use
- Store API keys securely in plugin settings
- Implement result caching with TTL (default: 1 hour)
- Add rate limiting (default: 10 requests/minute)
- Handle API errors gracefully with fallback

**Ollama Integration**:
```typescript
// Send chat request with web search tool enabled
const response = await fetch(`${ollamaHost}/api/chat`, {
  method: 'POST',
  body: JSON.stringify({
    model: selectedModel,
    messages: [...conversationHistory],
    tools: [{
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for information',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      }
    }]
  })
})
```

Reference: https://docs.ollama.com/web-search

### 6. Web Fetch Tool

**Purpose**: Retrieve and parse web page content for AI analysis.

**Parameters**:
- `url` (string, required): URL to fetch
- `format` (string, optional, default: 'markdown'): Output format ('markdown', 'text', 'html')
- `maxBytes` (number, optional, default: 500KB): Maximum content size

**Example Usage**:
```json
{
  "url": "https://docs.obsidian.md/plugins",
  "format": "markdown"
}
```

**Returns**:
```json
{
  "success": true,
  "data": {
    "content": "# Plugin Development\n\n...",
    "url": "https://docs.obsidian.md/plugins",
    "title": "Plugin Development - Obsidian Docs",
    "contentType": "text/html",
    "size": 45678
  },
  "metadata": {
    "cached": true,
    "fetchTime": 156
  }
}
```

**Implementation Notes**:
- Use Electron's net module for HTTP requests
- Parse HTML to Markdown using turndown or similar
- Implement content sanitization
- Cache results with URL-based key (TTL: 1 hour)
- Respect robots.txt and rate limits
- Handle redirects and timeouts

## User Consent Workflow

### Consent Modes

1. **Always Ask** (default): Prompt for every tool execution
2. **Session Allow**: Allow tool for current session only
3. **Always Allow**: Trust tool permanently (per-tool setting)
4. **Never Allow**: Block tool execution

### Per-Tool Consent Requirements

Different tools have different consent requirements based on their risk level:

| Tool | Default Mode | Can Bypass Consent | Requires Preview |
|------|--------------|-------------------|------------------|
| Find Tool | Session Allow | Yes* | No |
| Grep Tool | Session Allow | Yes* | No |
| Read Tool | Session Allow | Yes* | No |
| Apply Patch Tool | Always Ask | No | Yes (required) |
| Web Search Tool | Always Ask | Yes* | No |
| Web Fetch Tool | Always Ask | Yes* | No |

**Bypass Permission Notes**:
- Read-only tools (Find, Grep, Read) can be marked as "Always Allow" to enable autonomous operation
- Destructive tools (Apply Patch) **always** require explicit user consent, even if set to "Always Allow" - bypass is disabled
- Network tools (Web Search, Web Fetch) can be trusted after user establishes they're comfortable with external requests
- Settings provide a "Developer Mode" toggle that allows bypassing consent for non-destructive tools during testing

### Consent Workflow Implementation

```typescript
interface ConsentRequest {
  tool: Tool
  parameters: Record<string, any>
  preview?: string
  riskLevel: 'safe' | 'low' | 'medium' | 'high'
  canBypass: boolean
  
  approve(): void
  deny(): void
  alwaysAllow(): void
  neverAllow(): void
}

class ConsentManager {
  async requestConsent(tool: Tool, params: Record<string, any>): Promise<boolean> {
    // Check if tool has "Always Allow" or "Never Allow" setting
    const mode = this.getConsentMode(tool.name)
    
    if (mode === 'never_allow') return false
    if (mode === 'always_allow' && tool.canBypass) return true
    
    // For destructive tools or first-time use, show consent dialog
    if (!tool.canBypass || mode === 'always_ask') {
      return await this.showConsentDialog(tool, params)
    }
    
    // Session allow - check session cache
    if (mode === 'session_allow') {
      return this.checkSessionConsent(tool.name)
    }
    
    return false
  }
  
  private showConsentDialog(tool: Tool, params: Record<string, any>): Promise<boolean> {
    const dialog = new ConsentDialog({
      tool,
      parameters: params,
      preview: tool.preview ? await tool.preview(params) : undefined,
      riskLevel: this.calculateRiskLevel(tool, params),
      canBypass: tool.canBypass,
      onApprove: () => dialog.close(true),
      onDeny: () => dialog.close(false)
    })
    
    return dialog.open()
  }
}
```

### Consent UI

**Modal Dialog Components**:
- **Header**: Tool name and icon with risk level badge
- **Description**: What the tool does and why it needs permission
- **Parameter Display**: JSON or table view with syntax highlighting
- **Preview Pane**: For destructive operations (Apply Patch shows diff)
- **Risk Indicator**: Color-coded badge (safe=green, low=blue, medium=yellow, high=red)
- **Consent Buttons**:
  - "Allow Once" - Execute this time only
  - "Allow for Session" - Don't ask again until plugin reload
  - "Always Allow" - Trust permanently (disabled for high-risk tools)
  - "Deny" - Cancel execution
  - "Never Allow" - Block tool permanently
- **Footer Links**: "View Audit Log" | "Tool Settings"

**Example Consent Dialog for Apply Patch Tool**:
```
┌─────────────────────────────────────────────┐
│ 🔧 Apply Patch Tool            [HIGH RISK] │
├─────────────────────────────────────────────┤
│ This tool will modify files in your vault. │
│                                             │
│ Target: Notes/Meeting.md                   │
│ Changes: 3 lines modified                   │
│                                             │
│ Preview:                                    │
│ ┌─────────────────────────────────────────┐│
│ │ --- Notes/Meeting.md                    ││
│ │ +++ Notes/Meeting.md                    ││
│ │ @@ -5,3 +5,3 @@                          ││
│ │ -## Old Section                          ││
│ │ +## Updated Section                      ││
│ └─────────────────────────────────────────┘│
│                                             │
│ Backup will be saved to:                   │
│ .lonely-assistant/backups/patch-abc123.md  │
│                                             │
│ [Allow Once] [Deny]                         │
│                                             │
│ ⚠️ Always Allow is disabled for this tool  │
│                                             │
│ View Audit Log | Tool Settings              │
└─────────────────────────────────────────────┘
```

**Example Consent Dialog for Web Search Tool**:
```
┌─────────────────────────────────────────────┐
│ 🌐 Web Search Tool              [MEDIUM]   │
├─────────────────────────────────────────────┤
│ This tool will search the web using Ollama │
│ web search API. Your query will be sent to │
│ external servers.                           │
│                                             │
│ Query: "Obsidian plugin development"       │
│ Max Results: 5                              │
│                                             │
│ ⓘ Requires Ollama API key in settings      │
│                                             │
│ [Allow Once] [Allow for Session]            │
│ [Always Allow] [Deny]                       │
│                                             │
│ View Audit Log | Tool Settings              │
└─────────────────────────────────────────────┘
```

### Developer Mode

Settings include a "Developer Mode" toggle for power users:

```typescript
interface ToolSettings {
  // ... other settings
  developerMode: boolean  // Default: false
}
```

When enabled:
- Read-only tools (Find, Grep, Read) bypass consent by default
- Network tools show abbreviated consent dialogs
- Detailed execution logs are shown in console
- Performance metrics displayed after each tool execution
- **Note**: Destructive tools (Apply Patch) still require explicit consent

## Execution Logging

All tool executions are logged to `.lonely-assistant/logs/tools.log`:

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "tool": "apply_patch",
  "executionId": "patch-abc123",
  "parameters": {...},
  "result": {...},
  "duration": 123,
  "userId": "user-session-id"
}
```

**Log Rotation**:
- Max size: 10MB per file
- Keep last 5 rotated logs
- Compress old logs with gzip

**Audit Access**:
- Add "View Tool Logs" command in command palette
- Display in dedicated pane with filtering and search
- Export logs as JSON or CSV

## Security & Privacy

### Sandboxing

**Vault Boundaries**:
- All file operations restricted to vault root directory
- Cannot access files outside vault (e.g., system files, other apps)
- Symlinks are resolved and validated to stay within vault
- Hidden system folders (.git, .obsidian core) are protected from modification

**Command Execution**:
- No access to OS-level shell commands or scripts
- No ability to spawn child processes
- No access to Node.js `child_process` or Electron `shell` APIs

**Network Boundaries**:
- Network requests limited to approved domains (configurable in settings)
- Default allowed domains: Ollama API endpoint only
- Users can add additional domains via whitelist in settings
- All external requests logged for audit

### Permission Model

**Risk-Based Consent**:
```typescript
enum RiskLevel {
  SAFE = 'safe',      // No side effects (Find Tool listing files)
  LOW = 'low',        // Read-only access (Read Tool, Grep Tool)
  MEDIUM = 'medium',  // External requests (Web Search, Web Fetch)
  HIGH = 'high'       // Destructive operations (Apply Patch)
}

interface Tool {
  // ... other properties
  riskLevel: RiskLevel
  canBypass: boolean  // Can user set "Always Allow"?
  requiresPreview: boolean  // Must show preview before execution?
}
```

**Consent Bypass Rules**:
1. **Safe/Low Risk Tools** (Find, Grep, Read):
   - Can be set to "Always Allow"
   - Bypass enabled after user opts in once
   - Useful for autonomous agent workflows

2. **Medium Risk Tools** (Web Search, Web Fetch):
   - Can be set to "Always Allow" after API key configured
   - Requires explicit opt-in via settings
   - Rate limits always enforced

3. **High Risk Tools** (Apply Patch):
   - **Never** bypass consent, even if set to "Always Allow"
   - Always show diff preview before execution
   - Backup created automatically before any modification
   - Each execution requires explicit "Allow Once" click

### Data Protection

**API Key Storage**:
```typescript
interface ToolSettings {
  // ... other settings
  
  // External API Configuration
  ollamaApiKey?: string           // For Ollama web search
  ollamaWebSearchEndpoint: string // Default: http://localhost:11434
  
  // Encrypted storage
  encryptedKeys?: {
    ollama?: string
    // Future: OpenAI, Anthropic, etc.
  }
}
```

**Encryption Strategy**:
- API keys encrypted using Electron's `safeStorage` API
- Keys stored in Obsidian's secure settings storage
- Never logged or exposed in plain text
- Cleared from memory after use

**Sensitive Parameter Redaction**:
```typescript
// Before logging
const safeParams = redactSensitiveParams(params, tool.sensitiveFields)

// Example: Web Search Tool
tool.sensitiveFields = ['api_key', 'auth_token']

// Logged output
{
  "tool": "web_search",
  "parameters": {
    "query": "Obsidian plugins",
    "api_key": "[REDACTED]"
  }
}
```

**Cache Security**:
- Cached responses stored in `.lonely-assistant/cache/`
- Cache files readable only by vault owner (file permissions: 600)
- Sensitive data (API keys, auth tokens) never cached
- Cache invalidated when API key changes
- Manual cache clearing via settings: "Clear All Caches"

### Rate Limiting

**Per-Tool Limits** (configurable):
```typescript
const DEFAULT_RATE_LIMITS = {
  find: 100,        // 100 requests/minute
  grep: 60,         // 60 requests/minute
  read: 100,        // 100 requests/minute
  apply_patch: 10,  // 10 requests/minute (prevents abuse)
  web_search: 10,   // 10 requests/minute (API quota protection)
  web_fetch: 20     // 20 requests/minute (respectful crawling)
}
```

**Global Limit**: 200 requests/minute across all tools

**Rate Limit Enforcement**:
- Sliding window algorithm (tracks last 60 seconds)
- Queue overflow: Requests beyond limit are queued (max 10)
- User notification when rate limit hit: "Tool rate limit reached. Please wait X seconds."
- Settings allow increasing limits (with warning about API costs/abuse)

**Bypass for Localhost**:
- Rate limits relaxed when Ollama endpoint is localhost
- External endpoints always rate limited

### Audit & Compliance

**Required Logging**:
- All tool executions (success and failure)
- All consent decisions (allow, deny, always, never)
- All file modifications with before/after checksums
- All network requests with response status
- All rate limit violations

**Data Retention**:
- Default: 30 days of logs (configurable: 7, 30, 90 days, or indefinite)
- Logs automatically rotated and compressed
- User can export audit log as JSON/CSV anytime
- "Clear Audit Log" command available in settings

**Privacy Controls**:
```typescript
interface ToolSettings {
  // ... other settings
  
  // Privacy Settings
  enableAuditLog: boolean              // Default: true
  auditLogRetentionDays: number        // Default: 30
  logParameterValues: boolean          // Default: true (set false for privacy)
  anonymizeLog: boolean                // Default: false (redact file paths)
  shareUsageStatistics: boolean        // Default: false (future: telemetry)
}
```

### Network Security

**HTTPS Enforcement**:
- All external requests use HTTPS (HTTP auto-upgraded)
- Certificate validation enabled
- Self-signed certificates rejected (configurable for localhost)

**Domain Whitelist**:
```typescript
interface ToolSettings {
  // ... other settings
  
  allowedDomains: string[]  // Default: ['localhost', '127.0.0.1']
  allowAllDomains: boolean  // Default: false (requires explicit opt-in)
}
```

**Request Validation**:
- URLs validated before fetching
- Max redirect follow: 5
- Request timeout: 30 seconds
- Response size limit: 10MB (configurable)
- Content-Type validation for expected formats

**User Controls**:
- Settings: "Allowed Domains for Web Fetch"
- Add/remove domains via UI
- Toggle "Allow All Domains" (shows security warning)
- "Block External Network Requests" master switch

## Configuration

### Settings Schema

```typescript
interface ToolSettings {
  // Tool Enablement
  enabledTools: string[]  // Default: ['find', 'grep', 'read']
  
  // Consent Configuration
  consentMode: Record<string, ConsentMode>  // Per-tool consent modes
  developerMode: boolean  // Default: false (bypasses consent for safe tools)
  
  // Performance
  rateLimits: Record<string, number>  // Per-tool rate limits (req/min)
  globalRateLimit: number  // Default: 200 req/min
  cacheEnabled: boolean  // Default: true
  cacheTTL: number  // Default: 3600 seconds (1 hour)
  maxCacheSize: number  // Default: 100MB
  
  // External APIs
  ollamaApiKey?: string  // Required for Ollama web search
  ollamaWebSearchEndpoint: string  // Default: 'http://localhost:11434'
  encryptedKeys?: {
    ollama?: string  // Encrypted version of API key
  }
  
  // Network Security
  allowedDomains: string[]  // Default: ['localhost', '127.0.0.1']
  allowAllDomains: boolean  // Default: false
  blockExternalRequests: boolean  // Default: false
  httpsOnly: boolean  // Default: true
  maxResponseSize: number  // Default: 10485760 (10MB)
  
  // Privacy & Audit
  enableAuditLog: boolean  // Default: true
  auditLogRetentionDays: number  // Default: 30
  logParameterValues: boolean  // Default: true
  anonymizeLog: boolean  // Default: false
  shareUsageStatistics: boolean  // Default: false
  
  // Tool-Specific Settings
  findMaxResults: number  // Default: 50
  grepContextLines: number  // Default: 2
  readMaxBytes: number  // Default: 1048576 (1MB)
  patchBackupEnabled: boolean  // Default: true
  webSearchMaxResults: number  // Default: 5
}
```

### Settings UI

The settings panel is organized into collapsible sections:

#### 1. Tool Management Section

**Enabled Tools**:
```
┌─────────────────────────────────────────────┐
│ Tool Management                             │
├─────────────────────────────────────────────┤
│ Select which tools are available to the AI │
│                                             │
│ ☑ Find Tool         Search vault by name   │
│ ☑ Grep Tool         Search file contents   │
│ ☑ Read Tool         Read file contents     │
│ ☑ Apply Patch Tool  Modify files           │
│ ☐ Web Search Tool   Search the web         │
│ ☐ Web Fetch Tool    Fetch web pages        │
│                                             │
│ ⓘ Disabled tools won't appear to the AI    │
└─────────────────────────────────────────────┘
```

**Consent Preferences**:
```
┌─────────────────────────────────────────────┐
│ Consent Preferences                         │
├─────────────────────────────────────────────┤
│ Choose how to handle permission requests   │
│                                             │
│ Find Tool          [Session Allow ▼]       │
│ Grep Tool          [Session Allow ▼]       │
│ Read Tool          [Session Allow ▼]       │
│ Apply Patch Tool   [Always Ask ▼]          │
│ Web Search Tool    [Always Ask ▼]          │
│ Web Fetch Tool     [Always Ask ▼]          │
│                                             │
│ ☐ Developer Mode (bypasses safe tools)     │
│                                             │
│ [Reset to Defaults]                         │
└─────────────────────────────────────────────┘
```

#### 2. External APIs Section

**Ollama Web Search Configuration**:
```
┌─────────────────────────────────────────────┐
│ External APIs                               │
├─────────────────────────────────────────────┤
│ Ollama Web Search                           │
│                                             │
│ API Endpoint:                               │
│ [http://localhost:11434              ]     │
│                                             │
│ API Key (optional):                         │
│ [••••••••••••••••••••••••         ] [Show] │
│                                             │
│ ⓘ Required for Web Search Tool             │
│ Get your key: https://ollama.com/keys      │
│                                             │
│ [Test Connection]  [Clear Key]              │
│                                             │
│ Status: ✅ Connected                        │
└─────────────────────────────────────────────┘
```

**Field Descriptions**:
- **API Endpoint**: Ollama server URL (default: localhost:11434)
- **API Key**: Optional authentication key for Ollama web search API
  - Leave empty if running local Ollama without auth
  - Required for hosted/cloud Ollama instances
  - Stored encrypted using Electron's safeStorage
  - Test connection button validates endpoint and key
  - Status indicator shows connection state

#### 3. Network Security Section

**Domain Whitelist**:
```
┌─────────────────────────────────────────────┐
│ Network Security                            │
├─────────────────────────────────────────────┤
│ Control which domains can be accessed       │
│                                             │
│ Allowed Domains:                            │
│ ┌─────────────────────────────────────────┐│
│ │ localhost                       [Remove]││
│ │ 127.0.0.1                       [Remove]││
│ │ docs.obsidian.md                [Remove]││
│ └─────────────────────────────────────────┘│
│                                             │
│ Add Domain: [              ] [Add]          │
│                                             │
│ ☐ Allow all domains (⚠️ security risk)     │
│ ☐ Block all external requests              │
│ ☑ Enforce HTTPS only                       │
│                                             │
│ Max Response Size: [10] MB                  │
│ Request Timeout: [30] seconds               │
└─────────────────────────────────────────────┘
```

#### 4. Performance Section

**Caching & Rate Limits**:
```
┌─────────────────────────────────────────────┐
│ Performance                                 │
├─────────────────────────────────────────────┤
│ Caching                                     │
│ ☑ Enable response caching                  │
│ Cache TTL: [3600] seconds (1 hour)          │
│ Max Cache Size: [100] MB                    │
│ Current Cache: 23.4 MB [Clear Cache]        │
│                                             │
│ Rate Limits (requests per minute)           │
│ Find Tool:       [100]                      │
│ Grep Tool:       [60]                       │
│ Read Tool:       [100]                      │
│ Apply Patch:     [10]                       │
│ Web Search:      [10]                       │
│ Web Fetch:       [20]                       │
│ Global Limit:    [200]                      │
│                                             │
│ [Reset to Defaults]                         │
└─────────────────────────────────────────────┘
```

#### 5. Privacy & Audit Section

**Audit Logging**:
```
┌─────────────────────────────────────────────┐
│ Privacy & Audit                             │
├─────────────────────────────────────────────┤
│ Audit Logging                               │
│ ☑ Enable audit log                         │
│ Retention: [30 ▼] days                      │
│ ☑ Log parameter values                     │
│ ☐ Anonymize file paths                     │
│                                             │
│ Current Log Size: 2.3 MB                    │
│ [View Audit Log] [Export Log] [Clear Log]  │
│                                             │
│ Privacy                                     │
│ ☐ Share anonymous usage statistics         │
│                                             │
│ ⓘ Logs stored in .lonely-assistant/logs/   │
└─────────────────────────────────────────────┘
```

#### 6. Tool-Specific Settings Section

**Per-Tool Configuration**:
```
┌─────────────────────────────────────────────┐
│ Tool-Specific Settings                      │
├─────────────────────────────────────────────┤
│ Find Tool                                   │
│ Max Results: [50]                           │
│                                             │
│ Grep Tool                                   │
│ Context Lines: [2]                          │
│ Max Matches: [100]                          │
│                                             │
│ Read Tool                                   │
│ Max File Size: [1] MB                       │
│                                             │
│ Apply Patch Tool                            │
│ ☑ Create backups before modifying          │
│ Backup Location: .lonely-assistant/backups/ │
│ Backup Retention: [30] days                 │
│                                             │
│ Web Search Tool                             │
│ Max Results: [5]                            │
│ Default Freshness: [Any ▼]                  │
│                                             │
│ Web Fetch Tool                              │
│ Max Page Size: [500] KB                     │
│ Follow Redirects: ☑                         │
│ Max Redirects: [5]                          │
└─────────────────────────────────────────────┘
```

### Settings Validation

**API Key Validation**:
```typescript
async function validateOllamaApiKey(key: string, endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    return response.ok
  } catch (error) {
    return false
  }
}
```

**Domain Validation**:
- Must be valid hostname or IP address
- Cannot add `file://` or `javascript:` protocols
- Wildcards supported: `*.obsidian.md`
- Localhost variants auto-added: `localhost`, `127.0.0.1`, `::1`

**Rate Limit Validation**:
- Minimum: 1 req/min
- Maximum: 1000 req/min (prevents abuse)
- Warning shown when setting high limits

### Default Configuration

```typescript
const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  enabledTools: ['find', 'grep', 'read'],
  consentMode: {
    find: 'session_allow',
    grep: 'session_allow', 
    read: 'session_allow',
    apply_patch: 'always_ask',
    web_search: 'always_ask',
    web_fetch: 'always_ask'
  },
  developerMode: false,
  rateLimits: {
    find: 100,
    grep: 60,
    read: 100,
    apply_patch: 10,
    web_search: 10,
    web_fetch: 20
  },
  globalRateLimit: 200,
  cacheEnabled: true,
  cacheTTL: 3600,
  maxCacheSize: 104857600, // 100MB
  ollamaWebSearchEndpoint: 'http://localhost:11434',
  allowedDomains: ['localhost', '127.0.0.1'],
  allowAllDomains: false,
  blockExternalRequests: false,
  httpsOnly: true,
  maxResponseSize: 10485760, // 10MB
  enableAuditLog: true,
  auditLogRetentionDays: 30,
  logParameterValues: true,
  anonymizeLog: false,
  shareUsageStatistics: false,
  findMaxResults: 50,
  grepContextLines: 2,
  readMaxBytes: 1048576, // 1MB
  patchBackupEnabled: true,
  webSearchMaxResults: 5
}
```

## Error Handling

### Common Error Types

```typescript
enum ToolErrorType {
  PERMISSION_DENIED = 'permission_denied',
  INVALID_PARAMETERS = 'invalid_parameters',
  EXECUTION_FAILED = 'execution_failed',
  RATE_LIMITED = 'rate_limited',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout'
}
```

### Error Recovery
- Retry logic with exponential backoff
- Fallback strategies for network tools
- User-friendly error messages
- Automatic rollback for failed patches

## Testing Strategy

### Unit Tests
- Tool parameter validation
- Execution logic and error handling
- Undo/redo functionality
- Cache behavior

### Integration Tests
- End-to-end tool execution with real vault
- Consent workflow simulation
- Ollama API integration
- File system operations

### Performance Tests
- Large file reading/writing
- Bulk search operations
- Cache effectiveness
- Rate limiting behavior

## Future Enhancements

- **Tool Composition**: Chain multiple tools in workflows
- **Custom Tools**: User-defined tool scripts
- **MCP Integration**: External tool providers (Phase 4.5)
- **Tool Templates**: Pre-configured tool combinations
- **Metrics Dashboard**: Usage statistics and performance insights
