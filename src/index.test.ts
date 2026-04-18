import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { parseArgs } from "./index.ts";

describe("parseArgs", () => {
  it("parses required --prompt flag", () => {
    const args = parseArgs(["--prompt", "Build auth"]);
    expect(args.prompt).toBe("Build auth");
  });

  it("applies defaults — completeText is wrapped form of 'COMPLETE'", () => {
    const args = parseArgs(["--prompt", "Build auth"]);
    expect(args.maxIter).toBe(50);
    expect(args.progressEntries).toBe(10);
    expect(args.model).toBe("gpt-4.1");
    expect(args.completeText).toBe("<promise>COMPLETE</promise>");
    expect(args.verbose).toBe(false);
    expect(args.dir).toBe(process.cwd());
  });

  it("wraps --complete-text value in promise tags", () => {
    const args = parseArgs(["--prompt", "x", "--complete-text", "DONE"]);
    expect(args.completeText).toBe("<promise>DONE</promise>");
  });

  it("parses --max-iter", () => {
    const args = parseArgs(["--prompt", "x", "--max-iter", "5"]);
    expect(args.maxIter).toBe(5);
  });

  it("parses --progress-entries", () => {
    const args = parseArgs(["--prompt", "x", "--progress-entries", "3"]);
    expect(args.progressEntries).toBe(3);
  });

  it("parses --model", () => {
    const args = parseArgs(["--prompt", "x", "--model", "claude-sonnet-4.5"]);
    expect(args.model).toBe("claude-sonnet-4.5");
  });

  it("parses --verbose", () => {
    const args = parseArgs(["--prompt", "x", "--verbose"]);
    expect(args.verbose).toBe(true);
  });

  it("parses --dir", () => {
    const args = parseArgs(["--prompt", "x", "--dir", "/tmp/project"]);
    expect(args.dir).toBe(resolve("/tmp/project"));
  });

  it("throws when --prompt is missing", () => {
    expect(() => parseArgs([])).toThrow();
  });

  it("throws when --max-iter is not a number", () => {
    expect(() => parseArgs(["--prompt", "x", "--max-iter", "foo"])).toThrow(
      "--max-iter must be a positive integer",
    );
  });

  it("throws when --max-iter is zero or negative", () => {
    expect(() => parseArgs(["--prompt", "x", "--max-iter", "0"])).toThrow(
      "--max-iter must be a positive integer",
    );
    expect(() => parseArgs(["--prompt", "x", "--max-iter", "-5"])).toThrow(
      "--max-iter must be a positive integer",
    );
  });

  it("throws when --progress-entries is not a number", () => {
    expect(() =>
      parseArgs(["--prompt", "x", "--progress-entries", "abc"]),
    ).toThrow("--progress-entries must be a positive integer");
  });

  it("throws when --progress-entries is zero or negative", () => {
    expect(() =>
      parseArgs(["--prompt", "x", "--progress-entries", "-1"]),
    ).toThrow("--progress-entries must be a positive integer");
  });

  it("throws with a message when a flag is missing its value", () => {
    expect(() => parseArgs(["--prompt", "x", "--model"])).toThrow(
      "Missing value for --model",
    );
  });
});
