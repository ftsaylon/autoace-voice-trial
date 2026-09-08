import type { BatchRepository, AudioStore } from "./ports";
import type { IncomingFile } from "./parse-batch";
import { filesFromZip, parseManifestAndFiles } from "./parse-batch";
import type { Batch } from "@/domain";

export async function createBatch(deps: {
  repo: BatchRepository;
  store: AudioStore;
  files: IncomingFile[];
}): Promise<Batch> {
  const parsed = parseManifestAndFiles(deps.files);
  return deps.repo.create(
    { clips: parsed.clips, parseIssues: parsed.parseIssues },
    deps.store,
  );
}

export async function createBatchFromZip(deps: {
  repo: BatchRepository;
  store: AudioStore;
  zipBytes: Uint8Array;
}): Promise<Batch> {
  const files = await filesFromZip(deps.zipBytes);
  return createBatch({ ...deps, files });
}
