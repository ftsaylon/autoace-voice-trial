import { describe, expect, it } from "vitest"
import { AcousticBaselineClassifier } from "@/adapters/baseline/acoustic-baseline"
import { GeminiClassifier } from "@/adapters/gemini/gemini-classifier"
import { classifierForMethod } from "./select-classifier"
import type { AcousticAnalyzer } from "./ports"
import { ok } from "@/domain/result"

const acoustic: AcousticAnalyzer = {
  async measure() {
    return ok({
      durationSec: 1,
      longestSilenceSec: 0,
      snrDb: 20,
      clipFraction: 0,
      rms: 0.1,
      spectralFlatness: 0.2,
    })
  },
  async extractWindow(audio) {
    return ok(audio)
  },
}

describe("classifierForMethod", () => {
  it("uses Gemini fusion for the production method", () => {
    expect(classifierForMethod("fusion", acoustic)).toBeInstanceOf(GeminiClassifier)
  })

  it("uses the acoustic baseline for the control method", () => {
    expect(classifierForMethod("baseline", acoustic)).toBeInstanceOf(
      AcousticBaselineClassifier,
    )
  })
})
