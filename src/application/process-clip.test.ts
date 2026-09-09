import { describe, expect, it } from "vitest";
import { MemoryAudioStore, MemoryBatchRepository } from "@/adapters/storage/memory";
import { createBatch } from "./create-batch";
import { processBatchToCompletion, processNextClip } from "./process-clip";
import { requeueBatch } from "./requeue-batch";
import type { AcousticAnalyzer, SemanticClassifier } from "./ports";
import { ok } from "@/domain/result";
import { noNoise, presentNoise, type ClipPrediction } from "@/domain";

function wavBytes(): Uint8Array {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(0, 40);
  return new Uint8Array(header);
}

const fakeSemantic: ClipPrediction = {
  emotional_tone: "upset",
  emotional_intensity: "high",
  background_noise: noNoise,
  audio_quality: "clear",
  speaker_overlap_present: false,
  long_silence_present: false,
  confidence: 0.7,
};

const fakeClassifier: SemanticClassifier = {
  async classify() {
    return ok(fakeSemantic);
  },
};

const fakeAcoustic: AcousticAnalyzer = {
  async measure() {
    return ok({
      durationSec: 12,
      longestSilenceSec: 1,
      snrDb: 24,
      clipFraction: 0,
      rms: 0.1,
      spectralFlatness: 0.2,
    });
  },
  async extractWindow(audio) {
    return ok(audio);
  },
};

describe("ProcessClip", () => {
  it("persists the fused prediction from the fake classifier", async () => {
    const repo = new MemoryBatchRepository();
    const store = new MemoryAudioStore();
    const batch = await createBatch({
      repo,
      store,
      files: [
        {
          name: "labels.csv",
          bytes: new TextEncoder().encode("name,result_json\ncall_ok.wav,\n"),
        },
        { name: "call_ok.wav", bytes: wavBytes() },
      ],
    });
    await processBatchToCompletion({
      repo,
      store,
      acoustic: fakeAcoustic,
      classifier: fakeClassifier,
      batchId: batch.id,
    });
    const stored = await repo.get(batch.id);
    expect(stored?.clips[0]?.state).toBe("succeeded");
    expect(stored?.clips[0]?.prediction).toEqual({
      ...fakeSemantic,
      long_silence_present: false,
      audio_quality: "clear",
      confidence: 1,
    });
  });

  it("completing a succeeded clip twice does not replace the prediction", async () => {
    const repo = new MemoryBatchRepository();
    const store = new MemoryAudioStore();
    const batch = await createBatch({
      repo,
      store,
      files: [
        {
          name: "labels.csv",
          bytes: new TextEncoder().encode("name,result_json\ncall_ok.wav,\n"),
        },
        { name: "call_ok.wav", bytes: wavBytes() },
      ],
    });
    const deps = {
      repo,
      store,
      acoustic: fakeAcoustic,
      classifier: fakeClassifier,
      batchId: batch.id,
    };
    await processNextClip(deps);
    const first = await repo.get(batch.id);
    await repo.complete(first!.clips[0]!.id, {
      ok: true,
      value: {
        ...fakeSemantic,
        background_noise: presentNoise("should not stick", "high"),
      },
    });
    const second = await repo.get(batch.id);
    expect(second?.clips[0]?.prediction?.background_noise).toEqual(noNoise);
  });

  it("requeues failed clips so they can run again", async () => {
    const repo = new MemoryBatchRepository();
    const store = new MemoryAudioStore();
    const batch = await createBatch({
      repo,
      store,
      files: [
        {
          name: "labels.csv",
          bytes: new TextEncoder().encode("name,result_json\ncall_ok.wav,\n"),
        },
        { name: "call_ok.wav", bytes: wavBytes() },
      ],
    });
    const clip = (await repo.get(batch.id))!.clips[0]!;
    await repo.complete(clip.id, {
      ok: false,
      error: { tag: "classifier_unavailable" },
    });
    const failed = await repo.get(batch.id);
    expect(failed?.clips[0]?.state).toBe("failed");

    const result = await requeueBatch(repo, batch.id, "failed");
    expect(result?.requeued).toBe(1);

    const requeued = await repo.get(batch.id);
    expect(requeued?.clips[0]?.state).toBe("queued");
    expect(requeued?.clips[0]?.prediction).toBeNull();
    expect(requeued?.clips[0]?.error).toBeNull();
  });
});
