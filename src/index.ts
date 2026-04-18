#!/usr/bin/env bun
import { resolve } from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { runLoop } from "./loop.ts";
import { wrapCompleteText } from "./prompt-builder.ts";
import type { CliArgs } from "./types.ts";

function positiveInt(flag: string) {
  return (v: string): number => {
    const n = Number.parseInt(v, 10);
    if (!/^\d+$/.test(v) || n <= 0) {
      throw new InvalidArgumentError(
        `${flag} must be a positive integer, got: ${v}`,
      );
    }
    return n;
  };
}

function nonNegativeInt(flag: string) {
  return (v: string): number => {
    if (!/^\d+$/.test(v)) {
      throw new InvalidArgumentError(
        `${flag} must be a non-negative integer, got: ${v}`,
      );
    }
    return Number.parseInt(v, 10);
  };
}

export function parseArgs(argv: string[]): CliArgs {
  const program = new Command()
    .name("ralph-loop")
    .description("Autonomous agent loop using GitHub Copilot")
    .version("1.0.0", "-V, --version")
    .exitOverride()
    .requiredOption("-p, --prompt <text>", "Required: task description")
    .option("--dir <path>", "Target project path (default: cwd)")
    .option("--model <name>", "Model to use", "gpt-5.4")
    .option("--max-iter <n>", "Safety limit", positiveInt("--max-iter"), 50)
    .option(
      "--progress-entries <n>",
      "Recent JSONL entries to inject (0 = none)",
      nonNegativeInt("--progress-entries"),
      10,
    )
    .option(
      "--complete-text <value>",
      "Inner completion value (default: COMPLETE)",
      "COMPLETE",
    )
    .option(
      "--timeout <n>",
      "sendAndWait timeout in seconds",
      positiveInt("--timeout"),
      300,
    )
    .option("--verbose", "Debug output", false)
    .option(
      "--dangerous",
      "Auto-approve all Copilot permission requests (shell, file, network). Required for agent to act.",
      false,
    );

  program.parse(argv, { from: "user" });
  const opts = program.opts<{
    prompt: string;
    dir: string | undefined;
    model: string;
    maxIter: number;
    progressEntries: number;
    completeText: string;
    timeout: number;
    verbose: boolean;
    dangerous: boolean;
  }>();

  return {
    prompt: opts.prompt,
    dir: resolve(opts.dir ?? process.cwd()),
    model: opts.model,
    maxIter: opts.maxIter,
    progressEntries: opts.progressEntries,
    completeText: wrapCompleteText(opts.completeText),
    timeout: opts.timeout * 1000,
    verbose: opts.verbose,
    dangerous: opts.dangerous,
  };
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CommanderError) {
      if (
        err.code === "commander.helpDisplayed" ||
        err.code === "commander.version"
      ) {
        process.exit(0);
      }
      process.exit(err.exitCode ?? 1);
    }
    console.error(`[ralph-loop] ${(err as Error).message}`);
    process.exit(1);
  }
  await runLoop(args);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("[ralph-loop] Fatal error:", err);
    process.exit(1);
  });
}
