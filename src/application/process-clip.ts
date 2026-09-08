import { windowBounds, fuse, aggregateWindows, type ClipRow, type ClipPrediction } from "@/domain";
import type { AnalyzeError } from "@/domain/errors";
import type { Result } from "@/domain/result";
import { ok } from "@/domain/result";
import type {
  AcousticAnalyzer,
  AudioStore,
  BatchRepository,
  SemanticClassifier,
} from "./ports";

export async function processClip(
  deps: {
    repo: BatchRepository;
    store: AudioStore;
    acoustic: AcousticAnalyzer;
    classifier: SemanticClassifier;
  },
  clip: ClipRow,
): Promise<Result<ClipPrediction, AnalyzeError>> {
  const audio = await deps.store.get(clip.audioRef);
  const measured = await deps.acoustic.measure(audio);
  if (!measured.ok) {
    await deps.repo.complete(clip.id, measured);
    return measured;
  }

  const bounds = windowBounds(measured.value.durationSec);
  const windows = [];
  for (const bound of bounds) {
    const sliced = await deps.acoustic.extractWindow(
      audio,
      bound.startSec,
      bound.endSec,
    );
    if (!sliced.ok) {
      await deps.repo.complete(clip.id, sliced);
      return sliced;
    }
    const classified = await deps.classifier.classify({
      audio: sliced.value,
      durationSec: bound.endSec - bound.startSec,
    });
    if (!classified.ok) {
      await deps.repo.complete(clip.id, classified);
      return classified;
    }
    windows.push({
      ...classified.value,
      startSec: bound.startSec,
      endSec: bound.endSec,
    });
  }

  const semantic = aggregateWindows(windows);
  const fused = fuse(semantic, measured.value);
  const result = ok(fused);
  await deps.repo.complete(clip.id, result);
  return result;
}

export async function processNextClip(deps: {
  repo: BatchRepository;
  store: AudioStore;
  acoustic: AcousticAnalyzer;
  classifier: SemanticClassifier;
  batchId: string;
}): Promise<"idle" | Result<ClipPrediction, AnalyzeError>> {
  const clip = await deps.repo.claimNext(deps.batchId);
  if (!clip) {
    return "idle";
  }
  return processClip(deps, clip);
}

export async function processBatchToCompletion(deps: {
  repo: BatchRepository;
  store: AudioStore;
  acoustic: AcousticAnalyzer;
  classifier: SemanticClassifier;
  batchId: string;
}): Promise<void> {
  for (;;) {
    const next = await processNextClip(deps);
    if (next === "idle") {
      return;
    }
  }
}
