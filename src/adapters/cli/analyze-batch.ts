import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { createDeps } from "@/adapters/composition";
import { DEFAULT_METHOD, parseMethodId } from "@/application/methods";
import { createBatch, createBatchFromZip } from "@/application/create-batch";
import { processBatchToCompletion } from "@/application/process-clip";
import { batchToJson } from "@/application/download-batch";

function parseArgs(argv: string[]) {
  let target: string | undefined
  let method = DEFAULT_METHOD
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === "--method") {
      const value = argv[i + 1]
      const parsed = parseMethodId(value)
      if (!parsed) {
        console.error(`Unknown method: ${value ?? "(missing)"}`)
        process.exit(1)
      }
      method = parsed
      i += 1
      continue
    }
    if (!arg.startsWith("-") && !target) {
      target = arg
    }
  }
  return { target, method }
}

async function main() {
  const { target, method } = parseArgs(process.argv.slice(2));
  if (!target) {
    console.error("Usage: npm run analyze -- /path/to/evaluation_batch_or.zip [--method fusion]");
    process.exit(1);
  }
  const deps = await createDeps(method);
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
    fuseQualityAndSilence: deps.fuseQualityAndSilence,
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
