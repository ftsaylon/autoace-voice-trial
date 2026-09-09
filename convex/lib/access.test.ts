import { describe, expect, it } from "vitest"
import { ownedOrNull } from "./access"

describe("ownedOrNull", () => {
  it("returns the document when the user owns it", () => {
    const row = { userId: "user_a", name: "mine" }
    expect(ownedOrNull("user_a", row)).toBe(row)
  })

  it("hides another user's document", () => {
    expect(ownedOrNull("user_a", { userId: "user_b", name: "secret" })).toBeNull()
    expect(ownedOrNull("user_a", null)).toBeNull()
  })
})
