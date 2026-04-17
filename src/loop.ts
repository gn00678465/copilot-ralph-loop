import {
  CopilotClient,
  type CopilotSession,
  approveAll,
} from "@github/copilot-sdk";
import {
  buildIterationPrompt,
  buildSystemMessage,
  formatProgressForInjection,
  loadProgressFile,
} from "./prompt-builder.ts";
import type { CliArgs } from "./types.ts";

export function isComplete(output: string, completeText: string): boolean {
  const nonEmptyLines = output.split("\n").filter((l) => l.trim() !== "");
  if (nonEmptyLines.length === 0) return false;
  const lastLine = nonEmptyLines[nonEmptyLines.length - 1].trim();
  return lastLine === completeText.trim();
}

export function validateProgressAppend(
  linesBefore: number,
  linesAfter: number,
): boolean {
  return linesAfter === linesBefore + 1;
}

export async function runLoop(args: CliArgs): Promise<void> {
  const {
    prompt,
    dir,
    model,
    maxIter,
    progressEntries,
    completeText,
    verbose,
  } = args;

  let client: CopilotClient;
  try {
    client = new CopilotClient({ cwd: dir });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      console.error(
        "[ralph-loop] GitHub Copilot CLI not found.\n" +
          "Install it: gh extension install github/gh-copilot\n" +
          "Authenticate: gh auth login",
      );
    } else {
      console.error(
        "[ralph-loop] Failed to start Copilot client:",
        error.message,
      );
    }
    process.exit(1);
  }

  process.on("SIGINT", async () => {
    console.error("\n[ralph-loop] Interrupted. Shutting down...");
    await client.stop();
    process.exit(0);
  });

  let retried = false;

  for (let i = 1; i <= maxIter; i++) {
    if (verbose) console.error(`[ralph-loop] Iteration ${i}/${maxIter}`);

    // Re-read context each iteration to pick up agent-written updates
    const systemMessage = buildSystemMessage(dir, completeText);
    const progressBefore = loadProgressFile(dir);
    const progressText = formatProgressForInjection(
      progressBefore.parsedEntries,
      progressEntries,
    );
    const iterPrompt = buildIterationPrompt(prompt, progressText);

    let session: CopilotSession | undefined;
    try {
      session = await client.createSession({
        onPermissionRequest: approveAll,
        model,
        streaming: true,
        systemMessage: { content: systemMessage },
      });
      retried = false;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") {
        console.error(
          "[ralph-loop] Cannot connect to Copilot CLI. Make sure you are authenticated: gh auth login",
        );
        await client.stop();
        process.exit(1);
      }
      if (!retried) {
        retried = true;
        console.error("[ralph-loop] Session creation failed, retrying once...");
        try {
          session = await client.createSession({
            onPermissionRequest: approveAll,
            model,
            streaming: true,
            systemMessage: { content: systemMessage },
          });
        } catch (retryErr) {
          console.error(
            "[ralph-loop] Session creation failed after retry:",
            retryErr,
          );
          await client.stop();
          process.exit(1);
        }
      } else {
        console.error("[ralph-loop] Session creation failed:", err);
        await client.stop();
        process.exit(1);
      }
    }

    let output = "";
    session.on("assistant.message_delta", (event) => {
      process.stdout.write(event.data.deltaContent);
      output += event.data.deltaContent;
    });
    session.on("session.idle", () => {
      process.stdout.write("\n");
    });
    session.on("session.error", (event) => {
      console.error("[ralph-loop] Session error:", event.data);
    });

    await session.sendAndWait({ prompt: iterPrompt });

    const progressAfter = loadProgressFile(dir);
    if (
      !validateProgressAppend(
        progressBefore.rawLineCount,
        progressAfter.rawLineCount,
      )
    ) {
      console.warn(
        "[ralph-loop] Warning: agent did not append to progress.jsonl",
      );
    }

    if (isComplete(output, completeText)) {
      if (verbose) console.error("[ralph-loop] Task complete.");
      await client.stop();
      process.exit(0);
    }

    if (i < maxIter) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.error(`[ralph-loop] Reached max iterations (${maxIter}). Exiting.`);
  await client.stop();
  process.exit(1);
}
