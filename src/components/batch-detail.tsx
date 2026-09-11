"use client"

import { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import { StatusIcon } from "@/components/status-icon"
import { MethodCards } from "@/components/method-cards"
import { useBatchShell } from "@/components/batch-shell"
import { RunLogs } from "@/components/run-logs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
  parsePredictionJson,
  scoresFromClips,
} from "@/lib/clip-view"
import {
  formatDuration,
  formatF1,
  formatPercent,
} from "@/lib/format-time"
import { useBatchUpload } from "@/hooks/use-batch-upload"
import { METHOD_IDS, type AnalysisMethod, type MethodId } from "@/application/methods"
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

export const BatchDetail = () => {
  const { batchId, detail, queryDetail, clips, viewingRun, view, focusClipId } =
    useBatchShell()
  const { batch, runs } = detail
  const setMethod = useMutation(api.batches.setMethod)
  const start = useMutation(api.batches.start)
  const startRuns = useMutation(api.batches.startRuns)
  const [method, setLocalMethod] = useState<AnalysisMethod | null>(null)
  const [pending, setPending] = useState(false)
  const [runMethodsOpen, setRunMethodsOpen] = useState(false)
  const [runMethods, setRunMethods] = useState<MethodId[]>(["fusion"])
  const {
    isUploading,
    uploadError,
    uploadOrphaned,
    uploadWaitingRemote,
    canRetryUpload,
    canRetryStart,
    retryUpload,
    retryStart,
    abandonUpload,
  } = useBatchUpload(batchId, queryDetail)

  const selectedMethod = method ?? batch.method
  const isDraft = batch.status === "draft"
  const isUploadingBatch =
    batch.status === "uploading" && (isUploading || uploadWaitingRemote)
  const ranMethods = new Set(runs.map((run) => run.method))
  const unrunMethods = METHOD_IDS.filter((methodId) => !ranMethods.has(methodId))
  const canAddMethods = unrunMethods.length > 0

  useEffect(() => {
    if (view !== "clips" || !focusClipId) {
      return
    }
    const node = document.getElementById(`clip-${focusClipId}`)
    node?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focusClipId, view])

  const handleRun = async () => {
    setPending(true)
    try {
      if (selectedMethod !== batch.method) {
        await setMethod({ batchId, method: selectedMethod })
      }
      const result = await start({ batchId, method: selectedMethod })
      if (result.reason === "queued") {
        toast.message("Queued until another batch finishes")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start")
    } finally {
      setPending(false)
    }
  }

  const handleStartRuns = async () => {
    setPending(true)
    try {
      const result = await startRuns({ batchId, methods: runMethods })
      setRunMethodsOpen(false)
      if (result.reason === "queued") {
        toast.message("Queued until another batch finishes")
      } else if (result.reason === "already_running") {
        toast.message("Added to the running batch")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start runs")
    } finally {
      setPending(false)
    }
  }

  const openRunMethods = () => {
    setRunMethods(unrunMethods.length === 1 ? [...unrunMethods] : [])
    setRunMethodsOpen(true)
  }

  return (
    <div className="space-y-8">
      {!isUploadingBatch &&
      batch.status !== "uploading" &&
      batch.status !== "draft" &&
      canAddMethods ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || batch.status === "running"}
            onClick={openRunMethods}
          >
            Add methods
          </Button>
        </div>
      ) : null}

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
          <MethodCards value={selectedMethod} onChange={setLocalMethod} />
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

      <ResultsBody
        clips={clips}
        scores={scoresFromClips(clips)}
        focusClipId={focusClipId}
      />

      {viewingRun ? <RunLogs run={viewingRun} /> : null}

      <Dialog open={runMethodsOpen} onOpenChange={setRunMethodsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add methods</DialogTitle>
            <DialogDescription>
              Only methods that have not run on this batch yet. To rerun the same
              methods, use Run again to start a new batch.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRunMethods([...unrunMethods])}
            >
              Select all
            </Button>
          </div>
          <MethodCards
            multiple
            value={runMethods}
            onChange={setRunMethods}
            allowedMethods={unrunMethods}
          />
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
              {pending ? "Starting…" : `Add ${runMethods.length} method${runMethods.length === 1 ? "" : "s"}`}
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
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreCard
            label="Tone"
            accuracy={scores.emotional_tone.accuracy}
            extra={`F1 ${formatF1(scores.emotional_tone.f1 ?? 0)}`}
          />
          <ScoreCard
            label="Intensity"
            accuracy={scores.emotional_intensity.accuracy}
          />
          <ScoreCard
            label="Noise present"
            accuracy={scores.background_noise_present.accuracy}
          />
          <ScoreCard
            label="Noise type"
            accuracy={scores.background_noise_type.accuracy}
          />
          <ScoreCard
            label="Noise severity"
            accuracy={scores.background_noise_severity.accuracy}
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
          <ScoreCard
            label="Confidence"
            accuracy={scores.confidence.accuracy}
            extra="|Δ| ≤ 0.2"
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
