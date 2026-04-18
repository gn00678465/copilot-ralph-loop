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

Unit tests cover all pure functions. `runLoop` is tested via mocked `@github/copilot-sdk` and `@clack/prompts`.

## Progress JSONL

Append-only file in the target project. Each iteration must append **exactly one valid
progress entry** — no more, no less.

`ProgressState` carries three fields:
- `totalLineCount` — raw line count excluding trailing-newline artifact (includes blank lines)
- `lines` — non-empty line strings, used for append-only prefix verification
- `parsedEntries` — lines that pass the full `isProgressEntry` schema guard

`validateProgressAppend(before, after)` enforces three invariants:
1. **Prefix check**: `after.lines` must start with all of `before.lines` (detects overwrites
   and truncate-then-append)
2. **Raw delta check**: `totalLineCount` must increase by exactly 1 (rejects extra blank lines,
   malformed lines, or multi-line appends)
3. **Entry delta check**: `parsedEntries.length` must increase by exactly 1

**Validation failure is a hard error** — `runLoop` calls `client.stop()` and `process.exit(1)`
immediately. Silent memory corruption is not acceptable.

A valid progress entry must satisfy `isProgressEntry`: finite integer `iteration`, `timestamp`
matching exactly `YYYY-MM-DDTHH:MM:SSZ` (anchored regex + UTC round-trip check — rejects trailing
junk, milliseconds, UTC-offset variants, and out-of-range values such as Feb 29 on non-leap years,
month day 31 on 30-day months, and hour 24), string `summary`, and `files`/`learnings` arrays whose
elements are all strings.
