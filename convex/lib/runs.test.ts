import { describe, expect, it } from "vitest"
import {
  boundParseIssues,
  overlayClip,
  pickViewingRun,
  requireMethodIds,
  runHasFullResultSet,
  uniqueMethodIds,
} from "./runs"
import type { Doc } from "../_generated/dataModel"

describe("uniqueMethodIds", () => {
  it("preserves first-seen order", () => {
    expect(uniqueMethodIds(["fusion", "lexical", "fusion", "baseline"])).toEqual([
      "fusion",
      "lexical",
      "baseline",
    ])
  })
})

describe("requireMethodIds", () => {
  it("rejects an empty list", () => {
    expect(() => requireMethodIds([])).toThrow("Pick at least one method")
  })

  it("dedupes before inserting", () => {
    expect(requireMethodIds(["fusion", "fusion", "lexical"])).toEqual([
      "fusion",
      "lexical",
    ])
  })
})

describe("boundParseIssues", () => {
  it("caps count and length", () => {
    const issues = Array.from({ length: 50 }, (_, index) => "x".repeat(600) + String(index))
    const bounded = boundParseIssues(issues)
    expect(bounded).toHaveLength(40)
    expect(bounded.every((issue) => issue.length === 500)).toBe(true)
  })
})

describe("runHasFullResultSet", () => {
  it("requires every clip result and no unfinished rows", () => {
    expect(
      runHasFullResultSet(
        [{ state: "succeeded" }, { state: "failed" }],
        2,
      ),
    ).toBe(true)
    expect(runHasFullResultSet([{ state: "succeeded" }], 2)).toBe(false)
    expect(
      runHasFullResultSet(
        [{ state: "succeeded" }, { state: "queued" }],
        2,
      ),
    ).toBe(false)
  })
})

describe("pickViewingRun", () => {
  const runs = [
    { _id: "r1", createdAt: 1 },
    { _id: "r2", createdAt: 2 },
  ] as unknown as Doc<"runs">[]

  it("defaults to the latest run", () => {
    expect(pickViewingRun(runs)?._id).toBe("r2")
  })

  it("honors an explicit run id when it exists", () => {
    expect(pickViewingRun(runs, "r1" as Doc<"runs">["_id"])?._id).toBe("r1")
  })
})

describe("overlayClip", () => {
  it("copies viewing-run prediction fields onto the clip", () => {
    const clip = {
      _id: "c1",
      state: "queued",
      predictionJson: undefined,
    } as unknown as Doc<"clips">
    const result = {
      state: "succeeded",
      predictionJson: '{"emotional_tone":"neutral"}',
      errorJson: undefined,
    } as unknown as Doc<"clipResults">
    expect(overlayClip(clip, result).predictionJson).toBe(
      '{"emotional_tone":"neutral"}',
    )
    expect(overlayClip(clip, result).state).toBe("succeeded")
  })
})
