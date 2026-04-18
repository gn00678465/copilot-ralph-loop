import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isComplete,
  validateProgressAppend,
  validateProgressEntryForIteration,
} from "./loop.ts";
import type { ProgressState } from "./types.ts";

// ── isComplete ────────────────────────────────────────────────────────────────

describe("isComplete", () => {
  it("returns true when last non-empty line matches completeText exactly", () => {
    const output = "did some work\n\n<promise>COMPLETE</promise>\n";
    expect(isComplete(output, "<promise>COMPLETE</promise>")).toBe(true);
  });

  it("returns false when completeText appears in the middle", () => {
    const output = "output <promise>COMPLETE</promise> and more text";
    expect(isComplete(output, "<promise>COMPLETE</promise>")).toBe(false);
  });

  it("returns false when output is empty", () => {
    expect(isComplete("", "<promise>COMPLETE</promise>")).toBe(false);
  });

  it("is case-sensitive", () => {
    const output = "<PROMISE>COMPLETE</PROMISE>";
    expect(isComplete(output, "<promise>COMPLETE</promise>")).toBe(false);
  });

  it("trims whitespace from last line and completeText before comparing", () => {
    const output = "work done\n  <promise>COMPLETE</promise>  \n";
    expect(isComplete(output, "  <promise>COMPLETE</promise>  ")).toBe(true);
  });

  it("returns false when completeText appears mid-response followed by more output", () => {
    const output =
      "Output `<promise>COMPLETE</promise>` when done.\n\nI will now proceed...";
    expect(isComplete(output, "<promise>COMPLETE</promise>")).toBe(false);
  });
});

// ── validateProgressAppend ────────────────────────────────────────────────────

const makeLines = (n: number) =>
  Array.from({ length: n }, (_, i) => `line-${i}`);
const ps = (
  total: number,
  parsed: number,
  lines?: string[],
): ProgressState => ({
  totalLineCount: total,
  lines: lines ?? makeLines(total),
  parsedEntries: Array(parsed).fill({}),
});

describe("validateProgressAppend", () => {
  it("returns true when exactly one line added and it parses as valid entry", () => {
    expect(validateProgressAppend(ps(5, 5), ps(6, 6))).toBe(true);
  });

  it("returns false when no lines added", () => {
    expect(validateProgressAppend(ps(5, 5), ps(5, 5))).toBe(false);
  });

  it("returns false when one raw line added but invalid JSON (malformed append)", () => {
    expect(validateProgressAppend(ps(5, 5), ps(6, 5))).toBe(false);
  });

  it("returns false when two raw lines added (valid + malformed)", () => {
    expect(validateProgressAppend(ps(5, 5), ps(7, 6))).toBe(false);
  });

  it("returns false when line count decreased", () => {
    expect(validateProgressAppend(ps(5, 5), ps(3, 3))).toBe(false);
  });

  it("returns false when two raw lines added including one blank (extra blank line)", () => {
    // totalLineCount +2 even though non-empty lines only +1
    const before = ps(5, 5, makeLines(5));
    const after: ProgressState = {
      totalLineCount: 7, // +2 raw lines
      lines: [...makeLines(5), "line-5"], // only +1 non-empty
      parsedEntries: Array(6).fill({}),
    };
    expect(validateProgressAppend(before, after)).toBe(false);
  });

  it("returns false when file is overwritten with different content (prefix violated)", () => {
    const before = ps(2, 2, ["A", "B"]);
    const after = ps(3, 3, ["C", "D", "E"]);
    expect(validateProgressAppend(before, after)).toBe(false);
  });

  it("returns false when file is truncated then re-appended (prefix violated at index 1)", () => {
    const before = ps(2, 2, ["A", "B"]);
    const after = ps(3, 3, ["A", "X", "C"]);
    expect(validateProgressAppend(before, after)).toBe(false);
  });
});

const makeProgressEntry = (iteration: number) => ({
  iteration,
  timestamp: "2026-01-01T00:00:00Z",
  summary: `did work ${iteration}`,
  files: [],
  learnings: [],
});

describe("validateProgressEntryForIteration", () => {
  it("returns false when append validation fails before checking the iteration", () => {
    const before: ProgressState = {
      totalLineCount: 1,
      lines: [JSON.stringify(makeProgressEntry(1))],
      parsedEntries: [makeProgressEntry(1)],
    };

    expect(validateProgressEntryForIteration(before, before, 1)).toBe(false);
  });

  it("returns false when the appended entry iteration does not match the active iteration", () => {
    const before: ProgressState = {
      totalLineCount: 1,
      lines: [JSON.stringify(makeProgressEntry(1))],
      parsedEntries: [makeProgressEntry(1)],
    };
    const after: ProgressState = {
      totalLineCount: 2,
      lines: [
        JSON.stringify(makeProgressEntry(1)),
        JSON.stringify(makeProgressEntry(99)),
      ],
      parsedEntries: [makeProgressEntry(1), makeProgressEntry(99)],
    };

    expect(validateProgressEntryForIteration(before, after, 2)).toBe(false);
  });

  it("returns true when the appended entry iteration matches the active iteration", () => {
    const before: ProgressState = {
      totalLineCount: 1,
      lines: [JSON.stringify(makeProgressEntry(1))],
      parsedEntries: [makeProgressEntry(1)],
    };
    const after: ProgressState = {
      totalLineCount: 2,
      lines: [
        JSON.stringify(makeProgressEntry(1)),
        JSON.stringify(makeProgressEntry(2)),
      ],
      parsedEntries: [makeProgressEntry(1), makeProgressEntry(2)],
    };

    expect(validateProgressEntryForIteration(before, after, 2)).toBe(true);
  });
});

