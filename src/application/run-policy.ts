export const MAX_RUNNING_BATCHES = 2

/** Concurrent claimed clips per batch. Gemini RPM and Convex Node ffmpeg bound this. */
export const MAX_IN_FLIGHT_CLIPS = 4

export const processesOnCreate = false

/**
 * How many more clips to claim so in-flight work fills up to `cap`.
 * `running` is already-claimed clips; `remaining` is still queued (or stale).
 */
export const inFlightToSchedule = (
  running: number,
  remaining: number,
  cap = MAX_IN_FLIGHT_CLIPS,
): number => {
  if (remaining <= 0 || cap <= 0) {
    return 0
  }
  const slots = Math.max(0, cap - Math.max(0, running))
  return Math.min(slots, remaining)
}

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

export const canCompareRuns = <T extends RunQueueItem>(runs: T[]): boolean =>
  runs.length >= 2 &&
  runs.every((run) => run.status === "complete" || run.status === "failed")

export const pickViewingRunId = <T extends RunQueueItem & { _id: string }>(
  runs: T[],
  runId?: string | null,
): string | null => {
  if (runs.length === 0) {
    return null
  }
  if (runId) {
    return runs.find((run) => run._id === runId)?._id ?? runs[runs.length - 1]?._id ?? null
  }
  return (
    runs.find((run) => run.status === "running")?._id ??
    runs.find((run) => run.status === "queued")?._id ??
    runs[runs.length - 1]?._id ??
    null
  )
}

export const failedResultsForRun = <T extends { runId: string; state: string }>(
  results: T[],
  runId: string,
): T[] => results.filter((row) => row.runId === runId && row.state === "failed")

const UNFINISHED_STATES = new Set(["queued", "running", "uploading"])

export const unfinishedResults = <T extends { state: string }>(results: T[]): T[] =>
  results.filter((row) => UNFINISHED_STATES.has(row.state))
