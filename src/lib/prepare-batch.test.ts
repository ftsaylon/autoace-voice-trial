import { describe, expect, it, vi } from "vitest"
import {
  clipsToUploads,
  preparedClipsFromUploads,
  storageIdsFromUploads,
  uploadClipsInParallel,
  uploadsBusy,
  uploadsReady,
  type ClipUpload,
} from "@/lib/prepare-batch"
import type { ParsedBatchInput } from "@/application/parse-batch"

const sampleParsed = (count: number): ParsedBatchInput => ({
  parseIssues: [],
  clips: Array.from({ length: count }, (_, index) => ({
    name: `call_${index + 1}.ogg`,
    bytes: new Uint8Array([1, 2, 3, index]),
    gold: null,
  })),
})

describe("prepare-batch uploads", () => {
  it("clipsToUploads starts every clip as pending", () => {
    const uploads = clipsToUploads(sampleParsed(2))
    expect(uploads).toHaveLength(2)
    expect(uploads.every((clip) => clip.status === "pending")).toBe(true)
    expect(uploadsReady(uploads)).toBe(false)
    expect(uploadsBusy(uploads)).toBe(true)
  })

  it("uploadsReady requires every clip to have a storage id", () => {
    const uploads: ClipUpload[] = [
      {
        name: "a.ogg",
        bytes: new Uint8Array([1]),
        status: "ready",
        storageId: "storage_a",
      },
      {
        name: "b.ogg",
        bytes: new Uint8Array([2]),
        status: "uploading",
      },
    ]
    expect(uploadsReady(uploads)).toBe(false)
    expect(uploadsBusy(uploads)).toBe(true)
    uploads[1] = { ...uploads[1]!, status: "ready", storageId: "storage_b" }
    expect(uploadsReady(uploads)).toBe(true)
    expect(uploadsBusy(uploads)).toBe(false)
  })

  it("uploadClipsInParallel uploads with bounded concurrency and progress", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const generateUploadUrl = vi.fn(async () => "https://upload.test")
    const fetchMock = vi.fn(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 20))
      inFlight -= 1
      return {
        ok: true,
        json: async () => ({ storageId: `id_${Math.random()}` }),
      }
    })
    vi.stubGlobal("fetch", fetchMock)

    const updates: ClipUpload[][] = []
    const uploads = clipsToUploads(sampleParsed(5))
    const result = await uploadClipsInParallel(generateUploadUrl, uploads, {
      concurrency: 2,
      onUpdate: (current) => updates.push(current),
    })

    expect(result.every((clip) => clip.status === "ready")).toBe(true)
    expect(uploadsReady(result)).toBe(true)
    expect(maxInFlight).toBeLessThanOrEqual(2)
    expect(generateUploadUrl).toHaveBeenCalledTimes(5)
    expect(updates.length).toBeGreaterThan(0)
    expect(storageIdsFromUploads(result)).toHaveLength(5)
    expect(preparedClipsFromUploads(result)).toHaveLength(5)

    vi.unstubAllGlobals()
  })

  it("uploadClipsInParallel keeps ready clips and retries only pending", async () => {
    const generateUploadUrl = vi.fn(async () => "https://upload.test")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ storageId: "new_id" }),
      })),
    )

    const uploads: ClipUpload[] = [
      {
        name: "ready.ogg",
        bytes: new Uint8Array([1]),
        status: "ready",
        storageId: "existing",
      },
      {
        name: "retry.ogg",
        bytes: new Uint8Array([2]),
        status: "pending",
      },
    ]
    const result = await uploadClipsInParallel(generateUploadUrl, uploads, {
      concurrency: 2,
    })
    expect(result[0]?.storageId).toBe("existing")
    expect(result[1]?.status).toBe("ready")
    expect(generateUploadUrl).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it("marks failed uploads without aborting siblings", async () => {
    const generateUploadUrl = vi.fn(async () => "https://upload.test")
    let calls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1
        if (calls === 1) {
          return { ok: false, json: async () => ({}) }
        }
        return {
          ok: true,
          json: async () => ({ storageId: "ok_id" }),
        }
      }),
    )

    const result = await uploadClipsInParallel(
      generateUploadUrl,
      clipsToUploads(sampleParsed(2)),
      { concurrency: 1 },
    )
    expect(result.some((clip) => clip.status === "error")).toBe(true)
    expect(result.some((clip) => clip.status === "ready")).toBe(true)
    expect(uploadsReady(result)).toBe(false)
    vi.unstubAllGlobals()
  })

  it("stops scheduling new clips when aborted and keeps completed storage ids", async () => {
    const controller = new AbortController()
    const generateUploadUrl = vi.fn(async () => "https://upload.test")
    const seen: string[] = []
    let firstFetchStarted: (() => void) | undefined
    const firstFetch = new Promise<void>((resolve) => {
      firstFetchStarted = resolve
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
        firstFetchStarted?.()
        await new Promise<void>((resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"))
            return
          }
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        })
        return {
          ok: true,
          json: async () => ({ storageId: "should_not_exist" }),
        }
      }),
    )

    const running = uploadClipsInParallel(
      generateUploadUrl,
      clipsToUploads(sampleParsed(4)),
      {
        concurrency: 1,
        signal: controller.signal,
        onStorageId: (storageId) => seen.push(storageId),
      },
    )
    await firstFetch
    controller.abort()
    const result = await running

    expect(seen).toEqual([])
    expect(result.every((clip) => clip.status === "pending")).toBe(true)
    expect(generateUploadUrl).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
