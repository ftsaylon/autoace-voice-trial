"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { CheckIcon, XIcon } from "lucide-react"
import { Spinner } from "@/components/waveform-spinner"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { collectDroppedFiles } from "@/lib/collect-dropped-files"
import {
  clipsToUploads,
  formatFileSize,
  isAbortError,
  mergeSelectedBatchFiles,
  parseDroppedFiles,
  prepareClipsForDraft,
  toSelectedBatchFiles,
  type SelectedBatchFile,
} from "@/lib/prepare-batch"
import { deriveUploadSourceName } from "@/lib/upload-source-name"
import { MethodCards } from "@/components/method-cards"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DEFAULT_METHOD, METHOD_IDS, type MethodId } from "@/application/methods"
import { relativeTime } from "@/lib/format-time"
import { cn } from "@/lib/utils"

export type NewBatchPanelProps = {
  initialFiles?: File[] | null
  initialRootName?: string | null
  onStarted?: (batchId: string) => void
  className?: string
}

export const NewBatchPanel = ({
  initialFiles = null,
  initialRootName = null,
  onStarted,
  className,
}: NewBatchPanelProps) => {
  const { isAuthenticated } = useConvexAuth()
  const savedDatasets = useQuery(api.datasets.list, isAuthenticated ? {} : "skip")
  const generateUploadUrl = useMutation(api.batches.generateUploadUrl)
  const createDataset = useMutation(api.datasets.create)
  const createFromDataset = useMutation(api.batches.createFromDataset)
  const startBatch = useMutation(api.batches.start)

  const [selectedDatasetId, setSelectedDatasetId] = useState<Id<"datasets"> | null>(
    null,
  )
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<SelectedBatchFile[]>([])
  const [uploadRootName, setUploadRootName] = useState<string | null>(null)
  const [methods, setMethods] = useState<MethodId[]>([DEFAULT_METHOD])
  const [errors, setErrors] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const initialHandled = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const runInFlightRef = useRef(false)

  const selectedDataset = savedDatasets?.find(
    (dataset) => dataset._id === selectedDatasetId,
  )

  const clearDataset = () => {
    setSelectedDatasetId(null)
    setUploadRootName(null)
  }

  const handleAcceptFiles = (
    files: File[],
    options?: { replace?: boolean; rootName?: string | null },
  ) => {
    if (starting) {
      return
    }
    setSelectedDatasetId(null)
    const replace = options?.replace ?? false
    if (replace) {
      const nextSelected = toSelectedBatchFiles(files)
      if (nextSelected.length === 0) {
        setErrors(["No files were selected"])
        return
      }
      setErrors([])
      setSelected(nextSelected)
      setUploadRootName(options?.rootName ?? null)
      return
    }
    setSelected((current) => {
      const nextSelected = mergeSelectedBatchFiles(current, files)
      if (nextSelected.length === 0) {
        setErrors(["No files were selected"])
        return current
      }
      setErrors([])
      return nextSelected
    })
  }

  useEffect(() => {
    if (initialHandled.current || !initialFiles || initialFiles.length === 0) {
      return
    }
    initialHandled.current = true
    handleAcceptFiles(initialFiles, {
      replace: true,
      rootName: initialRootName,
    })
  }, [initialFiles, initialRootName])

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const { files, rootName } = await collectDroppedFiles(event.dataTransfer)
    if (files.length === 0) {
      return
    }
    const isSingleZip =
      files.length === 1 && files[0]?.name.toLowerCase().endsWith(".zip")
    const isFolderUpload = Boolean(rootName) || files.some((file) => file.webkitRelativePath)
    handleAcceptFiles(files, {
      replace: isSingleZip || isFolderUpload,
      rootName: rootName ?? null,
    })
  }

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    if (files.length > 0) {
      const isSingleZip =
        files.length === 1 && files[0]?.name.toLowerCase().endsWith(".zip")
      handleAcceptFiles(files, { replace: isSingleZip })
    }
    event.currentTarget.value = ""
  }

  const handleFolderInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    if (files.length > 0) {
      handleAcceptFiles(files, { replace: true })
    }
    event.currentTarget.value = ""
  }

  const handleRemoveFile = (id: string) => {
    setSelected((current) => {
      const next = current.filter((file) => file.id !== id)
      if (next.length === 0) {
        setErrors([])
      }
      return next
    })
  }

  const handleSelectDataset = (datasetId: Id<"datasets">) => {
    if (starting) {
      return
    }
    if (selectedDatasetId === datasetId) {
      clearDataset()
      return
    }
    setSelectedDatasetId(datasetId)
    setSelected([])
    setUploadRootName(null)
    setErrors([])
  }

  const launchBatch = useCallback(
    async (datasetId: Id<"datasets">, parseIssues: string[]) => {
      const batchId = await createFromDataset({
        datasetId,
        method: methods[0] ?? DEFAULT_METHOD,
        methods,
        parseIssues,
      })
      const result = await startBatch({
        batchId,
        methods,
      })
      if (result.reason === "queued") {
        toast.message("Queued until another batch finishes")
      }
      onStarted?.(batchId)
    },
    [
      createFromDataset,
      methods,
      onStarted,
      startBatch,
    ],
  )

  const handleRun = async () => {
    if (starting || runInFlightRef.current) {
      return
    }
    if (selectedDatasetId && selectedDataset) {
      // saved dataset path
    } else if (selected.length === 0) {
      setErrors(["Add files or pick a recent dataset before running"])
      return
    }

    runInFlightRef.current = true
    setStarting(true)
    setErrors([])
    setUploadProgress(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      if (selectedDatasetId && selectedDataset) {
        await launchBatch(selectedDatasetId, selectedDataset.parseIssues)
        return
      }

      const parsed = await parseDroppedFiles(
        selected.map((item) => item.file),
        controller.signal,
      )
      if (controller.signal.aborted) {
        return
      }
      if (parsed.clips.length === 0) {
        const issues =
          parsed.parseIssues.length > 0
            ? parsed.parseIssues
            : ["No valid clips to process"]
        setErrors(issues)
        return
      }

      const uploads = clipsToUploads(parsed)
      setUploadProgress({ done: 0, total: uploads.length })
      const prepared = await prepareClipsForDraft(
        () => generateUploadUrl({}),
        parsed,
        (done, total) => {
          setUploadProgress({ done, total })
        },
      )
      if (controller.signal.aborted) {
        return
      }

      const uploadFiles = selected.map((item) => item.file)
      const preferredName = deriveUploadSourceName(uploadFiles, uploadRootName ?? undefined)

      const datasetId = await createDataset({
        preferredName: preferredName ?? undefined,
        parseIssues: parsed.parseIssues,
        clips: prepared.map((clip) => ({
          name: clip.name,
          storageId: clip.storageId as Id<"_storage">,
          goldJson: clip.goldJson,
        })),
      })
      await launchBatch(datasetId, parsed.parseIssues)
    } catch (caught) {
      if (isAbortError(caught)) {
        return
      }
      const message =
        caught instanceof Error ? caught.message : "Could not start the batch"
      setErrors([message])
      toast.error(message)
    } finally {
      runInFlightRef.current = false
      setStarting(false)
      setUploadProgress(null)
    }
  }

  const hasFileSelection = selected.length > 0
  const hasDatasetSelection = selectedDatasetId !== null
  const canRun =
    !starting && (hasFileSelection || hasDatasetSelection)

  const runLabel = starting
    ? uploadProgress
      ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
      : "Starting…"
    : "Run"

  const allMethodsSelected = METHOD_IDS.every((id) => methods.includes(id))

  const handleSelectAllChange = (checked: boolean) => {
    if (checked) {
      setMethods([...METHOD_IDS])
      return
    }
    setMethods([DEFAULT_METHOD])
  }

  const dropzoneClass = cn(
    "rounded-xl border bg-card transition-colors",
    dragging
      ? "border-foreground bg-muted/40"
      : "border-dashed border-border",
  )

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto pb-4">
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Files</h2>

        <div
          role="region"
          aria-label="Drop a ZIP or folder of audio files with labels.csv, or use Choose files"
          onDragOver={(event) => {
            event.preventDefault()
            if (!starting && !hasDatasetSelection) {
              setDragging(true)
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            if (!starting && !hasDatasetSelection) {
              void handleDrop(event)
            }
          }}
          className={dropzoneClass}
        >
          {hasDatasetSelection && selectedDataset ? (
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{selectedDataset.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedDataset.clipCount} clip
                    {selectedDataset.clipCount === 1 ? "" : "s"}
                    {selectedDataset.parseIssues.length > 0
                      ? ` · ${selectedDataset.parseIssues.length} parse note${selectedDataset.parseIssues.length === 1 ? "" : "s"}`
                      : ""}
                    {` · ${relativeTime(selectedDataset.updatedAt)}`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Clear dataset selection"
                  disabled={starting}
                  onClick={clearDataset}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                Using a saved dataset.{" "}
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  disabled={starting}
                  onClick={clearDataset}
                >
                  Upload different files
                </button>
              </p>
            </div>
          ) : hasFileSelection ? (
            <div className="p-6 sm:p-8">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-medium">Selected files</p>
                <p className="text-sm text-muted-foreground">
                  {selected.length} file{selected.length === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-background">
                {selected.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {item.name}
                    </span>
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
              <div className="mt-6 flex flex-wrap gap-2">
                <label className="inline-flex">
                  <input
                    type="file"
                    className="sr-only"
                    multiple
                    accept=".zip,.csv,.wav,.mp3,.ogg,.m4a,.flac,application/zip"
                    disabled={starting}
                    aria-label="Add more batch files"
                    onChange={handleFileInput}
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border bg-background px-3 text-sm font-medium">
                    Add files
                  </span>
                </label>
                <label className="inline-flex">
                  <input
                    type="file"
                    className="sr-only"
                    multiple
                    disabled={starting}
                    aria-label="Replace selection with a folder"
                    onChange={handleFolderInput}
                    {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border bg-background px-3 text-sm font-medium">
                    Choose folder
                  </span>
                </label>
              </div>
            </div>
          ) : (
            <div className="p-8 sm:p-10">
              <p className="text-sm font-medium">Add a folder, ZIP, or files</p>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Include any supported audio (.wav, .mp3, .ogg, .m4a, .flac) and{" "}
                <code>labels.csv</code>. The CSV <code>name</code> column must match
                those filenames. You can drop a folder or choose one directly.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                <label className="inline-flex">
                  <input
                    type="file"
                    className="sr-only"
                    multiple
                    accept=".zip,.csv,.wav,.mp3,.ogg,.m4a,.flac,application/zip"
                    disabled={starting}
                    aria-label="Choose batch files"
                    onChange={handleFileInput}
                  />
                  <span className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-background px-4 text-sm font-medium">
                    Choose files
                  </span>
                </label>
                <label className="inline-flex">
                  <input
                    type="file"
                    className="sr-only"
                    multiple
                    disabled={starting}
                    aria-label="Choose a folder with labels.csv and audio files"
                    onChange={handleFolderInput}
                    {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                  />
                  <span className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-background px-4 text-sm font-medium">
                    Choose folder
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {savedDatasets === undefined ? null : savedDatasets.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent datasets
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {savedDatasets.map((dataset) => {
                const active = selectedDatasetId === dataset._id
                return (
                  <li key={dataset._id}>
                    <button
                      type="button"
                      disabled={starting}
                      onClick={() => handleSelectDataset(dataset._id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                        active
                          ? "border-foreground bg-accent/40"
                          : "border-border bg-card hover:border-foreground/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background",
                        )}
                        aria-hidden
                      >
                        {active ? <CheckIcon className="size-2.5" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {dataset.name}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {dataset.clipCount} clip{dataset.clipCount === 1 ? "" : "s"}
                          {` · ${relativeTime(dataset.updatedAt)}`}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {selectedDataset && selectedDataset.parseIssues.length > 0 ? (
          <Alert>
            <AlertTitle>Parse notes for this dataset</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                {selectedDataset.parseIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
      </section>

      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium">Methods</h2>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border border-border accent-foreground"
                checked={allMethodsSelected}
                disabled={starting}
                aria-label="Select all methods"
                onChange={(event) => handleSelectAllChange(event.target.checked)}
              />
              Select all
            </label>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Select one or more methods to run on the same files. Gemini methods
            cost extra.
          </p>
        </div>
        <MethodCards multiple value={methods} onChange={setMethods} />
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
      </div>

      <div className="relative z-10 -mx-8 flex shrink-0 flex-wrap items-center gap-3 border-t bg-background px-8 py-4">
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
              <Spinner size={16} />
              {runLabel}
            </span>
          ) : (
            "Run"
          )}
        </Button>
      </div>
    </div>
  )
}
