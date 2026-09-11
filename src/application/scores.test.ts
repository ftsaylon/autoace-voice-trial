import { describe, expect, it } from "vitest"
import { noNoise, presentNoise, type ClipPrediction } from "@/domain"
import { fieldMatches, macroF1, scoresForPairs } from "./scores"

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

describe("fieldMatches", () => {
  it("treats TV and television as the same noise type", () => {
    const gold = pred("neutral", {
      background_noise: presentNoise("TV", "medium"),
    })
    const prediction = pred("neutral", {
      background_noise: presentNoise("television", "medium"),
    })
    expect(fieldMatches(gold, prediction, "background_noise_type")).toBe(true)
  })

  it("allows confidence within the scoring tolerance", () => {
    const gold = pred("neutral", { confidence: 0.82 })
    const prediction = pred("neutral", { confidence: 0.85 })
    expect(fieldMatches(gold, prediction, "confidence")).toBe(true)
  })

  it("rejects confidence outside the scoring tolerance", () => {
    const gold = pred("neutral", { confidence: 0.5 })
    const prediction = pred("neutral", { confidence: 0.8 })
    expect(fieldMatches(gold, prediction, "confidence")).toBe(false)
  })
})

describe("scoresForPairs", () => {
  it("returns null without labeled pairs", () => {
    expect(scoresForPairs([])).toBeNull()
  })

  it("reports tone accuracy, tone F1, related fields, and boolean field accuracy", () => {
    const scores = scoresForPairs([
      {
        gold: pred("neutral"),
        prediction: pred("neutral"),
      },
      {
        gold: pred("upset", {
          emotional_intensity: "high",
          background_noise: presentNoise("television", "medium"),
          audio_quality: "slightly_impaired",
          speaker_overlap_present: true,
          long_silence_present: true,
          confidence: 0.8,
        }),
        prediction: pred("frustrated", {
          emotional_intensity: "high",
          background_noise: presentNoise("TV", "medium"),
          audio_quality: "slightly_impaired",
          speaker_overlap_present: true,
          long_silence_present: false,
          confidence: 0.72,
        }),
      },
    ])
    expect(scores?.emotional_tone.accuracy).toBe(0.5)
    expect(scores?.emotional_tone.f1).toBeCloseTo(1 / 3, 5)
    expect(scores?.emotional_intensity.accuracy).toBe(1)
    expect(scores?.background_noise_present.accuracy).toBe(1)
    expect(scores?.background_noise_type.accuracy).toBe(1)
    expect(scores?.background_noise_severity.accuracy).toBe(1)
    expect(scores?.audio_quality.accuracy).toBe(1)
    expect(scores?.speaker_overlap_present.accuracy).toBe(1)
    expect(scores?.long_silence_present.accuracy).toBe(0.5)
    expect(scores?.confidence.accuracy).toBe(1)
  })
})
