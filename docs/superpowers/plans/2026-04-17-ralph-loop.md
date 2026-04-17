# Ralph Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ralph autonomous agent loop in TypeScript using the GitHub Copilot SDK — a CLI tool that repeatedly sends a task prompt to a Copilot session until the agent signals completion or a max iteration limit is reached.

**Architecture:** One `CopilotClient` per execution (with `cwd` pointing to the target project). Each iteration creates a fresh `session`, assembles a `systemMessage` from files re-read on every iteration, sends the task + recent progress via `sendAndWait`, then checks the streamed output for the completion signal. Memory between iterations lives in files (`progress.jsonl`, `AGENTS.md`) in the target project directory.

**Tech Stack:** TypeScript, `@github/copilot-sdk`, Bun (test runner + runtime), Biome (linter), Node.js `fs` + `path`

**Completion signal convention:** `--complete-text` accepts the inner value (e.g., `COMPLETE`) and wraps it as `<promise>COMPLETE</promise>`. The default `--complete-text` is `COMPLETE`, so the default signal is `<promise>COMPLETE</promise>`.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `AGENTS.md` | Create | Project conventions and architecture for ralph-loop itself |
| `src/types.ts` | Create | `CliArgs`, `ProgressEntry`, `ProgressState` interfaces |
| `src/prompt-builder.ts` | Create | `buildSystemMessage()`, `buildIterationPrompt()`, `loadProgressFile()`, `formatProgressForInjection()`, `wrapCompleteText()` |
| `src/loop.ts` | Create | `runLoop()`, `isComplete()`, `validateProgressAppend()` |
| `src/index.ts` | Create | CLI entry: `parseArgs()`, `main()`, SIGINT handler — starts with `#!/usr/bin/env bun` shebang |
| `templates/default-prompt.md` | Create | Built-in agent instructions with `{COMPLETE_TEXT}` placeholder |
| `package.json` | Modify | Add `bin`, scripts (start/test/typecheck/lint), biome devDependency |
| `biome.json` | Create | Biome linter/formatter config |
| `tsconfig.json` | Create | TypeScript compiler config |
| `src/prompt-builder.test.ts` | Create | Unit tests for all exported functions incl. loadProgressFile + buildSystemMessage + wrapCompleteText |
| `src/loop.test.ts` | Create | Unit tests for completion detection + progress validation |
| `src/index.test.ts` | Create | Unit tests for CLI arg parsing |

---

## Task 0: AGENTS.md

Write the project's own `AGENTS.md` before any code. This serves as the authoritative constraint document for all subsequent development.

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Create AGENTS.md**

```markdown
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
- "Read `CLAUDE.md` for project instructions" (if the file exists)

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
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add AGENTS.md with project conventions"
```

---

## Task 1: Project Scaffolding

**Files:**
- Modify: `package.json` (targeted edits — preserve the existing `setup`/`preinstall` workflow)
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `templates/default-prompt.md`

- [ ] **Step 1: Edit package.json — add name, bin, scripts, biome dependency**

```json
{
  "name": "ralph-loop",
  "version": "1.0.0",
  "description": "Autonomous agent loop using GitHub Copilot SDK",
  "type": "module",
  "bin": {
    "ralph-loop": "./src/index.ts"
  },
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/",
    "lint:fix": "biome check --write src/",
    "setup": "npx tsx script/setup.ts",
    "preinstall": "node -e \"console.log('\\n⚠️  建議先執行: npm run setup 或 bun run setup\\n')\""
  },
  "dependencies": {
    "@github/copilot-sdk": "latest",
    "tsx": "^4.21.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/bun": "^1.3.8",
    "@types/node": "^25.2.1"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "private": true
}
```

Note: the `bin` entry points to `./src/index.ts`. `src/index.ts` will have a `#!/usr/bin/env bun` shebang (added in Task 6), making `bun link` / `bun install -g` work correctly.

