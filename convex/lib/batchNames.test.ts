import { describe, expect, it } from "vitest"
import { formatBatchCode } from "./batchNames"

describe("formatBatchCode", () => {
  it("zero-pads to five digits", () => {
    expect(formatBatchCode(1)).toBe("00001")
    expect(formatBatchCode(42)).toBe("00042")
    expect(formatBatchCode(99999)).toBe("99999")
  })
})
