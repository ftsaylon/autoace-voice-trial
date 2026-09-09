import {
  fromAutoAceJson,
  type AutoAceJson,
  type ClipPrediction,
} from "@/domain"
import { scoresForPairs, type FieldScores, type LabeledPair } from "@/application/scores"

export type ClipDoc = {
  name: string
  state: "uploading" | "queued" | "running" | "succeeded" | "failed"
  goldJson?: string
  predictionJson?: string
  errorJson?: string
  stage?: string
  startedAt?: number
  finishedAt?: number
}

export const parsePredictionJson = (json?: string): ClipPrediction | null => {
  if (!json) {
    return null
  }
  const parsed = fromAutoAceJson(json)
  return parsed.ok ? parsed.value : null
}

export const flattenPrediction = (prediction: ClipPrediction): AutoAceJson => {
  return {
    emotional_tone: prediction.emotional_tone,
    emotional_intensity: prediction.emotional_intensity,
    background_noise_present: prediction.background_noise.present,
    background_noise_type: prediction.background_noise.type,
    background_noise_severity: prediction.background_noise.severity,
    audio_quality: prediction.audio_quality,
    speaker_overlap_present: prediction.speaker_overlap_present,
    long_silence_present: prediction.long_silence_present,
    confidence: prediction.confidence,
  }
}

export const DIFF_FIELDS: Array<{ key: keyof AutoAceJson; label: string }> = [
  { key: "emotional_tone", label: "Tone" },
  { key: "emotional_intensity", label: "Intensity" },
  { key: "background_noise_present", label: "Noise present" },
  { key: "background_noise_type", label: "Noise type" },
  { key: "background_noise_severity", label: "Noise severity" },
  { key: "audio_quality", label: "Quality" },
  { key: "speaker_overlap_present", label: "Overlap" },
  { key: "long_silence_present", label: "Long silence" },
  { key: "confidence", label: "Confidence" },
]

export const scoresFromClips = (clips: ClipDoc[]): FieldScores | null => {
  const pairs: LabeledPair[] = []
  for (const clip of clips) {
    if (clip.state !== "succeeded") {
      continue
    }
    const gold = parsePredictionJson(clip.goldJson)
    const prediction = parsePredictionJson(clip.predictionJson)
    if (!gold || !prediction) {
      continue
    }
    pairs.push({ gold, prediction })
  }
  return scoresForPairs(pairs)
}

export const labeledCount = (clips: ClipDoc[]): number => {
  return clips.filter((clip) => parsePredictionJson(clip.goldJson)).length
}

export const formatFieldValue = (value: AutoAceJson[keyof AutoAceJson]): string => {
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }
  if (typeof value === "number") {
    return value.toFixed(2)
  }
  return value === "" ? "—" : String(value)
}
