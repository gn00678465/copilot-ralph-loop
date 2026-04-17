export interface CliArgs {
  prompt: string
  dir: string
  model: string
  maxIter: number
  progressEntries: number
  completeText: string  // always the wrapped form: <promise>...</promise>
  verbose: boolean
}

export interface ProgressEntry {
  iteration: number
  timestamp: string
  summary: string
  files: string[]
  learnings: string[]
}

export interface ProgressState {
  rawLineCount: number
  parsedEntries: ProgressEntry[]
}
