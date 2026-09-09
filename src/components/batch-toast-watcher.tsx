"use client"

import { useEffect, useRef } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"

export const BatchToastWatcher = () => {
  const { isAuthenticated } = useConvexAuth()
  const batches = useQuery(api.batches.list, isAuthenticated ? {} : "skip")
  const previous = useRef<Map<string, string>>(new Map())
  const primed = useRef(false)

  useEffect(() => {
    if (!batches) {
      return
    }
    if (!primed.current) {
      previous.current = new Map(batches.map((batch) => [batch._id, batch.status]))
      primed.current = true
      return
    }
    for (const batch of batches) {
      const prior = previous.current.get(batch._id)
      if (!prior || prior === batch.status) {
        continue
      }
      if (batch.status === "complete" && batch.failedCount > 0) {
        toast.warning(`${batch.name} finished with ${batch.failedCount} failed clip${batch.failedCount === 1 ? "" : "s"}`)
      } else if (batch.status === "complete") {
        toast.success(`${batch.name} completed`)
      } else if (batch.status === "failed") {
        toast.error(`${batch.name} failed`)
      } else if (batch.status === "queued") {
        toast.message(`${batch.name} is queued`)
      }
    }
    previous.current = new Map(batches.map((batch) => [batch._id, batch.status]))
  }, [batches])

  return null
}
