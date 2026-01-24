# AGENTS.md

Guidance for agentic coding assistants working in this repository.

## Project Overview
- Package: `opencode-plugin-auto-update`
- Purpose: OpenCode plugin that auto-updates other plugins on startup.
- Language: TypeScript (ESM, strict mode).
- Runtime target: Node 18 (tsup bundle).

## Commands (Bun Preferred)

Install dependencies:
- `bun install`

Build:
- `bun run build`
- `bun run dev` (watch mode)

Typecheck:
- `bun run typecheck`

Lint/Format:
- No lint or formatter configured.

Tests:
- No test runner configured.
- If adding tests, prefer Bun's built-in runner and document in `package.json`.

## Single Test (If Added Later)
- `bun test path/to/file.test.ts`
- `bun test -t "test name"`

## Repo Structure
- `src/index.ts`: plugin entry point and event handling.
- `src/update.ts`: update workflow and IO.
- `src/lock.ts`: lock/throttle utilities.
- `tsup.config.ts`: build output configuration.

## Build + Release Notes
- Bundler: `tsup` to `dist/` (ESM, no minify).
- Type declarations generated from `src/index.ts` entry.
- Release workflow: `.github/workflows/release.yml` (Release Please).
- Publish workflow: `.github/workflows/publish.yml` (OIDC, environment: `release`).
- Use conventional commits so Release Please can generate changelogs.

## TypeScript Style
- Always use TypeScript for new files.
- Use strict typing; avoid `any`.
- Prefer explicit types for public APIs and IO boundaries.
- Use `interface` for object shapes and exported types.
- Prefer union types for constrained values.
- Use `Promise<...>` return types for async functions.

## Imports
- Use ESM `import` syntax.
- Use `node:` specifier for Node built-ins.
- Include `.js` extension for local imports (ESM compatibility).
- Group imports: Node built-ins first, then external, then local.
- Keep imports sorted and minimal.

## Naming Conventions
- `camelCase` for variables and functions.
- `PascalCase` for types/interfaces.
- `UPPER_SNAKE_CASE` for constants.
- Use descriptive names for IO helpers (`readConfig`, `writeConfig`).

## Formatting
- Use semicolons.
- Two spaces for JSON indentation.
- Keep lines readable; wrap long parameter lists.
- Prefer trailing commas in multi-line literals when consistent.

## Error Handling
- Use `try/catch` around IO, parsing, and external commands.
- Fail soft when optional behavior (return `null` or empty object).
- Log detailed errors only in debug paths.
- Avoid throwing from background tasks unless necessary.
- Re-throw only when the caller must handle the failure.

## Async Patterns
- Use `async/await` over raw promises.
- Avoid fire-and-forget unless explicitly intentional.
- Keep timers and polling state local; clear intervals on completion.

## Logging
- Prefer structured string messages with a clear prefix.
- Use `console.log` for user-visible update logs.
- Use `console.error` for failures; keep messages user-safe.

## Local Config
- Use `~/.config/opencode/opencode-plugin-auto-update.json` for `ignoreThrottle` during testing.

## File IO
- Use `node:fs/promises` for async IO.
- Always pass `utf-8` for text reads/writes.
- Ensure directories exist with `mkdir(..., { recursive: true })`.
- Serialize JSON with `JSON.stringify(value, null, 2)` and trailing newline.

## Command Execution
- Use `spawn` with `stdio: ['ignore', 'pipe', 'pipe']`.
- Capture stdout/stderr and return exit code.
- Prefer Bun (`bun add`) with npm fallback.

## Config Handling
- OpenCode config file: `~/.config/opencode/opencode.json`.
- Support `plugin` and `plugins` keys.
- Preserve pinned versions when configured.

## Code Organization
- Keep helper functions near their usage.
- Small, focused functions over monolithic blocks.
- Export only what is used by other modules.

## Safety
- Avoid destructive operations without guardrails.
- Lock and throttle background updates to prevent concurrency.
- Skip non-registry plugins (file/git/path/workspace).

## Cursor / Copilot Rules
- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` found.

## Notes for Agents
- Follow existing patterns and file naming.
- Preserve ESM import style with `.js` extensions.
- Update `README.md` when user-facing behavior changes.
