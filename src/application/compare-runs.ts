import {
  EMOTIONAL_TONES,
  fromAutoAceJson,
  type ClipPrediction,
  type EmotionalTone,
} from "@/domain"
import {
  fieldMatches,
  scoresForPairs,
  type FieldScores,
  type LabeledPair,
} from "@/application/scores"
export type CompareClipInput = {
  id: string
  name: string
  goldJson?: string
  byRun: Record<
    string,
    {
      predictionJson?: string
      errorJson?: string
      state: string
      stage?: string
      startedAt?: number
      finishedAt?: number
    }
  >
}

export const SCORE_METRIC_KEYS = [
  "emotional_tone",
  "emotional_tone_f1",
  "emotional_intensity",
  "background_noise_present",
  "background_noise_type",
  "background_noise_severity",
  "audio_quality",
  "speaker_overlap_present",
  "long_silence_present",
  "confidence",
] as const

export type ScoreMetricKey = (typeof SCORE_METRIC_KEYS)[number]

export const SCORE_METRIC_LABEL: Record<ScoreMetricKey, string> = {
  emotional_tone: "Tone",
  emotional_tone_f1: "Tone F1",
  emotional_intensity: "Intensity",
  background_noise_present: "Noise",
  background_noise_type: "Noise type",
  background_noise_severity: "Noise severity",
  audio_quality: "Quality",
  speaker_overlap_present: "Overlap",
  long_silence_present: "Silence",
  confidence: "Confidence",
}

export const COMPARE_FIELDS = [
  { key: "emotional_tone", label: "Tone" },
  { key: "emotional_intensity", label: "Intensity" },
  { key: "background_noise_present", label: "Noise present" },
  { key: "background_noise_type", label: "Noise type" },
  { key: "background_noise_severity", label: "Noise severity" },
  { key: "audio_quality", label: "Quality" },
  { key: "speaker_overlap_present", label: "Overlap" },
  { key: "long_silence_present", label: "Long silence" },
  { key: "confidence", label: "Confidence" },
] as const

export type CompareFieldKey = (typeof COMPARE_FIELDS)[number]["key"]

export const parsePredictionJson = (json?: string): ClipPrediction | null => {
  if (!json) {
    return null
  }
  const parsed = fromAutoAceJson(json)
  return parsed.ok ? parsed.value : null
}

export const fieldValue = (
  prediction: ClipPrediction,
  key: CompareFieldKey,
): string => {
  switch (key) {
    case "emotional_tone":
      return prediction.emotional_tone
    case "emotional_intensity":
      return prediction.emotional_intensity
    case "background_noise_present":
      return prediction.background_noise.present ? "true" : "false"
    case "background_noise_type":
      return prediction.background_noise.type || "—"
    case "background_noise_severity":
      return prediction.background_noise.severity
    case "audio_quality":
      return prediction.audio_quality
    case "speaker_overlap_present":
      return prediction.speaker_overlap_present ? "true" : "false"
    case "long_silence_present":
      return prediction.long_silence_present ? "true" : "false"
    case "confidence":
      return prediction.confidence.toFixed(2)
  }
}

export const compareFieldForMetric = (
  key: ScoreMetricKey,
): CompareFieldKey | null => {
  if (key === "emotional_tone_f1") {
    return null
  }
  const match = COMPARE_FIELDS.find((field) => field.key === key)
  return match?.key ?? null
}

export const scoresForRun = (clips: CompareClipInput[], runId: string): FieldScores | null => {
  const pairs: LabeledPair[] = []
  for (const clip of clips) {
    const gold = parsePredictionJson(clip.goldJson)
    const result = clip.byRun[runId]
    if (!gold || !result || result.state !== "succeeded") {
      continue
    }
    const prediction = parsePredictionJson(result.predictionJson)
    if (!prediction) {
      continue
    }
    pairs.push({ gold, prediction })
  }
  return scoresForPairs(pairs)
}

export const metricValue = (scores: FieldScores, key: ScoreMetricKey): number => {
  if (key === "emotional_tone_f1") {
    return scores.emotional_tone.f1 ?? 0
  }
  return scores[key].accuracy
}

export const metricCorrect = (
  scores: FieldScores,
  key: ScoreMetricKey,
): { correct: number; total: number } => {
  if (key === "emotional_tone_f1") {
    return {
      correct: scores.emotional_tone.correct,
      total: scores.emotional_tone.total,
    }
  }
  return { correct: scores[key].correct, total: scores[key].total }
}

export type DisagreementRow = {
  field: CompareFieldKey
  label: string
  disagreed: number
  compared: number
}

