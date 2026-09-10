import { describe, expect, it } from "vitest"
import {
  FUSION_PROMPT,
  acousticForGeminiPrompt,
  buildGeminiUserText,
} from "./prompts"
import { acousticMeasurements } from "@/domain"
import { GEMINI_AUDIO_FILENAME } from "./gemini-classifier"

const measured = acousticMeasurements({
  durationSec: 31,
  longestSilenceSec: 2.4,
  snrDb: 18.25,
  clipFraction: 0.002,
  rms: 0.11,
  spectralFlatness: 0.19,
  noiseFamily: "uncertain",
  overlapEvidence: "none",
})

describe("buildGeminiUserText", () => {
  it("omits the filename", () => {
    const text = buildGeminiUserText({
      prompt: FUSION_PROMPT,
      durationSec: 12.5,
    })
    expect(text).toContain("Clip duration: 12.50 seconds.")
    expect(text.toLowerCase()).not.toContain("filename")
    expect(text).not.toContain("call_001.ogg")
    expect(GEMINI_AUDIO_FILENAME).toBe("clip.wav")
  })

  it("includes DSP evidence labels and not SNR or loudness", () => {
    const text = buildGeminiUserText({
      prompt: FUSION_PROMPT,
      durationSec: 8,
      acoustic: measured,
    })
    expect(text).toContain("noise_family: uncertain")
    expect(text).toContain("overlap_evidence: none")
    expect(text).toContain("Still report TV")
    expect(text).not.toContain("SNR:")
    expect(text).not.toContain("clip fraction")
    expect(text).not.toContain("longest silence")
    expect(text.toLowerCase()).not.toContain("rms")
    expect(text).toContain("do not infer tone from loudness")
  })

  it("drops measured acoustics when Gemini owns quality and silence", () => {
    expect(
      acousticForGeminiPrompt({
        ownQualityAndSilence: true,
        acoustic: measured,
      }),
    ).toBeUndefined()
    expect(
      acousticForGeminiPrompt({
        ownQualityAndSilence: false,
        acoustic: measured,
      }),
    ).toEqual(measured)
  })

  it("uses the frustrated vs upset vs distressed ladder", () => {
    expect(FUSION_PROMPT).toContain("distressed: crying, panic")
    expect(FUSION_PROMPT).toContain("upset: clearly angry")
    expect(FUSION_PROMPT).toContain("frustrated: annoyed, impatient")
    expect(FUSION_PROMPT).toContain("Do not default to office chatter")
  })
})
