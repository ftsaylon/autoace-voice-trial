import { describe, expect, it } from "vitest"
import { formatBatchCode, sequenceFromBatchName } from "./batchNames"

describe("formatBatchCode", () => {
  it("zero-pads to five digits", () => {
    expect(formatBatchCode(1)).toBe("00001")
    expect(formatBatchCode(42)).toBe("00042")
    expect(formatBatchCode(99999)).toBe("99999")
  })
})

describe("sequenceFromBatchName", () => {
  it("parses five-digit codes", () => {
    expect(sequenceFromBatchName("00042")).toBe(42)
  })

  it("ignores non-code names", () => {
    expect(sequenceFromBatchName("Batch 2026-09-11")).toBeNull()
  })
})
