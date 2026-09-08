import type { AnalyzeError } from "./errors";
import type { ClipPrediction } from "./prediction";
import type { Result } from "./result";

export type ClipState = "queued" | "running" | "succeeded" | "failed";

export type ClipRow = {
  id: string;
  batchId: string;
  name: string;
  audioRef: string;
  state: ClipState;
  gold: ClipPrediction | null;
  prediction: ClipPrediction | null;
  error: AnalyzeError | null;
  claimedAt: number | null;
};

export type BatchStatus = "validating" | "processing" | "complete";

export type Batch = {
  id: string;
  createdAt: number;
  clips: ClipRow[];
  parseIssues: string[];
};

export type NewClip = {
  name: string;
  bytes: Uint8Array;
  gold: ClipPrediction | null;
};

export type NewBatch = {
  clips: NewClip[];
  parseIssues: string[];
};

export function derivedBatchStatus(clips: ClipRow[]): BatchStatus {
  if (clips.length === 0) {
    return "complete";
  }
  if (clips.some((clip) => clip.state === "queued" || clip.state === "running")) {
    return "processing";
  }
  return "complete";
}

export type CompletedClip = {
  name: string;
  result: Result<ClipPrediction, AnalyzeError>;
};
