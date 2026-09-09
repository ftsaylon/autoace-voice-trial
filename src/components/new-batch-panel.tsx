"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { LoaderCircleIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import { collectDroppedFiles } from "@/lib/collect-dropped-files"
import { stashPendingUpload } from "@/lib/batch-upload-queue"
import {
  clipsToUploads,
  defaultBatchName,
  formatFileSize,
  isAbortError,
  parseDroppedFiles,
  parsedInputFromUploads,
  mergeSelectedBatchFiles,
  type SelectedBatchFile,
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
  onFilePickerOpen?: () => void
  onFilePickerSettled?: () => void
  discardRef?: React.MutableRefObject<(() => Promise<void>) | null>
}

export const NewBatchPanel = ({
  initialFiles = null,
  onStarted,
  onDiscard,
  onBusyChange,
  onFilePickerOpen,
  onFilePickerSettled,
  discardRef,
}: NewBatchPanelProps) => {
  const { isAuthenticated } = useConvexAuth()
  const settings = useQuery(api.settings.get, isAuthenticated ? {} : "skip")
  const createDraft = useMutation(api.batches.createDraft)
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<SelectedBatchFile[]>([])
  const [method, setMethod] = useState<AnalysisMethod | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const initialHandled = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const transferredRef = useRef(false)
  const startingRef = useRef(false)
  const runInFlightRef = useRef(false)

  const selectedMethod: AnalysisMethod = method ?? settings?.defaultMethod ?? "fusion"

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
    abortRef.current?.abort()
    setSelected([])
    setErrors([])
    onDiscard?.()
  }, [onDiscard])

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
      abortRef.current?.abort()
    }
  }, [onBusyChange])

  const handleAcceptFiles = (files: File[]) => {
    if (startingRef.current || transferredRef.current) {
      return
    }
    setSelected((current) => {
      const next = mergeSelectedBatchFiles(current, files)
      if (next.length === 0) {
        setErrors(["No files were selected"])
        return current
      }
      setErrors([])
      return next
    })
  }

  useEffect(() => {
    if (initialHandled.current || !initialFiles || initialFiles.length === 0) {
      return
    }
    initialHandled.current = true
    handleAcceptFiles(initialFiles)
  }, [initialFiles])

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const files = await collectDroppedFiles(event.dataTransfer)
    handleAcceptFiles(files)
  }

  const handleFilePickerOpen = () => {
    onFilePickerOpen?.()
  }

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    onFilePickerSettled?.()
    if (files.length > 0) {
      handleAcceptFiles(files)
    }
    event.currentTarget.value = ""
  }

  const handleRemoveFile = (id: string) => {
    setSelected((current) => {
      const next = current.filter((file) => file.id !== id)
      if (next.length === 0) {
        setErrors(["Add at least one file before running"])
      }
      return next
    })
  }

  const handleRun = async () => {
    if (selected.length === 0 || starting || transferredRef.current) {
      setErrors(["Add a ZIP or files with labels.csv before running"])
      return
    }
    if (runInFlightRef.current) {
      return
    }
    runInFlightRef.current = true
    setRunBusy(true)
    setErrors([])
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const parsed = await parseDroppedFiles(
        selected.map((item) => item.file),
        controller.signal,
      )
      if (controller.signal.aborted || transferredRef.current) {
        return
      }
      if (parsed.clips.length === 0) {
        const issues =
          parsed.parseIssues.length > 0
            ? parsed.parseIssues
            : ["No valid clips to process"]
        setErrors(issues)
        runInFlightRef.current = false
        setRunBusy(false)
        return
      }
      const uploads = clipsToUploads(parsed)
      const batchId = await createDraft({
        name: defaultBatchName(uploads.length),
        method: selectedMethod,
        parseIssues: parsed.parseIssues,
        clips: uploads.map((clip) => ({
          name: clip.name,
          goldJson: clip.goldJson,
        })),
      })
      transferredRef.current = true
      stashPendingUpload(batchId, parsedInputFromUploads(uploads, parsed.parseIssues))
      onStarted?.(batchId)
    } catch (caught) {
      if (isAbortError(caught) || transferredRef.current) {
        return
      }
      const message = caught instanceof Error ? caught.message : "Could not start the batch"
      setErrors([message])
      toast.error(message)
      runInFlightRef.current = false
      setRunBusy(false)
    }
  }

  const canRun = selected.length > 0 && !starting

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
          Include any supported audio (.wav, .mp3, .ogg, .m4a, .flac) and{" "}
          <code>labels.csv</code>. The CSV <code>name</code> column must match those
          filenames. Leave <code>result_json</code> empty on the hidden set. You can
          add files in more than one selection; they are only read when you press Run.
        </p>
        <label className="mt-8 inline-flex">
          <input
            type="file"
            className="sr-only"
            multiple
            accept=".zip,.csv,.wav,.mp3,.ogg,.m4a,.flac,application/zip"
            disabled={starting}
            aria-label="Choose batch files"
            onClick={handleFilePickerOpen}
            onChange={handleFileInput}
          />
          <span className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-background px-4 text-sm font-medium">
            {selected.length > 0 ? "Add files" : "Choose files"}
          </span>
        </label>
      </div>

      {selected.length > 0 ? (
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium">Selected files</p>
            <p className="text-sm text-muted-foreground">
              {selected.length} file{selected.length === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {selected.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatFileSize(item.size)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${item.name}`}
                  disabled={starting}
                  onClick={() => handleRemoveFile(item.id)}
                >
                  <XIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
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

      {errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Cannot run yet</AlertTitle>
          <AlertDescription>
            {errors.length === 1 ? (
              errors[0]
            ) : (
              <ul className="list-disc space-y-1 pl-4">
                {errors.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
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
          {starting ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
              Starting…
            </span>
          ) : (
            "Run"
          )}
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
