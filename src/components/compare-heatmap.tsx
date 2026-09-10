"use client"

import {
  COMPARE_FIELDS,
  heatmapRows,
  type CompareClipInput,
  type CompareFieldKey,
} from "@/application/compare-runs"
import { cn } from "@/lib/utils"
import type { LabeledRun } from "@/lib/run-labels"

const TONE_FILL: Record<string, string> = {
  neutral: "bg-slate-200 dark:bg-slate-700",
  satisfied: "bg-emerald-200 dark:bg-emerald-800",
  frustrated: "bg-amber-200 dark:bg-amber-800",
  upset: "bg-orange-300 dark:bg-orange-800",
  distressed: "bg-red-300 dark:bg-red-800",
}

export const CompareHeatmap = ({
  clips,
  runs,
  field,
  onFieldChange,
  onRowClick,
}: {
  clips: CompareClipInput[]
  runs: LabeledRun[]
  field: CompareFieldKey
  onFieldChange: (field: CompareFieldKey) => void
  onRowClick: (clipId: string) => void
}) => {
  const rows = heatmapRows(clips, runs.map((run) => run.id), field)
  const labeled = rows.some((row) => row.gold !== null)

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Clip heatmap</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {labeled
              ? "Green matches gold, red does not. Open a clip from its name."
              : "Color is the predicted value. A ring marks disagreement with the row majority. Open a clip from its name."}
          </p>
        </div>
        <label className="text-xs text-muted-foreground">
          Field
          <select
            className="ml-2 h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            value={field}
            onChange={(event) => onFieldChange(event.target.value as CompareFieldKey)}
          >
            {COMPARE_FIELDS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card px-2 py-1.5 text-left font-medium">
                Clip
              </th>
              {labeled ? (
                <th className="px-2 py-1.5 text-left font-medium">Gold</th>
              ) : null}
              {runs.map((run) => (
                <th key={run.id} className="px-2 py-1.5 text-left font-medium">
                  {run.shortLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.clipId}>
                <td className="sticky left-0 bg-card px-2 py-1">
                  <button
                    type="button"
                    className="max-w-[12rem] truncate text-left hover:underline"
                    aria-label={`Open ${row.name}`}
                    onClick={() => onRowClick(row.clipId)}
                  >
                    {row.name}
                  </button>
                </td>
                {labeled ? (
                  <td className="px-2 py-1 text-muted-foreground">{row.gold ?? "—"}</td>
                ) : null}
                {row.cells.map((cell) => {
                  const toneClass =
                    !labeled && field === "emotional_tone"
                      ? (TONE_FILL[cell.value] ?? "bg-muted")
                      : labeled
                        ? cell.matchGold === true
                          ? "bg-emerald-200/80 dark:bg-emerald-900/70"
                          : cell.matchGold === false
                            ? "bg-red-200/80 dark:bg-red-900/70"
                            : "bg-muted"
                        : "bg-muted"
                  return (
                    <td key={cell.runId} className="px-1 py-1">
                      <div
                        title={cell.value}
                        className={cn(
                          "rounded px-1.5 py-1 text-center tabular-nums",
                          toneClass,
                          cell.disagreesMajority && !labeled
                            ? "ring-2 ring-foreground/70"
                            : "",
                        )}
                      >
                        {cell.value}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
