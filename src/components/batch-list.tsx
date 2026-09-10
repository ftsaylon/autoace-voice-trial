"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useConvexAuth, useConvex, useQuery } from "convex/react"
import { MoreHorizontalIcon } from "lucide-react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import {
  StatusFilterGroup,
  type StatusFilterOption,
} from "@/components/status-filter-group"
import { StatusIcon } from "@/components/status-icon"
import { MethodBadge } from "@/components/batch-badges"
import { Button } from "@/components/ui/button"
import { downloadBatchZip } from "@/lib/download-batch-zip"
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

export const BatchList = ({
  onCreateBatch,
}: {
  onCreateBatch?: () => void
}) => {
  const { isAuthenticated } = useConvexAuth()
  const batches = useQuery(api.batches.list, isAuthenticated ? {} : "skip")
  const convex = useConvex()
  const [filter, setFilter] = useState<BatchFilter>("all")
  const [menuId, setMenuId] = useState<string | null>(null)

  const filterOptions = useMemo(() => {
    const counts = new Map<BatchFilter, number>(FILTERS.map((item) => [item, 0]))
    for (const batch of batches ?? []) {
      if (batch.status === "uploading") {
        counts.set("running", (counts.get("running") ?? 0) + 1)
      } else {
        counts.set(batch.status, (counts.get(batch.status) ?? 0) + 1)
      }
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
    if (filter === "running") {
      return batches.filter(
        (batch) => batch.status === "running" || batch.status === "uploading",
      )
    }
    return batches.filter((batch) => batch.status === filter)
  }, [batches, filter])

  const handleDownloadZip = async (batchId: Id<"batches">) => {
    await downloadBatchZip(convex, batchId)
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
          {onCreateBatch ? (
            <Button type="button" size="lg" className="mt-6" onClick={onCreateBatch}>
              New batch
            </Button>
          ) : (
            <Button asChild size="lg" className="mt-6">
              <Link href="/batches">New batch</Link>
            </Button>
          )}
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
                  {(batch.runCount ?? 0) > 1 ? ` · ${batch.runCount} runs` : ""}
                  {batch.startedAt
                    ? ` · ${formatDuration(batch.startedAt, batch.completedAt)}`
                    : ""}
                  {` · ${relativeTime(batch.createdAt)}`}
                </p>
              </Link>
              <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                {(batch.methodIds && batch.methodIds.length > 0
                  ? batch.methodIds
                  : [batch.method]
                ).map((methodId) => (
                  <MethodBadge key={methodId} method={methodId} />
                ))}
              </div>
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
                        void handleDownloadZip(batch._id)
                        setMenuId(null)
                      }}
                    >
                      Download ZIP
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
