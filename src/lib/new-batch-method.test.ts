import { describe, expect, it } from "vitest"
import { DEFAULT_METHOD, type MethodId } from "@/application/methods"

describe("new batch method selection", () => {
  it("defaults to fusion only", () => {
    const methods: MethodId[] = [DEFAULT_METHOD]
    expect(methods).toEqual(["fusion"])
  })

  it("keeps all selected methods for the batch start", () => {
    const methods: MethodId[] = ["fusion", "baseline", "lexical"]
    expect(methods[0]).toBe("fusion")
    expect(methods).toHaveLength(3)
  })

  it("requires at least one method", () => {
    const toggle = (current: MethodId[], id: MethodId): MethodId[] | null => {
      const next = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
      if (next.length === 0) {
        return null
      }
      return next
    }
    expect(toggle(["fusion"], "fusion")).toBeNull()
    expect(toggle(["fusion", "baseline"], "fusion")).toEqual(["baseline"])
  })
})
