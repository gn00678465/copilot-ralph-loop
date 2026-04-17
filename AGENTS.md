# ralph-loop

Autonomous agent loop CLI using the GitHub Copilot SDK. TypeScript + Bun.

## Architecture

- One `CopilotClient` per execution; `cwd` is set to the target project directory
- Fresh `session` per iteration — no conversation history carried between iterations
- File-based memory: target project's `progress.jsonl`, `AGENTS.md`, `CLAUDE.md`
- System message assembled fresh each iteration by re-reading context files

## Completion Signal Convention

`--complete-text` accepts the inner value (e.g., `COMPLETE`).
It is wrapped at parse time: `<promise>COMPLETE</promise>`.
Default: `--complete-text COMPLETE` → signal is `<promise>COMPLETE</promise>`.

## Context File Injection

`buildSystemMessage` does **not** embed target-project file contents.
Instead, it checks for file existence and injects text instructions:
- "Read `AGENTS.md` for project conventions" (if the file exists)
- "Read `CLAUDE.md` for project-specific instructions" (if the file exists)

The Copilot CLI reads the files itself via its built-in file tools.

## Key Source Files

| File | Purpose |
|------|---------|
| `src/types.ts` | TypeScript interfaces |
| `src/prompt-builder.ts` | System message assembly, progress injection, text utilities |
| `src/loop.ts` | Loop orchestration, completion detection |
| `src/index.ts` | CLI entry point (`#!/usr/bin/env bun` shebang) |
| `templates/default-prompt.md` | Built-in agent instructions template |

## Code Conventions

- Language: TypeScript strict mode; runtime: Bun
- Linting/formatting: Biome (`bun run lint`)
- Module format: ESM — use `.ts` extensions in all imports
- No mutation — always return new values from transform functions
- No `console.log` in production code — use `console.error` for diagnostics, `console.warn` for warnings

## Testing

```
bun test          # run all tests
bun run typecheck # tsc --noEmit
bun run lint      # biome check src/
```

Unit tests cover all pure functions. SDK-calling code (runLoop) is not unit-tested.

## Progress JSONL

Append-only file in the target project. Raw line count is used for append detection;
parsed entry count is used for injection slicing. These two counts are independent.
