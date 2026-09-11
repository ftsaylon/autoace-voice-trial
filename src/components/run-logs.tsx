"use client"

import { useEffect, useMemo, useRef } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Doc } from "@convex/_generated/dataModel"
import { cn } from "@/lib/utils"

type RunLogsProps = {
  run: Doc<"runs">
}

export const RunLogs = ({ run }: RunLogsProps) => {
  const { isAuthenticated } = useConvexAuth()
  const logs = useQuery(
    api.logs.listForRun,
    isAuthenticated ? { runId: run._id, limit: 400 } : "skip",
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const isLive = run.status === "running" || run.status === "queued"

  const lines = useMemo(() => {
    if (!logs) {
      return []
    }
    return [...logs].reverse()
  }, [logs])

  useEffect(() => {
    const container = containerRef.current
    if (!container || lines.length === 0) {
      return
    }
    container.scrollTop = container.scrollHeight
  }, [lines, run._id])

  return (
    <section className="space-y-3" aria-labelledby="run-logs-heading">
      <h2 id="run-logs-heading" className="text-sm font-medium">
        Logs
      </h2>
      <div
        ref={containerRef}
        role="log"
        aria-live={isLive ? "polite" : "off"}
        className="max-h-[32rem] overflow-auto rounded-xl border border-border bg-muted px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground"
      >
        {logs === undefined ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : lines.length === 0 ? (
          <p className="text-muted-foreground">
            {isLive ? "Waiting for output…" : "No output."}
          </p>
        ) : (
          lines.map((row) => (
            <p
              key={row._id}
              className={cn(
                "whitespace-pre-wrap break-words",
                row.level === "error" && "text-destructive",
                row.level === "warn" && "text-amber-700 dark:text-amber-400",
              )}
            >
              {row.message}
            </p>
          ))
        )}
      </div>
    </section>
  )
}
