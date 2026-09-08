import { derivedBatchStatus, type Batch, type ClipPrediction } from "@/domain";
import type { BatchRepository } from "./ports";

export type FieldScores = {
  emotional_tone: { accuracy: number; correct: number; total: number };
  background_noise_present: { accuracy: number; correct: number; total: number };
  audio_quality: { accuracy: number; correct: number; total: number };
  speaker_overlap_present: { accuracy: number; correct: number; total: number };
  long_silence_present: { accuracy: number; correct: number; total: number };
};

export type BatchView = {
  id: string;
  createdAt: number;
  status: ReturnType<typeof derivedBatchStatus>;
  parseIssues: string[];
  clips: Batch["clips"];
  labeledCount: number;
  scores: FieldScores | null;
};

function scoreBoolean(
  pairs: { gold: boolean; pred: boolean }[],
): { accuracy: number; correct: number; total: number } {
  const total = pairs.length;
  const correct = pairs.filter((pair) => pair.gold === pair.pred).length;
  return { accuracy: total === 0 ? 0 : correct / total, correct, total };
}

function scoreTone(
  pairs: { gold: ClipPrediction; pred: ClipPrediction }[],
): { accuracy: number; correct: number; total: number } {
  const total = pairs.length;
  const correct = pairs.filter(
    (pair) => pair.gold.emotional_tone === pair.pred.emotional_tone,
  ).length;
  return { accuracy: total === 0 ? 0 : correct / total, correct, total };
}

export function scoresFor(batch: Batch): FieldScores | null {
  const labeled = batch.clips.filter(
    (clip) => clip.gold && clip.prediction && clip.state === "succeeded",
  ) as Array<{ gold: ClipPrediction; prediction: ClipPrediction }>;
  if (labeled.length === 0) {
    return null;
  }
  const pairs = labeled.map((clip) => ({ gold: clip.gold, pred: clip.prediction }));
  return {
    emotional_tone: scoreTone(pairs),
    background_noise_present: scoreBoolean(
      pairs.map((pair) => ({
        gold: pair.gold.background_noise.present,
        pred: pair.pred.background_noise.present,
      })),
    ),
    audio_quality: {
      accuracy:
        pairs.filter((pair) => pair.gold.audio_quality === pair.pred.audio_quality)
          .length / pairs.length,
      correct: pairs.filter(
        (pair) => pair.gold.audio_quality === pair.pred.audio_quality,
      ).length,
      total: pairs.length,
    },
    speaker_overlap_present: scoreBoolean(
      pairs.map((pair) => ({
        gold: pair.gold.speaker_overlap_present,
        pred: pair.pred.speaker_overlap_present,
      })),
    ),
    long_silence_present: scoreBoolean(
      pairs.map((pair) => ({
        gold: pair.gold.long_silence_present,
        pred: pair.pred.long_silence_present,
      })),
    ),
  };
}

export async function getBatch(
  repo: BatchRepository,
  id: string,
): Promise<BatchView | null> {
  const batch = await repo.get(id);
  if (!batch) {
    return null;
  }
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    status: derivedBatchStatus(batch.clips),
    parseIssues: batch.parseIssues,
    clips: batch.clips,
    labeledCount: batch.clips.filter((clip) => clip.gold).length,
    scores: scoresFor(batch),
  };
}
