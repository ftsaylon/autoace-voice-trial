import type { CompareClipInput } from "@/application/compare-runs"

export type CompareResultRow = {
  runId: string
  clipId: string
  state: string
  predictionJson?: string
  errorJson?: string
  stage?: string
  startedAt?: number
  finishedAt?: number
}

export type CompareClipRow = {
  _id: string
  name: string
  goldJson?: string
}

export const toCompareClipsFromResults = (
  clips: CompareClipRow[],
  results: CompareResultRow[],
): CompareClipInput[] => {
  return clips.map((clip) => ({
    id: clip._id,
    name: clip.name,
    goldJson: clip.goldJson,
    byRun: Object.fromEntries(
      results
        .filter((row) => row.clipId === clip._id)
        .map((row) => [
          row.runId,
          {
            state: row.state,
            predictionJson: row.predictionJson,
            errorJson: row.errorJson,
            stage: row.stage,
            startedAt: row.startedAt,
            finishedAt: row.finishedAt,
          },
        ]),
    ),
  }))
}
