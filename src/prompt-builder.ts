import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProgressEntry, ProgressState } from "./types.ts";

export function isProgressEntry(obj: unknown): obj is ProgressEntry {
  if (typeof obj !== "object" || obj === null) return false;
  const e = obj as Record<string, unknown>;
  return (
    typeof e.iteration === "number" &&
    Number.isInteger(e.iteration) &&
    Number.isFinite(e.iteration) &&
    typeof e.timestamp === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(e.timestamp) &&
    !Number.isNaN(new Date(e.timestamp as string).getTime()) &&
    new Date(e.timestamp as string).toISOString().replace(/\.\d{3}Z$/, "Z") ===
      e.timestamp &&
    typeof e.summary === "string" &&
    Array.isArray(e.files) &&
    (e.files as unknown[]).every((f) => typeof f === "string") &&
    Array.isArray(e.learnings) &&
    (e.learnings as unknown[]).every((l) => typeof l === "string")
  );
}

export function wrapCompleteText(value: string): string {
  return `<promise>${value}</promise>`;
}

export function loadProgressFile(dir: string): ProgressState {
  const filePath = join(dir, "progress.jsonl");
  if (!existsSync(filePath)) {
    return { totalLineCount: 0, lines: [], parsedEntries: [] };
  }

  const raw = readFileSync(filePath, "utf-8");
  const rawLines = raw.split("\n");
  // Trailing newline produces an empty string at the end — don't count it
  const totalLineCount =
    rawLines[rawLines.length - 1] === ""
      ? rawLines.length - 1
      : rawLines.length;
  const lines = rawLines.filter((l) => l.trim() !== "");

  const parsedEntries: ProgressEntry[] = [];
  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (isProgressEntry(parsed)) {
        parsedEntries.push(parsed);
      } else {
        console.warn(
          "[ralph-loop] Warning: skipped schema-invalid entry in progress.jsonl",
        );
      }
    } catch {
      console.warn(
        "[ralph-loop] Warning: skipped invalid JSON line in progress.jsonl",
      );
    }
  }

  return { totalLineCount, lines, parsedEntries };
}

export function formatProgressForInjection(
  entries: ProgressEntry[],
  n: number,
): string {
  if (n === 0 || entries.length === 0) return "";

  const toInject = entries.slice(-Math.min(n, entries.length));
  const fullCount = Math.min(3, toInject.length);
  const summarySlice = toInject.slice(0, toInject.length - fullCount);
  const fullSlice = toInject.slice(toInject.length - fullCount);

  const lines: string[] = [];
  for (const e of summarySlice) lines.push(e.summary);
  for (const e of fullSlice) lines.push(JSON.stringify(e));

  return lines.join("\n");
}

export function buildSystemMessage(
  targetDir: string,
  completeText: string,
): string {
  // Resolve templates dir relative to this source file, not process.cwd()
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const templateDir = join(__dirname, "../templates");
  const defaultPrompt = readFileSync(
    join(templateDir, "default-prompt.md"),
    "utf-8",
  );

  const parts: string[] = [
    defaultPrompt.replaceAll("{COMPLETE_TEXT}", completeText),
  ];

  // Inject text instructions — the Copilot CLI reads the files itself via its file tools.
  // We check existence here so the agent is only instructed to read files that exist.
  const contextLines: string[] = [];
  if (existsSync(join(targetDir, "AGENTS.md"))) {
    contextLines.push(
      "- Read `AGENTS.md` for project conventions and constraints",
    );
  }
  if (existsSync(join(targetDir, "CLAUDE.md"))) {
    contextLines.push("- Read `CLAUDE.md` for project-specific instructions");
  }
  if (contextLines.length > 0) {
    parts.push(
      `\n## Context Files\nRead these files at the start of your session:\n${contextLines.join("\n")}`,
    );
  }

  parts.push(`\nWhen done, output: ${completeText}`);
  return parts.join("\n");
}

export function buildIterationPrompt(
  task: string,
  progressText: string,
): string {
  const parts = [`## Task\n${task}`];
  if (progressText.trim()) {
    parts.push(`## Recent Progress\n${progressText}`);
  }
  return parts.join("\n\n");
}
