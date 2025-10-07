# Lonely Assistant Logging System

This document explains how logging works in the Lonely Assistant plugin and how to enable it for development or debugging.

## Overview

Lonely Assistant ships with a minimal, privacy‑friendly console logger used to troubleshoot context gathering, tool execution, and model interactions. Logging is disabled by default.

## Enabling Logs

1. Open Settings → Lonely Assistant → Tool System → Management tab
2. In the Developer section, toggle `Print logs to console`

This setting is persisted and can be changed at any time. When enabled, logs are printed to the browser/Obsidian developer console and prefixed with `[LonelyAssistant]`.

## What’s Logged

- Tool lifecycle
  - Requests: tool name and parameters (as provided by the model)
  - Results: success/failure and execution time
  - Consent prompts and denials are recorded in the audit log and are not printed unless logging is enabled

- Chat flow
  - Tool calls returned by the model
  - Errors during tool execution

- RAG/context (minimal)
  - High‑level events can be added as needed, but by default logs avoid printing sensitive note content

## Code Reference

- Logger utility: `src/logger.ts`
  - `Logger.setEnabled(boolean)` – enable/disable console logging
  - `Logger.log/info/warn/error(...args)` – leveled log methods

- Integration points
  - Tool execution: `src/tools/ToolRegistry.ts`
  - Chat view: `src/LonelyAssistantView.ts`

## Best Practices

- Avoid logging full file contents or sensitive data; prefer summaries or counts
- Use `Logger.info()` for high‑level events, `Logger.error()` for failures
- Keep logging statements concise and actionable

## Troubleshooting

If you don’t see any logs:

- Confirm the `Print logs to console` toggle is enabled
- Reopen the developer console (Obsidian → View → Toggle developer tools)
- Verify your model returns tool calls (check the assistant bubble for the `Used tools` block)

