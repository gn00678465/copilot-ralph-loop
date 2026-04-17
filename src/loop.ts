import { CopilotClient, approveAll } from "@github/copilot-sdk"
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
