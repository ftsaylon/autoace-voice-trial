import { describe, expect, it } from "vitest"
import { normalizeAuthEmail, TRIAL_EMAIL } from "./trial-auth"

describe("normalizeAuthEmail", () => {
  it("maps the trial username to the Password email", () => {
    expect(normalizeAuthEmail("autoace")).toBe(TRIAL_EMAIL)
  })

  it("passes through a real email", () => {
    expect(normalizeAuthEmail("ops@example.com")).toBe("ops@example.com")
  })
})
