import { METHODS, type MethodId } from "@/application/methods"
import { relativeTime } from "@/lib/format-time"

export type LabeledRun = {
  id: string
  method: MethodId
  createdAt: number
  occurrence: number
  label: string
  shortLabel: string
}

export const labelRuns = (
  runs: Array<{ _id: string; method: MethodId; createdAt: number }>,
  now = Date.now(),
): LabeledRun[] => {
  const ordered = [...runs].sort((a, b) => a.createdAt - b.createdAt)
  const totals = new Map<MethodId, number>()
  for (const run of ordered) {
    totals.set(run.method, (totals.get(run.method) ?? 0) + 1)
  }
  const seen = new Map<MethodId, number>()
  return ordered.map((run) => {
    const index = seen.get(run.method) ?? 0
    seen.set(run.method, index + 1)
    const total = totals.get(run.method) ?? 1
    const occurrence = total - 1 - index
    const methodLabel = METHODS[run.method].label
    return {
      id: run._id,
      method: run.method,
      createdAt: run.createdAt,
      occurrence,
      label: `${methodLabel} · ${relativeTime(run.createdAt, now)}`,
      shortLabel: occurrence === 0 ? methodLabel : `${methodLabel} · earlier`,
    }
  })
}
