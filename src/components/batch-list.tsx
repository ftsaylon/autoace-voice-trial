"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useConvexAuth, useConvex, useQuery } from "convex/react"
import { MoreHorizontalIcon } from "lucide-react"
import { api } from "@convex/_generated/api"
import {
  StatusFilterGroup,
  type StatusFilterOption,
} from "@/components/status-filter-group"
import { StatusIcon } from "@/components/status-icon"
import { MethodBadge } from "@/components/batch-badges"
import { Button } from "@/components/ui/button"
import { clipsToCsv, clipsToJson, downloadTextFile } from "@/lib/export-clips"
import { formatDuration, relativeTime } from "@/lib/format-time"

const FILTERS = ["all", "running", "queued", "complete", "failed", "draft"] as const
type BatchFilter = (typeof FILTERS)[number]

const FILTER_OPTIONS: readonly StatusFilterOption<BatchFilter>[] = [
  { value: "all", label: "All", tone: "neutral" },
  { value: "running", label: "Running", tone: "running" },
  { value: "queued", label: "Queued", tone: "queued" },
  { value: "complete", label: "Complete", tone: "complete" },
  { value: "failed", label: "Failed", tone: "failed" },
  { value: "draft", label: "Draft", tone: "draft" },
]

export const BatchList = () => {
  const { isAuthenticated } = useConvexAuth()
  const batches = useQuery(api.batches.list, isAuthenticated ? {} : "skip")
  const convex = useConvex()
  const [filter, setFilter] = useState<BatchFilter>("all")
  const [menuId, setMenuId] = useState<string | null>(null)

  const filterOptions = useMemo(() => {
    const counts = new Map<BatchFilter, number>(FILTERS.map((item) => [item, 0]))
    for (const batch of batches ?? []) {
      counts.set(batch.status, (counts.get(batch.status) ?? 0) + 1)
      counts.set("all", (counts.get("all") ?? 0) + 1)
    }
    return FILTER_OPTIONS.map((option) => ({
      ...option,
      count: counts.get(option.value) ?? 0,
    }))
  }, [batches])

  const rows = useMemo(() => {
    if (!batches) {
      return []
    }
    if (filter === "all") {
      return batches
    }
    return batches.filter((batch) => batch.status === filter)
  }, [batches, filter])

  const handleDownload = async (batchId: string, format: "csv" | "json") => {
    const detail = await convex.query(api.batches.get, { batchId: batchId as never })
    if (!detail) {
      return
    }
    const clips = detail.clips.map((clip) => ({
      name: clip.name,
      predictionJson: clip.predictionJson,
      errorJson: clip.errorJson,
    }))
    if (format === "csv") {
      downloadTextFile(`${detail.batch.name}.csv`, clipsToCsv(clips), "text/csv")
      return
    }
    downloadTextFile(
      `${detail.batch.name}.json`,
      clipsToJson(clips),
      "application/json",
    )
  }

  if (batches === undefined) {
    return <p className="text-sm text-muted-foreground">Loading batches…</p>
  }

  return (
    <div className="space-y-6">
      <StatusFilterGroup
        value={filter}
        onValueChange={setFilter}
        options={filterOptions}
        ariaLabel="Filter batches by status"
      />
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10">
          <h2 className="text-base font-medium">No batches yet</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Upload a ZIP or folder that contains audio plus <code>labels.csv</code>.
            The CSV needs a <code>name</code> column. <code>result_json</code> can be
            empty on the hidden set.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/batches/new">New batch</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((batch) => (
            <div
              key={batch._id}
              className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0"
            >
              <StatusIcon status={batch.status} />
              <Link href={`/batches/${batch._id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{batch.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {batch.succeededCount + batch.failedCount}/{batch.clipCount} clips
                  {batch.startedAt
                    ? ` · ${formatDuration(batch.startedAt, batch.completedAt)}`
                    : ""}
                  {` · ${relativeTime(batch.createdAt)}`}
                </p>
              </Link>
              <MethodBadge method={batch.method} />
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  aria-label="Batch actions"
                  aria-haspopup="menu"
                  aria-expanded={menuId === batch._id}
                  onClick={() =>
                    setMenuId((current) => (current === batch._id ? null : batch._id))
                  }
                >
                  <MoreHorizontalIcon />
                </Button>
                {menuId === batch._id ? (
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-2 w-40 rounded-lg border border-border bg-popover p-1 shadow-sm"
                  >
                    <Link
                      href={`/batches/${batch._id}`}
                      className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
                      role="menuitem"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                      role="menuitem"
                      onClick={() => {
                        void handleDownload(batch._id, "csv")
                        setMenuId(null)
                      }}
                    >
                      Download CSV
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                      role="menuitem"
                      onClick={() => {
                        void handleDownload(batch._id, "json")
                        setMenuId(null)
                      }}
                    >
                      Download JSON
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
