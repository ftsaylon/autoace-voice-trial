import { describe, expect, it } from "vitest"
import { formatAnalyzeError, formatStoredAnalyzeError } from "./errors"

describe("formatAnalyzeError", () => {
  it("tells operators how to configure Gemini", () => {
    expect(formatAnalyzeError({ tag: "classifier_unavailable" })).toMatch(
      /GOOGLE_GENERATIVE_AI_API_KEY/,
    )
    expect(formatAnalyzeError({ tag: "classifier_unavailable" })).toMatch(
      /Convex/,
    )
  })
})

describe("formatStoredAnalyzeError", () => {
  it("formats stored classifier JSON instead of dumping the tag", () => {
    expect(
      formatStoredAnalyzeError('{"tag":"classifier_unavailable"}'),
    ).toMatch(/GOOGLE_GENERATIVE_AI_API_KEY/)
  })

  it("passes through unknown text", () => {
    expect(formatStoredAnalyzeError("boom")).toBe("boom")
    expect(formatStoredAnalyzeError(undefined)).toBe("unknown error")
  })
})
