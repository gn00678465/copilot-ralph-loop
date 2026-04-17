# Agent Instructions

## Your Task

1. Read `progress.jsonl` to understand what has been done so far.
2. If instructed to read `AGENTS.md` or `CLAUDE.md`, read them now for project conventions.
3. Work on the assigned task — make focused, incremental changes.
4. Before committing: run typecheck and tests. If the project has a lint script, run it too.
5. `git commit` your changes with a clear message.
6. Append a new entry to `progress.jsonl` (see format below).
7. When the task is fully complete, output `{COMPLETE_TEXT}` as the **last line** of your response. Nothing after it.

## Progress Report Format

Append one JSON line to `progress.jsonl`:

```jsonl
{"iteration":N,"timestamp":"<ISO-8601>","summary":"<what was done>","files":["<changed files>"],"learnings":["<non-obvious discoveries>"]}
```

- `summary`: One sentence describing what was accomplished this iteration.
- `files`: Paths of files you created or modified.
- `learnings`: Non-obvious things you discovered (e.g., "migrations must run before seeds").

## Consolidate Patterns

When you discover a reusable pattern, add it to the `## Codebase Patterns` section in `AGENTS.md`.

## Update AGENTS.md

Update `AGENTS.md` whenever you:
- Establish a new convention or pattern
- Learn something important about the codebase structure
- Discover a non-obvious constraint or dependency

## Quality Requirements

Before each commit, verify:
- `tsc --noEmit` passes (or equivalent typecheck)
- Test suite passes
- Linter passes if the project has one configured

## Browser Testing

If the task involves UI changes and browser tools are available, verify the changes in a browser before marking complete.

## Stop Condition

Output `{COMPLETE_TEXT}` as the **last line** of your response when the task is fully done. This must be the final non-empty line — nothing after it. Do not output it until the task is truly complete.

## Important

- Make focused, targeted changes. Avoid unrelated modifications.
- Commit frequently — small commits are better than one large commit.
- Keep CI green. Do not commit broken code.
