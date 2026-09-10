import { describe, expect, it } from "vitest"
import { formatModelLabel } from "./batch-badges"
import { METHOD_LIST } from "@/application/methods"

describe("formatModelLabel", () => {
  it("formats known model ids", () => {
    expect(formatModelLabel("gemini-3.5-flash-lite")).toBe("Gemini 3.5 Flash-Lite")
    expect(formatModelLabel("acoustic-baseline")).toBe("Acoustic baseline")
    expect(formatModelLabel("acoustic-prosody")).toBe("Acoustic prosody")
    expect(formatModelLabel("gemini-3.5-flash-lite-lexical")).toBe(
      "Gemini 3.5 Flash-Lite lexical",
    )
    expect(formatModelLabel("gemini-3.5-flash-lite-only")).toBe(
      "Gemini 3.5 Flash-Lite only",
    )
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
