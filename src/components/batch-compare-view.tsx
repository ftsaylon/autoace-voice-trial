"use client"

import { useState } from "react"
import { BatchCompare } from "@/components/batch-compare"
import { useBatchShell } from "@/components/batch-shell"
import { Button } from "@/components/ui/button"

export const BatchCompareView = () => {
  const { batchId, detail, baseClips, allResults, canCompare, setView } =
    useBatchShell()
  const [focusClipId, setFocusClipId] = useState<string | null>(null)

  const handleOpenInClips = (clipId: string) => {
    setView("clips")
    requestAnimationFrame(() => {
      document.getElementById(`clip-${clipId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    })
  }

  if (!canCompare) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <h2 className="text-base font-medium">Comparison not ready</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Compare unlocks when every method run on this batch has finished.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-6"
          onClick={() => setView("clips")}
        >
          Back to clips
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BatchCompare
        batchId={batchId}
        clips={baseClips}
        runs={detail.runs}
        results={allResults}
        onOpenClip={(clipId) => {
          setFocusClipId(clipId)
        }}
      />
      {focusClipId ? (
        <p className="text-xs text-muted-foreground">
          Open clip details in{" "}
          <button
            type="button"
            className="underline hover:text-foreground"
            onClick={() => handleOpenInClips(focusClipId)}
          >
            Clips view
          </button>
          .
        </p>
      ) : null}
    </div>
  )
}
