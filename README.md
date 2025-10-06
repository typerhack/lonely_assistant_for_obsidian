# Lonely Assistant

Lonely Assistant is a small Obsidian plugin that provides an in-vault AI assistant integration focused on Ollama (local and self-hosted Ollama servers). It plans to support other OpenAI-compatible APIs in the future. The plugin makes it simple to use GPT-OSS and other models inside your Obsidian vault with configurable prompts, models, and safety defaults.

## Key goals

-   Fast, local-first AI flows using Ollama
-   Easy configuration for model, temperature, and token limits
-   Minimal, unobtrusive UI inside Obsidian
-   Extensible to other OpenAI-compatible endpoints

## Features

-   Send selected text or the current note to an Ollama model and insert or preview the response
-   Per-vault settings for Ollama host, model, temperature, max tokens, and default prompt
-   Simple command palette actions and an optional ribbon icon
-   Local-first behavior when Ollama is available; configurable fallback for external APIs
-   Config validation and sensible defaults

## Getting started

### 1. Install

-   Copy the built plugin folder into your Obsidian vault's `.obsidian/plugins/lonely-assistant/`
-   Enable the plugin in Obsidian Settings → Community plugins

### 2. Basic usage

-   Open the command palette (Ctrl/Cmd+P)
-   Run `Lonely Assistant: Ask model` to send the selection or current note
-   Use settings (Settings → Community plugins → Lonely Assistant) to set your Ollama host, default model, and options

## Settings (recommended)

-   Ollama Host: `http://127.0.0.1:11434` (or your Ollama server)
-   Model: `gpt-oss` (or any Ollama-supported model)
-   Temperature: `0.2` (float)
-   Max Tokens: `1024` (integer)
-   Default Prompt: A short system-style message used when no prompt is set

## Example settings JSON

```json
{
	"ollamaHost": "http://127.0.0.1:11434",
	"model": "gpt-oss",
	"temperature": 0.2,
	"maxTokens": 1024,
	"defaultPrompt": "You are a helpful assistant focused on note-taking and ideas."
}
```

## Development

-   Development build (watch): `npm run dev`
-   Production build: `npm run build`

## Linting

-   Lint main: `eslint main.ts`
-   Lint src: `eslint ./src/`

## Tests

-   No test framework configured; consider adding Jest or similar
-   After adding a test framework, run a single test with: `npm test -- --testNamePattern="test name"`

## Code & style notes

-   TypeScript strict mode recommended
-   Explicit types for public APIs
-   Prefer interfaces for settings and clear defaults
-   Use async/await and try/catch for network operations
-   Register cleanup (events, intervals, DOM) with Obsidian helpers
-   Keep `main.ts` minimal and split features into `src/` modules

## Security & privacy

-   Designed for local-first use with Ollama — data remains in your environment when using a local Ollama host
-   If configured to use an external API, be aware of the provider's data policies

## Contributing

-   Open an issue for feature requests or bugs
-   PRs should follow the repository's TypeScript style and include meaningful commit messages
-   Add tests when adding non-trivial logic

## License

-   Add your preferred license file in the repository (e.g., MIT)

If you want, a concise Usage section or a screenshot can be added next. Specify preferred wording for the plugin name ("Lonely Assistant" vs "lonely assistant") and any example prompts to include.