// ── createPermissionHandler and runLoop orchestration (mocked SDK) ────────────
//
// mock.module calls are hoisted above imports by bun:test.
// Only SDK and @clack/prompts are mocked — prompt-builder uses its real
// implementation so it does not contaminate prompt-builder.test.ts.

const disconnectMock = mock(async () => {});
const sendAndWaitMock = mock(async () => undefined);
const clientStopMock = mock(async () => []);
const logWarnMock = mock((_msg: string) => {});
const logErrorMock = mock((_msg: string) => {});

// Stores event handlers registered by runLoop so tests can trigger them
const eventHandlers: Map<string, (event: unknown) => void> = new Map();

const sessionObject = {
  on: (type: string, handler: (event: unknown) => void) => {
    eventHandlers.set(type, handler);
    return () => {};
  },
  sendAndWait: sendAndWaitMock,
  disconnect: disconnectMock,
};

const createSessionMock = mock(async () => sessionObject);

mock.module("@github/copilot-sdk", () => ({
  CopilotClient: class MockCopilotClient {
    createSession = createSessionMock;
    stop = clientStopMock;
  },
  approveAll: () => ({ kind: "approved" as const }),
}));

mock.module("@clack/prompts", () => ({
  intro: () => {},
  outro: () => {},
  cancel: () => {},
  log: { warn: logWarnMock, error: logErrorMock, info: () => {} },
  spinner: () => ({ start: () => {}, stop: () => {}, message: () => {} }),
}));

import { createPermissionHandler, runLoop } from "./loop.ts";

const baseArgs = {
  prompt: "do work",
  dir: process.cwd(),
  model: "gpt-test",
  maxIter: 1,
  progressEntries: 0,
  completeText: "<promise>COMPLETE</promise>",
  timeout: 5000,
  verbose: false,
  dangerous: false,
};

// ── createPermissionHandler ───────────────────────────────────────────────────

describe("createPermissionHandler", () => {
  it("returns approveAll-equivalent when dangerous=true", () => {
    const handler = createPermissionHandler(true);
    const result = handler({ kind: "shell" }, { sessionId: "s1" });
    expect(result).toMatchObject({ kind: "approved" });
  });

  it("denies all permission kinds when dangerous=false", () => {
    const handler = createPermissionHandler(false);
    for (const kind of ["shell", "write", "read", "mcp", "url"] as const) {
      const result = handler({ kind }, { sessionId: "s1" });
      expect(result).toMatchObject({ kind: "denied-interactively-by-user" });
    }
  });
});

// ── runLoop orchestration ─────────────────────────────────────────────────────

function makeExitSpy() {
  return spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);
}

function resetMocks() {
  disconnectMock.mockReset();
  sendAndWaitMock.mockReset();
  clientStopMock.mockReset();
  createSessionMock.mockReset();
  logWarnMock.mockReset();
  logErrorMock.mockReset();
  createSessionMock.mockResolvedValue(sessionObject);
  clientStopMock.mockResolvedValue([]);
  eventHandlers.clear();
}

