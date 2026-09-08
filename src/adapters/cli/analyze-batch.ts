import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { getDeps } from "@/adapters/composition";
import { createBatch, createBatchFromZip } from "@/application/create-batch";
import { processBatchToCompletion } from "@/application/process-clip";
import { batchToJson } from "@/application/download-batch";

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npm run analyze -- /path/to/evaluation_batch_or.zip");
    process.exit(1);
  }
  const deps = await getDeps();
  const resolved = path.resolve(target);
  const info = await stat(resolved);
  const batch = info.isFile()
    ? await createBatchFromZip({
        repo: deps.repo,
        store: deps.store,
        zipBytes: new Uint8Array(await readFile(resolved)),
      })
    : await createBatch({
        repo: deps.repo,
        store: deps.store,
        files: await Promise.all(
          (await readdir(resolved)).map(async (name) => ({
            name,
            bytes: new Uint8Array(await readFile(path.join(resolved, name))),
          })),
        ),
      });
  if (batch.parseIssues.length > 0) {
    console.error("Parse issues:");
    for (const issue of batch.parseIssues) {
      console.error(`- ${issue}`);
    }
  }
  await processBatchToCompletion({
    repo: deps.repo,
    store: deps.store,
    acoustic: deps.acoustic,
    classifier: deps.classifier,
    batchId: batch.id,
  });
  const finished = await deps.repo.get(batch.id);
  if (!finished) {
    throw new Error("Batch disappeared after processing");
  }
  const outPath = path.join(process.cwd(), `batch-${batch.id}.json`);
  await writeFile(outPath, batchToJson(finished));
  console.log(batchToJson(finished));
  console.log(`Wrote ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
