"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import { collectDroppedFiles, resetFileInput } from "@/lib/collect-dropped-files"
import {
  defaultBatchName,
  parseDroppedFiles,
  prepareClipsForDraft,
} from "@/lib/prepare-batch"
import { MethodCards } from "@/components/method-cards"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { AnalysisMethod } from "@/application/select-classifier"
import type { ParsedBatchInput } from "@/application/parse-batch"

export const NewBatchPanel = () => {
  const router = useRouter()
  const { isAuthenticated } = useConvexAuth()
  const settings = useQuery(api.settings.get, isAuthenticated ? {} : "skip")
  const generateUploadUrl = useMutation(api.batches.generateUploadUrl)
  const createDraft = useMutation(api.batches.createDraft)
  const start = useMutation(api.batches.start)
  const [dragging, setDragging] = useState(false)
  const [parsed, setParsed] = useState<ParsedBatchInput | null>(null)
  const [method, setMethod] = useState<AnalysisMethod>("fusion")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)

  const defaultMethod = settings?.defaultMethod ?? "fusion"
  const selectedMethod = parsed ? method : defaultMethod

  const summary = useMemo(() => {
    if (!parsed) {
      return null
    }
    return {
      clipCount: parsed.clips.length,
      labeled: parsed.clips.filter((clip) => clip.gold).length,
    }
  }, [parsed])

  const handleFiles = async (files: File[]) => {
    setError(null)
    setPending(true)
    try {
      const next = await parseDroppedFiles(files)
      setParsed(next)
      setMethod(defaultMethod)
      if (next.clips.length === 0) {
        setError(next.parseIssues[0] ?? "No valid clips to process")
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not parse the drop")
    } finally {
      setPending(false)
    }
  }

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

  const handleRun = async () => {
    if (!parsed || parsed.clips.length === 0) {
      setError("Parse a ZIP or folder with labels.csv before running")
      return
    }
    setPending(true)
    setError(null)
    try {
      const clips = await prepareClipsForDraft(
        () => generateUploadUrl({}),
        parsed,
        (done, total) => setUploadProgress(`Uploading ${done}/${total}`),
      )
      const batchId = await createDraft({
        name: defaultBatchName(clips.length),
        method: selectedMethod,
        parseIssues: parsed.parseIssues,
        clips: clips.map((clip) => ({
          name: clip.name,
          storageId: clip.storageId as never,
          goldJson: clip.goldJson,
        })),
      })
      const result = await start({ batchId, method: selectedMethod })
      if (result.reason === "queued") {
        toast.message("Batch queued until another run finishes")
      }
      router.push(`/batches/${batchId}`)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not start the batch"
      setError(message)
      toast.error(message)
    } finally {
      setPending(false)
      setUploadProgress(null)
    }
  }

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
            ? "rounded-xl border border-foreground bg-muted/40 p-10"
            : "rounded-xl border border-dashed border-border bg-card p-10"
        }
      >
        <p className="text-sm font-medium">Drop a ZIP or folder</p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Include audio files and <code>labels.csv</code>. The CSV must have a{" "}
          <code>name</code> column. Leave <code>result_json</code> empty on the hidden
          set. Processing does not start until you press Run.
        </p>
        <label className="mt-6 inline-flex">
          <input
            type="file"
            className="sr-only"
            multiple
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
          </p>
          {parsed?.parseIssues.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {parsed.parseIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Method</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fusion is the production path. Baseline is the DSP control.
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

      <Button
        type="button"
        size="lg"
        className="h-10 px-5"
        disabled={pending || !parsed || parsed.clips.length === 0}
        onClick={() => {
          void handleRun()
        }}
      >
        {pending ? uploadProgress ?? "Working…" : "Run"}
      </Button>
    </div>
  )
}
