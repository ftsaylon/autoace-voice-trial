import { derivedBatchStatus, type Batch, type ClipPrediction } from "@/domain"
import type { BatchRepository } from "./ports"
import { scoresForPairs, type FieldScores, type LabeledPair } from "./scores"

export type { FieldScores } from "./scores"

export type BatchView = {
  id: string
  createdAt: number
  status: ReturnType<typeof derivedBatchStatus>
  parseIssues: string[]
  clips: Batch["clips"]
  labeledCount: number
  scores: FieldScores | null
}

export const scoresFor = (batch: Batch): FieldScores | null => {
  const labeled = batch.clips.filter(
    (clip) => clip.gold && clip.prediction && clip.state === "succeeded",
  ) as Array<{ gold: ClipPrediction; prediction: ClipPrediction }>
  const pairs: LabeledPair[] = labeled.map((clip) => ({
    gold: clip.gold,
    prediction: clip.prediction,
  }))
  return scoresForPairs(pairs)
}

export async function getBatch(
  repo: BatchRepository,
  id: string,
): Promise<BatchView | null> {
  const batch = await repo.get(id)
  if (!batch) {
    return null
  }
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    status: derivedBatchStatus(batch.clips),
    parseIssues: batch.parseIssues,
    clips: batch.clips,
    labeledCount: batch.clips.filter((clip) => clip.gold).length,
    scores: scoresFor(batch),
  }
}
