import { describe, expect, it } from "vitest"
import { measurePcm, measureStereo, SAMPLE_RATE } from "./measure-acoustics"
import { measurePcm as measureFromAnalyzer } from "./ffmpeg-analyzer"

function tone(seconds: number, hz: number, amplitude = 0.2): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE)
  }
  return samples
}

function whiteNoise(seconds: number, amplitude = 0.2, seed = 1): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  let state = seed
  for (let i = 0; i < samples.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0
    samples[i] = amplitude * ((state / 0xffffffff) * 2 - 1)
  }
  return samples
}

function amTone(seconds: number, carrierHz: number, modHz: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * modHz * t)
    samples[i] = 0.2 * env * Math.sin(2 * Math.PI * carrierHz * t)
  }
  return samples
}

describe("measurePcm synthetic signals", () => {
  it("flags an 8 second quiet stretch as long silence", () => {
    const samples = new Float32Array(SAMPLE_RATE * 10)
    for (let i = 0; i < SAMPLE_RATE; i++) {
      samples[i] = 0.2
    }
    const measured = measurePcm(samples)
    expect(measured.durationSec).toBeCloseTo(10)
    expect(measured.longestSilenceSec).toBeGreaterThanOrEqual(8)
  })

  it("gives white noise high spectral flatness and a static family", () => {
    const measured = measurePcm(whiteNoise(1.2))
    expect(measured.spectralFlatness).toBeGreaterThan(0.4)
    expect(measured.unvoicedSpectralFlatness).toBeGreaterThan(0.35)
    expect(measured.noiseFamily).toBe("static")
  })

  it("gives a pure tone low spectral flatness and high HNR", () => {
    const measured = measurePcm(tone(1.2, 200))
    expect(measured.spectralFlatness).toBeLessThan(0.2)
    expect(measured.hnrDb).toBeGreaterThan(5)
    expect(measured.noiseFamily).toBe("clean")
  })

  it("peaks the 2–8 Hz modulation ratio for 4 Hz amplitude modulation", () => {
    const modulated = measurePcm(amTone(2, 180, 4))
    const steady = measurePcm(tone(2, 180))
    expect(modulated.modulationRatio).toBeGreaterThan(steady.modulationRatio)
    expect(modulated.modulationRatio).toBeGreaterThan(5)
  })

  it("does not call a tone-plus-hiss mix clean", () => {
    const voiced = tone(1.2, 180, 0.12)
    const hiss = whiteNoise(1.2, 0.12)
    const mixed = new Float32Array(voiced.length)
    for (let i = 0; i < voiced.length; i++) {
      mixed[i] = voiced[i]! + hiss[i]!
    }
    expect(measurePcm(mixed).noiseFamily).not.toBe("clean")
  })

  it("lowers HNR when two F0s are summed", () => {
    const a = tone(1.2, 180)
    const b = tone(1.2, 250)
    const mixed = new Float32Array(a.length)
    for (let i = 0; i < a.length; i++) {
      mixed[i] = 0.5 * (a[i]! + b[i]!)
    }
    const one = measurePcm(a)
    const two = measurePcm(mixed)
    expect(two.hnrDb).toBeLessThan(one.hnrDb)
  })
})

describe("measureStereo", () => {
  it("treats copied channels as dual-mono", () => {
    const mono = tone(1, 180)
    const measured = measureStereo(mono, new Float32Array(mono))
    expect(measured.channelCorrelation).toBeGreaterThan(0.99)
    expect(measured.channelCount).toBe(1)
    expect(measured.overlapEvidence).not.toBe("stereo_both_active")
  })

  it("marks independent channels as stereo both-active overlap", () => {
    const left = tone(1.2, 180)
    const right = tone(1.2, 250)
    const measured = measureStereo(left, right)
    expect(measured.channelCorrelation).toBeLessThan(0.85)
    expect(measured.channelCount).toBe(2)
    expect(measured.bothChannelsActiveFraction).toBeGreaterThan(0.05)
    expect(measured.overlapEvidence).toBe("stereo_both_active")
  })
})

describe("ffmpeg-analyzer re-export", () => {
  it("exports the same measurePcm", () => {
    expect(measureFromAnalyzer).toBe(measurePcm)
  })
})
