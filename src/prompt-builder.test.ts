import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateProgressAppend } from "./loop.ts";
import {
  buildIterationPrompt,
  buildSystemMessage,
  formatProgressForInjection,
  isProgressEntry,
  loadProgressFile,
  wrapCompleteText,
} from "./prompt-builder.ts";
import type { ProgressEntry } from "./types.ts";

const entry = (n: number): ProgressEntry => ({
  iteration: n,
  timestamp: `2026-01-0${n}T00:00:00Z`,
  summary: `Did thing ${n}`,
  files: [`file${n}.ts`],
  learnings: [`learned ${n}`],
});

let tmpDir: string;

beforeAll(() => {
  tmpDir = join(tmpdir(), `ralph-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── isProgressEntry ───────────────────────────────────────────────────────────

describe("isProgressEntry", () => {
  it("returns true for a valid ProgressEntry", () => {
    expect(isProgressEntry(entry(1))).toBe(true);
  });

  it("returns false for an empty object", () => {
    expect(isProgressEntry({})).toBe(false);
  });

  it("returns false when iteration is missing", () => {
    const { iteration: _, ...rest } = entry(1);
    expect(isProgressEntry(rest)).toBe(false);
  });

  it("returns false when files is not an array", () => {
    expect(isProgressEntry({ ...entry(1), files: "file.ts" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isProgressEntry(null)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isProgressEntry("valid")).toBe(false);
  });

  it("returns false when iteration is NaN", () => {
    expect(isProgressEntry({ ...entry(1), iteration: Number.NaN })).toBe(false);
  });

  it("returns false when iteration is a float", () => {
    expect(isProgressEntry({ ...entry(1), iteration: 1.5 })).toBe(false);
  });

  it("returns false when iteration is Infinity", () => {
    expect(
      isProgressEntry({ ...entry(1), iteration: Number.POSITIVE_INFINITY }),
    ).toBe(false);
  });

  it("returns false when timestamp does not match ISO-8601 format", () => {
    expect(isProgressEntry({ ...entry(1), timestamp: "2026-01-01" })).toBe(
      false,
    );
    expect(isProgressEntry({ ...entry(1), timestamp: "not-a-date" })).toBe(
      false,
    );
  });

  it("regression: returns false for out-of-range timestamp values (2026-99-99T99:99:99Z)", () => {
    expect(
      isProgressEntry({ ...entry(1), timestamp: "2026-99-99T99:99:99Z" }),
    ).toBe(false);
  });

  it("regression: returns false when timestamp has trailing junk after seconds", () => {
    expect(
      isProgressEntry({ ...entry(1), timestamp: "2026-01-01T00:00:00junk" }),
    ).toBe(false);
  });

  it("regression: returns false when timestamp is missing Z suffix", () => {
    expect(
      isProgressEntry({ ...entry(1), timestamp: "2026-01-01T00:00:00" }),
    ).toBe(false);
  });

  it("regression: returns false when timestamp has milliseconds (2026-01-01T00:00:00.123Z)", () => {
    expect(
      isProgressEntry({ ...entry(1), timestamp: "2026-01-01T00:00:00.123Z" }),
    ).toBe(false);
  });

  it("regression: returns false when timestamp has UTC offset instead of Z (2026-01-01T00:00:00+02:00)", () => {
    expect(
      isProgressEntry({ ...entry(1), timestamp: "2026-01-01T00:00:00+02:00" }),
    ).toBe(false);
  });

  it("regression: returns false for non-leap-year Feb 29 (2026-02-29T00:00:00Z)", () => {
    expect(
      isProgressEntry({ ...entry(1), timestamp: "2026-02-29T00:00:00Z" }),
    ).toBe(false);
  });

  it("regression: returns false for out-of-range day April 31 (2026-04-31T00:00:00Z)", () => {
    expect(
      isProgressEntry({ ...entry(1), timestamp: "2026-04-31T00:00:00Z" }),
    ).toBe(false);
  });

  it("regression: returns false for hour=24 midnight rollover (2026-12-31T24:00:00Z)", () => {
    expect(
      isProgressEntry({ ...entry(1), timestamp: "2026-12-31T24:00:00Z" }),
    ).toBe(false);
  });

  it("returns false when files contains a non-string element", () => {
    expect(isProgressEntry({ ...entry(1), files: ["ok", 42] })).toBe(false);
  });

  it("returns false when learnings contains a non-string element", () => {
    expect(isProgressEntry({ ...entry(1), learnings: [true] })).toBe(false);
  });
});

// ── wrapCompleteText ──────────────────────────────────────────────────────────

describe("wrapCompleteText", () => {
  it("wraps value in promise tags", () => {
    expect(wrapCompleteText("COMPLETE")).toBe("<promise>COMPLETE</promise>");
  });

  it("preserves inner text exactly", () => {
    expect(wrapCompleteText("DONE")).toBe("<promise>DONE</promise>");
  });
});

// ── loadProgressFile ─────────────────────────────────────────────────────────

describe("loadProgressFile", () => {
  it("returns zero counts when file does not exist", () => {
    const result = loadProgressFile(join(tmpDir, "nonexistent"));
    expect(result.totalLineCount).toBe(0);
    expect(result.lines).toHaveLength(0);
    expect(result.parsedEntries).toHaveLength(0);
  });

  it("parses valid JSON entries and sets totalLineCount", () => {
    const dir = join(tmpDir, "valid");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "progress.jsonl"),
      `${[JSON.stringify(entry(1)), JSON.stringify(entry(2))].join("\n")}\n`,
    );
    const result = loadProgressFile(dir);
    expect(result.totalLineCount).toBe(2);
    expect(result.lines).toHaveLength(2);
    expect(result.parsedEntries).toHaveLength(2);
    expect(result.parsedEntries[0].summary).toBe("Did thing 1");
  });

  it("counts invalid JSON lines in totalLineCount and lines but excludes them from parsedEntries", () => {
    const dir = join(tmpDir, "invalid");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "progress.jsonl"),
      `${[JSON.stringify(entry(1)), "NOT JSON", JSON.stringify(entry(3))].join("\n")}\n`,
    );
    const result = loadProgressFile(dir);
    expect(result.totalLineCount).toBe(3);
    expect(result.lines).toHaveLength(3);
    expect(result.parsedEntries).toHaveLength(2);
  });

  it("counts schema-invalid JSON lines in totalLineCount but excludes them from parsedEntries", () => {
    const dir = join(tmpDir, "schema-invalid");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "progress.jsonl"),
      `${[JSON.stringify(entry(1)), JSON.stringify({ foo: "bar" })].join("\n")}\n`,
    );
    const result = loadProgressFile(dir);
    expect(result.totalLineCount).toBe(2);
    expect(result.lines).toHaveLength(2);
    expect(result.parsedEntries).toHaveLength(1);
  });

  it("regression: blank-line append increases totalLineCount but not lines → validateProgressAppend fails", () => {
    const dir = join(tmpDir, "blank-line");
    mkdirSync(dir);
    const file = join(dir, "progress.jsonl");
    writeFileSync(file, `${JSON.stringify(entry(1))}\n`);
    const before = loadProgressFile(dir);
    // Agent appends only a blank line
    writeFileSync(file, `${JSON.stringify(entry(1))}\n\n`);
    const after = loadProgressFile(dir);
    expect(after.lines).toHaveLength(before.lines.length); // blank not counted in lines
    expect(after.totalLineCount).toBe(before.totalLineCount + 1); // but raw total increases
    expect(validateProgressAppend(before, after)).toBe(false);
  });

  it("regression: no-trailing-newline entry is counted in totalLineCount and parsedEntries", () => {
    const dir = join(tmpDir, "no-newline");
    mkdirSync(dir);
    writeFileSync(join(dir, "progress.jsonl"), JSON.stringify(entry(1)));
    const result = loadProgressFile(dir);
    expect(result.totalLineCount).toBe(1);
    expect(result.parsedEntries).toHaveLength(1);
  });

  it("regression: valid+malformed append increases totalLineCount by 2 → validateProgressAppend fails", () => {
    const dir = join(tmpDir, "valid-plus-malformed");
    mkdirSync(dir);
    const file = join(dir, "progress.jsonl");
    writeFileSync(file, `${JSON.stringify(entry(1))}\n`);
    const before = loadProgressFile(dir);
    // Agent appends one valid entry AND one malformed non-empty line
    writeFileSync(
      file,
      `${JSON.stringify(entry(1))}\n${JSON.stringify(entry(2))}\nBAD LINE\n`,
    );
    const after = loadProgressFile(dir);
    expect(after.totalLineCount).toBe(before.totalLineCount + 2);
    expect(after.lines).toHaveLength(before.lines.length + 2);
    expect(after.parsedEntries).toHaveLength(before.parsedEntries.length + 1);
    expect(validateProgressAppend(before, after)).toBe(false);
  });

  it("regression: valid entry plus trailing blank line increases totalLineCount by 2 → validateProgressAppend fails", () => {
    const dir = join(tmpDir, "valid-plus-blank");
    mkdirSync(dir);
    const file = join(dir, "progress.jsonl");
    // Start from empty state
    const before = loadProgressFile(dir);
    // Agent writes one valid entry followed by a blank line
    writeFileSync(file, `${JSON.stringify(entry(1))}\n\n`);
    const after = loadProgressFile(dir);
    expect(after.totalLineCount).toBe(2); // entry line + blank line
    expect(after.lines).toHaveLength(1); // blank filtered from lines
    expect(validateProgressAppend(before, after)).toBe(false);
  });
});

// ── formatProgressForInjection ───────────────────────────────────────────────

describe("formatProgressForInjection", () => {
  it("returns empty string when N=0", () => {
    expect(formatProgressForInjection([entry(1), entry(2)], 0)).toBe("");
  });

  it("returns empty string when entries is empty", () => {
    expect(formatProgressForInjection([], 5)).toBe("");
  });

  it("uses full JSON for all entries when totalEntries < 3", () => {
    const result = formatProgressForInjection([entry(1), entry(2)], 10);
    expect(result).toContain(JSON.stringify(entry(1)));
    expect(result).toContain(JSON.stringify(entry(2)));
  });

  it("uses summary-only for older entries, full JSON for last 3", () => {
    const entries = [entry(1), entry(2), entry(3), entry(4), entry(5)];
    const result = formatProgressForInjection(entries, 5);
    expect(result).toContain(JSON.stringify(entry(3)));
    expect(result).toContain(JSON.stringify(entry(4)));
    expect(result).toContain(JSON.stringify(entry(5)));
    expect(result).toContain("Did thing 1");
    expect(result).not.toContain(JSON.stringify(entry(1))); // entry 1 is summary-only
  });

  it("injects only last N entries when N < totalEntries", () => {
    const entries = [entry(1), entry(2), entry(3), entry(4)];
    const result = formatProgressForInjection(entries, 2);
    expect(result).not.toContain("Did thing 1");
    expect(result).not.toContain("Did thing 2");
    expect(result).toContain(JSON.stringify(entry(3)));
    expect(result).toContain(JSON.stringify(entry(4)));
  });
});

describe("buildSystemMessage", () => {
  it("includes the default-prompt.md content", () => {
    const result = buildSystemMessage(tmpDir, "<promise>COMPLETE</promise>");
    expect(result).toContain("Agent Instructions");
  });

  it("includes staged-work and handoff guidance", () => {
    const result = buildSystemMessage(tmpDir, "<promise>COMPLETE</promise>");
    expect(result).toContain("Advance one concrete milestone per iteration");
    expect(result).toContain(
      "decide what handoff the next iteration needs so it can continue without re-planning",
    );
    expect(result).toContain("Append one handoff entry to `progress.jsonl`");
    expect(result).toContain(
      "Only output `<promise>COMPLETE</promise>` after final verification",
    );
    expect(result).toContain(
      "Output `<promise>COMPLETE</promise>` only after final verification is complete",
    );
  });

  it("replaces {COMPLETE_TEXT} placeholder", () => {
    const result = buildSystemMessage(tmpDir, "<promise>COMPLETE</promise>");
    expect(result).toContain("<promise>COMPLETE</promise>");
    expect(result).not.toContain("{COMPLETE_TEXT}");
  });

  it("appends completion reminder at end", () => {
    const result = buildSystemMessage(tmpDir, "<promise>COMPLETE</promise>");
    expect(result).toContain("When done, output: <promise>COMPLETE</promise>");
  });

  it("instructs agent to read AGENTS.md when file is present (does not embed content)", () => {
    const dir = join(tmpDir, "with-agents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "AGENTS.md"), "## My Patterns\nUse X over Y");
    const result = buildSystemMessage(dir, "<promise>COMPLETE</promise>");
    expect(result).toContain("AGENTS.md");
    expect(result).not.toContain("Use X over Y");
  });

  it("omits AGENTS.md instruction when file is absent", () => {
    const dir = join(tmpDir, "no-agents");
    mkdirSync(dir, { recursive: true });
    const result = buildSystemMessage(dir, "<promise>COMPLETE</promise>");
    expect(result).not.toContain("AGENTS.md");
  });

  it("instructs agent to read CLAUDE.md when file is present (does not embed content)", () => {
    const dir = join(tmpDir, "with-claude");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "CLAUDE.md"), "Project rule: always use bun");
    const result = buildSystemMessage(dir, "<promise>COMPLETE</promise>");
    expect(result).toContain("CLAUDE.md");
    expect(result).not.toContain("always use bun");
  });
});

describe("buildIterationPrompt", () => {
  it("includes loop state, rules, and recent progress", () => {
    const result = buildIterationPrompt("Build auth", {
      currentIteration: 2,
      maxIterations: 5,
      progressEntryCount: 1,
      lastProgressSummary: "Created tsconfig",
      progressText: JSON.stringify(entry(1)),
    });

    expect(result).toContain("## Loop State");
    expect(result).toContain("Iteration 2 of 5");
    expect(result).toContain("Progress entries so far: 1");
    expect(result).toContain("Last progress summary: Created tsconfig");
    expect(result).toContain("## Iteration Rules");
    expect(result).toContain(
      "Advance exactly one concrete milestone this iteration.",
    );
    expect(result).toContain("set `iteration` to 2");
    expect(result).toContain("## Recent Progress");
  });

  it("omits recent progress when progress text is empty", () => {
    const result = buildIterationPrompt("Build auth", {
      currentIteration: 2,
      maxIterations: 5,
      progressEntryCount: 1,
      lastProgressSummary: null,
      progressText: "",
    });

    expect(result).toContain("Last progress summary: none yet");
    expect(result).not.toContain("## Recent Progress");
  });
});