- [ ] **Step 2: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "files": {
    "ignore": ["node_modules", "dist"]
  }
}
```

- [ ] **Step 3: Install biome**

```bash
bun install
```

Expected: `@biomejs/biome` added to `node_modules`.

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Create templates/default-prompt.md**

```markdown
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
```

- [ ] **Step 6: Commit scaffolding**

```bash
git add package.json tsconfig.json biome.json templates/default-prompt.md bun.lock
git commit -m "chore: scaffold ralph-loop project structure"
```

---

## Task 2: Type Definitions

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
export interface CliArgs {
  prompt: string
  dir: string
  model: string
  maxIter: number
  progressEntries: number
  completeText: string  // always the wrapped form: <promise>...</promise>
  verbose: boolean
}

export interface ProgressEntry {
  iteration: number
  timestamp: string
  summary: string
  files: string[]
  learnings: string[]
}

export interface ProgressState {
  rawLineCount: number
  parsedEntries: ProgressEntry[]
}
```

- [ ] **Step 2: Verify typecheck**

```bash
bun run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add TypeScript type definitions"
```

---

## Task 3: Prompt Builder

**Files:**
- Create: `src/prompt-builder.ts`
- Create: `src/prompt-builder.test.ts`

### 3a: loadProgressFile + formatProgressForInjection + wrapCompleteText

- [ ] **Step 1: Write failing tests**

Create `src/prompt-builder.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  formatProgressForInjection,
  loadProgressFile,
  wrapCompleteText,
} from "./prompt-builder.ts"
import type { ProgressEntry } from "./types.ts"

const entry = (n: number): ProgressEntry => ({
  iteration: n,
  timestamp: `2026-01-0${n}T00:00:00Z`,
  summary: `Did thing ${n}`,
  files: [`file${n}.ts`],
  learnings: [`learned ${n}`],
})

let tmpDir: string

beforeAll(() => {
  tmpDir = join(tmpdir(), `ralph-test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── wrapCompleteText ──────────────────────────────────────────────────────────

describe("wrapCompleteText", () => {
  it("wraps value in promise tags", () => {
    expect(wrapCompleteText("COMPLETE")).toBe("<promise>COMPLETE</promise>")
  })

  it("preserves inner text exactly", () => {
    expect(wrapCompleteText("DONE")).toBe("<promise>DONE</promise>")
  })
})

// ── loadProgressFile ─────────────────────────────────────────────────────────

describe("loadProgressFile", () => {
  it("returns zero counts when file does not exist", () => {
    const result = loadProgressFile(join(tmpDir, "nonexistent"))
    expect(result.rawLineCount).toBe(0)
    expect(result.parsedEntries).toHaveLength(0)
  })

  it("counts raw lines and parses valid JSON entries", () => {
    const dir = join(tmpDir, "valid")
    mkdirSync(dir)
    writeFileSync(
      join(dir, "progress.jsonl"),
      [JSON.stringify(entry(1)), JSON.stringify(entry(2))].join("\n") + "\n"
    )
    const result = loadProgressFile(dir)
    expect(result.rawLineCount).toBe(2)
    expect(result.parsedEntries).toHaveLength(2)
    expect(result.parsedEntries[0].summary).toBe("Did thing 1")
  })

  it("skips invalid JSON lines in parsedEntries but still counts them in rawLineCount", () => {
    const dir = join(tmpDir, "invalid")
    mkdirSync(dir)
    writeFileSync(
      join(dir, "progress.jsonl"),
      [JSON.stringify(entry(1)), "NOT JSON", JSON.stringify(entry(3))].join("\n") + "\n"
    )
    const result = loadProgressFile(dir)
    expect(result.rawLineCount).toBe(3)        // raw count includes invalid lines
    expect(result.parsedEntries).toHaveLength(2) // parsed count excludes invalid
  })
})

// ── formatProgressForInjection ───────────────────────────────────────────────

