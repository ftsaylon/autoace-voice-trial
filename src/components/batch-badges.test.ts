import { describe, expect, it } from "vitest"
import {
  formatModelLabel,
  runProgressLabel,
  shouldShowMethodRunProgress,
  type MethodRunSnapshot,
} from "./batch-badges"
import { METHOD_LIST } from "@/application/methods"

const run = (
  overrides: Partial<MethodRunSnapshot> & Pick<MethodRunSnapshot, "status">,
): MethodRunSnapshot => ({
  runId: "run_1",
  clipCount: 3,
  succeededCount: 0,
  failedCount: 0,
  ...overrides,
})

describe("runProgressLabel", () => {
  it("shows fraction while queued or running", () => {
    expect(runProgressLabel(run({ status: "running", succeededCount: 2 }))).toBe("2/3")
    expect(runProgressLabel(run({ status: "queued" }))).toBe("0/3")
  })

  it("hides fraction when a run finished", () => {
    expect(runProgressLabel(run({ status: "complete", succeededCount: 3 }))).toBeNull()
  })
})

describe("shouldShowMethodRunProgress", () => {
  it("hides during upload and on clean completed batches", () => {
    expect(shouldShowMethodRunProgress("uploading", [])).toBe(false)
    expect(shouldShowMethodRunProgress("complete", [run({ status: "complete" })])).toBe(
      false,
    )
  })

  it("shows while any run is active or failed", () => {
    expect(shouldShowMethodRunProgress("running", [run({ status: "running" })])).toBe(
      true,
    )
    expect(shouldShowMethodRunProgress("complete", [run({ status: "failed" })])).toBe(
      true,
    )
  })
})

describe("formatModelLabel", () => {
  it("formats known model ids", () => {
    expect(formatModelLabel("gemini-3.6-flash")).toBe("Gemini 3.6 Flash")
    expect(formatModelLabel("acoustic-baseline")).toBe("Acoustic baseline")
    expect(formatModelLabel("acoustic-prosody")).toBe("Acoustic prosody")
    expect(formatModelLabel("gemini-3.6-flash-lexical")).toBe("Gemini 3.6 Flash lexical")
    expect(formatModelLabel("gemini-3.6-flash-only")).toBe("Gemini 3.6 Flash only")
    expect(formatModelLabel("gemini-3.5-flash-lite")).toBe("Gemini 3.5 Flash-Lite")
  })

  it("passes through unknown model ids", () => {
    expect(formatModelLabel("custom-model")).toBe("custom-model")
  })

  it("has a label mapping for every registered model", () => {
    for (const method of METHOD_LIST) {
      expect(formatModelLabel(method.model)).not.toBe(method.model)
    }
  })
})
