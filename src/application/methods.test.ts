import { describe, expect, it } from "vitest"
import {
  DEFAULT_METHOD,
  METHOD_IDS,
  METHODS,
  methodDefinition,
  modelForMethod,
  parseMethodId,
  resolveMethod,
} from "./methods"

describe("method registry", () => {
  it("defaults to fusion for hidden-set scoring", () => {
    expect(DEFAULT_METHOD).toBe("fusion")
    expect(METHODS.fusion.role).toBe("production")
    expect(METHODS.fusion.fuseQualityAndSilence).toBe(true)
    expect(METHODS.fusion.costUsdPerMinute).toBeLessThanOrEqual(0.003)
  })

  it("keeps every method id in the catalog", () => {
    for (const id of METHOD_IDS) {
      expect(methodDefinition(id).id).toBe(id)
      expect(modelForMethod(id).length).toBeGreaterThan(0)
    }
  })

  it("skips acoustic fusion only for gemini_only", () => {
    expect(METHODS.gemini_only.fuseQualityAndSilence).toBe(false)
    expect(METHODS.fusion.fuseQualityAndSilence).toBe(true)
    expect(METHODS.lexical.fuseQualityAndSilence).toBe(true)
    expect(METHODS.baseline.fuseQualityAndSilence).toBe(true)
    expect(METHODS.prosody.fuseQualityAndSilence).toBe(true)
  })

  it("parses known ids and rejects unknown ones", () => {
    expect(parseMethodId("lexical")).toBe("lexical")
    expect(parseMethodId("nope")).toBeNull()
    expect(parseMethodId(undefined)).toBeNull()
    expect(resolveMethod("fusion")?.id).toBe("fusion")
    expect(resolveMethod("ensemble")).toBeNull()
  })
})
