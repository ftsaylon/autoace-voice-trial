"use client"

import { useMemo, useState } from "react"
import {
  COMPARE_FIELDS,
  SCORE_METRIC_KEYS,
  SCORE_METRIC_LABEL,
  comparisonCsv,
  disagreementCounts,
  fieldValue,
  latestRunIdsPerMethod,
  labeledClipCount,
  parsePredictionJson,
  scoresForRun,
  metricValue,
  type CompareClipInput,
  type CompareFieldKey,
} from "@/application/compare-runs"
import { CompareBars, formatMetricCell } from "@/components/compare-bars"
import { CompareConfusion } from "@/components/compare-confusion"
import { CompareHeatmap } from "@/components/compare-heatmap"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { downloadTextFile } from "@/lib/export-clips"
import { labelRuns, type LabeledRun } from "@/lib/run-labels"
import { cn } from "@/lib/utils"
import { METHODS, type MethodId } from "@/application/methods"
import { formatAnalyzeError, type AnalyzeError } from "@/domain"

type ResultRow = {
  runId: string
  clipId: string
  state: string
  predictionJson?: string
  errorJson?: string
}

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

const errorLabel = (errorJson?: string): string => {
  if (!errorJson) {
    return ""
  }
  try {
    return formatAnalyzeError(JSON.parse(errorJson) as AnalyzeError)
  } catch {
    return errorJson
  }
}

const toCompareClips = (clips: ClipRow[], results: ResultRow[]): CompareClipInput[] => {
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
          },
        ]),
    ),
  }))
}

export const BatchCompare = ({
  batchName,
  clips,
  runs,
  results,
  onOpenClip,
}: {
  batchName: string
  clips: ClipRow[]
  runs: RunRow[]
  results: ResultRow[]
  onOpenClip: (clipId: string) => void
}) => {
  const completed = runs.filter((run) => run.status === "complete" || run.status === "failed")
  const labeledRuns = useMemo(() => labelRuns(completed), [completed])
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    latestRunIdsPerMethod(completed.map((run) => ({
      id: run._id,
      method: run.method,
      createdAt: run.createdAt,
    }))),
  )
  const [field, setField] = useState<CompareFieldKey>("emotional_tone")
  const [expandedClip, setExpandedClip] = useState<string | null>(null)

  const selected = labeledRuns.filter((run) => selectedIds.includes(run.id))
  const compareClips = useMemo(
    () => toCompareClips(clips, results),
    [clips, results],
  )
  const labeled = labeledClipCount(compareClips) > 0
  const scoreByRun = useMemo(
    () =>
      new Map(selected.map((run) => [run.id, scoresForRun(compareClips, run.id)] as const)),
    [compareClips, selected],
  )
  const disagreements = useMemo(
    () => disagreementCounts(compareClips, selected.map((run) => run.id)),
    [compareClips, selected],
  )

  const toggleRun = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((item) => item !== id)
      }
      return [...current, id]
    })
  }

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

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium">Runs to compare</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Defaults to the latest run of each method. Older runs stay available.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {labeledRuns.map((run) => {
            const pressed = selectedIds.includes(run.id)
            return (
              <button
                key={run.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => toggleRun(run.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  pressed
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/40",
                )}
              >
                {run.label}
              </button>
            )
          })}
        </div>
      </section>

      {selected.length >= 2 ? (
        <>
          <CompareBars clips={compareClips} runs={selected} labeled={labeled} />
          {labeled ? <CompareConfusion clips={compareClips} runs={selected} /> : null}
          <CompareHeatmap
            clips={compareClips}
            runs={selected}
            field={field}
            onFieldChange={setField}
            onRowClick={openClip}
          />
          {labeled ? (
            <ScoreMatrix runs={selected} scoreByRun={scoreByRun} />
          ) : null}
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-medium">Disagreement</h3>
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
            runs={selected}
            expandedClip={expandedClip}
            onToggle={setExpandedClip}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              downloadTextFile(
                `${batchName}-comparison.csv`,
                comparisonCsv(
                  compareClips,
                  selected.map((run) => ({ id: run.id, label: run.shortLabel })),
                ),
                "text/csv",
              )
            }
          >
            Download comparison CSV
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Select at least two runs.</p>
      )}
    </div>
  )
}

