import { cancel, intro, log, outro, spinner } from "@clack/prompts";
import {
  CopilotClient,
  type CopilotSession,
  type PermissionHandler,
  type PermissionRequest,
  approveAll,
} from "@github/copilot-sdk";
import {
  buildIterationPrompt,
  buildSystemMessage,
  formatProgressForInjection,
  loadProgressFile,
} from "./prompt-builder.ts";
import type {
  CliArgs,
  IterationPromptContext,
  ProgressState,
} from "./types.ts";

export function isComplete(output: string, completeText: string): boolean {
  const nonEmptyLines = output.split("\n").filter((l) => l.trim() !== "");
  if (nonEmptyLines.length === 0) return false;
  const lastLine = nonEmptyLines[nonEmptyLines.length - 1].trim();
  return lastLine === completeText.trim();
}

export function validateProgressAppend(
  before: ProgressState,
  after: ProgressState,
): boolean {
  if (after.lines.length < before.lines.length) return false;
  for (let i = 0; i < before.lines.length; i++) {
    if (after.lines[i] !== before.lines[i]) return false;
  }
  return (
    after.totalLineCount === before.totalLineCount + 1 &&
    after.parsedEntries.length === before.parsedEntries.length + 1
  );
}

export function createPermissionHandler(dangerous: boolean): PermissionHandler {
  if (dangerous) return approveAll;
  return (req: PermissionRequest) => {
    log.warn(
      `Permission denied (${req.kind}). Re-run with --dangerous to auto-approve.`,
    );
    return { kind: "denied-interactively-by-user" as const };
  };
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
    dangerous,
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

  const onPermissionRequest = createPermissionHandler(dangerous);

  for (let i = 1; i <= maxIter; i++) {
    const systemMessage = buildSystemMessage(dir, completeText);
    const progressBefore = loadProgressFile(dir);
    const progressText = formatProgressForInjection(
      progressBefore.parsedEntries,
      progressEntries,
    );
    const iterPromptContext: IterationPromptContext = {
      currentIteration: i,
      maxIterations: maxIter,
      progressEntryCount: progressBefore.parsedEntries.length,
      lastProgressSummary:
        progressBefore.parsedEntries.at(-1)?.summary ?? null,
      progressText,
    };
    const iterPrompt = buildIterationPrompt(prompt, iterPromptContext);

    const s = spinner();
    activeSpinner = s;
    s.start(`Iteration ${i}/${maxIter}${verbose ? " — creating session" : ""}`);

    let session: CopilotSession | undefined;
    try {
      session = await client.createSession({
        onPermissionRequest,
        model,
        streaming: true,
        systemMessage: { content: systemMessage },
      });
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
      s.message("Session creation failed — retrying once...");
      try {
        session = await client.createSession({
          onPermissionRequest,
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
    }

    if (verbose) s.message(`Iteration ${i}/${maxIter} — waiting for response`);

    let output = "";
    let firstDelta = true;

    // All catch branches above call process.exit — session is always assigned here
    if (!session) process.exit(1);
    const activeSession = session;

    activeSession.on("assistant.message_delta", (event) => {
      if (firstDelta) {
        s.stop(`Iteration ${i}/${maxIter}`);
        activeSpinner = null;
        firstDelta = false;
      }
      process.stdout.write(event.data.deltaContent);
      output += event.data.deltaContent;
    });

    activeSession.on("session.idle", () => {
      if (!firstDelta) process.stdout.write("\n");
    });

    activeSession.on("session.error", (event) => {
      log.error(`Session error: ${event.data}`);
    });

    let sendErr: Error | undefined;
    try {
      await activeSession.sendAndWait({ prompt: iterPrompt }, timeout);
    } catch (err) {
      sendErr = err as Error;
    } finally {
      // Always disconnect before reading progress or starting next iteration
      try {
        await activeSession.disconnect();
      } catch {}
    }

    if (sendErr) {
      if (!firstDelta) {
        // Partial output was already streamed — treat as incomplete iteration
        log.warn(`Session ended early: ${sendErr.message}`);
      } else {
        s.stop(`Iteration ${i}/${maxIter} — session error`);
        activeSpinner = null;
        log.error(`Session failed: ${sendErr.message}`);
        await client.stop();
        process.exit(1);
      }
    }

    if (firstDelta) {
      s.stop(`Iteration ${i}/${maxIter} — no output`);
      activeSpinner = null;
    }

    // Session is disconnected before reading progress (eliminates post-send race)
    const progressAfter = loadProgressFile(dir);
    if (!validateProgressAppend(progressBefore, progressAfter)) {
      log.error(
        "Agent did not append exactly one valid progress entry — aborting",
      );
      await client.stop();
      process.exit(1);
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
