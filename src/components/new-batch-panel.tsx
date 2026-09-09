"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { LoaderCircleIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import { collectDroppedFiles, resetFileInput } from "@/lib/collect-dropped-files"
import { stashPendingUpload } from "@/lib/batch-upload-queue"
import {
  clipsToUploads,
  defaultBatchName,
  parseDroppedFiles,
  parsedInputFromUploads,
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
  const createDraft = useMutation(api.batches.createDraft)
  const [dragging, setDragging] = useState(false)
  const [parseIssues, setParseIssues] = useState<string[]>([])
  const [uploads, setUploads] = useState<ClipUpload[]>([])
  const [method, setMethod] = useState<AnalysisMethod | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [starting, setStarting] = useState(false)
  const initialHandled = useRef(false)
  const generationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const transferredRef = useRef(false)
  const disposedRef = useRef(false)
  const startingRef = useRef(false)
  const runInFlightRef = useRef(false)

  const selectedMethod: AnalysisMethod = method ?? settings?.defaultMethod ?? "fusion"

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
    if (startingRef.current || transferredRef.current) {
      return
    }
    beginGeneration()
    setUploads([])
    setParseIssues([])
    onDiscard?.()
  }, [beginGeneration, onDiscard])

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

  useEffect(() => {
    return () => {
      disposedRef.current = true
      abortRef.current?.abort()
    }
  }, [])

  const handleFiles = async (files: File[]) => {
    if (startingRef.current || transferredRef.current) {
      return
    }
    const { generation, signal } = beginGeneration()
    setError(null)
    setParsing(true)
    try {
      const next = await parseDroppedFiles(files)
      if (!isCurrent(generation) || signal.aborted) {
        return
      }
      setParseIssues(next.parseIssues)
      if (next.clips.length === 0) {
        setUploads([])
        setError(next.parseIssues[0] ?? "No valid clips to process")
        return
      }
      setUploads(clipsToUploads(next))
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

  const removeClip = (name: string) => {
    setUploads((current) => {
      const next = current.filter((clip) => clip.name !== name)
      if (next.length === 0) {
        setError("Add at least one clip before running")
      }
      return next
    })
  }

  const handleRun = async () => {
    if (uploads.length === 0 || starting || transferredRef.current) {
      setError("Parse a ZIP or folder with labels.csv before running")
      return
    }
    if (runInFlightRef.current) {
      return
    }
    runInFlightRef.current = true
    setRunBusy(true)
    setError(null)
    try {
      const batchId = await createDraft({
        name: defaultBatchName(uploads.length),
        method: selectedMethod,
        parseIssues,
        clips: uploads.map((clip) => ({
          name: clip.name,
          goldJson: clip.goldJson,
        })),
      })
      transferredRef.current = true
      abortRef.current?.abort()
      stashPendingUpload(batchId, parsedInputFromUploads(uploads, parseIssues))
      onStarted?.(batchId)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not start the batch"
      setError(message)
      toast.error(message)
      runInFlightRef.current = false
      setRunBusy(false)
    }
  }

  const summary = useMemo(() => {
    if (uploads.length === 0) {
      return null
    }
    return {
      clipCount: uploads.length,
      labeled: uploads.filter((clip) => Boolean(clip.goldJson)).length,
    }
  }, [uploads])

  const canRun = uploads.length > 0 && !parsing && !starting

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
          set. Processing does not start until you press Run.
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
        {parsing ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
            Parsing files…
          </p>
        ) : null}
      </div>

      {summary ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium">Ready for upload</p>
            <p className="text-sm text-muted-foreground">
              {summary.clipCount} clip{summary.clipCount === 1 ? "" : "s"}
              {summary.labeled > 0 ? ` · ${summary.labeled} labeled` : " · unlabeled"}
            </p>
          </div>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {uploads.map((clip) => (
              <li
                key={clip.name}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{clip.name}</span>
                {clip.goldJson ? (
                  <span className="shrink-0 text-xs text-muted-foreground">labeled</span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${clip.name}`}
                  disabled={starting}
                  onClick={() => removeClip(clip.name)}
                >
                  <XIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          {parseIssues.length > 0 ? (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {parseIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-medium">Method</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Fusion is the production path. Baseline is the DSP control. You can pick either
            before running.
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
          Run
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
