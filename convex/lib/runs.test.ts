import { describe, expect, it } from "vitest"
import { overlayClip, pickViewingRun, uniqueMethodIds } from "./runs"
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
