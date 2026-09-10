import { describe, expect, it } from "vitest"
import { labelRuns } from "./run-labels"

describe("labelRuns", () => {
  it("marks older same-method runs as earlier and newest as primary", () => {
    const labeled = labelRuns(
      [
        { _id: "f1", method: "fusion", createdAt: 1 },
        { _id: "l1", method: "lexical", createdAt: 2 },
        { _id: "f2", method: "fusion", createdAt: 3 },
      ],
      3 + 120_000,
    )
    const fusionNew = labeled.find((run) => run.id === "f2")
    const fusionOld = labeled.find((run) => run.id === "f1")
    expect(fusionNew?.occurrence).toBe(0)
    expect(fusionNew?.shortLabel).toBe("Fusion")
    expect(fusionOld?.occurrence).toBe(1)
    expect(fusionOld?.shortLabel).toBe("Fusion · earlier")
    expect(labeled.find((run) => run.id === "l1")?.shortLabel).toBe("Lexical")
  })
})
