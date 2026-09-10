import { describe, expect, it } from "vitest"
import {
  decideBatchLaunch,
  failedResultsForRun,
  hasPendingRuns,
  pickRunningRun,
  processesOnCreate,
  queuedRunsOldestFirst,
} from "./run-policy"

describe("run policy", () => {
  it("does not process a draft on create", () => {
    expect(processesOnCreate).toBe(false)
  })

  it("starts immediately when under the concurrent cap", () => {
    expect(decideBatchLaunch(0)).toBe("running")
    expect(decideBatchLaunch(1)).toBe("running")
  })

  it("queues when two batches are already running", () => {
    expect(decideBatchLaunch(2)).toBe("queued")
  })
})

describe("sequential runs on one batch", () => {
  const runs = [
    { id: "fusion", status: "complete" as const, createdAt: 1 },
    { id: "lexical", status: "running" as const, createdAt: 2 },
    { id: "baseline", status: "queued" as const, createdAt: 4 },
    { id: "prosody", status: "queued" as const, createdAt: 3 },
  ]

  it("claims the running run before queued methods", () => {
    expect(pickRunningRun(runs)?.id).toBe("lexical")
  })

  it("starts the oldest queued run after the active run finishes", () => {
    const afterLexical = runs.map((run) =>
      run.id === "lexical" ? { ...run, status: "complete" as const } : run,
    )
    expect(pickRunningRun(afterLexical)).toBeUndefined()
    expect(queuedRunsOldestFirst(afterLexical).map((run) => run.id)).toEqual([
      "prosody",
      "baseline",
    ])
  })

  it("keeps the batch running while any run is queued or running", () => {
    expect(hasPendingRuns(runs)).toBe(true)
    expect(
      hasPendingRuns(runs.map((run) => ({ ...run, status: "complete" as const }))),
    ).toBe(false)
  })
})

describe("retryRun isolation", () => {
  it("requeues failed clips on one run and leaves sibling runs untouched", () => {
    const results = [
      { runId: "a", state: "failed" },
      { runId: "a", state: "succeeded" },
      { runId: "b", state: "failed" },
      { runId: "b", state: "succeeded" },
    ]
    expect(failedResultsForRun(results, "a")).toEqual([{ runId: "a", state: "failed" }])
    expect(failedResultsForRun(results, "b")).toEqual([{ runId: "b", state: "failed" }])
  })
})