export const disagreementCounts = (
  clips: CompareClipInput[],
  runIds: string[],
): DisagreementRow[] => {
  return COMPARE_FIELDS.map((field) => {
    let compared = 0
    let disagreed = 0
    for (const clip of clips) {
      const values: string[] = []
      let missing = false
      for (const runId of runIds) {
        const result = clip.byRun[runId]
        const prediction = parsePredictionJson(result?.predictionJson)
        if (!result || result.state !== "succeeded" || !prediction) {
          missing = true
          break
        }
        values.push(fieldValue(prediction, field.key))
      }
      if (missing || values.length === 0) {
        continue
      }
      compared += 1
      if (values.some((value) => value !== values[0])) {
        disagreed += 1
      }
    }
    return { field: field.key, label: field.label, disagreed, compared }
  })
}

export const agreementRate = (
  clips: CompareClipInput[],
  runIds: string[],
  field: CompareFieldKey,
): { rate: number; agreed: number; compared: number } => {
  const row = disagreementCounts(clips, runIds).find((item) => item.field === field)
  const compared = row?.compared ?? 0
  const disagreed = row?.disagreed ?? 0
  const agreed = compared - disagreed
  return {
    rate: compared === 0 ? 0 : agreed / compared,
    agreed,
    compared,
  }
}

export type ConfusionMatrix = {
  labels: readonly EmotionalTone[]
  counts: number[][]
  total: number
}

export const confusionMatrixForRun = (
  clips: CompareClipInput[],
  runId: string,
): ConfusionMatrix | null => {
  const labels = EMOTIONAL_TONES
  const index = new Map(labels.map((label, i) => [label, i] as const))
  const counts = labels.map(() => labels.map(() => 0))
  let total = 0
  for (const clip of clips) {
    const gold = parsePredictionJson(clip.goldJson)
    const result = clip.byRun[runId]
    const prediction = parsePredictionJson(result?.predictionJson)
    if (!gold || !prediction || result?.state !== "succeeded") {
      continue
    }
    const row = index.get(gold.emotional_tone)
    const col = index.get(prediction.emotional_tone)
    if (row === undefined || col === undefined) {
      continue
    }
    counts[row]![col] = (counts[row]![col] ?? 0) + 1
    total += 1
  }
  if (total === 0) {
    return null
  }
  return { labels, counts, total }
}

export type HeatmapCell = {
  runId: string
  value: string
  matchGold: boolean | null
  disagreesMajority: boolean
}

export type HeatmapRow = {
  clipId: string
  name: string
  gold: string | null
  cells: HeatmapCell[]
}

export const heatmapRows = (
  clips: CompareClipInput[],
  runIds: string[],
  field: CompareFieldKey,
): HeatmapRow[] => {
  return [...clips]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((clip) => {
      const goldPred = parsePredictionJson(clip.goldJson)
      const gold = goldPred ? fieldValue(goldPred, field) : null
      const raw = runIds.map((runId) => {
        const result = clip.byRun[runId]
        const prediction = parsePredictionJson(result?.predictionJson)
        return {
          runId,
          value: prediction ? fieldValue(prediction, field) : "—",
          matchGold:
            goldPred === null || !prediction
              ? null
              : fieldMatches(goldPred, prediction, field),
        }
      })
      const succeeded = raw.filter((cell) => cell.value !== "—").map((cell) => cell.value)
      const majority = majorityValue(succeeded)
      return {
        clipId: clip.id,
        name: clip.name,
        gold,
        cells: raw.map((cell) => ({
          ...cell,
          disagreesMajority:
            majority !== null && cell.value !== "—" && cell.value !== majority,
        })),
      }
    })
}

const majorityValue = (values: string[]): string | null => {
  if (values.length === 0) {
    return null
  }
  const counts = new Map<string, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

export const comparisonCsv = (
  clips: CompareClipInput[],
  runs: Array<{ id: string; label: string }>,
): string => {
  const headers = [
    "name",
    "gold_tone",
    ...runs.flatMap((run) => [`${run.label}_tone`, `${run.label}_error`]),
  ]
  const lines = [...clips]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((clip) => {
      const gold = parsePredictionJson(clip.goldJson)
      const cells = [
        clip.name,
        gold?.emotional_tone ?? "",
        ...runs.flatMap((run) => {
          const result = clip.byRun[run.id]
          const prediction = parsePredictionJson(result?.predictionJson)
          return [prediction?.emotional_tone ?? "", result?.errorJson ?? ""]
        }),
      ]
      return cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")
    })
  return [headers.join(","), ...lines].join("\n")
}

export const labeledClipCount = (clips: CompareClipInput[]): number => {
  return clips.filter((clip) => parsePredictionJson(clip.goldJson)).length
}
