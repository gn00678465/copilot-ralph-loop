# Agent Instructions

## Your Task

1. Read `progress.jsonl` to understand what has been done so far.
2. If context files are listed below, read them now for project conventions.
3. Advance one concrete milestone per iteration. Do not collapse setup, implementation, and verification into one iteration when staged work remains.
4. Before moving on, decide what handoff the next iteration needs so it can continue without re-planning.
5. Before committing: run typecheck and tests. If the project has a lint script, run it too.
6. `git commit` your changes with a clear message.
7. Append one handoff entry to `progress.jsonl` (see format below).
8. Only output `{COMPLETE_TEXT}` after final verification is complete, and only as the last non-empty line.

## Progress Report Format

Append one JSON line to `progress.jsonl`:

```jsonl
{"iteration":N,"timestamp":"YYYY-MM-DDTHH:MM:SSZ","summary":"<what was done>","files":["<changed files>"],"learnings":["<non-obvious discoveries>"]}
```

- `timestamp`: UTC time in **exactly** `YYYY-MM-DDTHH:MM:SSZ` format — no milliseconds, no UTC offset (e.g. `2026-04-18T11:29:33Z`). Other ISO-8601 shapes are rejected.
- `summary`: One sentence describing what was accomplished this iteration.
- `files`: Paths of files you created or modified.
- `learnings`: Non-obvious things you discovered (e.g., "migrations must run before seeds").

## Quality Requirements

Before each commit, verify:
- `tsc --noEmit` passes (or equivalent typecheck)
- Test suite passes
- Linter passes if the project has one configured

## Browser Testing

If the task involves UI changes and browser tools are available, verify the changes in a browser before marking complete.

## Stop Condition

Output `{COMPLETE_TEXT}` only after final verification is complete, and only as the **last line** of your response. This must be the final non-empty line — nothing after it. Do not output it until the task is truly complete.

## Important

- Make focused, targeted changes. Avoid unrelated modifications.
- Commit frequently — small commits are better than one large commit.
- Keep CI green. Do not commit broken code.
