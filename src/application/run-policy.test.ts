import { describe, expect, it } from "vitest"
import {
  canCompareRuns,
  decideBatchLaunch,
  failedResultsForRun,
  hasPendingRuns,
  inFlightToSchedule,
  MAX_IN_FLIGHT_CLIPS,
  pickRunningRun,
  processesOnCreate,
  queuedRunsOldestFirst,
  unfinishedResults,
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

describe("canCompareRuns", () => {
  it("requires at least two finished runs", () => {
    expect(
      canCompareRuns([
        { status: "complete", createdAt: 1 },
        { status: "running", createdAt: 2 },
      ]),
    ).toBe(false)
    expect(
      canCompareRuns([
        { status: "complete", createdAt: 1 },
        { status: "complete", createdAt: 2 },
      ]),
    ).toBe(true)
  })
})

describe("parallel runs on one batch", () => {
  const runs = [
    { id: "fusion", status: "complete" as const, createdAt: 1 },
    { id: "lexical", status: "running" as const, createdAt: 2 },
    { id: "baseline", status: "queued" as const, createdAt: 4 },
    { id: "prosody", status: "queued" as const, createdAt: 3 },
  ]

  it("still reports the currently running method", () => {
    expect(pickRunningRun(runs)?.id).toBe("lexical")
  })

  it("keeps queued methods pending until they start", () => {
    expect(queuedRunsOldestFirst(runs).map((run) => run.id)).toEqual([
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

describe("in-flight clip pool", () => {
  it("fills to 4 when many clips remain and none are running", () => {
    expect(inFlightToSchedule(0, 10)).toBe(MAX_IN_FLIGHT_CLIPS)
    expect(inFlightToSchedule(0, 2)).toBe(2)
    expect(inFlightToSchedule(4, 10)).toBe(0)
    expect(inFlightToSchedule(3, 10)).toBe(1)
  })

  it("fills to 4 then chains without exceeding the cap", () => {
    let queued = 10
    let running = 0
    let completed = 0
    let maxRunning = 0
    const spawn = () => {
      const n = inFlightToSchedule(running, queued)
      for (let i = 0; i < n; i++) {
        queued -= 1
        running += 1
      }
      maxRunning = Math.max(maxRunning, running)
    }
    spawn()
    expect(running).toBe(MAX_IN_FLIGHT_CLIPS)
    while (running > 0) {
      running -= 1
      completed += 1
      spawn()
    }
    expect(completed).toBe(10)
    expect(maxRunning).toBe(MAX_IN_FLIGHT_CLIPS)
  })
})

describe("unfinishedResults", () => {
  it("selects queued, running, and uploading rows so a missing Gemini key can fail the run once", () => {
    const results = [
      { id: "a", state: "queued" },
      { id: "b", state: "running" },
      { id: "c", state: "uploading" },
      { id: "d", state: "succeeded" },
      { id: "e", state: "failed" },
    ]
    expect(unfinishedResults(results).map((row) => row.id)).toEqual(["a", "b", "c"])
  })
})
