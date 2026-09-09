import { FfmpegAcousticAnalyzer } from "@/adapters/acoustic/ffmpeg-analyzer";
import { classifierIsConfigured } from "@/adapters/gemini/gemini-classifier"
import { classifierForMethod } from "@/application/select-classifier"
import {
  DEFAULT_METHOD,
  methodDefinition,
  type MethodId,
} from "@/application/methods"
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
  method: MethodId;
  fuseQualityAndSilence: boolean;
};

export async function createDeps(method: MethodId = DEFAULT_METHOD): Promise<AppDeps> {
  const repo = await SqliteBatchRepository.open(
    process.env.DATABASE_URL ?? "file:data/app.db",
  );
  const store = new FilesystemAudioStore(
    process.env.AUDIO_ROOT ?? path.resolve("data/audio"),
  );
  const acoustic = new FfmpegAcousticAnalyzer()
  const definition = methodDefinition(method)
  return {
    repo,
    store,
    acoustic,
    classifier: classifierForMethod(method, acoustic),
    method,
    fuseQualityAndSilence: definition.fuseQualityAndSilence,
  };
}

export function getDeps(method: MethodId = DEFAULT_METHOD): Promise<AppDeps> {
  return createDeps(method);
}

export { classifierIsConfigured };
