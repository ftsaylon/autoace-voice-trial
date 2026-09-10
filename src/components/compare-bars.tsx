"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  SCORE_METRIC_KEYS,
  SCORE_METRIC_LABEL,
  agreementRate,
  metricCorrect,
  metricValue,
  scoresForRun,
  type CompareClipInput,
  type ScoreMetricKey,
} from "@/application/compare-runs"
import { runChartColor } from "@/components/batch-badges"
import type { LabeledRun } from "@/lib/run-labels"
import { formatPercent } from "@/lib/format-time"

export const CompareBars = ({
  clips,
  runs,
  labeled,
}: {
  clips: CompareClipInput[]
  runs: LabeledRun[]
  labeled: boolean
}) => {
  if (runs.length === 0) {
    return null
  }

  if (!labeled) {
    const data = SCORE_METRIC_KEYS.filter((key) => key !== "emotional_tone_f1").map(
      (key) => {
        const field =
          key === "emotional_tone"
            ? "emotional_tone"
            : key
        const stats = agreementRate(
          clips,
          runs.map((run) => run.id),
          field === "emotional_tone"
            ? "emotional_tone"
            : field === "background_noise_present"
              ? "background_noise_present"
              : field === "audio_quality"
                ? "audio_quality"
                : field === "speaker_overlap_present"
                  ? "speaker_overlap_present"
                  : "long_silence_present",
        )
        return {
          metric: SCORE_METRIC_LABEL[key],
          agreement: Math.round(stats.rate * 100),
          detail: `${stats.agreed}/${stats.compared}`,
        }
      },
    )
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium">Agreement across selected runs</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Share of clips where every selected run matches on that field. No gold labels
          on this batch.
        </p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="metric" tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={40} />
              <Tooltip
                formatter={(value, _name, item) => {
                  const detail = (item?.payload as { detail?: string } | undefined)?.detail
                  return [`${value}%${detail ? ` (${detail})` : ""}`, "Agreement"]
                }}
              />
              <Bar dataKey="agreement" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    )
  }

  const scores = new Map(
    runs.map((run) => [run.id, scoresForRun(clips, run.id)] as const),
  )
  const data = SCORE_METRIC_KEYS.map((key) => {
    const row: Record<string, string | number> = {
      metric: SCORE_METRIC_LABEL[key],
    }
    for (const run of runs) {
      const fieldScores = scores.get(run.id)
      if (!fieldScores) {
        row[run.id] = 0
        row[`${run.id}_detail`] = "—"
        continue
      }
      row[run.id] = Math.round(metricValue(fieldScores, key) * 100)
      const counts = metricCorrect(fieldScores, key)
      row[`${run.id}_detail`] =
        key === "emotional_tone_f1"
          ? String(metricValue(fieldScores, key).toFixed(2))
          : `${counts.correct}/${counts.total}`
    }
    return row
  })

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-medium">Accuracy by field</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Gold-labeled clips only. Hover a bar for correct/total.
      </p>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="metric" tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={40} />
            <Tooltip
              formatter={(value, name, item) => {
                const run = runs.find((row) => row.shortLabel === name || row.id === name)
                const detail = run
                  ? (item?.payload as Record<string, string> | undefined)?.[`${run.id}_detail`]
                  : undefined
                return [
                  `${value}%${detail && detail !== "—" ? ` (${detail})` : ""}`,
                  String(name),
                ]
              }}
            />
            <Legend />
            {runs.map((run) => (
              <Bar
                key={run.id}
                dataKey={run.id}
                name={run.shortLabel}
                fill={runChartColor(run.method, run.occurrence)}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export const formatMetricCell = (
  scores: ReturnType<typeof scoresForRun>,
  key: ScoreMetricKey,
): string => {
  if (!scores) {
    return "—"
  }
  if (key === "emotional_tone_f1") {
    return metricValue(scores, key).toFixed(2)
  }
  return formatPercent(metricValue(scores, key))
}
