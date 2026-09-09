import { describe, expect, it } from "vitest"
import { METHOD_IDS } from "../src/application/methods"

const SCHEMA_METHOD_IDS = [
  "fusion",
  "baseline",
  "lexical",
  "prosody",
  "gemini_only",
] as const

describe("methodValidator", () => {
  it("lists the same ids as the application registry", () => {
    expect([...METHOD_IDS]).toEqual([...SCHEMA_METHOD_IDS])
  })
})
