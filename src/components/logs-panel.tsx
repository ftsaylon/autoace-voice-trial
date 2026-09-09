"use client"

import { useMemo, useState } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import {
  StatusFilterGroup,
  type StatusFilterOption,
} from "@/components/status-filter-group"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const LEVELS = ["all", "info", "warn", "error"] as const
type LogLevel = (typeof LEVELS)[number]

const LEVEL_OPTIONS: readonly StatusFilterOption<LogLevel>[] = [
  { value: "all", label: "All", tone: "neutral" },
  { value: "info", label: "Info", tone: "info" },
  { value: "warn", label: "Warn", tone: "warn" },
  { value: "error", label: "Error", tone: "error" },
]

export const LogsPanel = () => {
  const { isAuthenticated } = useConvexAuth()
  const logs = useQuery(api.logs.listForUser, isAuthenticated ? { limit: 400 } : "skip")
  const batches = useQuery(api.batches.list, isAuthenticated ? {} : "skip")
  const [level, setLevel] = useState<LogLevel>("all")
  const [query, setQuery] = useState("")
  const [batchId, setBatchId] = useState("all")

  const names = useMemo(() => {
    const map = new Map<string, string>()
    for (const batch of batches ?? []) {
      map.set(batch._id, batch.name)
    }
    return map
  }, [batches])

  const levelOptions = useMemo(() => {
    const counts = new Map<LogLevel, number>(LEVELS.map((item) => [item, 0]))
    for (const row of logs ?? []) {
      counts.set(row.level, (counts.get(row.level) ?? 0) + 1)
      counts.set("all", (counts.get("all") ?? 0) + 1)
    }
    return LEVEL_OPTIONS.map((option) => ({
      ...option,
      count: counts.get(option.value) ?? 0,
    }))
  }, [logs])

  const rows = useMemo(() => {
    return (logs ?? []).filter((row) => {
      if (level !== "all" && row.level !== level) {
        return false
      }
      if (batchId !== "all" && row.batchId !== batchId) {
        return false
      }
      if (query && !row.message.toLowerCase().includes(query.toLowerCase())) {
        return false
      }
      return true
    })
  }, [logs, level, batchId, query])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusFilterGroup
          value={level}
          onValueChange={setLevel}
          options={levelOptions}
          ariaLabel="Filter logs by level"
        />
        <select
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          value={batchId}
          onChange={(event) => setBatchId(event.target.value)}
          aria-label="Filter by batch"
        >
          <option value="all">All batches</option>
          {(batches ?? []).map((batch) => (
            <option key={batch._id} value={batch._id}>
              {batch.name}
            </option>
          ))}
        </select>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search messages"
          aria-label="Search logs"
          className="h-10 max-w-xs"
        />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No log rows match.</p>
        ) : (
          rows.map((row) => (
            <div
              key={row._id}
              className={cn(
                "flex gap-4 border-b border-border px-5 py-3 text-sm last:border-b-0",
                row.level === "error" && "bg-red-50 dark:bg-red-950/30",
              )}
            >
              <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                {new Date(row.createdAt).toISOString().slice(11, 19)}
              </span>
              <span className="w-14 shrink-0 text-xs uppercase text-muted-foreground">
                {row.level}
              </span>
              <span className="w-40 shrink-0 truncate text-xs text-muted-foreground">
                {names.get(row.batchId) ?? "batch"}
              </span>
              <span className="min-w-0 flex-1">{row.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
