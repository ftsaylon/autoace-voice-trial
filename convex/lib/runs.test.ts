import { describe, expect, it } from "vitest"
import { uniqueMethodIds } from "./runs"

describe("uniqueMethodIds", () => {
  it("preserves first-seen order", () => {
    expect(uniqueMethodIds(["fusion", "lexical", "fusion", "baseline"])).toEqual([
      "fusion",
      "lexical",
      "baseline",
    ])
  })
})
