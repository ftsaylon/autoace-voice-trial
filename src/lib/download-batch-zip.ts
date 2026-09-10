import type { ConvexReactClient } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { buildBatchZipBlob } from "@/application/export-batch-zip"
import { downloadBlobFile } from "@/lib/export-clips"

export const downloadBatchZip = async (
  convex: ConvexReactClient,
  batchId: Id<"batches">,
): Promise<void> => {
  const detail = await convex.query(api.batches.get, { batchId })
  if (!detail) {
    return
  }
  const finishedRuns = detail.runs.filter(
    (run) => run.status === "complete" || run.status === "failed",
  )
  const results =
    finishedRuns.length > 0
      ? await convex.query(api.batches.listResultsForRuns, {
          batchId,
          runIds: finishedRuns.map((run) => run._id),
        })
      : []
  const blob = await buildBatchZipBlob({
    batchName: detail.batch.name,
    clips: detail.clips.map((clip) => ({
      _id: clip._id,
      name: clip.name,
      goldJson: clip.goldJson,
      state: clip.state,
      predictionJson: clip.predictionJson,
      errorJson: clip.errorJson,
      stage: clip.stage,
      startedAt: clip.startedAt,
      finishedAt: clip.finishedAt,
    })),
    runs: detail.runs.map((run) => ({
      _id: run._id,
      method: run.method,
      createdAt: run.createdAt,
      status: run.status,
    })),
    results: results.map((row) => ({
      runId: row.runId,
      clipId: row.clipId,
      state: row.state,
      predictionJson: row.predictionJson,
      errorJson: row.errorJson,
    })),
  })
  downloadBlobFile(`${detail.batch.name}.zip`, blob)
}
