import { describe, expect, it } from "vitest"
import {
  GeminiClassifier,
  toPrediction,
  type GeminiGenerateFn,
  type GeminiStructuredOutput,
} from "./gemini-classifier"
import { FUSION_PROMPT } from "./prompts"
import { acousticMeasurements } from "@/domain"

const valid: GeminiStructuredOutput = {
  emotional_tone: "neutral",
  emotional_intensity: "low",
  background_noise_present: false,
  background_noise_type: "",
  background_noise_severity: "none",
  speaker_overlap_present: false,
  confidence: 0.61,
  audio_quality: "slightly_impaired",
}

const clip = {
  name: "clip.wav",
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: "audio/wav",
}

describe("toPrediction", () => {
  it("aliases TV to television", () => {
    const parsed = toPrediction({
      ...valid,
      background_noise_present: true,
      background_noise_type: "TV",
      background_noise_severity: "medium",
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.background_noise).toEqual({
        present: true,
        type: "television",
        severity: "medium",
      })
    }
  })

  it("rejects present noise without a type", () => {
    const parsed = toPrediction({
      ...valid,
      background_noise_present: true,
      background_noise_type: "  ",
      background_noise_severity: "low",
    })
    expect(parsed.ok).toBe(false)
  })
})

describe("GeminiClassifier retry", () => {
  it("retries once on invalid structured output then succeeds", async () => {
    const calls: GeminiStructuredOutput[] = []
    const generate: GeminiGenerateFn = async () => {
      if (calls.length === 0) {
        calls.push(valid)
        return {
          output: {
            ...valid,
            background_noise_present: true,
            background_noise_type: "",
            background_noise_severity: "none",
          },
        }
      }
      calls.push(valid)
      return { output: valid }
    }
    const classifier = new GeminiClassifier({
      prompt: FUSION_PROMPT,
      ownQuality: true,
      generate,
    })
    const result = await classifier.classify({
      audio: clip,
      durationSec: 12,
      acoustic: acousticMeasurements(),
    })
    expect(calls).toHaveLength(2)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.audio_quality).toBe("slightly_impaired")
      expect(result.value.confidence).toBe(0.61)
    }
  })

  it("fails after a second invalid output", async () => {
    const generate: GeminiGenerateFn = async () => ({
      output: {
        ...valid,
        background_noise_present: true,
        background_noise_type: "",
        background_noise_severity: "none",
      },
    })
    const classifier = new GeminiClassifier({
      prompt: FUSION_PROMPT,
      generate,
    })
    const result = await classifier.classify({
      audio: clip,
      durationSec: 4,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.tag).toBe("classifier_invalid_output")
    }
  })

  it("asks for quality on fusion without dropping DSP context", async () => {
    let seen = ""
    const generate: GeminiGenerateFn = async (input) => {
      seen = input.userText
      expect(input.ownQuality).toBe(true)
      expect(input.ownSilence).toBe(false)
      return { output: valid }
    }
    const classifier = new GeminiClassifier({
      prompt: FUSION_PROMPT,
      ownQuality: true,
      generate,
    })
    await classifier.classify({
      audio: clip,
      durationSec: 8,
      acoustic: acousticMeasurements({ noiseFamily: "uncertain" }),
    })
    expect(seen).toContain("noise_family: uncertain")
    expect(seen).toContain("Do not set long silence")
  })

  it("retries once on empty output", async () => {
    let calls = 0
    const generate: GeminiGenerateFn = async () => {
      calls += 1
      if (calls === 1) {
        return { output: null }
      }
      return { output: valid }
    }
    const classifier = new GeminiClassifier({ prompt: FUSION_PROMPT, generate })
    const result = await classifier.classify({ audio: clip, durationSec: 1 })
    expect(calls).toBe(2)
    expect(result.ok).toBe(true)
  })
})
