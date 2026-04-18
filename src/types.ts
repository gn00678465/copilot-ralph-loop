export interface CliArgs {
  prompt: string;
  dir: string;
  model: string;
  maxIter: number;
  progressEntries: number;
  completeText: string; // always the wrapped form: <promise>...</promise>
  timeout: number; // sendAndWait timeout in ms
  verbose: boolean;
  dangerous: boolean; // auto-approve all Copilot permission requests
}

export interface ProgressEntry {
  iteration: number;
  timestamp: string;
  summary: string;
  files: string[];
  learnings: string[];
}

export interface ProgressState {
  totalLineCount: number; // all raw lines excl. trailing-newline artifact (incl. blank)
  lines: string[]; // non-empty lines for append-only prefix verification
  parsedEntries: ProgressEntry[];
}
