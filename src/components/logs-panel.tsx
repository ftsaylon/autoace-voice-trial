"use client"

import { useMemo, useState } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const LEVELS = ["all", "info", "warn", "error"] as const

export const LogsPanel = () => {
  const { isAuthenticated } = useConvexAuth()
  const logs = useQuery(api.logs.listForUser, isAuthenticated ? { limit: 400 } : "skip")
  const batches = useQuery(api.batches.list, isAuthenticated ? {} : "skip")
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("all")
  const [query, setQuery] = useState("")
  const [batchId, setBatchId] = useState("all")

  const names = useMemo(() => {
    const map = new Map<string, string>()
    for (const batch of batches ?? []) {
      map.set(batch._id, batch.name)
    }
    return map
  }, [batches])

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
      <div className="flex flex-wrap gap-3">
        {LEVELS.map((item) => (
          <Button
            key={item}
            type="button"
            size="lg"
            variant={level === item ? "default" : "outline"}
            onClick={() => setLevel(item)}
          >
            {item}
          </Button>
        ))}
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
