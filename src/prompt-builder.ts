import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProgressEntry, ProgressState } from "./types.ts";

export function wrapCompleteText(value: string): string {
  return `<promise>${value}</promise>`;
}

export function loadProgressFile(dir: string): ProgressState {
  const filePath = join(dir, "progress.jsonl");
  if (!existsSync(filePath)) {
    return { rawLineCount: 0, parsedEntries: [] };
  }

  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  const rawLineCount = lines.length;

  const parsedEntries: ProgressEntry[] = [];
  for (const line of lines) {
    try {
      parsedEntries.push(JSON.parse(line) as ProgressEntry);
    } catch {
      console.warn(
        "[ralph-loop] Warning: skipped invalid JSON line in progress.jsonl",
      );
    }
  }

  return { rawLineCount, parsedEntries };
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
