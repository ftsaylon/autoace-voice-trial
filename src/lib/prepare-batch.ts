import {
  filesFromZip,
  parseManifestAndFiles,
  type IncomingFile,
  type ParsedBatchInput,
} from "@/application/parse-batch"
import { autoAceJsonString, fromAutoAceJson } from "@/domain"
import { mediaTypeFor } from "@/lib/media-type"

export type PreparedClip = {
  name: string
  storageId: string
  goldJson?: string
}

export type ClipUploadStatus = "pending" | "uploading" | "ready" | "error"

export type ClipUpload = {
  name: string
  bytes: Uint8Array
  goldJson?: string
  status: ClipUploadStatus
  storageId?: string
  error?: string
}

export const UPLOAD_CONCURRENCY = 4

const basename = (path: string): string => {
  const parts = path.replaceAll("\\", "/").split("/")
  return parts[parts.length - 1] ?? path
}

export const fileToIncoming = async (file: File): Promise<IncomingFile> => {
  return {
    name: basename(file.name),
    bytes: new Uint8Array(await file.arrayBuffer()),
  }
}

export const incomingFromDropped = async (
  files: File[],
): Promise<IncomingFile[]> => {
  if (files.length === 1 && files[0]?.name.toLowerCase().endsWith(".zip")) {
    const bytes = new Uint8Array(await files[0].arrayBuffer())
    return filesFromZip(bytes)
  }
  return Promise.all(files.map((file) => fileToIncoming(file)))
}

export const parseDroppedFiles = async (
  files: File[],
): Promise<ParsedBatchInput> => {
  const incoming = await incomingFromDropped(files)
  return parseManifestAndFiles(incoming)
}

export const clipsToUploads = (parsed: ParsedBatchInput): ClipUpload[] => {
  return parsed.clips.map((clip) => ({
    name: clip.name,
    bytes: clip.bytes,
    goldJson: clip.gold ? autoAceJsonString(clip.gold) : undefined,
    status: "pending" as const,
  }))
}

export const parsedInputFromUploads = (
  uploads: ClipUpload[],
  parseIssues: string[],
): ParsedBatchInput => {
  return {
    parseIssues,
    clips: uploads.map((clip) => ({
      name: clip.name,
      bytes: clip.bytes,
      gold: clip.goldJson
        ? (() => {
            const parsed = fromAutoAceJson(clip.goldJson)
            return parsed.ok ? parsed.value : null
          })()
        : null,
    })),
  }
}

export const storageIdsFromUploads = (uploads: ClipUpload[]): string[] => {
  return uploads.flatMap((clip) => (clip.storageId ? [clip.storageId] : []))
}

export const uploadsReady = (uploads: ClipUpload[]): boolean => {
  return (
    uploads.length > 0 &&
    uploads.every((clip) => clip.status === "ready" && Boolean(clip.storageId))
  )
}

export const uploadsBusy = (uploads: ClipUpload[]): boolean => {
  return uploads.some(
    (clip) => clip.status === "pending" || clip.status === "uploading",
  )
}

export const preparedClipsFromUploads = (
  uploads: ClipUpload[],
): PreparedClip[] => {
  return uploads.map((clip) => {
    if (!clip.storageId) {
      throw new Error(`Clip ${clip.name} is not uploaded`)
    }
    return {
      name: clip.name,
      storageId: clip.storageId,
      goldJson: clip.goldJson,
    }
  })
}

export const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true
  }
  return error instanceof Error && error.name === "AbortError"
}

export const uploadClipBytes = async (
  generateUploadUrl: () => Promise<string>,
  name: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<string> => {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
  const uploadUrl = await generateUploadUrl()
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
  const payload = new Blob([Uint8Array.from(bytes)], { type: mediaTypeFor(name) })
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mediaTypeFor(name) },
    body: payload,
    signal,
  })
  if (!response.ok) {
    throw new Error(`Failed to upload ${name}`)
  }
  const body = (await response.json()) as { storageId?: string }
  if (!body.storageId) {
    throw new Error(`Upload of ${name} did not return a storage id`)
  }
  return body.storageId
}

export const uploadClipsInParallel = async (
  generateUploadUrl: () => Promise<string>,
  uploads: ClipUpload[],
  options?: {
    concurrency?: number
    signal?: AbortSignal
    onUpdate?: (uploads: ClipUpload[]) => void
    onStorageId?: (storageId: string) => void
  },
): Promise<ClipUpload[]> => {
  const concurrency = options?.concurrency ?? UPLOAD_CONCURRENCY
  const signal = options?.signal
  const next = uploads.map((clip) => ({ ...clip }))
  let cursor = 0

  const publish = () => {
    options?.onUpdate?.(next.map((clip) => ({ ...clip })))
  }

  const worker = async () => {
    while (cursor < next.length) {
      if (signal?.aborted) {
        return
      }
      const index = cursor
      cursor += 1
      const clip = next[index]
      if (!clip || clip.status === "ready") {
        if (clip?.storageId) {
          options?.onStorageId?.(clip.storageId)
        }
        publish()
        continue
      }
      next[index] = { ...clip, status: "uploading", error: undefined }
      publish()
      try {
        const storageId = await uploadClipBytes(
          generateUploadUrl,
          clip.name,
          clip.bytes,
          signal,
        )
        options?.onStorageId?.(storageId)
        next[index] = {
          ...clip,
          status: "ready",
          storageId,
          error: undefined,
        }
      } catch (caught) {
        if (isAbortError(caught)) {
          next[index] = { ...clip, status: "pending", error: undefined }
          return
        }
        next[index] = {
          ...clip,
          status: "error",
          storageId: undefined,
          error:
            caught instanceof Error ? caught.message : `Failed to upload ${clip.name}`,
        }
      }
      publish()
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(next.length, 1)) },
    () => worker(),
  )
  await Promise.all(workers)
  return next
}

/** @deprecated Prefer uploadClipsInParallel after parse. Kept for callers that still batch on Run. */
export const prepareClipsForDraft = async (
  generateUploadUrl: () => Promise<string>,
  parsed: ParsedBatchInput,
  onProgress?: (done: number, total: number) => void,
): Promise<PreparedClip[]> => {
  const uploads = clipsToUploads(parsed)
  const uploaded = await uploadClipsInParallel(generateUploadUrl, uploads, {
    onUpdate: (current) => {
      const done = current.filter(
        (clip) => clip.status === "ready" || clip.status === "error",
      ).length
      onProgress?.(done, current.length)
    },
  })
  if (!uploadsReady(uploaded)) {
    const firstError = uploaded.find((clip) => clip.status === "error")
    throw new Error(firstError?.error ?? "Some clips failed to upload")
  }
  return preparedClipsFromUploads(uploaded)
}

export const defaultBatchName = (fileCount: number): string => {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
  return fileCount === 1 ? `Batch ${stamp}` : `Batch ${stamp}`
}
