import { FfmpegAcousticAnalyzer } from "@/adapters/acoustic/ffmpeg-analyzer";
import { classifierIsConfigured } from "@/adapters/gemini/gemini-classifier"
import { classifierForMethod } from "@/application/select-classifier"
import { FilesystemAudioStore } from "@/adapters/storage/fs-audio-store";
import { SqliteBatchRepository } from "@/adapters/storage/sqlite-repository";
import type {
  AcousticAnalyzer,
  AudioStore,
  BatchRepository,
  SemanticClassifier,
} from "@/application/ports";
import path from "node:path";

export type AppDeps = {
  repo: BatchRepository;
  store: AudioStore;
  acoustic: AcousticAnalyzer;
  classifier: SemanticClassifier;
};

let cached: Promise<AppDeps> | null = null;

export function getDeps(): Promise<AppDeps> {
  if (!cached) {
    cached = (async () => {
      const repo = await SqliteBatchRepository.open(
        process.env.DATABASE_URL ?? "file:data/app.db",
      );
      const store = new FilesystemAudioStore(
        process.env.AUDIO_ROOT ?? path.resolve("data/audio"),
      );
      const acoustic = new FfmpegAcousticAnalyzer()
      return {
        repo,
        store,
        acoustic,
        classifier: classifierForMethod("fusion", acoustic),
      };
    })();
  }
  return cached;
}

export { classifierIsConfigured };
