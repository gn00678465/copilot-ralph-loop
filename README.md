# ralph-loop

Autonomous agent loop CLI built on the [GitHub Copilot SDK](https://github.com/copilot-extensions/copilot-sdk.js). Sends a task prompt to Copilot, runs multiple iterations until the agent outputs a completion signal, and tracks progress in a `progress.jsonl` file.

## Requirements

- [Bun](https://bun.sh/) >= 1.3
- GitHub Copilot access

## Installation

```bash
bun install
```

## Usage

```bash
ralph-loop --prompt "Your task description" [options]
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `-p, --prompt <text>` | required | Task description sent to the agent |
| `--dir <path>` | cwd | Target project directory |
| `--model <name>` | `gpt-5.4` | Model to use |
| `--max-iter <n>` | `50` | Maximum iteration safety limit |
| `--progress-entries <n>` | `10` | Recent `progress.jsonl` entries injected per iteration |
| `--timeout <n>` | `300` | Per-iteration timeout in seconds |
| `--complete-text <value>` | `COMPLETE` | Inner completion signal value |
| `--dangerous` | `false` | Auto-approve all Copilot permission requests (shell, file, network) |
| `--verbose` | `false` | Debug output |

### Example

```bash
ralph-loop \
  --dir /path/to/project \
  --max-iter 5 \
  --dangerous \
  --prompt "Read AGENTS.md and complete the milestones one per iteration."
```

## How It Works

1. Each iteration builds a prompt from the task description and recent `progress.jsonl` entries.
2. The prompt is sent to Copilot via `sendAndWait`.
3. The agent writes one `progress.jsonl` entry per iteration (append-only, validated).
4. The loop exits when the agent's last output line matches `<promise>COMPLETE</promise>`, or when `--max-iter` is reached.

## Development

```bash
bun test          # run tests
bun run typecheck # TypeScript check
bun run lint      # Biome linter
```