describe("formatProgressForInjection", () => {
  it("returns empty string when N=0", () => {
    expect(formatProgressForInjection([entry(1), entry(2)], 0)).toBe("")
  })

  it("returns empty string when entries is empty", () => {
    expect(formatProgressForInjection([], 5)).toBe("")
  })

  it("uses full JSON for all entries when totalEntries < 3", () => {
    const result = formatProgressForInjection([entry(1), entry(2)], 10)
    expect(result).toContain(JSON.stringify(entry(1)))
    expect(result).toContain(JSON.stringify(entry(2)))
  })

  it("uses summary-only for older entries, full JSON for last 3", () => {
    const entries = [entry(1), entry(2), entry(3), entry(4), entry(5)]
    const result = formatProgressForInjection(entries, 5)
    expect(result).toContain(JSON.stringify(entry(3)))
    expect(result).toContain(JSON.stringify(entry(4)))
    expect(result).toContain(JSON.stringify(entry(5)))
    expect(result).toContain("Did thing 1")
    expect(result).not.toContain('"learnings"') // entry 1 is summary-only
  })

  it("injects only last N entries when N < totalEntries", () => {
    const entries = [entry(1), entry(2), entry(3), entry(4)]
    const result = formatProgressForInjection(entries, 2)
    expect(result).not.toContain("Did thing 1")
    expect(result).not.toContain("Did thing 2")
    expect(result).toContain(JSON.stringify(entry(3)))
    expect(result).toContain(JSON.stringify(entry(4)))
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
bun test src/prompt-builder.test.ts
```

Expected: FAIL with "Cannot find module './prompt-builder.ts'"

- [ ] **Step 3: Implement prompt-builder.ts (first three functions)**

Create `src/prompt-builder.ts`:

```typescript
import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { ProgressEntry, ProgressState } from "./types.ts"

export function wrapCompleteText(value: string): string {
  return `<promise>${value}</promise>`
}

export function loadProgressFile(dir: string): ProgressState {
  const filePath = join(dir, "progress.jsonl")
  if (!existsSync(filePath)) {
    return { rawLineCount: 0, parsedEntries: [] }
  }

  const raw = readFileSync(filePath, "utf-8")
  const lines = raw.split("\n").filter((l) => l.trim() !== "")
  const rawLineCount = lines.length

  const parsedEntries: ProgressEntry[] = []
  for (const line of lines) {
    try {
      parsedEntries.push(JSON.parse(line) as ProgressEntry)
    } catch {
      console.warn("[ralph-loop] Warning: skipped invalid JSON line in progress.jsonl")
    }
  }

  return { rawLineCount, parsedEntries }
}

export function formatProgressForInjection(entries: ProgressEntry[], n: number): string {
  if (n === 0 || entries.length === 0) return ""

  const toInject = entries.slice(-Math.min(n, entries.length))
  const fullCount = Math.min(3, toInject.length)
  const summarySlice = toInject.slice(0, toInject.length - fullCount)
  const fullSlice = toInject.slice(toInject.length - fullCount)

  const lines: string[] = []
  for (const e of summarySlice) lines.push(e.summary)
  for (const e of fullSlice) lines.push(JSON.stringify(e))

  return lines.join("\n")
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
bun test src/prompt-builder.test.ts
```

Expected: PASS (all wrapCompleteText + loadProgressFile + formatProgressForInjection tests)

### 3b: buildSystemMessage + buildIterationPrompt

**Design note:** `buildSystemMessage` does **not** read or embed the contents of `AGENTS.md` / `CLAUDE.md`. It checks whether each file exists and injects a text instruction for the agent to read it. The Copilot CLI reads the files itself via its built-in file tools — giving it fresh, complete content without the overhead of loading it into the system message string.

- [ ] **Step 5: Add tests for buildSystemMessage and buildIterationPrompt**

Append to `src/prompt-builder.test.ts` (merge imports at the top of the file):

```typescript
import { buildSystemMessage, buildIterationPrompt } from "./prompt-builder.ts"

describe("buildSystemMessage", () => {
  it("includes the default-prompt.md content", () => {
    const result = buildSystemMessage(tmpDir, "<promise>COMPLETE</promise>")
    expect(result).toContain("Agent Instructions")
  })

  it("replaces {COMPLETE_TEXT} placeholder", () => {
    const result = buildSystemMessage(tmpDir, "<promise>COMPLETE</promise>")
    expect(result).toContain("<promise>COMPLETE</promise>")
    expect(result).not.toContain("{COMPLETE_TEXT}")
  })

  it("appends completion reminder at end", () => {
    const result = buildSystemMessage(tmpDir, "<promise>COMPLETE</promise>")
    expect(result).toContain("When done, output: <promise>COMPLETE</promise>")
  })

  it("instructs agent to read AGENTS.md when file is present (does not embed content)", () => {
    const dir = join(tmpDir, "with-agents")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "AGENTS.md"), "## My Patterns\nUse X over Y")
    const result = buildSystemMessage(dir, "<promise>COMPLETE</promise>")
    // Should contain an instruction to read the file, not the file's raw content
    expect(result).toContain("AGENTS.md")
    expect(result).not.toContain("Use X over Y")
  })

  it("omits AGENTS.md instruction when file is absent", () => {
    const dir = join(tmpDir, "no-agents")
    mkdirSync(dir, { recursive: true })
    const result = buildSystemMessage(dir, "<promise>COMPLETE</promise>")
    expect(result).not.toContain("AGENTS.md")
  })

  it("instructs agent to read CLAUDE.md when file is present (does not embed content)", () => {
    const dir = join(tmpDir, "with-claude")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "CLAUDE.md"), "Project rule: always use bun")
    const result = buildSystemMessage(dir, "<promise>COMPLETE</promise>")
    expect(result).toContain("CLAUDE.md")
    expect(result).not.toContain("always use bun")
  })
})

describe("buildIterationPrompt", () => {
  it("includes task section", () => {
    const result = buildIterationPrompt("Build auth", "")
    expect(result).toContain("## Task")
    expect(result).toContain("Build auth")
  })

  it("includes recent progress section when progress is non-empty", () => {
    const result = buildIterationPrompt("Build auth", "iteration 1 done")
    expect(result).toContain("## Recent Progress")
    expect(result).toContain("iteration 1 done")
  })

  it("omits recent progress section when progress is empty", () => {
    const result = buildIterationPrompt("Build auth", "")
    expect(result).not.toContain("## Recent Progress")
  })
})
```

- [ ] **Step 6: Run new tests — verify they FAIL**

```bash
bun test src/prompt-builder.test.ts
```

Expected: FAIL — `buildSystemMessage` and `buildIterationPrompt` not yet exported

- [ ] **Step 7: Add buildSystemMessage + buildIterationPrompt to prompt-builder.ts**

Append to `src/prompt-builder.ts`:

```typescript
export function buildSystemMessage(targetDir: string, completeText: string): string {
  // Resolve templates dir relative to this source file, not process.cwd()
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const templateDir = join(__dirname, "../templates")
  const defaultPrompt = readFileSync(join(templateDir, "default-prompt.md"), "utf-8")

  const parts: string[] = [defaultPrompt.replace("{COMPLETE_TEXT}", completeText)]

  // Inject text instructions — the Copilot CLI reads the files itself via its file tools.
  // We check existence here so the agent is only instructed to read files that exist.
  const contextLines: string[] = []
  if (existsSync(join(targetDir, "AGENTS.md"))) {
    contextLines.push(`- Read \`AGENTS.md\` for project conventions and constraints`)
  }
  if (existsSync(join(targetDir, "CLAUDE.md"))) {
    contextLines.push(`- Read \`CLAUDE.md\` for project-specific instructions`)
  }
  if (contextLines.length > 0) {
    parts.push(
      `\n## Context Files\nRead these files at the start of your session:\n${contextLines.join("\n")}`
    )
  }

  parts.push(`\nWhen done, output: ${completeText}`)
  return parts.join("\n")
}

export function buildIterationPrompt(task: string, progressText: string): string {
  const parts = [`## Task\n${task}`]
  if (progressText.trim()) {
    parts.push(`## Recent Progress\n${progressText}`)
  }
  return parts.join("\n\n")
}
```

- [ ] **Step 8: Run all prompt-builder tests — verify they PASS**

```bash
bun test src/prompt-builder.test.ts
```

Expected: All PASS

- [ ] **Step 9: Typecheck + lint**

```bash
bun run typecheck && bun run lint
```

Expected: Both PASS

- [ ] **Step 10: Commit**

```bash
git add src/prompt-builder.ts src/prompt-builder.test.ts
git commit -m "feat: add prompt builder with progress injection and context-file references"
```

---

## Task 4: Loop Pure Logic

**Files:**
- Create: `src/loop.ts` (pure functions only, no SDK yet)
- Create: `src/loop.test.ts`

- [ ] **Step 1: Write failing tests for isComplete and validateProgressAppend**

Create `src/loop.test.ts`:

```typescript
import { describe, it, expect } from "bun:test"
import { isComplete, validateProgressAppend } from "./loop.ts"

describe("isComplete", () => {
  it("returns true when last non-empty line matches completeText exactly", () => {
    const output = "did some work\n\n<promise>COMPLETE</promise>\n"
    expect(isComplete(output, "<promise>COMPLETE</promise>")).toBe(true)
  })

  it("returns false when completeText appears in the middle", () => {
    const output = "output <promise>COMPLETE</promise> and more text"
    expect(isComplete(output, "<promise>COMPLETE</promise>")).toBe(false)
  })

  it("returns false when output is empty", () => {
    expect(isComplete("", "<promise>COMPLETE</promise>")).toBe(false)
  })

  it("is case-sensitive", () => {
    const output = "<PROMISE>COMPLETE</PROMISE>"
    expect(isComplete(output, "<promise>COMPLETE</promise>")).toBe(false)
  })

  it("trims whitespace from last line and completeText before comparing", () => {
    const output = "work done\n  <promise>COMPLETE</promise>  \n"
    expect(isComplete(output, "  <promise>COMPLETE</promise>  ")).toBe(true)
  })

  it("returns false when completeText appears mid-response followed by more output", () => {
    const output =
      "Output `<promise>COMPLETE</promise>` when done.\n\nI will now proceed..."
    expect(isComplete(output, "<promise>COMPLETE</promise>")).toBe(false)
  })
})

describe("validateProgressAppend", () => {
  it("returns true when line count increased by exactly 1", () => {
    expect(validateProgressAppend(5, 6)).toBe(true)
  })

  it("returns false when line count did not change", () => {
    expect(validateProgressAppend(5, 5)).toBe(false)
  })

  it("returns false when line count increased by more than 1", () => {
    expect(validateProgressAppend(5, 7)).toBe(false)
  })

  it("returns false when line count decreased", () => {
    expect(validateProgressAppend(5, 3)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
bun test src/loop.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement pure functions in loop.ts**

Create `src/loop.ts`:

```typescript
import { CopilotClient, approveAll } from "@github/copilot-sdk"
import type { SessionEvent } from "@github/copilot-sdk"
import {
  buildSystemMessage,
  buildIterationPrompt,
  loadProgressFile,
  formatProgressForInjection,
} from "./prompt-builder.ts"
import type { CliArgs } from "./types.ts"

export function isComplete(output: string, completeText: string): boolean {
  const nonEmptyLines = output.split("\n").filter((l) => l.trim() !== "")
  if (nonEmptyLines.length === 0) return false
  const lastLine = nonEmptyLines[nonEmptyLines.length - 1].trim()
  return lastLine === completeText.trim()
}

export function validateProgressAppend(linesBefore: number, linesAfter: number): boolean {
  return linesAfter === linesBefore + 1
}

export async function runLoop(args: CliArgs): Promise<void> {
  // Implementation in Task 5
  throw new Error("Not yet implemented")
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
bun test src/loop.test.ts
```

Expected: PASS

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/loop.ts src/loop.test.ts
git commit -m "feat: add loop pure logic (completion detection, progress validation)"
```

---

## Task 5: Loop Orchestration

**Files:**
- Modify: `src/loop.ts` — implement `runLoop()`

No unit tests for the SDK-calling code (external service). The `isComplete` and `validateProgressAppend` helpers are already tested in Task 4.

- [ ] **Step 1: Implement runLoop() in src/loop.ts**

Replace the stub `runLoop` export:

```typescript
export async function runLoop(args: CliArgs): Promise<void> {
  const { prompt, dir, model, maxIter, progressEntries, completeText, verbose } = args

  let client: CopilotClient
  try {
    client = new CopilotClient({ cwd: dir })
  } catch (err) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      console.error(
        "[ralph-loop] GitHub Copilot CLI not found.\n" +
        "Install it: gh extension install github/gh-copilot\n" +
        "Authenticate: gh auth login"
      )
    } else {
      console.error("[ralph-loop] Failed to start Copilot client:", error.message)
    }
    process.exit(1)
  }

  process.on("SIGINT", async () => {
    console.error("\n[ralph-loop] Interrupted. Shutting down...")
    await client.stop()
    process.exit(0)
  })

  let retried = false

  for (let i = 1; i <= maxIter; i++) {
    if (verbose) console.error(`[ralph-loop] Iteration ${i}/${maxIter}`)

    // Re-read context each iteration to pick up agent-written updates
    const systemMessage = buildSystemMessage(dir, completeText)
    const progressBefore = loadProgressFile(dir)
    const progressText = formatProgressForInjection(progressBefore.parsedEntries, progressEntries)
    const iterPrompt = buildIterationPrompt(prompt, progressText)

    let session
    try {
      session = await client.createSession({
        onPermissionRequest: approveAll,
        model,
        streaming: true,
        systemMessage: { content: systemMessage },
      })
      retried = false
    } catch (err) {
      const error = err as NodeJS.ErrnoException
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") {
        console.error(
          "[ralph-loop] Cannot connect to Copilot CLI. Make sure you are authenticated: gh auth login"
        )
        await client.stop()
        process.exit(1)
      }
      if (!retried) {
        retried = true
        console.error("[ralph-loop] Session creation failed, retrying once...")
        try {
          session = await client.createSession({
            onPermissionRequest: approveAll,
            model,
            streaming: true,
            systemMessage: { content: systemMessage },
          })
        } catch (retryErr) {
          console.error("[ralph-loop] Session creation failed after retry:", retryErr)
          await client.stop()
          process.exit(1)
        }
      } else {
        console.error("[ralph-loop] Session creation failed:", err)
        await client.stop()
        process.exit(1)
      }
    }

    let output = ""
    session.on((event: SessionEvent) => {
      if (event.type === "assistant.message_delta") {
        const chunk = event.data.deltaContent
        process.stdout.write(chunk)
        output += chunk
      }
      if (event.type === "session.idle") {
        process.stdout.write("\n")
      }
      if (event.type === "session.error") {
        console.error("[ralph-loop] Session error:", event.data)
      }
    })

    await session.sendAndWait({ prompt: iterPrompt })
    // Each createSession call starts a fresh context — no history carried over.

    const progressAfter = loadProgressFile(dir)
    if (!validateProgressAppend(progressBefore.rawLineCount, progressAfter.rawLineCount)) {
      console.warn("[ralph-loop] Warning: agent did not append to progress.jsonl")
    }

    if (isComplete(output, completeText)) {
      if (verbose) console.error("[ralph-loop] Task complete.")
      await client.stop()
      process.exit(0)
    }

    if (i < maxIter) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  console.error(`[ralph-loop] Reached max iterations (${maxIter}). Exiting.`)
  await client.stop()
  process.exit(1)
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: PASS

- [ ] **Step 3: Run loop tests to confirm no regression**

```bash
bun test src/loop.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/loop.ts
git commit -m "feat: implement runLoop() with Copilot SDK and CLI error handling"
```

---

## Task 6: CLI Entry Point

**Files:**
- Create: `src/index.ts` (starts with `#!/usr/bin/env bun` shebang)
- Create: `src/index.test.ts`

- [ ] **Step 1: Write failing tests for parseArgs**

Create `src/index.test.ts`:

```typescript
import { describe, it, expect } from "bun:test"
import { parseArgs } from "./index.ts"

describe("parseArgs", () => {
  it("parses required --prompt flag", () => {
    const args = parseArgs(["--prompt", "Build auth"])
    expect(args.prompt).toBe("Build auth")
  })

  it("applies defaults — completeText is wrapped form of 'COMPLETE'", () => {
    const args = parseArgs(["--prompt", "Build auth"])
    expect(args.maxIter).toBe(50)
    expect(args.progressEntries).toBe(10)
    expect(args.model).toBe("gpt-4.1")
    expect(args.completeText).toBe("<promise>COMPLETE</promise>")
    expect(args.verbose).toBe(false)
    expect(args.dir).toBe(process.cwd())
  })

  it("wraps --complete-text value in promise tags", () => {
    const args = parseArgs(["--prompt", "x", "--complete-text", "DONE"])
    expect(args.completeText).toBe("<promise>DONE</promise>")
  })

  it("parses --max-iter", () => {
    const args = parseArgs(["--prompt", "x", "--max-iter", "5"])
    expect(args.maxIter).toBe(5)
  })

  it("parses --progress-entries", () => {
    const args = parseArgs(["--prompt", "x", "--progress-entries", "3"])
    expect(args.progressEntries).toBe(3)
  })

  it("parses --model", () => {
    const args = parseArgs(["--prompt", "x", "--model", "claude-sonnet-4.5"])
    expect(args.model).toBe("claude-sonnet-4.5")
  })

  it("parses --verbose", () => {
    const args = parseArgs(["--prompt", "x", "--verbose"])
    expect(args.verbose).toBe(true)
  })

  it("parses --dir", () => {
    const args = parseArgs(["--prompt", "x", "--dir", "/tmp/project"])
    expect(args.dir).toBe("/tmp/project")
  })

  it("throws when --prompt is missing", () => {
    expect(() => parseArgs([])).toThrow()
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
bun test src/index.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement src/index.ts**

The file starts with `#!/usr/bin/env bun` so `bun link` / `bun install -g` installs a working executable. `parseArgs` wraps the `--complete-text` value with `wrapCompleteText`; the default inner value is `"COMPLETE"`.

```typescript
#!/usr/bin/env bun
import { resolve } from "node:path"
import type { CliArgs } from "./types.ts"
import { runLoop } from "./loop.ts"
import { wrapCompleteText } from "./prompt-builder.ts"

export function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {}
  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === "--verbose") {
      args.verbose = true
      i++
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const value = argv[i + 1]
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`)
      }
      args[key] = value
      i += 2
    } else {
      i++
    }
  }

  if (!args.prompt) {
    console.error("Usage: ralph-loop --prompt <task> [options]")
    console.error("  --prompt <text>           Required: task description")
    console.error("  --dir <path>              Target project path (default: cwd)")
    console.error("  --model <name>            Model to use (default: gpt-4.1)")
    console.error("  --max-iter <n>            Safety limit (default: 50)")
    console.error("  --progress-entries <n>    Recent JSONL entries to inject (default: 10)")
    console.error("  --complete-text <value>   Inner completion value (default: COMPLETE)")
    console.error("                            Wrapped as <promise>VALUE</promise>")
    console.error("  --verbose                 Debug output")
    throw new Error("--prompt is required")
  }

  return {
    prompt: args.prompt as string,
    dir: resolve((args.dir as string) ?? process.cwd()),
    model: (args.model as string) ?? "gpt-4.1",
    maxIter: args["max-iter"] ? parseInt(args["max-iter"] as string, 10) : 50,
    progressEntries: args["progress-entries"]
      ? parseInt(args["progress-entries"] as string, 10)
      : 10,
    completeText: wrapCompleteText((args["complete-text"] as string) ?? "COMPLETE"),
    verbose: (args.verbose as boolean) ?? false,
  }
}

