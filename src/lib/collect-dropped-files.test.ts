import { describe, expect, it } from "vitest";
import { buildUploadFormData } from "@/lib/collect-dropped-files";

describe("buildUploadFormData", () => {
  it("accepts a single zip file", () => {
    const zip = new File(["x"], "batch.zip", { type: "application/zip" });
    const result = buildUploadFormData([zip]);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.get("zip")).toBe(zip);
    }
  });

  it("accepts multiple audio files", () => {
    const files = [
      new File(["a"], "call_001.ogg", { type: "audio/ogg" }),
      new File(["b"], "call_002.ogg", { type: "audio/ogg" }),
    ];
    const result = buildUploadFormData(files);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.getAll("files")).toHaveLength(2);
    }
  });

  it("keeps labels.csv with folder audio files", () => {
    const files = [
      new File(["a"], "call_001.ogg", { type: "audio/ogg" }),
      new File(["name,result_json\ncall_001.ogg,\n"], "labels.csv", { type: "text/csv" }),
    ]
    const result = buildUploadFormData(files)
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.getAll("files")).toHaveLength(2)
    }
  })

  it("rejects empty drops", () => {
    expect(buildUploadFormData([])).toEqual({ error: "No files were dropped." })
  })
});
