import { CLAIM_STALE_MS } from "@/domain/constants";
import {
  fromAutoAceJson,
  autoAceJsonString,
  type AnalyzeError,
  type Batch,
  type ClipPrediction,
  type ClipRow,
  type NewBatch,
} from "@/domain";
import type { Result } from "@/domain/result";
import { randomUUID } from "node:crypto";
import type { AudioStore, BatchRepository, RequeueScope } from "@/application/ports";

type ClipRecord = {
  id: string;
  batchId: string;
  name: string;
  audioRef: string;
  state: ClipRow["state"];
  goldJson: string | null;
  predictionJson: string | null;
  errorJson: string | null;
  claimedAt: number | null;
};

type BatchRecord = {
  id: string;
  createdAt: number;
  parseIssuesJson: string;
};

function parseGold(json: string | null): ClipPrediction | null {
  if (!json) {
    return null;
  }
  const parsed = fromAutoAceJson(json);
  return parsed.ok ? parsed.value : null;
}

function parsePrediction(json: string | null): ClipPrediction | null {
  return parseGold(json);
}

function parseError(json: string | null): AnalyzeError | null {
  if (!json) {
    return null;
  }
  return JSON.parse(json) as AnalyzeError;
}

function toClipRow(record: ClipRecord): ClipRow {
  return {
    id: record.id,
    batchId: record.batchId,
    name: record.name,
    audioRef: record.audioRef,
    state: record.state,
    gold: parseGold(record.goldJson),
    prediction: parsePrediction(record.predictionJson),
    error: parseError(record.errorJson),
    claimedAt: record.claimedAt,
  };
}

export class MemoryBatchRepository implements BatchRepository {
  private batches = new Map<string, BatchRecord>();
  private clips = new Map<string, ClipRecord>();

  async create(batch: NewBatch, store: AudioStore): Promise<Batch> {
    const id = randomUUID();
    const createdAt = Date.now();
    this.batches.set(id, {
      id,
      createdAt,
      parseIssuesJson: JSON.stringify(batch.parseIssues),
    });
    const clips: ClipRow[] = [];
    for (const clip of batch.clips) {
      const clipId = randomUUID();
      const audioRef = await store.put(id, clip.name, clip.bytes);
      const record: ClipRecord = {
        id: clipId,
        batchId: id,
        name: clip.name,
        audioRef,
        state: "queued",
        goldJson: clip.gold ? autoAceJsonString(clip.gold) : null,
        predictionJson: null,
        errorJson: null,
        claimedAt: null,
      };
      this.clips.set(clipId, record);
      clips.push(toClipRow(record));
    }
    return {
      id,
      createdAt,
      clips,
      parseIssues: batch.parseIssues,
    };
  }

  async get(id: string): Promise<Batch | null> {
    const batch = this.batches.get(id);
    if (!batch) {
      return null;
    }
    const clips = [...this.clips.values()]
      .filter((clip) => clip.batchId === id)
      .map(toClipRow);
    return {
      id: batch.id,
      createdAt: batch.createdAt,
      clips,
      parseIssues: JSON.parse(batch.parseIssuesJson) as string[],
    };
  }

  async claimNext(batchId: string, now = Date.now()): Promise<ClipRow | null> {
    const staleBefore = now - CLAIM_STALE_MS;
    const candidates = [...this.clips.values()].filter(
      (clip) =>
        clip.batchId === batchId &&
        (clip.state === "queued" ||
          (clip.state === "running" &&
            clip.claimedAt !== null &&
            clip.claimedAt < staleBefore)),
    );
    const next = candidates[0];
    if (!next) {
      return null;
    }
    next.state = "running";
    next.claimedAt = now;
    this.clips.set(next.id, next);
    return toClipRow(next);
  }

  async complete(
    clipId: string,
    result: Result<ClipPrediction, AnalyzeError>,
  ): Promise<void> {
    const clip = this.clips.get(clipId);
    if (!clip) {
      return;
    }
    if (clip.state === "succeeded" || clip.state === "failed") {
      return;
    }
    if (result.ok) {
      clip.state = "succeeded";
      clip.predictionJson = autoAceJsonString(result.value);
      clip.errorJson = null;
    } else {
      clip.state = "failed";
      clip.errorJson = JSON.stringify(result.error);
    }
    this.clips.set(clipId, clip);
  }

  async requeueClips(batchId: string, scope: RequeueScope): Promise<number> {
    const states =
      scope === "failed"
        ? new Set<ClipRow["state"]>(["failed"])
        : new Set<ClipRow["state"]>(["failed", "succeeded", "running"]);
    let requeued = 0;
    for (const clip of this.clips.values()) {
      if (clip.batchId !== batchId || !states.has(clip.state)) {
        continue;
      }
      clip.state = "queued";
      clip.predictionJson = null;
      clip.errorJson = null;
      clip.claimedAt = null;
      this.clips.set(clip.id, clip);
      requeued += 1;
    }
    return requeued;
  }
}

export class MemoryAudioStore implements AudioStore {
  private blobs = new Map<string, { name: string; bytes: Uint8Array }>();

  async put(batchId: string, name: string, bytes: Uint8Array) {
    const ref = `${batchId}/${name}`;
    this.blobs.set(ref, { name, bytes });
    return ref;
  }

  async get(ref: string) {
    const blob = this.blobs.get(ref);
    if (!blob) {
      throw new Error(`Missing audio ${ref}`);
    }
    return { name: blob.name, bytes: blob.bytes, mediaType: mediaTypeFor(blob.name) };
  }
}

export function mediaTypeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    case ".flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}
