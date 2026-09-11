"use client"

import { useMemo, useState } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import {
  disagreementCounts,
  labeledClipCount,
  scoresForRun,
  type CompareFieldKey,
} from "@/application/compare-runs"
import { toCompareClipsFromResults } from "@/application/compare-clips"
import { CompareBars } from "@/components/compare-bars"
import { CompareConfusion } from "@/components/compare-confusion"
import { CompareHeatmap } from "@/components/compare-heatmap"
import { CompareClipTable, CompareScoreMatrix } from "@/components/compare-shared"
import { LoadingMessage } from "@/components/waveform-spinner"
import { labelRuns } from "@/lib/run-labels"
import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import type { MethodId } from "@/application/methods"

type ClipRow = {
  _id: string
  name: string
  goldJson?: string
}

type RunRow = {
  _id: string
  method: MethodId
  createdAt: number
  status: string
}

export const BatchCompare = ({
  batchId,
  clips,
  runs,
  results: resultsProp,
  onOpenClip,
}: {
  batchId: Id<"batches">
  clips: ClipRow[]
  runs: RunRow[]
  results?: Doc<"clipResults">[] | undefined
  onOpenClip: (clipId: string) => void
}) => {
  const { isAuthenticated } = useConvexAuth()
  const completed = useMemo(
    () => runs.filter((run) => run.status === "complete" || run.status === "failed"),
    [runs],
  )
  const labeledRuns = useMemo(() => labelRuns(completed), [completed])
  const runIds = useMemo(() => completed.map((run) => run._id), [completed])
  const fetchedResults = useQuery(
    api.batches.listResultsForRuns,
    isAuthenticated && resultsProp === undefined && runIds.length >= 2
      ? { batchId, runIds: runIds as Id<"runs">[] }
      : "skip",
  )
  const results = resultsProp ?? fetchedResults
  const [field, setField] = useState<CompareFieldKey>("emotional_tone")
  const [expandedClip, setExpandedClip] = useState<string | null>(null)

  const compareClips = useMemo(
    () => toCompareClipsFromResults(clips, results ?? []),
    [clips, results],
  )
  const labeled = labeledClipCount(compareClips) > 0
  const scoreByRun = useMemo(
    () =>
      new Map(
        labeledRuns.map((run) => [run.id, scoresForRun(compareClips, run.id)] as const),
      ),
    [compareClips, labeledRuns],
  )
  const disagreements = useMemo(
    () => disagreementCounts(compareClips, labeledRuns.map((run) => run.id)),
    [compareClips, labeledRuns],
  )

  const openClip = (clipId: string) => {
    setExpandedClip(clipId)
    onOpenClip(clipId)
    document.getElementById(`compare-clip-${clipId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    })
  }

  if (completed.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Run another method on this batch to compare results.
      </p>
    )
  }

  if (results === undefined) {
    return <LoadingMessage>Loading results…</LoadingMessage>
  }

  return (
    <div className="space-y-6">
      <CompareBars clips={compareClips} runs={labeledRuns} labeled={labeled} />
      {labeled ? <CompareConfusion clips={compareClips} runs={labeledRuns} /> : null}
      <CompareHeatmap
        clips={compareClips}
        runs={labeledRuns}
        field={field}
        onFieldChange={setField}
        onRowClick={openClip}
      />
      {labeled ? (
        <CompareScoreMatrix runs={labeledRuns} scoreByRun={scoreByRun} />
      ) : null}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium">Disagreement</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Clips where runs predicted different values on the same field.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {disagreements.map((row) => (
            <li key={row.field} className="flex justify-between gap-4">
              <span>{row.label}</span>
              <span className="text-muted-foreground">
                {row.disagreed}/{row.compared} clips differ
              </span>
            </li>
          ))}
        </ul>
      </section>
      <CompareClipTable
        clips={compareClips}
        runs={labeledRuns}
        expandedClip={expandedClip}
        onToggle={setExpandedClip}
      />
    </div>
  )
}
