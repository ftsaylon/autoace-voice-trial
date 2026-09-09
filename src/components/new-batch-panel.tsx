"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { collectDroppedFiles, resetFileInput } from "@/lib/collect-dropped-files"
import {
  clipsToUploads,
  defaultBatchName,
  parseDroppedFiles,
  preparedClipsFromUploads,
  uploadClipsInParallel,
  uploadsBusy,
  uploadsReady,
  type ClipUpload,
} from "@/lib/prepare-batch"
import { MethodCards } from "@/components/method-cards"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { AnalysisMethod } from "@/application/select-classifier"

export type NewBatchPanelProps = {
  initialFiles?: File[] | null
  onStarted?: (batchId: string) => void
  onDiscard?: () => void
  onBusyChange?: (busy: boolean) => void
  discardRef?: React.MutableRefObject<(() => Promise<void>) | null>
}

export const NewBatchPanel = ({
  initialFiles = null,
  onStarted,
  onDiscard,
  onBusyChange,
  discardRef,
}: NewBatchPanelProps) => {
  const { isAuthenticated } = useConvexAuth()
  const settings = useQuery(api.settings.get, isAuthenticated ? {} : "skip")
  const generateUploadUrl = useMutation(api.batches.generateUploadUrl)
  const deleteStorageIds = useMutation(api.batches.deleteStorageIds)
  const createDraft = useMutation(api.batches.createDraft)
  const start = useMutation(api.batches.start)

  const [dragging, setDragging] = useState(false)
  const [parseIssues, setParseIssues] = useState<string[]>([])
  const [uploads, setUploads] = useState<ClipUpload[]>([])
  const [method, setMethod] = useState<AnalysisMethod | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [starting, setStarting] = useState(false)
  const uploadsRef = useRef(uploads)
  const initialHandled = useRef(false)
  const generationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const trackedIdsRef = useRef(new Set<string>())
  const transferredRef = useRef(false)
  const disposedRef = useRef(false)
  const startingRef = useRef(false)

  const selectedMethod: AnalysisMethod = method ?? settings?.defaultMethod ?? "fusion"

  useEffect(() => {
    uploadsRef.current = uploads
  }, [uploads])

  const discardStorageIds = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        return
      }
      try {
        await deleteStorageIds({ storageIds: ids as Id<"_storage">[] })
      } catch {
        // Best-effort cleanup for abandoned blobs.
      }
    },
    [deleteStorageIds],
  )

  const trackStorageId = useCallback(
    (storageId: string, generation: number) => {
      if (
        disposedRef.current ||
        transferredRef.current ||
        generation !== generationRef.current
      ) {
        void discardStorageIds([storageId])
        return
      }
      trackedIdsRef.current.add(storageId)
    },
    [discardStorageIds],
  )

  const discardTracked = useCallback(async () => {
    const ids = [...trackedIdsRef.current]
    trackedIdsRef.current.clear()
    uploadsRef.current = []
    setUploads([])
    await discardStorageIds(ids)
  }, [discardStorageIds])

  const beginGeneration = useCallback(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    generationRef.current += 1
    transferredRef.current = false
    return { generation: generationRef.current, signal: controller.signal }
  }, [])

  const isCurrent = (generation: number) =>
    !disposedRef.current &&
    generation === generationRef.current &&
    !transferredRef.current

  const setRunBusy = useCallback(
    (busy: boolean) => {
      startingRef.current = busy
      setStarting(busy)
      onBusyChange?.(busy)
    },
    [onBusyChange],
  )

  const handleDiscard = useCallback(async () => {
    // Run owns the blobs until the draft is created or the mutation fails.
    if (startingRef.current || transferredRef.current) {
      return
    }
    beginGeneration()
    await discardTracked()
    onDiscard?.()
  }, [beginGeneration, discardTracked, onDiscard])

  useEffect(() => {
    if (discardRef) {
      discardRef.current = handleDiscard
    }
    return () => {
      if (discardRef) {
        discardRef.current = null
      }
    }
  }, [discardRef, handleDiscard])

  useEffect(() => {
    return () => {
      onBusyChange?.(false)
    }
  }, [onBusyChange])

  const discardStorageIdsRef = useRef(discardStorageIds)
  useEffect(() => {
    discardStorageIdsRef.current = discardStorageIds
  }, [discardStorageIds])

  useEffect(() => {
    const trackedIds = trackedIdsRef.current
    return () => {
      disposedRef.current = true
      abortRef.current?.abort()
      if (transferredRef.current || startingRef.current) {
        return
      }
      const ids = [...trackedIds]
      trackedIds.clear()
      if (ids.length === 0) {
        return
      }
      void discardStorageIdsRef.current(ids)
    }
  }, [])

  const handleFiles = async (files: File[]) => {
    if (startingRef.current || transferredRef.current) {
      return
    }
    const previousIds = [...trackedIdsRef.current]
    const { generation, signal } = beginGeneration()
    trackedIdsRef.current.clear()
    setError(null)
    setParsing(true)
    void discardStorageIds(previousIds)
    try {
      const next = await parseDroppedFiles(files)
      if (!isCurrent(generation)) {
        return
      }
      setParseIssues(next.parseIssues)
      if (next.clips.length === 0) {
        setUploads([])
        setError(next.parseIssues[0] ?? "No valid clips to process")
        return
      }
      const pending = clipsToUploads(next)
      setUploads(pending)
      const uploaded = await uploadClipsInParallel(
        () => generateUploadUrl({}),
        pending,
        {
          signal,
          onStorageId: (storageId) => trackStorageId(storageId, generation),
          onUpdate: (current) => {
            if (isCurrent(generation)) {
              setUploads(current)
            }
          },
        },
      )
      if (!isCurrent(generation) || signal.aborted) {
        return
      }
      setUploads(uploaded)
      if (!uploadsReady(uploaded)) {
        const firstError = uploaded.find((clip) => clip.status === "error")
        setError(firstError?.error ?? "Some clips failed to upload")
      }
    } catch (caught) {
      if (!isCurrent(generation)) {
        return
      }
      setError(caught instanceof Error ? caught.message : "Could not parse the drop")
      setUploads([])
    } finally {
      if (isCurrent(generation)) {
        setParsing(false)
      }
    }
  }

  useEffect(() => {
    if (initialHandled.current || !initialFiles || initialFiles.length === 0) {
      return
    }
    initialHandled.current = true
    void handleFiles(initialFiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for drop-opened modal
  }, [initialFiles])

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const files = await collectDroppedFiles(event.dataTransfer)
    await handleFiles(files)
  }

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    resetFileInput(event.target)
    if (files.length > 0) {
      await handleFiles(files)
    }
  }

  const handleRetryFailed = async () => {
    if (startingRef.current || transferredRef.current || uploadsBusy(uploads)) {
      return
    }
    const failed = uploads.filter((clip) => clip.status === "error")
    if (failed.length === 0) {
      return
    }
    const generation = generationRef.current
    const signal = abortRef.current?.signal
    setError(null)
    const retrying = uploads.map((clip) =>
      clip.status === "error"
        ? { ...clip, status: "pending" as const, error: undefined }
        : clip,
    )
    setUploads(retrying)
    const uploaded = await uploadClipsInParallel(
      () => generateUploadUrl({}),
      retrying,
      {
        signal,
        onStorageId: (storageId) => trackStorageId(storageId, generation),
        onUpdate: (current) => {
          if (isCurrent(generation)) {
            setUploads(current)
          }
        },
      },
    )
    if (!isCurrent(generation) || signal?.aborted) {
      return
    }
    setUploads(uploaded)
    if (!uploadsReady(uploaded)) {
      const firstError = uploaded.find((clip) => clip.status === "error")
      setError(firstError?.error ?? "Some clips failed to upload")
    }
  }

  const handleRun = async () => {
    if (!uploadsReady(uploads) || starting || transferredRef.current) {
      setError("Wait until every clip has finished uploading")
      return
    }
    setRunBusy(true)
    setError(null)
    try {
      const clips = preparedClipsFromUploads(uploads)
      const batchId = await createDraft({
        name: defaultBatchName(clips.length),
        method: selectedMethod,
        parseIssues,
        clips: clips.map((clip) => ({
          name: clip.name,
          storageId: clip.storageId as Id<"_storage">,
          goldJson: clip.goldJson,
        })),
      })
      // Draft now owns the blobs. Do not delete them on close or unmount.
      transferredRef.current = true
      trackedIdsRef.current.clear()
      abortRef.current?.abort()
      try {
        const result = await start({ batchId, method: selectedMethod })
        if (result.reason === "queued") {
          toast.message("Batch queued until another run finishes")
        }
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Could not start the batch"
        toast.error(`${message}. Open the draft to retry Run.`)
      }
      onStarted?.(batchId)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not start the batch"
      setError(message)
      toast.error(message)
    } finally {
      setRunBusy(false)
    }
  }

  const summary = useMemo(() => {
    if (uploads.length === 0) {
      return null
    }
    const labeled = uploads.filter((clip) => Boolean(clip.goldJson)).length
    const ready = uploads.filter((clip) => clip.status === "ready").length
    const failed = uploads.filter((clip) => clip.status === "error").length
    return { clipCount: uploads.length, labeled, ready, failed }
  }, [uploads])

  const uploading = uploadsBusy(uploads)
  const canRun = uploadsReady(uploads) && !parsing && !starting && !uploading

  const uploadLabel = (() => {
    if (parsing) {
      return "Parsing…"
    }
    if (starting) {
      return "Starting…"
    }
    if (uploading && summary) {
      return `Uploading ${summary.ready}/${summary.clipCount}`
    }
    return null
  })()

  return (
    <div className="space-y-8">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          void handleDrop(event)
        }}
        className={
          dragging
            ? "rounded-xl border border-foreground bg-muted/40 p-8 sm:p-10"
            : "rounded-xl border border-dashed border-border bg-card p-8 sm:p-10"
        }
      >
        <p className="text-sm font-medium">Drop a ZIP or folder</p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Include audio files and <code>labels.csv</code>. The CSV must have a{" "}
          <code>name</code> column. Leave <code>result_json</code> empty on the hidden
          set. Files upload as soon as they parse. Processing starts when you press Run.
        </p>
        <label className="mt-8 inline-flex">
          <input
            type="file"
            className="sr-only"
            multiple
            disabled={starting}
            onChange={(event) => {
              void handleFileInput(event)
            }}
          />
          <span className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-background px-4 text-sm font-medium">
            Choose files
          </span>
        </label>
      </div>

      {summary ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm font-medium">Parsed summary</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {summary.clipCount} clip{summary.clipCount === 1 ? "" : "s"}
            {summary.labeled > 0 ? ` · ${summary.labeled} labeled` : " · unlabeled"}
            {uploading
              ? ` · uploading ${summary.ready}/${summary.clipCount}`
              : summary.failed > 0
                ? ` · ${summary.failed} failed`
                : " · uploaded"}
          </p>
          {parseIssues.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {parseIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
          {summary.failed > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => {
                void handleRetryFailed()
              }}
            >
              Retry failed uploads
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-medium">Method</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Fusion is the production path. Baseline is the DSP control. You can pick either
            before uploading files.
          </p>
        </div>
        <MethodCards value={selectedMethod} onChange={setMethod} />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Cannot run yet</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="sticky bottom-0 -mx-6 mt-2 flex flex-wrap items-center gap-3 border-t bg-popover px-6 py-4">
        <Button
          type="button"
          size="lg"
          className="h-10 px-5"
          disabled={!canRun}
          onClick={() => {
            void handleRun()
          }}
        >
          {uploadLabel ?? "Run"}
        </Button>
        {onDiscard ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 px-5"
            disabled={starting}
            onClick={() => {
              void handleDiscard()
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  )
}
