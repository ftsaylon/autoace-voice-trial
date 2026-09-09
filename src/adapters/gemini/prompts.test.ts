import { describe, expect, it } from "vitest"
import {
  FUSION_PROMPT,
  acousticForGeminiPrompt,
  buildGeminiUserText,
} from "./prompts"

const measured = {
  durationSec: 31,
  longestSilenceSec: 2.4,
  snrDb: 18.25,
  clipFraction: 0.002,
  rms: 0.11,
  spectralFlatness: 0.19,
}

describe("buildGeminiUserText", () => {
  it("omits the filename", () => {
    const text = buildGeminiUserText({
      prompt: FUSION_PROMPT,
      durationSec: 12.5,
    })
    expect(text).toContain("Clip duration: 12.50 seconds.")
    expect(text.toLowerCase()).not.toContain("filename")
    expect(text).not.toContain("call_001.ogg")
  })

  it("includes measured acoustics when provided", () => {
    const text = buildGeminiUserText({
      prompt: FUSION_PROMPT,
      durationSec: 8,
      acoustic: measured,
    })
    expect(text).toContain("SNR: 18.3 dB")
    expect(text).toContain("clip fraction: 0.0020")
    expect(text).toContain("longest silence: 2.40 s")
    expect(text).toContain("spectral flatness: 0.190")
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
  })
})
