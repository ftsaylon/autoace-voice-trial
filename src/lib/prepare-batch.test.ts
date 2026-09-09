import { describe, expect, it, vi } from "vitest"
import {
  clipsToUploads,
  formatFileSize,
  parseDroppedFiles,
  preparedClipsFromUploads,
  readFileBuffer,
  snapshotSelectedFiles,
  mergeSelectedBatchFiles,
  toSelectedBatchFiles,
  storageIdsFromUploads,
  uploadClipsInParallel,
  uploadsBusy,
  uploadsReady,
  type ClipUpload,
} from "@/lib/prepare-batch"
import type { ParsedBatchInput } from "@/application/parse-batch"
import { MAX_BATCH_BYTES } from "@/domain"

const sampleParsed = (count: number): ParsedBatchInput => ({
  parseIssues: [],
  clips: Array.from({ length: count }, (_, index) => ({
    name: `call_${index + 1}.ogg`,
    bytes: new Uint8Array([1, 2, 3, index]),
    gold: null,
  })),
})

describe("toSelectedBatchFiles", () => {
  it("lists selected files without reading bytes and skips junk names", () => {
    const csv = new File(["name,result_json\n"], "labels.csv")
    const audio = new File([new Uint8Array([1, 2, 3])], "call_ok.wav")
    const junk = new File(["x"], ".DS_Store")
    const listed = toSelectedBatchFiles([csv, audio, junk])
    expect(listed.map((item) => item.name)).toEqual(["labels.csv", "call_ok.wav"])
    expect(listed[0]?.file).toBe(csv)
    expect(listed[1]?.size).toBe(3)
  })

  it("keeps duplicate names distinguishable", () => {
    const listed = toSelectedBatchFiles([
      new File(["a"], "call.wav"),
      new File(["b"], "call.wav"),
    ])
    expect(listed.map((item) => item.id)).toEqual(["call.wav", "call.wav#2"])
  })
})

describe("mergeSelectedBatchFiles", () => {
  it("keeps earlier files when more are added and replaces the same name", () => {
    const current = toSelectedBatchFiles([
      new File(["csv"], "labels.csv"),
      new File(["old"], "a.ogg"),
    ])
    const merged = mergeSelectedBatchFiles(current, [
      new File(["new-a"], "a.ogg"),
      new File(["b"], "b.wav"),
    ])
    expect(merged.map((item) => item.name)).toEqual([
      "labels.csv",
      "a.ogg",
      "b.wav",
    ])
    expect(merged.find((item) => item.name === "a.ogg")?.size).toBe(5)
  })
})

describe("formatFileSize", () => {
  it("formats bytes for the selected-file list", () => {
    expect(formatFileSize(400)).toBe("400 B")
    expect(formatFileSize(2048)).toBe("2 KB")
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB")
  })
})

describe("readFileBuffer", () => {
  it("reads file bytes in the node test environment", async () => {
    const file = new File([new Uint8Array([4, 5, 6])], "clip.wav")
    const buffer = await readFileBuffer(file)
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([4, 5, 6]))
  })
})

describe("snapshotSelectedFiles", () => {
  it("copies bytes so later input resets cannot revoke the payload", async () => {
    const original = new File([new Uint8Array([9, 8, 7])], "labels.csv", {
      type: "text/csv",
    })
    const [copy] = await snapshotSelectedFiles([original])
    expect(copy).not.toBe(original)
    expect(copy?.name).toBe("labels.csv")
    expect(new Uint8Array(await copy!.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]))
  })
})

describe("parseDroppedFiles", () => {
  it("rejects oversized batches from file.size before reading bytes", async () => {
    const huge = new File([new Uint8Array([1, 2, 3, 4])], "batch.zip")
    Object.defineProperty(huge, "size", { value: MAX_BATCH_BYTES + 1 })
    const parsed = await parseDroppedFiles([huge])
    expect(parsed.clips).toEqual([])
    expect(parsed.parseIssues).toEqual(["Batch exceeds the 200 MB size cap"])
  })

  it("stops reading when the parse is aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      parseDroppedFiles(
        [new File([new Uint8Array([1, 2, 3, 4])], "labels.csv")],
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
  })
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
