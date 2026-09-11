import { describe, expect, it } from "vitest"
import { normalizeAuthEmail } from "./trial-auth"

describe("normalizeAuthEmail", () => {
  it("maps a username to the Password email", () => {
    expect(normalizeAuthEmail("review")).toBe("review@eval.local")
  })

  it("passes through a real email", () => {
    expect(normalizeAuthEmail("ops@example.com")).toBe("ops@example.com")
  })
})
