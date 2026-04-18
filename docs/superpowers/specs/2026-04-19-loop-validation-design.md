# Loop Validation Redesign

## Problem

`ralph-loop` already supports iterative execution with file-based memory, but the current loop contract is too permissive for reliable validation. An agent can often finish the entire task in the first iteration, which makes it hard to prove that:

1. the loop actually hands work off across iterations,
2. `progress.jsonl` is functioning as real memory rather than a passive log, and
3. final completion only happens after explicit verification.

The current append-only validation is strong for file integrity, but it does not yet enforce a stronger iteration narrative or a clear final verification round.

## Goals

1. Preserve the existing execution model: one execution, one fresh Copilot session per iteration, file-based memory in the target project.
2. Redesign the per-iteration contract so agents understand loop state, handoff responsibilities, and the completion gate.
3. Validate `progress.jsonl` as cross-iteration memory, not just as append-only JSONL.
4. Prove the redesign with a resettable demo project that intentionally exercises multiple iterations.
5. Avoid breaking the current CLI shape unless a later implementation step proves it necessary.

## Non-Goals

1. Replacing `progress.jsonl` with another storage mechanism.
2. Introducing a large new CLI surface area up front.
3. Forcing every task in every project to take multiple iterations.
4. Turning the loop into a workflow engine with custom stage configuration.

## Current State Summary

- `runLoop()` creates a fresh session each iteration and rebuilds the system message every time.
- Iteration prompts currently consist of the task plus recent progress injection.
- `validateProgressAppend(before, after)` already guarantees append-only integrity:
  - prior non-empty lines remain unchanged,
  - raw line count increases by exactly one,
  - parsed valid entries increase by exactly one.
- Completion is detected only by the last non-empty output line matching the wrapped completion text.

This is a solid base, but it does not yet strongly direct staged work or make multi-iteration validation easy to demonstrate.

## Proposed Design

### 1. Iteration Contract Redesign

Keep the fresh-session architecture, but upgrade each iteration prompt from a generic task reminder into an explicit iteration contract.

Each iteration prompt should include:

1. **Loop state**
   - current iteration number,
   - maximum iteration count,
   - current `progress.jsonl` entry count,
   - the most recent progress summary when available.
2. **Iteration objective**
   - make clear that the agent is continuing an in-progress loop,
   - require the agent to advance one concrete milestone for the current iteration rather than opportunistically collapsing the entire task.
3. **Required handoff**
   - if the task is not complete, the agent must leave a useful handoff in `progress.jsonl` for the next iteration.
4. **Completion gate**
   - the wrapped completion text may only appear when the task is fully complete and the final verification step has been performed.

The redesign changes the quality of instructions, not the underlying session model.

### 2. `progress.jsonl` as Verifiable Memory

Retain the one-line-per-entry JSONL format and current schema shape, but strengthen its semantic contract.

Each entry must continue to provide:

- `summary`: what was completed this iteration,
- `files`: which files changed,
- `learnings`: the non-obvious details the next iteration needs.

Additional design expectations:

1. **One loop iteration maps to one progress entry**
   - the new entry should align with the current loop iteration rather than just any integer.
2. **`learnings` becomes a required handoff surface**
   - not just optional commentary,
   - should help the next iteration resume without re-planning from scratch.
3. **The final entry must be a verification-aware entry**
   - it should record the validation commands or outcomes that justify completion.

Append-only validation remains the hard integrity guard. The redesign adds stronger meaning to each valid append.

### 3. Demo Validation Scenario

The demo project at `D:\Projects\ralph-loop-demo` becomes a deliberate validation target rather than a convenience smoke test.

#### Reset strategy

Before validation:

- remove previously completed demo implementation artifacts,
- reset or recreate `progress.jsonl`,
- keep project convention files such as `AGENTS.md`,
- leave the project in a clean starting state.

#### Multi-iteration task shape

The demo task should naturally split into at least three stages:

1. **Iteration 1**
   - create or restore the minimal project skeleton and configuration.
2. **Iteration 2**
   - implement the actual source files and matching tests.
3. **Iteration 3**
   - run verification commands, confirm outcomes, write the final progress entry, and only then emit the completion signal.

The exact demo feature can stay small. The important property is that the work is clearly staged and the last stage is verification.

#### Validation evidence

A successful demo run must provide all of the following:

1. terminal output showing multiple actual iterations,
2. `progress.jsonl` with one new valid entry per iteration,
3. resulting project files that match the task,
4. a final progress entry that records verification results,
5. completion text emitted only as the last non-empty line of the final verification iteration.

#### Failure conditions

The validation should be considered failed if any of the following happen:

- the task completes in the first iteration,
- `progress.jsonl` has fewer entries than expected,
- a final progress entry lacks verification evidence,
- verification commands were not actually run,
- completion text appears before the final verification round,
- append-only validation fails at any point.

### 4. Compatibility and Risk Control

This redesign should preserve current ergonomics where possible.

#### Compatibility

- Keep the current CLI flags and defaults unchanged initially.
- Keep the wrapped completion text convention unchanged.
- Keep JSONL as the memory file format.
- Continue allowing genuinely small tasks to finish in one iteration when appropriate.

The redesign improves iteration clarity without requiring an immediate CLI contract change.

#### Risk control

Implementation should prefer explicit signals over fragile heuristics:

- preserve `validateProgressAppend()` as the hard integrity check,
- add iteration-to-progress alignment checks where practical,
- avoid using vague natural-language keyword matching as the primary validator,
- rely on actual command execution results for final verification evidence.

## Implementation Touchpoints

The expected implementation surface is:

| File | Purpose |
|---|---|
| `src\prompt-builder.ts` | Expand iteration prompt generation to include loop state, handoff rules, and completion gate wording |
| `src\loop.ts` | Pass richer iteration context and add semantic progress checks around each append |
| `src\types.ts` | Add any prompt/context types needed to keep the contract explicit and type-safe |
| `templates\default-prompt.md` | Clarify agent responsibilities for staged execution, handoff, and final completion |
| `src\*.test.ts` | Cover prompt generation, progress alignment, and loop completion behavior |
| `D:\Projects\ralph-loop-demo` | Reset demo content and define the staged validation scenario |

## Success Criteria

The redesign is complete when all of the following are true:

1. the loop code emits the new iteration-aware prompt contract,
2. the demo project has been reset to a clean validation baseline,
3. a real `ralph-loop` run executes at least three iterations,
4. each iteration appends exactly one valid progress entry,
5. the entries tell a coherent staged story from setup to implementation to verification,
6. the last entry explicitly captures verification results,
7. the wrapped completion text appears only as the last non-empty line of the final iteration.

## Recommendation

Implement the redesign by strengthening the iteration contract and demo scenario first, while preserving the current CLI surface. This provides a meaningful proof of loop behavior with the smallest compatibility risk. If later testing shows that general tasks need an explicit staged mode, that can be added as a follow-up rather than being bundled into this change.
