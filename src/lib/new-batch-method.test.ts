import { describe, expect, it } from "vitest"

/**
 * Method selection should honor a user pick even before files exist.
 * Mirrors NewBatchPanel: settings seed the display until the user overrides.
 */
const resolveMethod = (
  settingsDefault: "fusion" | "baseline" | undefined,
  method: "fusion" | "baseline" | null,
): "fusion" | "baseline" => {
  return method ?? settingsDefault ?? "fusion"
}

describe("new batch method selection", () => {
  it("uses settings default until the user picks a method", () => {
    expect(resolveMethod("baseline", null)).toBe("baseline")
    expect(resolveMethod(undefined, null)).toBe("fusion")
  })

  it("keeps the user pick even when settings load later", () => {
    expect(resolveMethod("fusion", "baseline")).toBe("baseline")
    expect(resolveMethod("baseline", "fusion")).toBe("fusion")
  })
})

