import JSZip from "jszip"
import { buildComparisonExports } from "@/application/export-comparison"
import {
  toCompareClipsFromResults,
  type CompareResultRow,
} from "@/application/compare-clips"
import { clipsToCsv, clipsToJson } from "@/lib/export-clips"
import { labelRuns, type LabeledRun } from "@/lib/run-labels"
import { overlayClipsForRun, type BaseClipRow } from "@/lib/overlay-clips"
import { runExportSlug } from "@/lib/run-export-slug"

export type BatchZipInput = {
  batchName: string
  clips: BaseClipRow[]
  runs: Array<{
    _id: string
    method: LabeledRun["method"]
    createdAt: number
    status: string
  }>
  results: CompareResultRow[]
}

const exportableClips = (clips: BaseClipRow[]) =>
  clips.map((clip) => ({
    name: clip.name,
    predictionJson: clip.predictionJson,
    errorJson: clip.errorJson,
  }))

export const buildBatchZipBlob = async (input: BatchZipInput): Promise<Blob> => {
  const zip = new JSZip()
  const finishedRuns = input.runs.filter(
    (run) => run.status === "complete" || run.status === "failed",
  )
  const labeledRuns = labelRuns(finishedRuns)
  const latestRun = [...finishedRuns].sort((a, b) => b.createdAt - a.createdAt)[0]

  if (latestRun) {
    const latestClips = overlayClipsForRun(input.clips, input.results, latestRun._id)
    zip.file("results.csv", clipsToCsv(exportableClips(latestClips)))
    zip.file("results.json", clipsToJson(exportableClips(latestClips)))
  }

  for (const run of labeledRuns) {
    const runClips = overlayClipsForRun(input.clips, input.results, run.id)
    const slug = runExportSlug(run)
    const folder = zip.folder(`runs/${slug}`)
    if (!folder) {
      continue
    }
    folder.file("results.csv", clipsToCsv(exportableClips(runClips)))
    folder.file("results.json", clipsToJson(exportableClips(runClips)))
  }

  if (labeledRuns.length >= 2) {
    const compareClips = toCompareClipsFromResults(input.clips, input.results)
    const comparisonFiles = buildComparisonExports(compareClips, labeledRuns)
    for (const [path, contents] of Object.entries(comparisonFiles)) {
      zip.file(path, contents)
    }
  }

  return await zip.generateAsync({ type: "blob" })
}
