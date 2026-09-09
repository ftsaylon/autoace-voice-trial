"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import {
  clearPendingUpload,
  peekPendingUpload,
} from "@/lib/batch-upload-queue"
import { uploadClipBytes } from "@/lib/prepare-batch"
import type { AnalysisMethod } from "@/application/methods"
import type { ParsedBatchInput } from "@/application/parse-batch"

type BatchClip = {
  _id: Id<"clips">
  name: string
  state: string
  storageId?: Id<"_storage">
}

type BatchDetail = {
  batch: {
    _id: Id<"batches">
    status: string
    method: AnalysisMethod
  }
  clips: BatchClip[]
}

type UploadAttempt = "idle" | "running" | "finished"

const allClipsStored = (clips: BatchClip[]): boolean =>
  clips.length > 0 &&
  clips.every((clip) => clip.storageId && clip.state === "queued")

const anyClipStored = (clips: BatchClip[]): boolean =>
  clips.some((clip) => clip.storageId)

const storedClipCount = (clips: BatchClip[]): number =>
  clips.filter((clip) => clip.storageId && clip.state === "queued").length

export const useBatchUpload = (
  batchId: string,
  detail: BatchDetail | null | undefined,
) => {
  const generateUploadUrl = useMutation(api.batches.generateUploadUrl)
  const attachClipStorage = useMutation(api.batches.attachClipStorage)
  const start = useMutation(api.batches.start)
  const failUpload = useMutation(api.batches.failUpload)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [startFailed, setStartFailed] = useState(false)
  const [uploadOrphaned, setUploadOrphaned] = useState(false)
  const [uploadWaitingRemote, setUploadWaitingRemote] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const attemptRef = useRef<UploadAttempt>("idle")

  const runStart = useCallback(
    async (batch: BatchDetail["batch"]) => {
      const result = await start({
        batchId: batch._id,
        method: batch.method,
      })
      if (result.reason === "queued") {
        toast.message("Batch queued until another run finishes")
      }
    },
    [start],
  )

  const runUpload = useCallback(
    async (parsed: ParsedBatchInput, clips: BatchClip[], batch: BatchDetail["batch"]) => {
      const clipByName = new Map(clips.map((clip) => [clip.name, clip] as const))
      const pendingNames = parsed.clips.map((clip) => clip.name)
      const alreadyStored = pendingNames.filter((name) => {
        const clip = clipByName.get(name)
        return clip?.storageId && clip.state === "queued"
      }).length
      let done = alreadyStored
      setProgress({ done, total: parsed.clips.length })

      for (const clip of parsed.clips) {
        const record = clipByName.get(clip.name)
        if (!record) {
          throw new Error(`Missing clip record for ${clip.name}`)
        }
        if (record.storageId && record.state === "queued") {
          continue
        }
        const storageId = await uploadClipBytes(
          () => generateUploadUrl({}),
          clip.name,
          clip.bytes,
        )
        await attachClipStorage({
          clipId: record._id,
          storageId: storageId as Id<"_storage">,
        })
        done += 1
        setProgress({ done, total: parsed.clips.length })
      }

      await runStart(batch)
      clearPendingUpload(batchId)
      setProgress(null)
    },
    [attachClipStorage, batchId, generateUploadUrl, runStart],
  )

  useEffect(() => {
    if (!detail || detail.batch.status !== "uploading") {
      return
    }
    if (attemptRef.current === "running") {
      return
    }

    const pending = peekPendingUpload(batchId)
    const { clips, batch } = detail

    if (allClipsStored(clips)) {
      if (attemptRef.current === "finished" && startFailed) {
        return
      }
      attemptRef.current = "running"
      setUploadError(null)
      setStartFailed(false)
      setUploadOrphaned(false)
      setUploadWaitingRemote(false)
      void (async () => {
        try {
          await runStart(batch)
          attemptRef.current = "finished"
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Could not start batch"
          setUploadError(message)
          setStartFailed(true)
          toast.error(message)
          attemptRef.current = "finished"
        }
      })()
      return
    }

    if (pending) {
      if (attemptRef.current === "finished") {
        return
      }
      attemptRef.current = "running"
      setUploadError(null)
      setStartFailed(false)
      setUploadOrphaned(false)
      setUploadWaitingRemote(false)

      void (async () => {
        try {
          await runUpload(pending, clips, batch)
          attemptRef.current = "finished"
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Upload failed"
          setUploadError(message)
          toast.error(message)
          setProgress(null)
          attemptRef.current = "finished"
        }
      })()
      return
    }

    if (anyClipStored(clips)) {
      setUploadWaitingRemote(true)
      setUploadOrphaned(false)
      setProgress({ done: storedClipCount(clips), total: clips.length })
      return
    }

    if (attemptRef.current === "finished") {
      return
    }
    attemptRef.current = "finished"
    setUploadOrphaned(true)
    setUploadWaitingRemote(false)
    setProgress(null)
  }, [
    batchId,
    detail,
    retryNonce,
    runStart,
    runUpload,
    startFailed,
  ])

  const retryUpload = useCallback(() => {
    if (!peekPendingUpload(batchId)) {
      setUploadOrphaned(true)
      return
    }
    attemptRef.current = "idle"
    setUploadError(null)
    setStartFailed(false)
    setUploadOrphaned(false)
    setUploadWaitingRemote(false)
    setRetryNonce((value) => value + 1)
  }, [batchId])

  const retryStart = useCallback(() => {
    attemptRef.current = "idle"
    setUploadError(null)
    setStartFailed(false)
    setRetryNonce((value) => value + 1)
  }, [])

  const abandonUpload = useCallback(async () => {
    if (!detail) {
      return
    }
    await failUpload({
      batchId: detail.batch._id,
      message: "Upload abandoned",
    })
    setUploadOrphaned(false)
    setUploadWaitingRemote(false)
    setProgress(null)
  }, [detail, failUpload])

  return {
    isUploading:
      detail?.batch.status === "uploading" &&
      (progress !== null || peekPendingUpload(batchId) !== null),
    progress,
    uploadError,
    uploadOrphaned,
    uploadWaitingRemote,
    canRetryUpload:
      uploadError !== null && !startFailed && peekPendingUpload(batchId) !== null,
    canRetryStart: startFailed && detail?.batch.status === "uploading",
    retryUpload,
    retryStart,
    abandonUpload,
  }
}
