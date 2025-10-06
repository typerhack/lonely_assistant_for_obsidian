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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
