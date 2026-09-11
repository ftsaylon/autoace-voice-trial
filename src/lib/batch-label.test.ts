import { describe, expect, it } from "vitest"
import { formatBatchLabel, isBatchCode } from "@/lib/batch-label"

describe("batch label", () => {
  it("recognizes five-digit batch codes", () => {
    expect(isBatchCode("00001")).toBe(true)
    expect(isBatchCode("00042")).toBe(true)
    expect(isBatchCode("Batch 2026-09-11")).toBe(false)
  })

  it("prefixes batch codes with Batch #", () => {
    expect(formatBatchLabel({ name: "00042" })).toBe("Batch #00042")
  })

  it("shows non-code batch names as-is", () => {
    expect(formatBatchLabel({ name: "Batch 2026-09-11" })).toBe("Batch 2026-09-11")
  })
})
