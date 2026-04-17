#!/usr/bin/env bun
import { resolve } from "node:path";
import { runLoop } from "./loop.ts";
import { wrapCompleteText } from "./prompt-builder.ts";
import type { CliArgs } from "./types.ts";

export function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--verbose") {
      args.verbose = true;
      i++;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      args[key] = value;
      i += 2;
    } else {
      i++;
    }
  }

  if (!args.prompt) {
    console.error("Usage: ralph-loop --prompt <task> [options]");
    console.error("  --prompt <text>           Required: task description");
    console.error(
      "  --dir <path>              Target project path (default: cwd)",
    );
    console.error(
      "  --model <name>            Model to use (default: gpt-4.1)",
    );
    console.error("  --max-iter <n>            Safety limit (default: 50)");
    console.error(
      "  --progress-entries <n>    Recent JSONL entries to inject (default: 10)",
    );
    console.error(
      "  --complete-text <value>   Inner completion value (default: COMPLETE)",
    );
    console.error(
      "                            Wrapped as <promise>VALUE</promise>",
    );
    console.error("  --verbose                 Debug output");
    throw new Error("--prompt is required");
  }

  return {
    prompt: args.prompt as string,
    dir: resolve((args.dir as string) ?? process.cwd()),
    model: (args.model as string) ?? "gpt-4.1",
    maxIter: args["max-iter"]
      ? Number.parseInt(args["max-iter"] as string, 10)
      : 50,
    progressEntries: args["progress-entries"]
      ? Number.parseInt(args["progress-entries"] as string, 10)
      : 10,
    completeText: wrapCompleteText(
      (args["complete-text"] as string) ?? "COMPLETE",
    ),
    verbose: (args.verbose as boolean) ?? false,
  };
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch {
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
