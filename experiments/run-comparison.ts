import { createBatch } from "@/application/create-batch";
import { processBatchToCompletion } from "@/application/process-clip";
import { MemoryAudioStore, MemoryBatchRepository } from "@/adapters/storage/memory";
import { FfmpegAcousticAnalyzer } from "@/adapters/acoustic/ffmpeg-analyzer";
import { classifierForMethod } from "@/application/select-classifier";
import {
  METHOD_IDS,
  METHODS,
  methodDefinition,
  type MethodId,
} from "@/application/methods";
import { scoresForPairs, type LabeledPair } from "@/application/scores";
import { classifierIsConfigured, resolveGeminiModel } from "@/adapters/gemini/gemini-classifier";
import { autoAceJsonString, type ClipPrediction } from "@/domain";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type MethodRow = {
  name: string;
  gold: ClipPrediction | null;
  prediction: ClipPrediction | null;
  error: string | null;
};

async function runMethod(
  files: { name: string; bytes: Uint8Array }[],
  method: MethodId,
) {
  const definition = methodDefinition(method);
  if (definition.needsGemini && !classifierIsConfigured()) {
    return null;
  }
  const repo = new MemoryBatchRepository();
  const store = new MemoryAudioStore();
  const acoustic = new FfmpegAcousticAnalyzer();
  const started = Date.now();
  const batch = await createBatch({ repo, store, files });
  await processBatchToCompletion({
    repo,
    store,
    acoustic,
    classifier: classifierForMethod(method, acoustic),
    fuseQualityAndSilence: definition.fuseQualityAndSilence,
    batchId: batch.id,
  });
  const finished = await repo.get(batch.id);
  return { elapsedMs: Date.now() - started, batch: finished! };
}

function pairsFromRows(rows: MethodRow[]): LabeledPair[] {
  const pairs: LabeledPair[] = [];
  for (const row of rows) {
    if (row.gold && row.prediction) {
      pairs.push({ gold: row.gold, prediction: row.prediction });
    }
  }
  return pairs;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: npx tsx experiments/run-comparison.ts /path/to/folder");
    process.exit(1);
  }
  const entries = await readdir(dir);
  const files = await Promise.all(
    entries.map(async (name) => ({
      name,
      bytes: new Uint8Array(await readFile(path.join(dir, name))),
    })),
  );

  const methods: Record<string, unknown> = {};
  for (const id of METHOD_IDS) {
    const run = await runMethod(files, id);
    if (!run) {
      methods[id] = {
        skipped: true,
        reason: "classifier_unavailable",
        definition: METHODS[id],
      };
      continue;
    }
    const rows: MethodRow[] = run.batch.clips.map((clip) => ({
      name: clip.name,
      gold: clip.gold,
      prediction: clip.prediction,
      error: clip.error ? clip.error.tag : null,
    }));
    methods[id] = {
      skipped: false,
      definition: METHODS[id],
      elapsedMs: run.elapsedMs,
      scores: scoresForPairs(pairsFromRows(rows)),
      rows: rows.map((row) => ({
        name: row.name,
        error: row.error,
        gold: row.gold ? JSON.parse(autoAceJsonString(row.gold)) : null,
        prediction: row.prediction ? JSON.parse(autoAceJsonString(row.prediction)) : null,
      })),
    };
  }

  const report = {
    classifierConfigured: classifierIsConfigured(),
    geminiModel: resolveGeminiModel(),
    audioTokenEstimatePerMinute: 1920,
    estimatedUsdPerMinute: METHODS.fusion.costUsdPerMinute,
    costCeilingUsdPerMinute: 0.003,
    methods,
  };
  const out = path.join(process.cwd(), "experiments/last-run.json");
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${out}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
