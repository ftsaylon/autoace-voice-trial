"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { StatusIcon } from "@/components/status-icon"
import { MethodCards } from "@/components/method-cards"
import { BatchCompare } from "@/components/batch-compare"
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
import { formatDuration, formatF1, formatPercent } from "@/lib/format-time"
import { downloadBatchZip } from "@/lib/download-batch-zip"
import { useBatchUpload } from "@/hooks/use-batch-upload"
import { METHOD_IDS, METHODS, type AnalysisMethod, type MethodId } from "@/application/methods"
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

export const BatchDetail = ({ batchId }: { batchId: Id<"batches"> }) => {
  const { isAuthenticated } = useConvexAuth()
  const convex = useConvex()
  const id = batchId
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
  const startRuns = useMutation(api.batches.startRuns)
  const retry = useMutation(api.batches.retry)
  const [method, setLocalMethod] = useState<AnalysisMethod | null>(null)
  const [pending, setPending] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [runMethodsOpen, setRunMethodsOpen] = useState(false)
  const [runMethods, setRunMethods] = useState<MethodId[]>(["fusion"])
  const [focusClipId, setFocusClipId] = useState<string | null>(null)
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

  const { batch, clips, runs, viewingRun } = detail
  const selectedMethod = method ?? batch.method
  const isDraft = batch.status === "draft"
  const isUploadingBatch =
    batch.status === "uploading" && (isUploading || uploadWaitingRemote)
  const canAct = batch.status === "complete" || batch.status === "failed"
  const viewingFailed = batch.failedCount
  const uploadLabel = progress
    ? uploadWaitingRemote && !isUploading
      ? `Waiting for upload ${progress.done}/${progress.total}`
      : `Uploading ${progress.done}/${progress.total}`
    : uploadWaitingRemote
      ? "Waiting for upload to finish"
      : "Uploading clips"
  const runningRun = runs.find((run) => run.status === "running")
  const queuedRunCount = runs.filter((run) => run.status === "queued").length
  const completedRunCount = runs.filter(
    (run) => run.status === "complete" || run.status === "failed",
  ).length
  const showMultiRunResults = completedRunCount >= 2
  const methodIds = batch.methodIds ?? [batch.method]

  const handleDownloadZip = async () => {
    setDownloading(true)
    try {
      await downloadBatchZip(convex, id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed")
    } finally {
      setDownloading(false)
    }
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

  const handleRetryFailed = async () => {
    setPending(true)
    try {
      const result = await retry({ batchId: id, scope: "failed" })
      if (result.requeued === 0) {
        toast.message("Nothing to retry")
        return
      }
      toast.message(`Requeued ${result.requeued} failed clips`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed")
    } finally {
      setPending(false)
    }
  }

  const handleStartRuns = async () => {
    setPending(true)
    try {
      const result = await startRuns({ batchId: id, methods: runMethods })
      setRunMethodsOpen(false)
      if (result.reason === "queued") {
        toast.message("Queued until another batch finishes")
      } else if (result.reason === "already_running") {
        toast.message("Queued on this batch until the current run finishes")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start runs")
    } finally {
      setPending(false)
    }
  }

  const openRunMethods = () => {
    setRunMethods([viewingRun?.method ?? batch.method])
    setRunMethodsOpen(true)
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
            {methodIds.map((methodId) => (
              <MethodBadge key={methodId} method={methodId} />
            ))}
            <ModelBadge model={viewingRun?.model ?? batch.model} />
          </div>
          <p className="text-sm text-muted-foreground">
            {runningRun
              ? `${METHODS[runningRun.method].label} · ${runningRun.succeededCount + runningRun.failedCount}/${runningRun.clipCount}`
              : `${(viewingRun?.succeededCount ?? batch.succeededCount) + (viewingRun?.failedCount ?? batch.failedCount)}/${batch.clipCount} clips`}
            {queuedRunCount > 0 ? ` · ${queuedRunCount} queued` : ""}
            {` · ${formatDuration(batch.startedAt, batch.completedAt)}`}
          </p>
          {runs.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              {runs.length} runs across {methodIds.length} method
              {methodIds.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          {canAct ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={downloading}
              onClick={() => {
                void handleDownloadZip()
              }}
            >
              {downloading ? "Preparing…" : "Download ZIP"}
            </Button>
          ) : null}
          {canAct && viewingFailed > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => {
                void handleRetryFailed()
              }}
            >
              Retry failed
            </Button>
          ) : null}
          {!isUploadingBatch && batch.status !== "uploading" && batch.status !== "draft" ? (
            <Button
              type="button"
              size="lg"
              disabled={pending || batch.status === "running"}
              onClick={openRunMethods}
            >
              Run methods
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
              : queuedRunCount > 0 || runningRun
                ? "One clip at a time inside the active run. Queued methods start when the current run finishes."
                : "One clip at a time inside this batch. Other batches can run at the same time."}
          </p>
        </details>
        <details open className="px-5 py-4">
          <summary className="cursor-pointer text-sm font-medium">Complete</summary>
          <p className="mt-2 text-sm text-muted-foreground">
            Status: {isUploadingBatch ? "uploading" : batch.status}
            {batch.failedCount > 0 ? ` · ${batch.failedCount} isolated failures` : ""}
            {(batch.runCount ?? runs.length) > 1
              ? ` · ${batch.runCount ?? runs.length} runs`
              : ""}
          </p>
        </details>
      </section>

      {showMultiRunResults ? (
        <div className="space-y-6">
          {runningRun || queuedRunCount > 0 ? (
            <Alert>
              <AlertTitle>More runs in progress</AlertTitle>
              <AlertDescription>
                {runningRun
                  ? `${METHODS[runningRun.method].label} is processing now.`
                  : null}
                {queuedRunCount > 0
                  ? ` ${queuedRunCount} method${queuedRunCount === 1 ? "" : "s"} queued.`
                  : null}{" "}
                Finished runs are shown below.
              </AlertDescription>
            </Alert>
          ) : null}
          <BatchCompare
            batchId={id}
            clips={clips}
            runs={runs}
            onOpenClip={(clipId) => {
              setFocusClipId(clipId)
            }}
          />
        </div>
      ) : (
        <ResultsBody
          clips={clips}
          scores={scoresFromClips(clips)}
          focusClipId={focusClipId}
        />
      )}

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3 text-sm font-medium">
          Clip log
        </div>
        <div className="max-h-80 overflow-auto bg-black p-4 font-mono text-xs text-zinc-100">
          {chronologicalLogs.length === 0 ? (
            <p className="text-zinc-500">No log lines yet.</p>
          ) : (
            chronologicalLogs.map((row) => {
              return (
                <p
                  key={row._id}
                  className={
                    row.level === "error" ? "text-red-400" : "text-zinc-200"
                  }
                >
                  {new Date(row.createdAt).toISOString().slice(11, 19)} {row.message}
                </p>
              )
            })
          )}
        </div>
      </section>

      <Dialog open={runMethodsOpen} onOpenChange={setRunMethodsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Run methods</DialogTitle>
            <DialogDescription>
              New runs keep existing results. Methods process one after another on the
              same files.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRunMethods([...METHOD_IDS])}
            >
              Select all
            </Button>
          </div>
          <MethodCards multiple value={runMethods} onChange={setRunMethods} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRunMethodsOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || runMethods.length === 0}
              onClick={() => {
                void handleStartRuns()
              }}
            >
              {pending ? "Starting…" : `Run ${runMethods.length} method${runMethods.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const ResultsBody = ({
  clips,
  scores,
  focusClipId,
}: {
  clips: Array<{
    _id: string
    name: string
    state: "uploading" | "queued" | "running" | "succeeded" | "failed"
    goldJson?: string
    predictionJson?: string
    errorJson?: string
    stage?: string
    startedAt?: number
    finishedAt?: number
  }>
  scores: ReturnType<typeof scoresFromClips>
  focusClipId: string | null
}) => {
  return (
    <>
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
                id={`clip-${clip._id}`}
                open={focusClipId === clip._id ? true : undefined}
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
    </>
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
