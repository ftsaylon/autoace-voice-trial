import {
  filesFromZip,
  parseManifestAndFiles,
  type IncomingFile,
  type ParsedBatchInput,
} from "@/application/parse-batch"
import { autoAceJsonString } from "@/domain"
import { mediaTypeFor } from "@/lib/media-type"

export type PreparedClip = {
  name: string
  storageId: string
  goldJson?: string
}

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

export const uploadClipBytes = async (
  generateUploadUrl: () => Promise<string>,
  name: string,
  bytes: Uint8Array,
): Promise<string> => {
  const uploadUrl = await generateUploadUrl()
  const payload = new Blob([Uint8Array.from(bytes)], { type: mediaTypeFor(name) })
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mediaTypeFor(name) },
    body: payload,
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

export const prepareClipsForDraft = async (
  generateUploadUrl: () => Promise<string>,
  parsed: ParsedBatchInput,
  onProgress?: (done: number, total: number) => void,
): Promise<PreparedClip[]> => {
  const prepared: PreparedClip[] = []
  for (const [index, clip] of parsed.clips.entries()) {
    const storageId = await uploadClipBytes(
      generateUploadUrl,
      clip.name,
      clip.bytes,
    )
    prepared.push({
      name: clip.name,
      storageId,
      goldJson: clip.gold ? autoAceJsonString(clip.gold) : undefined,
    })
    onProgress?.(index + 1, parsed.clips.length)
  }
  return prepared
}

export const defaultBatchName = (fileCount: number): string => {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
  return fileCount === 1 ? `Batch ${stamp}` : `Batch ${stamp}`
}
