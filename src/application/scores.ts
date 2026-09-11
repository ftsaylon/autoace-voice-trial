import { EMOTIONAL_TONES, normalizeNoiseType, type ClipPrediction, type EmotionalTone } from "@/domain"

export type FieldScore = {
  accuracy: number
  correct: number
  total: number
  f1?: number
}

export type FieldScores = {
  emotional_tone: FieldScore
  emotional_intensity: FieldScore
  background_noise_present: FieldScore
  background_noise_type: FieldScore
  background_noise_severity: FieldScore
  audio_quality: FieldScore
  speaker_overlap_present: FieldScore
  long_silence_present: FieldScore
  confidence: FieldScore
}

export type LabeledPair = {
  gold: ClipPrediction
  prediction: ClipPrediction
}

const CONFIDENCE_MATCH_MAX_ABS = 0.2

const scoreRatio = (correct: number, total: number): FieldScore => {
  return {
    accuracy: total === 0 ? 0 : correct / total,
    correct,
    total,
  }
}

export const macroF1 = (
  pairs: Array<{ gold: string; pred: string }>,
  labels: readonly string[],
): number => {
  if (pairs.length === 0) {
    return 0
  }
  const perClass: number[] = []
  for (const label of labels) {
    let tp = 0
    let fp = 0
    let fn = 0
    for (const pair of pairs) {
      if (pair.pred === label && pair.gold === label) {
        tp += 1
      } else if (pair.pred === label && pair.gold !== label) {
        fp += 1
      } else if (pair.pred !== label && pair.gold === label) {
        fn += 1
      }
    }
    if (tp + fp + fn === 0) {
      continue
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
    perClass.push(
      precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    )
  }
  if (perClass.length === 0) {
    return 0
  }
  return perClass.reduce((sum, value) => sum + value, 0) / perClass.length
}

export const toneClassCounts = (
  pairs: LabeledPair[],
): Record<EmotionalTone, { gold: number; predicted: number; correct: number }> => {
  const counts = {} as Record<
    EmotionalTone,
    { gold: number; predicted: number; correct: number }
  >
  for (const tone of EMOTIONAL_TONES) {
    counts[tone] = { gold: 0, predicted: 0, correct: 0 }
  }
  for (const pair of pairs) {
    counts[pair.gold.emotional_tone].gold += 1
    counts[pair.prediction.emotional_tone].predicted += 1
    if (pair.gold.emotional_tone === pair.prediction.emotional_tone) {
      counts[pair.gold.emotional_tone].correct += 1
    }
  }
  return counts
}

const noiseTypeKey = (prediction: ClipPrediction): string => {
  if (!prediction.background_noise.present) {
    return ""
  }
  return normalizeNoiseType(prediction.background_noise.type).toLowerCase()
}

export const scoresForPairs = (pairs: LabeledPair[]): FieldScores | null => {
  if (pairs.length === 0) {
    return null
  }
  const toneCorrect = pairs.filter(
    (pair) => pair.gold.emotional_tone === pair.prediction.emotional_tone,
  ).length
  return {
    emotional_tone: {
      ...scoreRatio(toneCorrect, pairs.length),
      f1: macroF1(
        pairs.map((pair) => ({
          gold: pair.gold.emotional_tone,
          pred: pair.prediction.emotional_tone,
        })),
        EMOTIONAL_TONES,
      ),
    },
    emotional_intensity: scoreRatio(
      pairs.filter(
        (pair) => pair.gold.emotional_intensity === pair.prediction.emotional_intensity,
      ).length,
      pairs.length,
    ),
    background_noise_present: scoreRatio(
      pairs.filter(
        (pair) =>
          pair.gold.background_noise.present === pair.prediction.background_noise.present,
      ).length,
      pairs.length,
    ),
    background_noise_type: scoreRatio(
      pairs.filter((pair) => noiseTypeKey(pair.gold) === noiseTypeKey(pair.prediction))
        .length,
      pairs.length,
    ),
    background_noise_severity: scoreRatio(
      pairs.filter(
        (pair) =>
          pair.gold.background_noise.severity === pair.prediction.background_noise.severity,
      ).length,
      pairs.length,
    ),
    audio_quality: scoreRatio(
      pairs.filter((pair) => pair.gold.audio_quality === pair.prediction.audio_quality)
        .length,
      pairs.length,
    ),
    speaker_overlap_present: scoreRatio(
      pairs.filter(
        (pair) =>
          pair.gold.speaker_overlap_present === pair.prediction.speaker_overlap_present,
      ).length,
      pairs.length,
    ),
    long_silence_present: scoreRatio(
      pairs.filter(
        (pair) => pair.gold.long_silence_present === pair.prediction.long_silence_present,
      ).length,
      pairs.length,
    ),
    confidence: scoreRatio(
      pairs.filter(
        (pair) =>
          Math.abs(pair.gold.confidence - pair.prediction.confidence) <=
          CONFIDENCE_MATCH_MAX_ABS,
      ).length,
      pairs.length,
    ),
  }
}
