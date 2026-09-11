import {
  COMPARE_FIELDS,
  SCORE_METRIC_KEYS,
  SCORE_METRIC_LABEL,
  agreementRate,
  compareFieldForMetric,
  comparisonCsv,
  confusionMatrixForRun,
  disagreementCounts,
  fieldValue,
  heatmapRows,
  labeledClipCount,
  metricCorrect,
  metricValue,
  parsePredictionJson,
  scoresForRun,
  type CompareClipInput,
  type CompareFieldKey,
  type ScoreMetricKey,
} from "@/application/compare-runs"
import { formatAnalyzeError, type AnalyzeError } from "@/domain"
import type { LabeledRun } from "@/lib/run-labels"
import { runExportSlug } from "@/lib/run-export-slug"

const csvCell = (value: string): string => `"${value.replaceAll('"', '""')}"`

const csvRow = (cells: string[]): string => cells.map(csvCell).join(",")

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

export const accuracyByFieldCsv = (
  clips: CompareClipInput[],
  runs: LabeledRun[],
): string => {
  const labeled = labeledClipCount(clips) > 0
  if (labeled) {
    const headers = ["metric", ...runs.flatMap((run) => [run.shortLabel, `${run.shortLabel} detail`])]
    const lines = SCORE_METRIC_KEYS.map((key) => {
      const cells = [SCORE_METRIC_LABEL[key]]
      for (const run of runs) {
        const scores = scoresForRun(clips, run.id)
        if (!scores) {
          cells.push("", "")
          continue
        }
        cells.push(String(Math.round(metricValue(scores, key) * 100)))
        const counts = metricCorrect(scores, key)
        cells.push(
          key === "emotional_tone_f1"
            ? metricValue(scores, key).toFixed(2)
            : `${counts.correct}/${counts.total}`,
        )
      }
      return csvRow(cells)
    })
    return [csvRow(headers), ...lines].join("\n")
  }

  const headers = ["metric", "agreement_pct", "agreed", "compared"]
  const lines = SCORE_METRIC_KEYS.filter((key) => key !== "emotional_tone_f1").map(
    (key) => {
      const field = compareFieldForMetric(key)
      const stats = agreementRate(
        clips,
        runs.map((run) => run.id),
        field ?? "emotional_tone",
      )
      return csvRow([
        SCORE_METRIC_LABEL[key],
        String(Math.round(stats.rate * 100)),
        String(stats.agreed),
        String(stats.compared),
      ])
    },
  )
  return [csvRow(headers), ...lines].join("\n")
}

export const confusionMatrixCsv = (
  clips: CompareClipInput[],
  run: LabeledRun,
): string | null => {
  const matrix = confusionMatrixForRun(clips, run.id)
  if (!matrix) {
    return null
  }
  const headers = ["gold\\pred", ...matrix.labels]
  const lines = matrix.labels.map((gold, row) =>
    csvRow([gold, ...matrix.labels.map((_, col) => String(matrix.counts[row]?.[col] ?? 0))]),
  )
  return [csvRow(headers), ...lines].join("\n")
}

export const heatmapFieldCsv = (
  clips: CompareClipInput[],
  runs: LabeledRun[],
  field: CompareFieldKey,
): string => {
  const rows = heatmapRows(
    clips,
    runs.map((run) => run.id),
    field,
  )
  const labeled = rows.some((row) => row.gold !== null)
  const headers = [
    "clip",
    ...(labeled ? ["gold"] : []),
    ...runs.map((run) => run.shortLabel),
  ]
  const lines = rows.map((row) =>
    csvRow([
      row.name,
      ...(labeled ? [row.gold ?? ""] : []),
      ...row.cells.map((cell) => cell.value),
    ]),
  )
  return [csvRow(headers), ...lines].join("\n")
}

export const scoreMatrixCsv = (
  clips: CompareClipInput[],
  runs: LabeledRun[],
): string | null => {
  if (labeledClipCount(clips) === 0) {
    return null
  }
  const headers = ["metric", ...runs.map((run) => run.shortLabel)]
  const lines = SCORE_METRIC_KEYS.map((key: ScoreMetricKey) => {
    const cells = [SCORE_METRIC_LABEL[key]]
    for (const run of runs) {
      const scores = scoresForRun(clips, run.id)
      if (!scores) {
        cells.push("—")
        continue
      }
      cells.push(
        key === "emotional_tone_f1"
          ? metricValue(scores, key).toFixed(2)
          : String(Math.round(metricValue(scores, key) * 100)),
      )
    }
    return csvRow(cells)
  })
  return [csvRow(headers), ...lines].join("\n")
}

export const disagreementCsv = (
  clips: CompareClipInput[],
  runs: LabeledRun[],
): string => {
  const headers = ["field", "label", "disagreed", "compared"]
  const lines = disagreementCounts(
    clips,
    runs.map((run) => run.id),
  ).map((row) => csvRow([row.field, row.label, String(row.disagreed), String(row.compared)]))
  return [csvRow(headers), ...lines].join("\n")
}

export const perClipComparisonCsv = (
  clips: CompareClipInput[],
  runs: LabeledRun[],
): string => {
  const headers = [
    "clip",
    "field",
    "gold",
    ...runs.map((run) => run.shortLabel),
  ]
  const lines: string[] = []
  for (const clip of [...clips].sort((a, b) => a.name.localeCompare(b.name))) {
    const gold = parsePredictionJson(clip.goldJson)
    for (const field of COMPARE_FIELDS) {
      const goldValue = gold ? fieldValue(gold, field.key) : ""
      const runValues = runs.map((run) => {
        const result = clip.byRun[run.id]
        const prediction = parsePredictionJson(result?.predictionJson)
        if (prediction) {
          return fieldValue(prediction, field.key)
        }
        return errorLabel(result?.errorJson) || "—"
      })
      lines.push(csvRow([clip.name, field.label, goldValue || "unlabeled", ...runValues]))
    }
  }
  return [csvRow(headers), ...lines].join("\n")
}

export const buildComparisonExports = (
  clips: CompareClipInput[],
  runs: LabeledRun[],
): Record<string, string> => {
  const files: Record<string, string> = {
    "comparison/comparison.csv": comparisonCsv(
      clips,
      runs.map((run) => ({ id: run.id, label: run.shortLabel })),
    ),
    "comparison/accuracy-by-field.csv": accuracyByFieldCsv(clips, runs),
    "comparison/disagreement.csv": disagreementCsv(clips, runs),
    "comparison/per-clip-comparison.csv": perClipComparisonCsv(clips, runs),
  }
  for (const field of COMPARE_FIELDS) {
    files[`comparison/clip-heatmap-${field.key}.csv`] = heatmapFieldCsv(clips, runs, field.key)
  }
  const matrix = scoreMatrixCsv(clips, runs)
  if (matrix) {
    files["comparison/score-matrix.csv"] = matrix
  }
  for (const run of runs) {
    const matrixForRun = confusionMatrixCsv(clips, run)
    if (matrixForRun) {
      files[`comparison/tone-confusion-${runExportSlug(run)}.csv`] = matrixForRun
    }
  }
  return files
}
