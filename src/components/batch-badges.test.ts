import { describe, expect, it } from "vitest"
import { formatModelLabel } from "./batch-badges"

describe("formatModelLabel", () => {
  it("formats known model ids", () => {
    expect(formatModelLabel("gemini-3.6-flash")).toBe("Gemini 3.6 Flash")
    expect(formatModelLabel("acoustic-baseline")).toBe("Acoustic baseline")
  })

  it("passes through unknown model ids", () => {
    expect(formatModelLabel("custom-model")).toBe("custom-model")
  })
})
