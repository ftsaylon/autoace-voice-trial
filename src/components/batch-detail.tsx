"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { StatusIcon } from "@/components/status-icon"
import { MethodCards } from "@/components/method-cards"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { MethodBadge, ModelBadge } from "@/components/batch-badges"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatAnalyzeError, type AnalyzeError } from "@/domain"
import {
  DIFF_FIELDS,
  flattenPrediction,
  formatFieldValue,
  labeledCount,
  parsePredictionJson,
  scoresFromClips,
} from "@/lib/clip-view"
import { clipsToCsv, clipsToJson, downloadTextFile } from "@/lib/export-clips"
import { formatDuration, formatF1, formatPercent } from "@/lib/format-time"
import { useBatchUpload } from "@/hooks/use-batch-upload"
import type { AnalysisMethod } from "@/application/select-classifier"
import { cn } from "@/lib/utils"

const errorLabel = (errorJson?: string): string => {
  if (!errorJson) {
    return ""
  }
  try {
    return formatAnalyzeError(JSON.parse(errorJson) as AnalyzeError)
  } catch {
    return errorJson
  }
}

export const BatchDetail = ({ batchId }: { batchId: string }) => {
  const { isAuthenticated } = useConvexAuth()
  const id = batchId as Id<"batches">
  const detail = useQuery(
    api.batches.get,
    isAuthenticated ? { batchId: id } : "skip",
  )
  const logs = useQuery(
    api.logs.listForUser,
    isAuthenticated ? { batchId: id, limit: 200 } : "skip",
  )
  const setMethod = useMutation(api.batches.setMethod)
  const start = useMutation(api.batches.start)
  const retry = useMutation(api.batches.retry)
  const [method, setLocalMethod] = useState<AnalysisMethod | null>(null)
  const [pending, setPending] = useState(false)
  const [redoOpen, setRedoOpen] = useState(false)
  const {
    isUploading,
    progress,
    uploadError,
    uploadOrphaned,
    uploadWaitingRemote,
    canRetryUpload,
    canRetryStart,
    retryUpload,
    retryStart,
    abandonUpload,
  } = useBatchUpload(batchId, detail)

  const scores = useMemo(
    () => (detail ? scoresFromClips(detail.clips) : null),
    [detail],
  )
  const chronologicalLogs = useMemo(
    () => (logs ? [...logs].reverse() : []),
    [logs],
  )

  if (detail === undefined) {
    return <p className="text-sm text-muted-foreground">Loading batch…</p>
  }
  if (detail === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-8">
        <h1 className="text-lg font-medium">Batch not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may belong to another account, or the id is wrong.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/batches">Back to batches</Link>
        </Button>
      </div>
    )
  }

  const { batch, clips } = detail
  const selectedMethod = method ?? batch.method
  const isDraft = batch.status === "draft"
  const isUploadingBatch =
    batch.status === "uploading" && (isUploading || uploadWaitingRemote)
  const canRetry = batch.status === "complete" || batch.status === "failed"
  const uploadLabel = progress
    ? uploadWaitingRemote && !isUploading
      ? `Waiting for upload ${progress.done}/${progress.total}`
      : `Uploading ${progress.done}/${progress.total}`
    : uploadWaitingRemote
      ? "Waiting for upload to finish"
      : "Uploading clips"
  const failedCount = batch.failedCount

  const handleDownload = (format: "csv" | "json") => {
    const payload = clips.map((clip) => ({
      name: clip.name,
      predictionJson: clip.predictionJson,
      errorJson: clip.errorJson,
    }))
    if (format === "csv") {
      downloadTextFile(`${batch.name}.csv`, clipsToCsv(payload), "text/csv")
      return
    }
    downloadTextFile(`${batch.name}.json`, clipsToJson(payload), "application/json")
  }

  const handleRun = async () => {
    setPending(true)
    try {
      if (selectedMethod !== batch.method) {
        await setMethod({ batchId: id, method: selectedMethod })
      }
      const result = await start({ batchId: id, method: selectedMethod })
      if (result.reason === "queued") {
        toast.message("Queued until another batch finishes")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start")
    } finally {
      setPending(false)
    }
  }

  const handleRetry = async (scope: "failed" | "all") => {
    setPending(true)
    setRedoOpen(false)
    try {
      const result = await retry({ batchId: id, scope })
      if (result.requeued === 0) {
        toast.message("Nothing to retry")
        return
      }
      await start({ batchId: id })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-6 border-b border-border pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/batches" className="hover:text-foreground">
              Batches
            </Link>
            <span>/</span>
            <span className="text-foreground">{batch.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusIcon status={batch.status} />
            <h1 className="text-2xl font-semibold tracking-tight">{batch.name}</h1>
            <MethodBadge method={batch.method} />
            <ModelBadge model={batch.model} />
          </div>
          <p className="text-sm text-muted-foreground">
            {batch.succeededCount + batch.failedCount}/{batch.clipCount} clips
            {` · ${formatDuration(batch.startedAt, batch.completedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => handleDownload("csv")}
          >
            Download CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => handleDownload("json")}
          >
            Download JSON
          </Button>
          {canRetry && failedCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => {
                void handleRetry("failed")
              }}
            >
              Retry failed
            </Button>
          ) : null}
          {canRetry ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => setRedoOpen(true)}
            >
              Redo
            </Button>
          ) : null}
        </div>
      </header>

      {batch.parseIssues.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          {batch.parseIssues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      ) : null}

      {isDraft && !isUploadingBatch ? (
        <section className="space-y-4">
          <h2 className="text-sm font-medium">Method</h2>
          <MethodCards
            value={selectedMethod}
            onChange={setLocalMethod}
          />
          <Button
            type="button"
            size="lg"
            className="h-10 px-5"
            disabled={pending}
            onClick={() => {
              void handleRun()
            }}
          >
            {pending ? "Starting…" : "Run"}
          </Button>
        </section>
      ) : null}

      {uploadWaitingRemote && !uploadError ? (
        <Alert>
          <AlertTitle>Upload in progress</AlertTitle>
          <AlertDescription>
            Clips are being uploaded from another window or device. This page will
            start processing automatically when uploads finish.
          </AlertDescription>
        </Alert>
      ) : null}

      {uploadOrphaned ? (
        <Alert variant="destructive">
          <AlertTitle>Upload not available</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              This batch has no local files to upload. That usually means the page
              was refreshed or the batch was created twice. Start a new batch, or
              mark this one as failed.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void abandonUpload()
              }}
            >
              Mark as failed
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {uploadError ? (
        <Alert variant="destructive">
          <AlertTitle>{canRetryStart ? "Could not start batch" : "Upload failed"}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{uploadError}</p>
            {canRetryStart ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  retryStart()
                }}
              >
                Retry start
              </Button>
            ) : null}
            {canRetryUpload ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  retryUpload()
                }}
              >
                Retry upload
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-xl border border-border bg-card">
        <details open className="border-b border-border px-5 py-4">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            {isUploadingBatch ? <StatusIcon status="uploading" /> : null}
            Validate
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            {isUploadingBatch
              ? uploadLabel
              : `${batch.clipCount} audio files matched labels.csv`}
            {!isUploadingBatch && labeledCount(clips) > 0
              ? ` · ${labeledCount(clips)} gold labels stored for scoring, never sent to the model`
              : !isUploadingBatch
                ? " · unlabeled hidden-set shape"
                : ""}
          </p>
        </details>
        <details open className="border-b border-border px-5 py-4">
          <summary className="cursor-pointer text-sm font-medium">Process clips</summary>
          <p className="mt-2 text-sm text-muted-foreground">
            {isUploadingBatch
              ? "Processing starts automatically once uploads finish."
              : "One clip at a time inside this batch. Other batches can run at the same time."}
          </p>
        </details>
        <details open className="px-5 py-4">
          <summary className="cursor-pointer text-sm font-medium">Complete</summary>
          <p className="mt-2 text-sm text-muted-foreground">
            Status: {isUploadingBatch ? "uploading" : batch.status}
            {batch.failedCount > 0 ? ` · ${batch.failedCount} isolated failures` : ""}
          </p>
        </details>
      </section>

      {scores ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <ScoreCard
            label="Tone"
            accuracy={scores.emotional_tone.accuracy}
            extra={`F1 ${formatF1(scores.emotional_tone.f1 ?? 0)}`}
          />
          <ScoreCard
            label="Noise present"
            accuracy={scores.background_noise_present.accuracy}
          />
          <ScoreCard label="Quality" accuracy={scores.audio_quality.accuracy} />
          <ScoreCard
            label="Overlap"
            accuracy={scores.speaker_overlap_present.accuracy}
          />
          <ScoreCard
            label="Silence"
            accuracy={scores.long_silence_present.accuracy}
          />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        {clips
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((clip) => {
            const gold = parsePredictionJson(clip.goldJson)
            const prediction = parsePredictionJson(clip.predictionJson)
            const goldFlat = gold ? flattenPrediction(gold) : null
            const predFlat = prediction ? flattenPrediction(prediction) : null
            return (
              <details
                key={clip._id}
                className={cn(
                  "border-b border-border last:border-b-0",
                  (clip.state === "running" || clip.state === "uploading") &&
                    "bg-muted/30",
                )}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3">
                  <StatusIcon
                    status={
                      clip.state === "succeeded"
                        ? "succeeded"
                        : clip.state === "uploading"
                          ? "uploading"
                          : clip.state
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {clip.name}
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {clip.stage ?? clip.state}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(clip.startedAt, clip.finishedAt)}
                  </span>
                </summary>
                <div className="space-y-3 px-5 pb-5">
                  {clip.errorJson ? (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      {errorLabel(clip.errorJson)}
                    </p>
                  ) : null}
                  {predFlat ? (
                    <div className="grid gap-2">
                      {DIFF_FIELDS.map((field) => {
                        const pred = formatFieldValue(predFlat[field.key])
                        const goldValue = goldFlat
                          ? formatFieldValue(goldFlat[field.key])
                          : null
                        const match = goldValue === null || goldValue === pred
                        return (
                          <div
                            key={field.key}
                            className="grid grid-cols-[8rem_1fr_1fr] gap-3 text-sm"
                          >
                            <span className="text-muted-foreground">{field.label}</span>
                            <span className={match ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
                              pred {pred}
                            </span>
                            <span className="text-muted-foreground">
                              {goldValue === null ? "unlabeled" : `gold ${goldValue}`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No prediction yet.
                    </p>
                  )}
                </div>
              </details>
            )
          })}
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3 text-sm font-medium">
          Clip log
        </div>
        <div className="max-h-80 overflow-auto bg-black p-4 font-mono text-xs text-zinc-100">
          {chronologicalLogs.length === 0 ? (
            <p className="text-zinc-500">No log lines yet.</p>
          ) : (
            chronologicalLogs.map((row) => (
              <p
                key={row._id}
                className={row.level === "error" ? "text-red-400" : "text-zinc-200"}
              >
                {new Date(row.createdAt).toISOString().slice(11, 19)} {row.message}
              </p>
            ))
          )}
        </div>
      </section>

      <Dialog open={redoOpen} onOpenChange={setRedoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redo this batch?</DialogTitle>
            <DialogDescription>
              All clips will be queued again and processed with the current method.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRedoOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleRetry("all")
              }}
            >
              Redo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const ScoreCard = ({
  label,
  accuracy,
  extra,
}: {
  label: string
  accuracy: number
  extra?: string
}) => {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-medium">{formatPercent(accuracy)}</p>
      {extra ? <p className="mt-1 text-xs text-muted-foreground">{extra}</p> : null}
    </div>
  )
}
