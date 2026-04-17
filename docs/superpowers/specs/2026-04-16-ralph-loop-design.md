# Ralph Loop — Design Document

**Date:** 2026-04-16  
**Status:** Approved (rev 3)

## Problem & Approach

Reimplement the [ralph](https://github.com/snarktank/ralph) autonomous agent loop in TypeScript using the GitHub Copilot SDK, replacing the original bash script that called `amp` or `claude` CLI tools.

The Copilot SDK wraps the Copilot CLI in server mode, providing the full agent runtime (file read/write, shell execution, git operations) via `session.sendAndWait()`. The TypeScript layer manages only the loop orchestration.

---

## Architecture

### Project Structure

```
copilot-ralph-loop/
├── src/
│   ├── index.ts            CLI entry point, argument parsing
│   ├── loop.ts             Main loop logic
│   ├── prompt-builder.ts   Assembles systemMessage and per-iteration prompt
│   └── types.ts            TypeScript interfaces
├── templates/
│   └── default-prompt.md   Built-in agent instructions template
└── package.json
```

### Runtime Components

- **One `CopilotClient`** per ralph-loop execution (`cwd` = target project dir)
- **New `session`** created each iteration (fresh context — aligned with ralph philosophy)
- Memory between iterations persists via files in the target project (`progress.jsonl`, `AGENTS.md`)

---

## CLI Interface

```bash
ralph-loop \
  --prompt "Implement OAuth login"   # Required: task description
  --dir /path/to/project             # Target project path (default: cwd)
  --model gpt-4.1                    # Model to use (default: gpt-4.1)
  --max-iter 50                      # Safety limit (default: 50)
  --progress-entries 10              # Recent JSONL entries to inject (default: 10)
  --complete-text "<promise>COMPLETE</promise>"  # Custom completion signal
  --verbose                          # Debug output
```

**Note:** `--prompt` is the task description. `--complete-text` defaults to `<promise>COMPLETE</promise>` and is injected into the system message so the agent knows what to output.

---

## Prompt Composition

### `systemMessage` (rebuilt each iteration)

Re-read and re-assembled at the start of **every iteration**, before creating the session. This ensures changes to `AGENTS.md` (written by the agent in a previous iteration) are visible to the next session:

```
[default-prompt.md]          Always included (built-in template)
[AGENTS.md]                  Target project — re-read each iteration, omitted if missing
[CLAUDE.md]                  Target project — re-read each iteration, omitted if missing

Completion signal notice: "When done, output: {completeText}"
```

### Per-iteration `prompt` (dynamic)

Sent via `session.sendAndWait()` each iteration:

```
## Task
{--prompt content}

## Recent Progress
{Last N entries from progress.jsonl}
  - Entries older than 3: summary field only
  - Last 3 entries: full JSON content
```

### Context Files (Target Project)

| File | Location | Required |
|------|----------|----------|
| `default-prompt.md` | ralph-loop built-in | ✅ Always |
| `AGENTS.md` | target project | Optional |
| `CLAUDE.md` | target project | Optional |
| `progress.jsonl` | target project | Optional |

---

## Loop Logic

```
Start CopilotClient (cwd = --dir)
│
└── LOOP i = 1, 2, 3...
    │
    ├── Re-read: AGENTS.md, CLAUDE.md (pick up agent-written updates)
    ├── Re-read: progress.jsonl → validate (see below)
    ├── Build systemMessage (fresh each iteration)
    ├── createSession (fresh context)
    ├── sendAndWait(task + recent progress) → stream to terminal
    │
    ├── Validate progress.jsonl appended a new entry?
    │   NO  → log warning "agent did not update progress.jsonl"
    │         (continue — do not abort)
    │
    ├── Output contains completeText (outside code fences)?
    │   YES → exit(0)
    │   NO  → i >= max-iter? YES → exit(1)
    │                         NO  → sleep 2s → next iteration
    │
    └── (session closed each iteration)
```

**Error handling:**
- Session creation failure → retry once, then exit(1)
- Copilot CLI not installed/authenticated → clear error message, exit(1)
- SIGINT (Ctrl+C) → graceful shutdown, `client.stop()`

### progress.jsonl Validation (after each iteration)

Two separate concerns with distinct counting semantics:

**Append validation — uses raw line count:**
1. Record raw line count before `sendAndWait`
2. After iteration completes, re-count raw lines
3. If count did not increase by exactly 1 → warn "agent did not append to progress.jsonl"
4. Do not abort — a missing entry is recoverable

**Prompt injection — uses successfully parsed entry count:**
1. Read all lines from progress.jsonl
2. Parse each line as JSON; skip and log warning for any line that fails to parse
3. Apply the injection formula against the list of *successfully parsed* entries only

These two counts are intentionally independent. Raw line count is used only for append detection. Parsed entry count is used only for injection slicing.

---

## Progress Memory Format (`progress.jsonl`)

One JSON line per iteration, append-only:

```jsonl
{"iteration":1,"timestamp":"2026-04-16T10:00:00Z","summary":"Implemented User model","files":["src/models/user.ts"],"learnings":["migrations need seed to run first"]}
{"iteration":2,"timestamp":"2026-04-16T10:15:00Z","summary":"Added JWT auth","files":["src/middleware/auth.ts"],"learnings":["middleware order matters"]}
```

Injection strategy — deterministic formula:

```
toInject   = last min(N, totalEntries) entries   (N = --progress-entries)
fullCount  = min(3, len(toInject))
```

- Last `fullCount` entries → full JSON content
- Remaining entries (if any) → `summary` field only (token-efficient)

Edge cases:
- `N = 0` or file missing → inject nothing
- `totalEntries < 3` → all injected entries get full JSON (fullCount = totalEntries)
- Invalid JSON lines → skip for injection, log warning

---

## Default Prompt Template (`templates/default-prompt.md`)

Built-in agent instructions. Preserves all sections from original ralph `prompt.md`, adapted for the new format:

- **Your Task** — read progress.jsonl, work on assigned task, quality checks, commit, append progress
- **Progress Report Format** — JSONL append format with iteration, timestamp, summary, files, learnings
- **Consolidate Patterns** — add reusable patterns to AGENTS.md Codebase Patterns section
- **Update AGENTS.md Files** — when/how to preserve learnings per directory
- **Quality Requirements** — typecheck/lint/test must pass before commit
- **Browser Testing** — verify UI changes in browser if tools available
- **Stop Condition** — output `{COMPLETE_TEXT}` as the **last line** of the response, nothing after it
- **Important** — focused changes, commit frequently, keep CI green

The `{COMPLETE_TEXT}` placeholder is replaced at runtime with `--complete-text` value.

**Removed from original:**
- `prd.json` references
- "Pick highest priority story" workflow
- "Set passes: true" instructions
- Thread URL logging (amp-specific)

---

## Stop Condition

The loop exits when:
1. Agent output satisfies the completion rule below (exit 0) — primary condition
2. Iteration count reaches `--max-iter` (exit 1) — safety net

### Completion Detection

The completion signal must appear as the **last non-empty line** of the agent's output, with an exact string match to `completeText` (trimmed of whitespace). No substring search, no code fence exclusion needed.

```
...agent does work...

<promise>COMPLETE</promise>     ← must be the last non-empty line, exact match
```

This rule provides a strong guarantee: the signal cannot be triggered by the agent quoting it in prose or code examples mid-response, since those will always be followed by more output. The agent instructions in `default-prompt.md` explicitly state this requirement.

**Detection algorithm:**
1. Collect full streamed output
2. Split into lines, filter empty lines
3. Compare last line (trimmed) against `completeText` (trimmed)
4. Match → exit(0); no match → continue loop

---

## Key Design Decisions

- **Fresh session per iteration**: Aligns with ralph's "fresh context" philosophy. Memory passes through files, not conversation history.
- **JSONL over plain text**: Enables precise injection by entry count rather than line count, and structured field selection (summary vs. full).
- **No custom tools**: The Copilot CLI already provides all needed tools (file I/O, shell, git). No need to implement them in the SDK layer.
- **`cwd` on client**: Setting the working directory at the `CopilotClient` level ensures the CLI process operates in the target project directory.
