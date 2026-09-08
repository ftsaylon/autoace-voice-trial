import { createBatch } from "@/application/create-batch";
import { processBatchToCompletion } from "@/application/process-clip";
import { MemoryAudioStore, MemoryBatchRepository } from "@/adapters/storage/memory";
import { FfmpegAcousticAnalyzer } from "@/adapters/acoustic/ffmpeg-analyzer";
import { AcousticBaselineClassifier } from "@/adapters/baseline/acoustic-baseline";
import { GeminiClassifier, classifierIsConfigured } from "@/adapters/gemini/gemini-classifier";
import { autoAceJsonString, EMOTIONAL_TONES, type ClipPrediction } from "@/domain";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type RunRow = {
  name: string;
  gold: ClipPrediction | null;
  gemini: ClipPrediction | null;
  baseline: ClipPrediction | null;
  geminiMs: number | null;
  baselineMs: number | null;
  durationSec: number | null;
  geminiError: string | null;
  baselineError: string | null;
};

function confusion(pairs: { gold: string; pred: string }[]) {
  const labels = [...EMOTIONAL_TONES];
  const matrix: Record<string, Record<string, number>> = {};
  for (const gold of labels) {
    matrix[gold] = {};
    for (const pred of labels) {
      matrix[gold]![pred] = 0;
    }
  }
  for (const pair of pairs) {
    if (!matrix[pair.gold] || matrix[pair.gold][pair.pred] === undefined) {
      continue;
    }
    matrix[pair.gold]![pair.pred]! += 1;
  }
  return matrix;
}

async function runOne(
  files: { name: string; bytes: Uint8Array }[],
  classifier: "gemini" | "baseline",
) {
  const repo = new MemoryBatchRepository();
  const store = new MemoryAudioStore();
  const acoustic = new FfmpegAcousticAnalyzer();
  const started = Date.now();
  const batch = await createBatch({ repo, store, files });
  await processBatchToCompletion({
    repo,
    store,
    acoustic,
    classifier:
      classifier === "gemini" ? new GeminiClassifier() : new AcousticBaselineClassifier(acoustic),
    batchId: batch.id,
  });
  const finished = await repo.get(batch.id);
  return { elapsedMs: Date.now() - started, batch: finished! };
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
  const baselineRun = await runOne(files, "baseline");
  const geminiRun = classifierIsConfigured()
    ? await runOne(files, "gemini")
    : null;

  const rows: RunRow[] = baselineRun.batch.clips.map((clip) => {
    const geminiClip = geminiRun?.batch.clips.find((row) => row.name === clip.name);
    return {
      name: clip.name,
      gold: clip.gold,
      gemini: geminiClip?.prediction ?? null,
      baseline: clip.prediction,
      geminiMs: geminiRun ? geminiRun.elapsedMs : null,
      baselineMs: baselineRun.elapsedMs,
      durationSec: null,
      geminiError: geminiClip?.error ? geminiClip.error.tag : null,
      baselineError: clip.error ? clip.error.tag : null,
    };
  });

  const geminiPairs = rows
    .filter((row) => row.gold && row.gemini)
    .map((row) => ({
      gold: row.gold!.emotional_tone,
      pred: row.gemini!.emotional_tone,
    }));
  const baselinePairs = rows
    .filter((row) => row.gold && row.baseline)
    .map((row) => ({
      gold: row.gold!.emotional_tone,
      pred: row.baseline!.emotional_tone,
    }));

  const report = {
    classifierConfigured: classifierIsConfigured(),
    geminiModel: "gemini-2.5-flash",
    audioTokenEstimatePerMinute: 1920,
    estimatedUsdPerMinute: 0.0003,
    costCeilingUsdPerMinute: 0.003,
    baselineElapsedMs: baselineRun.elapsedMs,
    geminiElapsedMs: geminiRun?.elapsedMs ?? null,
    geminiConfusion: confusion(geminiPairs),
    baselineConfusion: confusion(baselinePairs),
    rows: rows.map((row) => ({
      ...row,
      gold: row.gold ? JSON.parse(autoAceJsonString(row.gold)) : null,
      gemini: row.gemini ? JSON.parse(autoAceJsonString(row.gemini)) : null,
      baseline: row.baseline ? JSON.parse(autoAceJsonString(row.baseline)) : null,
    })),
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
