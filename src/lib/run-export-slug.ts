import type { LabeledRun } from "@/lib/run-labels"

export const runExportSlug = (run: LabeledRun): string => {
  const base = run.method
  if (run.occurrence === 0) {
    return base
  }
  return `${base}-earlier-${run.occurrence}`
}