async function main(): Promise<void> {
  let args: CliArgs
  try {
    args = parseArgs(process.argv.slice(2))
  } catch {
    process.exit(1)
  }
  await runLoop(args)
}

main().catch((err) => {
  console.error("[ralph-loop] Fatal error:", err)
  process.exit(1)
})
```

- [ ] **Step 4: Run index tests — verify they PASS**

```bash
bun test src/index.test.ts
```

Expected: PASS

- [ ] **Step 5: Run all tests to confirm no regression**

```bash
bun test
```

Expected: All PASS

- [ ] **Step 6: Typecheck + lint**

```bash
bun run typecheck && bun run lint
```

Expected: Both PASS

- [ ] **Step 7: Smoke test CLI help output**

```bash
bun run src/index.ts
```

Expected: Usage text printed to stderr, process exits with code 1.

- [ ] **Step 8: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: add CLI entry point with shebang and arg parsing"
```

---

## Final Verification

- [ ] Run full test suite: `bun test`
- [ ] Run typecheck: `bun run typecheck`
- [ ] Run lint: `bun run lint`
- [ ] Manual smoke test (requires Copilot CLI authenticated):

```bash
bun run src/index.ts --prompt "List the files in this directory" --dir . --max-iter 1
```

Expected: Copilot agent runs one iteration, streams output to terminal.

---

## Spec Reference

Design spec: `docs/superpowers/specs/2026-04-16-ralph-loop-design.md`
