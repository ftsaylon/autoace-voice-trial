import { describe, expect, it } from "vitest"
import { AcousticBaselineClassifier } from "@/adapters/baseline/acoustic-baseline"
import { GeminiClassifier } from "@/adapters/gemini/gemini-classifier"
import { ProsodyClassifier } from "@/adapters/prosody/prosody-classifier"
import { classifierForMethod } from "./select-classifier"
import { METHOD_IDS, METHODS } from "./methods"
import type { AcousticAnalyzer } from "./ports"
import { ok } from "@/domain/result"
import { acousticMeasurements } from "@/domain"

const acoustic: AcousticAnalyzer = {
  async measure() {
    return ok(acousticMeasurements())
  },
  async extractWindow(audio) {
    return ok(audio)
  },
}

describe("classifierForMethod", () => {
  it("uses Gemini for fusion, lexical, and gemini_only", () => {
    expect(classifierForMethod("fusion", acoustic)).toBeInstanceOf(GeminiClassifier)
    expect(classifierForMethod("lexical", acoustic)).toBeInstanceOf(GeminiClassifier)
    expect(classifierForMethod("gemini_only", acoustic)).toBeInstanceOf(
      GeminiClassifier,
    )
  })

  it("uses the acoustic baseline for the naive control", () => {
    expect(classifierForMethod("baseline", acoustic)).toBeInstanceOf(
      AcousticBaselineClassifier,
    )
  })

  it("uses the prosody classifier for the literature DSP control", () => {
    expect(classifierForMethod("prosody", acoustic)).toBeInstanceOf(ProsodyClassifier)
  })

  it("covers every registered method", () => {
    for (const id of METHOD_IDS) {
      expect(classifierForMethod(id, acoustic)).toBeDefined()
      expect(METHODS[id].id).toBe(id)
    }
  })
})
