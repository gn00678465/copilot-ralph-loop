import { cancel, intro, log, outro, spinner } from "@clack/prompts";
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
    timeout,
    verbose,
  } = args;

  intro(" ralph-loop ");

  let client: CopilotClient;
  try {
    client = new CopilotClient({ cwd: dir });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      log.error(
        "GitHub Copilot CLI not found.\n" +
          "Install it: gh extension install github/gh-copilot\n" +
          "Authenticate: gh auth login",
      );
    } else {
      log.error(`Failed to start Copilot client: ${error.message}`);
    }
    process.exit(1);
  }

  let activeSpinner: ReturnType<typeof spinner> | null = null;

  process.on("SIGINT", async () => {
    activeSpinner?.stop();
    cancel("Interrupted. Shutting down...");
    await client.stop();
    process.exit(0);
  });

  for (let i = 1; i <= maxIter; i++) {
    let retried = false;

    const systemMessage = buildSystemMessage(dir, completeText);
    const progressBefore = loadProgressFile(dir);
    const progressText = formatProgressForInjection(
      progressBefore.parsedEntries,
      progressEntries,
    );
    const iterPrompt = buildIterationPrompt(prompt, progressText);

    const s = spinner();
    activeSpinner = s;
    s.start(`Iteration ${i}/${maxIter}${verbose ? " — creating session" : ""}`);

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
        s.stop();
        log.error(
          "Cannot connect to Copilot CLI. Make sure you are authenticated: gh auth login",
        );
        await client.stop();
        process.exit(1);
      }
      if (!retried) {
        retried = true;
        s.message("Session creation failed — retrying once...");
        try {
          session = await client.createSession({
            onPermissionRequest: approveAll,
            model,
            streaming: true,
            systemMessage: { content: systemMessage },
          });
        } catch (retryErr) {
          s.stop();
          log.error(`Session creation failed after retry: ${retryErr}`);
          await client.stop();
          process.exit(1);
        }
      } else {
        s.stop();
        log.error(`Session creation failed: ${err}`);
        await client.stop();
        process.exit(1);
      }
    }

    if (verbose) s.message(`Iteration ${i}/${maxIter} — waiting for response`);

    let output = "";
    let firstDelta = true;

    session.on("assistant.message_delta", (event) => {
      if (firstDelta) {
        s.stop(`Iteration ${i}/${maxIter}`);
        activeSpinner = null;
        firstDelta = false;
      }
      process.stdout.write(event.data.deltaContent);
      output += event.data.deltaContent;
    });

    session.on("session.idle", () => {
      if (!firstDelta) process.stdout.write("\n");
    });

    session.on("session.error", (event) => {
      log.error(`Session error: ${event.data}`);
    });

    try {
      await session.sendAndWait({ prompt: iterPrompt }, timeout);
    } catch (err) {
      if (!firstDelta) {
        // Partial output was already streamed — treat as incomplete iteration
        log.warn(`Session ended early: ${(err as Error).message}`);
      } else {
        s.stop(`Iteration ${i}/${maxIter} — session error`);
        activeSpinner = null;
        log.error(`Session failed: ${(err as Error).message}`);
        await client.stop();
        process.exit(1);
      }
    }

    if (firstDelta) {
      s.stop(`Iteration ${i}/${maxIter} — no output`);
      activeSpinner = null;
    }

    const progressAfter = loadProgressFile(dir);
    if (
      !validateProgressAppend(
        progressBefore.rawLineCount,
        progressAfter.rawLineCount,
      )
    ) {
      log.warn("Agent did not append to progress.jsonl");
    }

    if (isComplete(output, completeText)) {
      outro("Task complete.");
      await client.stop();
      process.exit(0);
    }

    if (i < maxIter) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  log.error(`Reached max iterations (${maxIter}). Exiting.`);
  outro("Stopping.");
  await client.stop();
  process.exit(1);
}