describe("runLoop orchestration", () => {
  let exitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    resetMocks();
    exitSpy = makeExitSpy();
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it("disconnect is called in finally when sendAndWait throws with no output", async () => {
    sendAndWaitMock.mockRejectedValueOnce(new Error("SDK timeout"));

    await expect(runLoop(baseArgs)).rejects.toThrow("process.exit");

    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("disconnect is called and loop continues when sendAndWait throws after partial output", async () => {
    sendAndWaitMock.mockImplementationOnce(async () => {
      // Trigger delta event to set firstDelta = false before the throw
      const handler = eventHandlers.get("assistant.message_delta");
      handler?.({ data: { deltaContent: "partial output" } });
      throw new Error("SDK timeout");
    });

    await expect(runLoop(baseArgs)).rejects.toThrow("process.exit");

    // disconnect must be called despite the throw
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it("uses approve handler when dangerous=true", async () => {
    sendAndWaitMock.mockResolvedValueOnce(undefined);

    await expect(runLoop({ ...baseArgs, dangerous: true })).rejects.toThrow(
      "process.exit",
    );

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    const [config] = createSessionMock.mock.calls[0] as unknown as [
      { onPermissionRequest: (r: { kind: string }) => unknown },
    ];
    expect(config.onPermissionRequest({ kind: "shell" })).toMatchObject({
      kind: "approved",
    });
  });

  it("uses deny handler when dangerous=false", async () => {
    sendAndWaitMock.mockResolvedValueOnce(undefined);

    await expect(runLoop({ ...baseArgs, dangerous: false })).rejects.toThrow(
      "process.exit",
    );

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    const [config] = createSessionMock.mock.calls[0] as unknown as [
      { onPermissionRequest: (r: { kind: string }) => unknown },
    ];
    expect(config.onPermissionRequest({ kind: "shell" })).toMatchObject({
      kind: "denied-interactively-by-user",
    });
  });
});

// ── runLoop progress validation ───────────────────────────────────────────────

const APPEND_ERROR =
  "Agent did not append exactly one valid progress entry for the current iteration — aborting";

const validEntry = JSON.stringify({
  iteration: 1,
  timestamp: "2026-01-01T00:00:00Z",
  summary: "did work",
  files: [],
  learnings: [],
});

describe("runLoop progress validation", () => {
  let tmpTestDir: string;
  let progressFile: string;
  let exitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpTestDir = mkdtempSync(join(tmpdir(), "loop-progress-"));
    progressFile = join(tmpTestDir, "progress.jsonl");
    resetMocks();
    exitSpy = makeExitSpy();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    rmSync(tmpTestDir, { recursive: true, force: true });
  });

  it("hard-fails when agent appends nothing", async () => {
    sendAndWaitMock.mockResolvedValueOnce(undefined);

    await expect(runLoop({ ...baseArgs, dir: tmpTestDir })).rejects.toThrow(
      "process.exit",
    );

    expect(logErrorMock).toHaveBeenCalledWith(APPEND_ERROR);
  });

  it("does not hard-fail when agent appends exactly one valid entry", async () => {
    sendAndWaitMock.mockImplementationOnce(async () => {
      writeFileSync(progressFile, `${validEntry}\n`);
    });

    await expect(runLoop({ ...baseArgs, dir: tmpTestDir })).rejects.toThrow(
      "process.exit",
    );

    const appendErrors = logErrorMock.mock.calls.filter(
      ([msg]) => msg === APPEND_ERROR,
    );
    expect(appendErrors).toHaveLength(0);
  });

  it("hard-fails when agent appends one valid entry plus one malformed non-empty line", async () => {
    sendAndWaitMock.mockImplementationOnce(async () => {
      writeFileSync(progressFile, `${validEntry}\nBAD LINE\n`);
    });

    await expect(runLoop({ ...baseArgs, dir: tmpTestDir })).rejects.toThrow(
      "process.exit",
    );

    expect(logErrorMock).toHaveBeenCalledWith(APPEND_ERROR);
  });

  it("hard-fails when agent appends an entry for the wrong iteration", async () => {
    sendAndWaitMock.mockImplementationOnce(async () => {
      writeFileSync(progressFile, `${JSON.stringify(makeProgressEntry(99))}\n`);
    });

    await expect(runLoop({ ...baseArgs, dir: tmpTestDir })).rejects.toThrow(
      "process.exit",
    );

    expect(logErrorMock).toHaveBeenCalledWith(APPEND_ERROR);
  });

  it("hard-fails when agent appends valid entry plus trailing blank line", async () => {
    sendAndWaitMock.mockImplementationOnce(async () => {
      // totalLineCount becomes 2 — fails the +1 raw-line check
      writeFileSync(progressFile, `${validEntry}\n\n`);
    });

    await expect(runLoop({ ...baseArgs, dir: tmpTestDir })).rejects.toThrow(
      "process.exit",
    );

    expect(logErrorMock).toHaveBeenCalledWith(APPEND_ERROR);
  });

  it("hard-fails when agent appends only a malformed non-empty line", async () => {
    sendAndWaitMock.mockImplementationOnce(async () => {
      writeFileSync(progressFile, "BAD LINE\n");
    });

    await expect(runLoop({ ...baseArgs, dir: tmpTestDir })).rejects.toThrow(
      "process.exit",
    );

    expect(logErrorMock).toHaveBeenCalledWith(APPEND_ERROR);
  });

  it("hard-fails when agent appends schema-invalid but parseable JSON", async () => {
    sendAndWaitMock.mockImplementationOnce(async () => {
      writeFileSync(progressFile, `${JSON.stringify({ foo: "bar" })}\n`);
    });

    await expect(runLoop({ ...baseArgs, dir: tmpTestDir })).rejects.toThrow(
      "process.exit",
    );

    expect(logErrorMock).toHaveBeenCalledWith(APPEND_ERROR);
  });

  it("hard-fails when agent overwrites progress file instead of appending (prefix violated)", async () => {
    writeFileSync(progressFile, `${validEntry}\n`);
    const differentEntry = JSON.stringify({
      iteration: 99,
      timestamp: "2026-02-01T00:00:00Z",
      summary: "overwrite",
      files: [],
      learnings: [],
    });
    sendAndWaitMock.mockImplementationOnce(async () => {
      writeFileSync(progressFile, `${differentEntry}\n${differentEntry}\n`);
    });

    await expect(runLoop({ ...baseArgs, dir: tmpTestDir })).rejects.toThrow(
      "process.exit",
    );

    expect(logErrorMock).toHaveBeenCalledWith(APPEND_ERROR);
  });
});
