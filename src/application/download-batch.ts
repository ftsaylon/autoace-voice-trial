import { autoAceJsonString, formatAnalyzeError } from "@/domain";
import type { Batch } from "@/domain";

export function batchToCsv(batch: Batch): string {
  const header = "name,result_json,error";
  const lines = batch.clips.map((clip) => {
    const json = clip.prediction ? autoAceJsonString(clip.prediction) : "";
    const error = clip.error ? formatAnalyzeError(clip.error) : "";
    const escapedJson = `"${json.replaceAll('"', '""')}"`;
    const escapedError = `"${error.replaceAll('"', '""')}"`;
    return `${clip.name},${escapedJson},${escapedError}`;
  });
  return [header, ...lines].join("\n");
}

export function batchToJson(batch: Batch): string {
  return JSON.stringify(
    batch.clips.map((clip) => ({
      name: clip.name,
      result: clip.prediction
        ? JSON.parse(autoAceJsonString(clip.prediction))
        : null,
      error: clip.error ? formatAnalyzeError(clip.error) : null,
    })),
    null,
    2,
  );
}
