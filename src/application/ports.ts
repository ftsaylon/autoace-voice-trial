import type { AnalyzeError } from "@/domain/errors";
import type {
  AcousticMeasurements,
  ClipPrediction,
  ClipRow,
  Batch,
  NewBatch,
} from "@/domain";
import type { Result } from "@/domain/result";

export type AudioBytes = {
  name: string;
  bytes: Uint8Array;
  mediaType: string;
};

export type AudioRef = string;

export interface SemanticClassifier {
  classify(input: {
    audio: AudioBytes;
    durationSec: number;
    acoustic?: AcousticMeasurements;
  }): Promise<Result<ClipPrediction, AnalyzeError>>;
}

export interface AcousticAnalyzer {
  measure(audio: AudioBytes): Promise<Result<AcousticMeasurements, AnalyzeError>>;
  extractWindow(
    audio: AudioBytes,
    startSec: number,
    endSec: number,
  ): Promise<Result<AudioBytes, AnalyzeError>>;
}

export interface AudioStore {
  put(batchId: string, name: string, bytes: Uint8Array): Promise<AudioRef>;
  get(ref: AudioRef): Promise<AudioBytes>;
}

export type RequeueScope = "failed" | "all";

export interface BatchRepository {
  create(batch: NewBatch, store: AudioStore): Promise<Batch>;
  get(id: string): Promise<Batch | null>;
  claimNext(batchId: string, now?: number): Promise<ClipRow | null>;
  complete(
    clipId: string,
    result: Result<ClipPrediction, AnalyzeError>,
  ): Promise<void>;
  requeueClips(batchId: string, scope: RequeueScope): Promise<number>;
}
