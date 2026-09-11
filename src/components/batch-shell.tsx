"use client"

import Link from "next/link"
import { DownloadIcon, RotateCwIcon, RotateCwSquareIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react"
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { BatchCompareView } from "@/components/batch-compare-view"
import { BatchDetail } from "@/components/batch-detail"
import { StatusIcon } from "@/components/status-icon"
import {
  AllMethodsBadge,
  MethodBadge,
  MethodRunBadge,
} from "@/components/batch-badges"
import { formatBatchLabel } from "@/lib/batch-label"
import { labeledCount } from "@/lib/clip-view"
import { formatDuration, relativeTime } from "@/lib/format-time"
import {
  overlayClipsForRun,
  stripClipOverlays,
  type BaseClipRow,
} from "@/lib/overlay-clips"
import {
  canCompareRuns,
  pickViewingRunId,
} from "@/application/run-policy"
import { METHOD_IDS, METHODS } from "@/application/methods"
import { downloadBatchZip } from "@/lib/download-batch-zip"
import { Button } from "@/components/ui/button"
import { LoadingMessage, Spinner } from "@/components/waveform-spinner"
import { cn } from "@/lib/utils"

export type BatchView = "clips" | "compare"

type BatchDetail = {
  batch: Doc<"batches">
  clips: BaseClipRow[]
  runs: Doc<"runs">[]
  viewingRun: Doc<"runs"> | null
}

type BatchShellContextValue = {
  batchId: Id<"batches">
  detail: BatchDetail
  queryDetail: {
    batch: Doc<"batches">
    clips: Doc<"clips">[]
    runs: Doc<"runs">[]
    viewingRun: Doc<"runs"> | null
  }
  clips: BaseClipRow[]
  baseClips: BaseClipRow[]
  allResults: Doc<"clipResults">[] | undefined
  viewingRun: Doc<"runs"> | null
  view: BatchView
  setView: (view: BatchView) => void
  setSelectedRunId: (runId: Id<"runs">) => void
  canCompare: boolean
}

const BatchShellContext = createContext<BatchShellContextValue | null>(null)

export const useBatchShell = (): BatchShellContextValue => {
  const value = useContext(BatchShellContext)
  if (!value) {
    throw new Error("useBatchShell must be used within BatchShell")
  }
  return value
}

export const BatchShell = ({ batchId }: { batchId: Id<"batches"> }) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const convex = useConvex()
  const { isAuthenticated } = useConvexAuth()
  const view: BatchView =
    searchParams.get("view") === "compare" ? "compare" : "clips"
  const isCompare = view === "compare"
  const [selectedRunId, setSelectedRunId] = useState<Id<"runs"> | null>(null)
  const [pending, setPending] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const retry = useMutation(api.batches.retry)
  const runAgain = useMutation(api.batches.runAgain)

  const detailQuery = useQuery(
    api.batches.get,
    isAuthenticated ? { batchId } : "skip",
  )
  const detailRef = useRef<typeof detailQuery>(undefined)
  if (detailQuery !== undefined) {
    detailRef.current = detailQuery
  }
  const detail = detailQuery ?? detailRef.current
  const isInitialLoad = detail === undefined

  const runIds = useMemo(
    () => detail?.runs.map((run) => run._id) ?? [],
    [detail?.runs],
  )
  const allResults = useQuery(
    api.batches.listResultsForRuns,
    isAuthenticated && detail && runIds.length >= 2
      ? { batchId, runIds }
      : "skip",
  )

  const viewingRunId = useMemo(() => {
    if (!detail) {
      return null
    }
    return pickViewingRunId(detail.runs, selectedRunId)
  }, [detail, selectedRunId])

  const viewingRun = useMemo(() => {
    if (!detail || !viewingRunId) {
      return null
    }
    return detail.runs.find((run) => run._id === viewingRunId) ?? null
  }, [detail, viewingRunId])

  const baseClips = useMemo(() => {
    if (!detail) {
      return []
    }
    return stripClipOverlays(detail.clips)
  }, [detail])

  const clips = useMemo(() => {
    if (!detail) {
      return []
    }
    if (detail.runs.length <= 1 && !selectedRunId) {
      return detail.clips
    }
    if (!allResults || !viewingRunId) {
      return detail.clips
    }
    return overlayClipsForRun(baseClips, allResults, viewingRunId)
  }, [allResults, baseClips, detail, selectedRunId, viewingRunId])

  const setView = useCallback(
    (next: BatchView) => {
      const href =
        next === "compare"
          ? `/batches/${batchId}?view=compare`
          : `/batches/${batchId}`
      router.replace(href, { scroll: false })
    },
    [batchId, router],
  )

  if (isInitialLoad) {
    return <LoadingMessage>Loading batch…</LoadingMessage>
  }

  if (detail === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-8">
        <h1 className="text-lg font-medium">Batch not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may belong to another account, or the id is wrong.
        </p>
        <Link
          href="/history"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          Back to history
        </Link>
      </div>
    )
  }

  const { batch, runs } = detail
  const batchLabel = formatBatchLabel(batch)
  const canCompare = canCompareRuns(runs)
  const methodIds = batch.methodIds ?? [batch.method]
  const runsByMethod = new Map(runs.map((run) => [run.method, run]))
  const isUploadingBatch = batch.status === "uploading"
  const canAct = batch.status === "complete" || batch.status === "failed"
  const viewingFailed = batch.failedCount
  const ranMethods = new Set(runs.map((run) => run.method))
  const unrunMethods = METHOD_IDS.filter((methodId) => !ranMethods.has(methodId))
  const canAddMethods = unrunMethods.length > 0
  const canRunAgain = Boolean(batch.datasetId)

  const handleDownloadZip = async () => {
    setDownloading(true)
    try {
      await downloadBatchZip(convex, batchId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed")
    } finally {
      setDownloading(false)
    }
  }

  const handleRetryFailed = async () => {
    setPending(true)
    try {
      const result = await retry({ batchId })
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

  const handleRunAgain = async () => {
    setPending(true)
    try {
      const result = await runAgain({ batchId })
      if (result.reason === "queued") {
        toast.message("Queued until another batch finishes")
      }
      router.push(`/batches/${result.batchId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run again")
    } finally {
      setPending(false)
    }
  }

  const runningRuns = runs.filter((run) => run.status === "running")
  const runningRun = runningRuns[0]
  const queuedRunCount = runs.filter((run) => run.status === "queued").length
  const goldLabels = isCompare
    ? labeledCount(baseClips)
    : labeledCount(clips)

  const shellValue: BatchShellContextValue = {
    batchId,
    detail: { ...detail, clips, viewingRun },
    queryDetail: detail,
    clips,
    baseClips,
    allResults,
    viewingRun,
    view,
    setView,
    setSelectedRunId,
    canCompare,
  }

  return (
    <BatchShellContext.Provider value={shellValue}>
      <div className="space-y-8">
        <header className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <StatusIcon status={batch.status} />
              <h1 className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                {batchLabel}
              </h1>
            </div>
            {canAct ||
            (!isUploadingBatch &&
              batch.status !== "uploading" &&
              batch.status !== "draft" &&
              canAddMethods) ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {canAct ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={downloading}
                    onClick={() => {
                      void handleDownloadZip()
                    }}
                  >
                    {downloading ? (
                      <Spinner size={16} />
                    ) : (
                      <DownloadIcon data-icon="inline-start" aria-hidden />
                    )}
                    {downloading ? "Preparing…" : "Download ZIP"}
                  </Button>
                ) : null}
                {canAct && viewingFailed > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      void handleRetryFailed()
                    }}
                  >
                    <RotateCwIcon data-icon="inline-start" aria-hidden />
                    Retry failed
                  </Button>
                ) : null}
                {canAct && canRunAgain ? (
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      void handleRunAgain()
                    }}
                  >
                    <RotateCwSquareIcon data-icon="inline-start" aria-hidden />
                    Run again
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {runs.length >= 2 ? (
              <AllMethodsBadge
                selected={isCompare}
                disabled={!canCompare}
                title={
                  canCompare
                    ? undefined
                    : "Available when every method run has finished"
                }
                onSelect={canCompare ? () => setView("compare") : undefined}
              />
            ) : null}
            {methodIds.map((methodId) => {
              const run = runsByMethod.get(methodId)
              if (run) {
                return (
                  <MethodRunBadge
                    key={methodId}
                    method={methodId}
                    run={{
                      runId: run._id,
                      status: run.status,
                      succeededCount: run.succeededCount,
                      failedCount: run.failedCount,
                      clipCount: run.clipCount,
                    }}
                    selected={!isCompare && viewingRun?._id === run._id}
                    onSelect={() => {
                      if (isCompare) {
                        setView("clips")
                      }
                      setSelectedRunId(run._id)
                    }}
                  />
                )
              }
              return <MethodBadge key={methodId} method={methodId} />
            })}
          </div>

          <p className="text-sm text-muted-foreground">
            {relativeTime(batch.createdAt)}
            {" · "}
            {isCompare
              ? `${batch.succeededCount + batch.failedCount}/${batch.clipCount} clips`
              : runningRuns.length > 1
                ? `${runningRuns.length} methods running`
                : runningRun
                  ? `${METHODS[runningRun.method].label} · ${runningRun.succeededCount + runningRun.failedCount}/${runningRun.clipCount}`
                  : `${(viewingRun?.succeededCount ?? batch.succeededCount) + (viewingRun?.failedCount ?? batch.failedCount)}/${batch.clipCount} clips`}
            {queuedRunCount > 0 ? ` · ${queuedRunCount} queued` : ""}
            {` · ${formatDuration(batch.startedAt, batch.completedAt)}`}
            {goldLabels > 0 ? ` · ${goldLabels} gold labels` : ""}
            {batch.failedCount > 0
              ? ` · ${batch.failedCount} failed clip${batch.failedCount === 1 ? "" : "s"}`
              : ""}
          </p>
        </header>

        <div className={cn(view !== "clips" && "hidden")} aria-hidden={view !== "clips"}>
          <BatchDetail />
        </div>
        <div className={cn(view !== "compare" && "hidden")} aria-hidden={view !== "compare"}>
          <BatchCompareView />
        </div>
      </div>
    </BatchShellContext.Provider>
  )
}