const ScoreMatrix = ({
  runs,
  scoreByRun,
}: {
  runs: LabeledRun[]
  scoreByRun: Map<string, ReturnType<typeof scoresForRun>>
}) => {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3 text-sm font-medium">
        Score matrix
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            {runs.map((run) => (
              <TableHead key={run.id}>{run.shortLabel}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {SCORE_METRIC_KEYS.map((key) => {
            const values = runs.map((run) => {
              const scores = scoreByRun.get(run.id)
              if (!scores) {
                return null
              }
              return metricValue(scores, key)
            })
            const numeric = values.filter((value): value is number => value !== null)
            const best = numeric.length > 0 ? Math.max(...numeric) : null
            return (
              <TableRow key={key}>
                <TableCell>{SCORE_METRIC_LABEL[key]}</TableCell>
                {runs.map((run, index) => (
                  <TableCell
                    key={run.id}
                    className={
                      best !== null && values[index] === best ? "font-medium" : ""
                    }
                  >
                    {formatMetricCell(scoreByRun.get(run.id) ?? null, key)}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}

const CompareClipTable = ({
  clips,
  runs,
  expandedClip,
  onToggle,
}: {
  clips: CompareClipInput[]
  runs: LabeledRun[]
  expandedClip: string | null
  onToggle: (clipId: string | null) => void
}) => {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3 text-sm font-medium">
        Per-clip comparison
      </div>
      {[...clips]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((clip) => {
          const gold = parsePredictionJson(clip.goldJson)
          const open = expandedClip === clip.id
          return (
            <details
              key={clip.id}
              id={`compare-clip-${clip.id}`}
              open={open}
              onToggle={(event) => {
                if (event.currentTarget.open) {
                  onToggle(clip.id)
                } else if (expandedClip === clip.id) {
                  onToggle(null)
                }
              }}
              className="border-b border-border last:border-b-0"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {clip.name}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  gold {gold ? gold.emotional_tone : "unlabeled"}
                </span>
                {runs.map((run) => {
                  const prediction = parsePredictionJson(
                    clip.byRun[run.id]?.predictionJson,
                  )
                  const match =
                    !gold || !prediction || gold.emotional_tone === prediction.emotional_tone
                  return (
                    <span
                      key={run.id}
                      className={cn(
                        "hidden text-xs sm:inline",
                        match
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-700 dark:text-red-400",
                      )}
                    >
                      {METHODS[run.method].label} {prediction?.emotional_tone ?? "—"}
                    </span>
                  )
                })}
              </summary>
              <div className="space-y-2 px-5 pb-5">
                {COMPARE_FIELDS.map((field) => {
                  const goldValue = gold ? fieldValue(gold, field.key) : null
                  return (
                    <div
                      key={field.key}
                      className="grid gap-2 text-sm md:grid-cols-[8rem_repeat(auto-fit,minmax(6rem,1fr))]"
                    >
                      <span className="text-muted-foreground">{field.label}</span>
                      <span className="text-muted-foreground">
                        {goldValue === null ? "unlabeled" : `gold ${goldValue}`}
                      </span>
                      {runs.map((run) => {
                        const result = clip.byRun[run.id]
                        const prediction = parsePredictionJson(result?.predictionJson)
                        const value = prediction
                          ? fieldValue(prediction, field.key)
                          : errorLabel(result?.errorJson) || "—"
                        const match = goldValue === null || goldValue === value
                        return (
                          <span
                            key={run.id}
                            className={
                              match
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-red-700 dark:text-red-400"
                            }
                          >
                            {run.shortLabel} {value}
                          </span>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
    </section>
  )
}
