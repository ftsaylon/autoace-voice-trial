export const MAX_RUNNING_BATCHES = 2

export const processesOnCreate = false

export type RunQueueStatus = "queued" | "running" | "complete" | "failed"

export type RunQueueItem = {
  status: RunQueueStatus
  createdAt: number
}

export const decideBatchLaunch = (
  othersRunning: number,
  cap = MAX_RUNNING_BATCHES,
): "queued" | "running" => {
  if (othersRunning >= cap) {
    return "queued"
  }
  return "running"
}

export const pickRunningRun = <T extends RunQueueItem>(runs: T[]): T | undefined =>
  runs.find((run) => run.status === "running")

export const queuedRunsOldestFirst = <T extends RunQueueItem>(runs: T[]): T[] =>
  runs
    .filter((run) => run.status === "queued")
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)

export const hasPendingRuns = <T extends RunQueueItem>(runs: T[]): boolean =>
  runs.some((run) => run.status === "queued" || run.status === "running")

export const failedResultsForRun = <T extends { runId: string; state: string }>(
  results: T[],
  runId: string,
): T[] => results.filter((row) => row.runId === runId && row.state === "failed")

const UNFINISHED_STATES = new Set(["queued", "running", "uploading"])

export const unfinishedResults = <T extends { state: string }>(results: T[]): T[] =>
  results.filter((row) => UNFINISHED_STATES.has(row.state))
