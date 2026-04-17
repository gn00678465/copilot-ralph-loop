import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildIterationPrompt,
  buildSystemMessage,
  formatProgressForInjection,
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
    expect(result.rawLineCount).toBe(0);
    expect(result.parsedEntries).toHaveLength(0);
  });

  it("counts raw lines and parses valid JSON entries", () => {
    const dir = join(tmpDir, "valid");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "progress.jsonl"),
      `${[JSON.stringify(entry(1)), JSON.stringify(entry(2))].join("\n")}\n`,
    );
    const result = loadProgressFile(dir);
    expect(result.rawLineCount).toBe(2);
    expect(result.parsedEntries).toHaveLength(2);
    expect(result.parsedEntries[0].summary).toBe("Did thing 1");
  });

  it("skips invalid JSON lines in parsedEntries but still counts them in rawLineCount", () => {
    const dir = join(tmpDir, "invalid");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "progress.jsonl"),
      `${[JSON.stringify(entry(1)), "NOT JSON", JSON.stringify(entry(3))].join("\n")}\n`,
    );
    const result = loadProgressFile(dir);
    expect(result.rawLineCount).toBe(3);
    expect(result.parsedEntries).toHaveLength(2);
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
  it("includes task section", () => {
    const result = buildIterationPrompt("Build auth", "");
    expect(result).toContain("## Task");
    expect(result).toContain("Build auth");
  });

  it("includes recent progress section when progress is non-empty", () => {
    const result = buildIterationPrompt("Build auth", "iteration 1 done");
    expect(result).toContain("## Recent Progress");
    expect(result).toContain("iteration 1 done");
  });

  it("omits recent progress section when progress is empty", () => {
    const result = buildIterationPrompt("Build auth", "");
    expect(result).not.toContain("## Recent Progress");
  });
});
