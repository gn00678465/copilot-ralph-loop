import { describe, expect, it } from "bun:test";
import { isComplete, validateProgressAppend } from "./loop.ts";

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

describe("validateProgressAppend", () => {
  it("returns true when line count increased by exactly 1", () => {
    expect(validateProgressAppend(5, 6)).toBe(true);
  });

  it("returns false when line count did not change", () => {
    expect(validateProgressAppend(5, 5)).toBe(false);
  });

  it("returns false when line count increased by more than 1", () => {
    expect(validateProgressAppend(5, 7)).toBe(false);
  });

  it("returns false when line count decreased", () => {
    expect(validateProgressAppend(5, 3)).toBe(false);
  });
});
