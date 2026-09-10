/**
 * eGeMAPS-inspired F0, speaking rate, and HNR (Eyben et al., IEEE TAC 2016;
 * Boersma, IFA Proceedings 1993). Tone comes from pitch dynamics, not RMS.
 * The openSMILE binary is not bundled. Overlap stays false here; fuse() may
 * still apply stereo overlap for the method.
 */
import { measurePcm, SAMPLE_RATE } from "@/adapters/acoustic/ffmpeg-analyzer"
import type { AcousticMeasurements, ClipPrediction } from "@/domain"
import { noNoise, presentNoise } from "@/domain"

export type ProsodyMeasurements = {
  acoustic: AcousticMeasurements
  f0MeanHz: number
  f0RangeHz: number
  speakingRateHz: number
  hnrDb: number
}

const MIN_F0_HZ = 80
const MAX_F0_HZ = 400
const FRAME_SEC = 0.03
const HOP_SEC = 0.01

function autocorrelationLag(
  frame: Float32Array,
  minLag: number,
  maxLag: number,
): { lag: number; peak: number; energy: number } {
  let energy = 0
  for (let i = 0; i < frame.length; i++) {
    energy += frame[i]! * frame[i]!
  }
  let bestLag = minLag
  let best = 0
  for (let lag = minLag; lag <= maxLag && lag < frame.length; lag++) {
    let sum = 0
    for (let i = 0; i + lag < frame.length; i++) {
      sum += frame[i]! * frame[i + lag]!
    }
    if (sum > best) {
      best = sum
      bestLag = lag
    }
  }
  return { lag: bestLag, peak: best, energy }
}

export function measureProsody(samples: Float32Array): ProsodyMeasurements {
  const acoustic = measurePcm(samples)
  if (samples.length === 0) {
    return {
      acoustic,
      f0MeanHz: 0,
      f0RangeHz: 0,
      speakingRateHz: 0,
      hnrDb: 0,
    }
  }

  const frame = Math.round(FRAME_SEC * SAMPLE_RATE)
  const hop = Math.round(HOP_SEC * SAMPLE_RATE)
  const minLag = Math.floor(SAMPLE_RATE / MAX_F0_HZ)
  const maxLag = Math.floor(SAMPLE_RATE / MIN_F0_HZ)
  const f0s: number[] = []
  let hnrSum = 0
  let hnrCount = 0
  let speechIslands = 0
  let inSpeech = false

  const noiseFloor = acoustic.rms * 0.25
  const speechThresh = Math.max(0.01, noiseFloor)

  for (let start = 0; start + frame <= samples.length; start += hop) {
    const window = samples.subarray(start, start + frame)
    let rms = 0
    for (let i = 0; i < window.length; i++) {
      rms += window[i]! * window[i]!
    }
    rms = Math.sqrt(rms / window.length)
    const voiced = rms >= speechThresh
    if (voiced && !inSpeech) {
      speechIslands += 1
    }
    inSpeech = voiced
    if (!voiced) {
      continue
    }
    const copy = new Float32Array(window)
    const { lag, peak, energy } = autocorrelationLag(copy, minLag, maxLag)
    const periodic = Math.max(peak, 1e-12)
    const residual = Math.max(energy - peak, 1e-12)
    if (energy > 0 && peak / energy >= 0.3) {
      f0s.push(SAMPLE_RATE / lag)
      hnrSum += 10 * Math.log10(periodic / residual)
      hnrCount += 1
    }
  }

  const f0MeanHz =
    f0s.length === 0 ? 0 : f0s.reduce((sum, value) => sum + value, 0) / f0s.length
  const f0RangeHz =
    f0s.length === 0 ? 0 : Math.max(...f0s) - Math.min(...f0s)
  const speakingRateHz = acoustic.durationSec > 0 ? speechIslands / acoustic.durationSec : 0
  const hnrDb = hnrCount === 0 ? 0 : hnrSum / hnrCount

  return {
    acoustic,
    f0MeanHz,
    f0RangeHz,
    speakingRateHz,
    hnrDb,
  }
}

export function mapProsodyToPrediction(
  measured: ProsodyMeasurements,
): ClipPrediction {
  const { acoustic, f0RangeHz, speakingRateHz, hnrDb } = measured
  let emotional_tone: ClipPrediction["emotional_tone"] = "neutral"
  let emotional_intensity: ClipPrediction["emotional_intensity"] = "low"

  if (f0RangeHz >= 80 && speakingRateHz >= 3.5 && hnrDb < 8) {
    emotional_tone = "distressed"
    emotional_intensity = "high"
  } else if (f0RangeHz >= 50 && speakingRateHz >= 3) {
    emotional_tone = "upset"
    emotional_intensity = f0RangeHz >= 70 ? "high" : "medium"
  } else if (f0RangeHz >= 30 && speakingRateHz >= 2.8) {
    emotional_tone = "frustrated"
    emotional_intensity = "medium"
  } else if (f0RangeHz < 25 && speakingRateHz < 2 && hnrDb >= 12) {
    emotional_tone = "satisfied"
    emotional_intensity = "medium"
  }

  const noisy = acoustic.noiseFamily === "static"

  return {
    emotional_tone,
    emotional_intensity,
    background_noise: noisy
      ? presentNoise(
          acoustic.noiseFamily === "static" ? "broadband noise" : "background noise",
          acoustic.snrDb < 8 ? "medium" : "low",
        )
      : noNoise,
    audio_quality: "clear",
    speaker_overlap_present: false,
    long_silence_present: false,
    confidence: 0.45,
  }
}
