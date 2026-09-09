import { describe, expect, it } from "vitest"
import { decideBatchLaunch, processesOnCreate } from "./run-policy"

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
