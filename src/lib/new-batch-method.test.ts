import { describe, expect, it } from "vitest"
import { DEFAULT_METHOD, type MethodId } from "@/application/methods"

const resolveMethod = (
  settingsDefault: MethodId | undefined,
  method: MethodId | null,
): MethodId => {
  return method ?? settingsDefault ?? DEFAULT_METHOD
}

describe("new batch method selection", () => {
  it("uses settings default until the user picks a method", () => {
    expect(resolveMethod("baseline", null)).toBe("baseline")
    expect(resolveMethod(undefined, null)).toBe("fusion")
  })

  it("keeps the user pick even when settings load later", () => {
    expect(resolveMethod("fusion", "baseline")).toBe("baseline")
    expect(resolveMethod("baseline", "fusion")).toBe("fusion")
    expect(resolveMethod("fusion", "lexical")).toBe("lexical")
  })
})
