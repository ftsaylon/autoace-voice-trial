import { describe, expect, it } from "vitest"
import { mapProsodyToPrediction, measureProsody } from "./measure-prosody"
import { acousticMeasurements } from "@/domain"

const SAMPLE_RATE = 16000

function tone(seconds: number, hz: number, amplitude = 0.2): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE)
  }
  return samples
}

function concat(parts: Float32Array[]): Float32Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Float32Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

describe("measureProsody", () => {
  it("estimates F0 near a steady 200 Hz tone", () => {
    const measured = measureProsody(tone(1, 200))
    expect(measured.f0MeanHz).toBeGreaterThan(160)
    expect(measured.f0MeanHz).toBeLessThan(240)
    expect(measured.f0RangeHz).toBeLessThan(40)
  })

  it("counts speech bursts for speaking rate", () => {
    const burst = tone(0.12, 180)
    const gap = new Float32Array(Math.round(0.2 * SAMPLE_RATE))
    const samples = concat([burst, gap, burst, gap, burst])
    const measured = measureProsody(samples)
    expect(measured.speakingRateHz).toBeGreaterThan(1)
  })
})

describe("mapProsodyToPrediction", () => {
  it("does not use RMS to pick tone", () => {
    const loudNeutral = mapProsodyToPrediction({
      acoustic: acousticMeasurements({
        durationSec: 4,
        longestSilenceSec: 0.2,
        snrDb: 25,
        clipFraction: 0,
        rms: 0.4,
        spectralFlatness: 0.1,
        noiseFamily: "clean",
      }),
      f0MeanHz: 140,
      f0RangeHz: 12,
      speakingRateHz: 1.2,
      hnrDb: 14,
    })
    expect(loudNeutral.emotional_tone).toBe("satisfied")
    expect(loudNeutral.emotional_tone).not.toBe("upset")
  })

  it("maps wide F0 range and fast rate to high-arousal tones", () => {
    const upset = mapProsodyToPrediction({
      acoustic: acousticMeasurements({
        durationSec: 4,
        longestSilenceSec: 0.1,
        snrDb: 20,
        clipFraction: 0,
        rms: 0.05,
        spectralFlatness: 0.12,
        noiseFamily: "clean",
      }),
      f0MeanHz: 210,
      f0RangeHz: 60,
      speakingRateHz: 3.2,
      hnrDb: 10,
    })
    expect(upset.emotional_tone).toBe("upset")
  })
})
