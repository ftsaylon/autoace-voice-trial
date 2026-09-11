import { describe, expect, it } from "vitest"
import {
  formatBatchLabel,
  getBatchLabelParts,
  isBatchCode,
  joinBatchMeta,
} from "@/lib/batch-label"

describe("batch label", () => {
  it("recognizes five-digit batch codes", () => {
    expect(isBatchCode("00001")).toBe(true)
    expect(isBatchCode("00042")).toBe(true)
    expect(isBatchCode("Batch 2026-09-11")).toBe(false)
  })

  it("prefixes batch codes with Batch #", () => {
    expect(formatBatchLabel({ name: "00042" })).toBe("Batch #00042")
  })

  it("appends dataset name for full labels", () => {
    expect(
      formatBatchLabel({ name: "00032", datasetName: "acme-calls" }),
    ).toBe("Batch #00032 · acme-calls")
  })

  it("uses compact sidebar labels", () => {
    expect(
      formatBatchLabel(
        { name: "00032", datasetName: "acme-calls" },
        { variant: "compact" },
      ),
    ).toBe("#00032 · acme-calls")
  })

  it("splits label parts for tight UI rendering", () => {
    expect(
      getBatchLabelParts({ name: "00032", datasetName: "test" }, { variant: "compact" }),
    ).toEqual({ codeLabel: "#00032", datasetName: "test" })
  })

  it("shows non-code batch names as-is", () => {
    expect(formatBatchLabel({ name: "Batch 2026-09-11" })).toBe("Batch 2026-09-11")
  })

  it("joins batch metadata with dataset name first", () => {
    expect(joinBatchMeta("acme-calls", "12/12 clips", "2 runs")).toBe(
      "acme-calls · 12/12 clips · 2 runs",
    )
    expect(joinBatchMeta(null, "12/12 clips")).toBe("12/12 clips")
  })
})
