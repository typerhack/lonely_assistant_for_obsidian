# Agent Instructions for Lonely Assistant Obsidian Plugin

**IMPORTANT**: Always check the `docs/` folder for the latest documentation and project-specific guidelines before making changes.

- UI and styling decisions **must** follow `docs/SYSTEM_DESIGN.md`. Review it before introducing or adjusting any user interface.
- Any code-level API changes **must** be documented in `docs/API_DOC.md` before shipping. New APIs are not considered complete until the documentation is updated.

## Build Commands
- `npm run dev` - Development build with watch mode
- `npm run build` - Production build (includes TypeScript check)

## Lint Commands
- `eslint main.ts` - Lint main file
- `eslint ./src/` - Lint src directory (if organized in src/)

## Test Commands
- No test framework configured - add Jest or similar for unit tests
- For single test: `npm test -- --testNamePattern="test name"` (after setup)

## Code Style Guidelines

### TypeScript
- Strict mode enabled (`"strict": true` in tsconfig)
- Use explicit types for function parameters and return values
- Prefer interfaces over types for object shapes
- Use `async/await` over Promise chains

### Naming Conventions
- Classes: PascalCase (e.g., `MyPlugin`, `SampleModal`)
- Interfaces: PascalCase with 'I' prefix optional (e.g., `MyPluginSettings`)
- Variables/Functions: camelCase (e.g., `mySetting`, `loadSettings`)
- Constants: UPPER_SNAKE_CASE (e.g., `DEFAULT_SETTINGS`)

### Imports & Formatting
- Single quotes for imports: `import { Plugin } from 'obsidian'`
- Group imports: obsidian core first, then third-party, then local
- No semicolons at end of statements
- 1 tab indentation (configured in .editorconfig)

### Error Handling
- Use try/catch for async operations
- Register cleanup with `this.register*` helpers (events, intervals, DOM)
- Validate settings with defaults using `Object.assign({}, DEFAULTS, loaded)`

### File Organization
- Keep `main.ts` minimal - only plugin lifecycle
- Split features into separate modules under `src/`
- Settings in dedicated file with interface and defaults
