import { describe, expect, it } from "vitest"
import { noNoise, presentNoise, type ClipPrediction } from "@/domain"
import { macroF1, scoresForPairs } from "./scores"

const pred = (
  tone: ClipPrediction["emotional_tone"],
  extras: Partial<ClipPrediction> = {},
): ClipPrediction => ({
  emotional_tone: tone,
  emotional_intensity: "medium",
  background_noise: noNoise,
  audio_quality: "clear",
  speaker_overlap_present: false,
  long_silence_present: false,
  confidence: 0.5,
  ...extras,
})

describe("macroF1", () => {
  it("is 1 when every class is predicted perfectly", () => {
    const f1 = macroF1(
      [
        { gold: "neutral", pred: "neutral" },
        { gold: "upset", pred: "upset" },
      ],
      ["neutral", "upset"],
    )
    expect(f1).toBe(1)
  })

  it("averages per-class F1 and ignores unused labels", () => {
    const f1 = macroF1(
      [
        { gold: "neutral", pred: "neutral" },
        { gold: "upset", pred: "frustrated" },
        { gold: "frustrated", pred: "frustrated" },
      ],
      ["neutral", "upset", "frustrated", "satisfied"],
    )
    expect(f1).toBeCloseTo(5 / 9, 5)
  })
})

describe("scoresForPairs", () => {
  it("returns null without labeled pairs", () => {
    expect(scoresForPairs([])).toBeNull()
  })

  it("reports tone accuracy, tone F1, and boolean field accuracy", () => {
    const scores = scoresForPairs([
      {
        gold: pred("neutral"),
        prediction: pred("neutral"),
      },
      {
        gold: pred("upset", {
          background_noise: presentNoise("TV", "medium"),
          audio_quality: "slightly_impaired",
          speaker_overlap_present: true,
          long_silence_present: true,
        }),
        prediction: pred("frustrated", {
          background_noise: presentNoise("TV", "medium"),
          audio_quality: "slightly_impaired",
          speaker_overlap_present: true,
          long_silence_present: false,
        }),
      },
    ])
    expect(scores?.emotional_tone.accuracy).toBe(0.5)
    expect(scores?.emotional_tone.f1).toBeCloseTo(1 / 3, 5)
    expect(scores?.background_noise_present.accuracy).toBe(1)
    expect(scores?.audio_quality.accuracy).toBe(1)
    expect(scores?.speaker_overlap_present.accuracy).toBe(1)
    expect(scores?.long_silence_present.accuracy).toBe(0.5)
  })
})
