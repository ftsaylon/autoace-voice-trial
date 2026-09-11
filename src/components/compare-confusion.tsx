"use client"

import { confusionMatrixForRun, type CompareClipInput } from "@/application/compare-runs"
import { cn } from "@/lib/utils"
import type { LabeledRun } from "@/lib/run-labels"

export const CompareConfusion = ({
  clips,
  runs,
}: {
  clips: CompareClipInput[]
  runs: LabeledRun[]
}) => {
  const matrices = runs
    .map((run) => ({ run, matrix: confusionMatrixForRun(clips, run.id) }))
    .filter((row) => row.matrix)

  if (matrices.length === 0) {
    return null
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-medium">Tone confusion</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Rows are gold, columns are predicted. Darker cells have more clips.
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {matrices.map(({ run, matrix }) => {
          if (!matrix) {
            return null
          }
          const max = Math.max(1, ...matrix.counts.flat())
          return (
            <div key={run.id}>
              <p className="mb-2 text-xs font-medium">{run.shortLabel}</p>
              <div
                className="grid gap-px"
                style={{
                  gridTemplateColumns: `2.5rem repeat(${matrix.labels.length}, minmax(0, 1fr))`,
                }}
              >
                <div />
                {matrix.labels.map((label) => (
                  <div
                    key={`col-${label}`}
                    className="truncate px-1 text-center text-[10px] text-muted-foreground"
                    title={label}
                  >
                    {label.slice(0, 3)}
                  </div>
                ))}
                {matrix.labels.map((gold, row) => (
                  <div key={`row-${gold}`} className="contents">
                    <div
                      className="truncate pr-1 text-right text-[10px] text-muted-foreground"
                      title={gold}
                    >
                      {gold.slice(0, 3)}
                    </div>
                    {matrix.counts[row]?.map((count, col) => {
                      const intensity = count / max
                      return (
                        <div
                          key={`${gold}-${matrix.labels[col]}`}
                          title={`${gold} → ${matrix.labels[col]}: ${count}`}
                          className={cn(
                            "flex aspect-square items-center justify-center text-[11px] tabular-nums",
                            row === col ? "font-medium" : "",
                          )}
                          style={{
                            backgroundColor: `rgba(37, 99, 235, ${0.08 + intensity * 0.72})`,
                            color: intensity > 0.55 ? "#fff" : undefined,
                          }}
                        >
                          {count || ""}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
