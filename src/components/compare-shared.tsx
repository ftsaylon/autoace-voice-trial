"use client"

import {
  COMPARE_FIELDS,
  SCORE_METRIC_KEYS,
  SCORE_METRIC_LABEL,
  fieldValue,
  metricValue,
  parsePredictionJson,
  scoresForRun,
  type CompareClipInput,
} from "@/application/compare-runs"
import { formatMetricCell } from "@/components/compare-bars"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatAnalyzeError, type AnalyzeError } from "@/domain"
import { formatDuration } from "@/lib/format-time"
import type { LabeledRun } from "@/lib/run-labels"
import { cn } from "@/lib/utils"
import { METHODS } from "@/application/methods"

export const compareErrorLabel = (errorJson?: string): string => {
  if (!errorJson) {
    return ""
  }
  try {
    return formatAnalyzeError(JSON.parse(errorJson) as AnalyzeError)
  } catch {
    return errorJson
  }
}

export const CompareScoreMatrix = ({
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

export const CompareClipTable = ({
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
        Per-clip results
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
                  const result = clip.byRun[run.id]
                  const prediction = parsePredictionJson(result?.predictionJson)
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
                      {METHODS[run.method].label}{" "}
                      {prediction?.emotional_tone ??
                        (result?.state === "failed" ? "failed" : "—")}
                    </span>
                  )
                })}
              </summary>
              <div className="space-y-4 px-5 pb-5">
                <div className="flex flex-wrap gap-3">
                  {runs.map((run) => {
                    const result = clip.byRun[run.id]
                    return (
                      <div
                        key={run.id}
                        className="rounded-lg border border-border px-3 py-2 text-xs"
                      >
                        <p className="font-medium">{run.shortLabel}</p>
                        <p className="mt-1 text-muted-foreground">
                          {result?.stage ?? result?.state ?? "—"}
                          {result?.startedAt || result?.finishedAt
                            ? ` · ${formatDuration(result?.startedAt, result?.finishedAt)}`
                            : ""}
                        </p>
                        {result?.errorJson ? (
                          <p className="mt-1 text-red-700 dark:text-red-400">
                            {compareErrorLabel(result.errorJson)}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
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
                          : compareErrorLabel(result?.errorJson) || "—"
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
