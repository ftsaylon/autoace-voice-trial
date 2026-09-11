import { describe, expect, it } from "vitest"
import { nextAvailableDatasetName } from "./datasetNames"

describe("nextAvailableDatasetName", () => {
  it("returns preferred name when unused", () => {
    expect(nextAvailableDatasetName("acme-calls", [])).toBe("acme-calls")
    expect(nextAvailableDatasetName("acme-calls", ["other-set"])).toBe("acme-calls")
  })

  it("appends filesystem-style copy suffixes", () => {
    expect(nextAvailableDatasetName("acme-calls", ["acme-calls"])).toBe(
      "acme-calls (1)",
    )
    expect(
      nextAvailableDatasetName("acme-calls", ["acme-calls", "acme-calls (1)"]),
    ).toBe("acme-calls (2)")
  })

  it("finds the next suffix even when base is missing", () => {
    expect(nextAvailableDatasetName("acme-calls", ["acme-calls (1)"])).toBe(
      "acme-calls",
    )
  })
})
