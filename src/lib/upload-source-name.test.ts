import { describe, expect, it } from "vitest"
import { deriveUploadSourceName, sanitizeDatasetName } from "@/lib/upload-source-name"

describe("sanitizeDatasetName", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeDatasetName("  acme  calls  ")).toBe("acme calls")
  })

  it("strips path separators", () => {
    expect(sanitizeDatasetName("foo/bar")).toBe("foo bar")
  })
})

describe("deriveUploadSourceName", () => {
  it("uses zip basename without extension", () => {
    const files = [new File(["x"], "my-dataset.zip", { type: "application/zip" })]
    expect(deriveUploadSourceName(files)).toBe("my-dataset")
  })

  it("uses dropped root folder name", () => {
    const files = [new File(["a"], "labels.csv", { type: "text/csv" })]
    expect(deriveUploadSourceName(files, "acme-calls")).toBe("acme-calls")
  })

  it("uses webkitRelativePath root segment", () => {
    const file = new File(["a"], "labels.csv", { type: "text/csv" })
    Object.defineProperty(file, "webkitRelativePath", {
      value: "acme-calls/labels.csv",
    })
    expect(deriveUploadSourceName([file])).toBe("acme-calls")
  })

  it("returns null for loose files", () => {
    const files = [
      new File(["a"], "call_001.ogg", { type: "audio/ogg" }),
      new File(["b"], "labels.csv", { type: "text/csv" }),
    ]
    expect(deriveUploadSourceName(files)).toBeNull()
  })
})
