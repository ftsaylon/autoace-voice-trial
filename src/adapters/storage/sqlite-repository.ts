import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CLAIM_STALE_MS } from "@/domain/constants";
import {
  autoAceJsonString,
  fromAutoAceJson,
  type AnalyzeError,
  type Batch,
  type ClipPrediction,
  type ClipRow,
  type NewBatch,
} from "@/domain";
import type { Result } from "@/domain/result";
import type { AudioStore, BatchRepository } from "@/application/ports";

function parsePrediction(json: string | null): ClipPrediction | null {
  if (!json) {
    return null;
  }
  const parsed = fromAutoAceJson(json);
  return parsed.ok ? parsed.value : null;
}

export class SqliteBatchRepository implements BatchRepository {
  constructor(private readonly client: Client) {}

  static async open(url = process.env.DATABASE_URL ?? "file:data/app.db") {
    if (url.startsWith("file:")) {
      const filePath = url.slice("file:".length);
      mkdirSync(path.dirname(filePath), { recursive: true });
    }
    const client = createClient({ url });
    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        parse_issues_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS clips (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        name TEXT NOT NULL,
        audio_ref TEXT NOT NULL,
        state TEXT NOT NULL,
        gold_json TEXT,
        prediction_json TEXT,
        error_json TEXT,
        claimed_at INTEGER,
        FOREIGN KEY (batch_id) REFERENCES batches(id)
      );
      CREATE INDEX IF NOT EXISTS clips_batch_state ON clips(batch_id, state);
    `);
    return new SqliteBatchRepository(client);
  }

  async create(batch: NewBatch, store: AudioStore): Promise<Batch> {
    const id = randomUUID();
    const createdAt = Date.now();
    await this.client.execute({
      sql: "INSERT INTO batches (id, created_at, parse_issues_json) VALUES (?, ?, ?)",
      args: [id, createdAt, JSON.stringify(batch.parseIssues)],
    });
    const clips: ClipRow[] = [];
    for (const clip of batch.clips) {
      const clipId = randomUUID();
      const audioRef = await store.put(id, clip.name, clip.bytes);
      await this.client.execute({
        sql: `INSERT INTO clips (id, batch_id, name, audio_ref, state, gold_json, prediction_json, error_json, claimed_at)
              VALUES (?, ?, ?, ?, 'queued', ?, NULL, NULL, NULL)`,
        args: [
          clipId,
          id,
          clip.name,
          audioRef,
          clip.gold ? autoAceJsonString(clip.gold) : null,
        ],
      });
      clips.push({
        id: clipId,
        batchId: id,
        name: clip.name,
        audioRef,
        state: "queued",
        gold: clip.gold,
        prediction: null,
        error: null,
        claimedAt: null,
      });
    }
    return { id, createdAt, clips, parseIssues: batch.parseIssues };
  }

  async get(id: string): Promise<Batch | null> {
    const batchResult = await this.client.execute({
      sql: "SELECT id, created_at, parse_issues_json FROM batches WHERE id = ?",
      args: [id],
    });
    const batchRow = batchResult.rows[0];
    if (!batchRow) {
      return null;
    }
    const clipResult = await this.client.execute({
      sql: `SELECT id, batch_id, name, audio_ref, state, gold_json, prediction_json, error_json, claimed_at
            FROM clips WHERE batch_id = ? ORDER BY name`,
      args: [id],
    });
    const clips: ClipRow[] = clipResult.rows.map((row) => ({
      id: String(row.id),
      batchId: String(row.batch_id),
      name: String(row.name),
      audioRef: String(row.audio_ref),
      state: String(row.state) as ClipRow["state"],
      gold: parsePrediction(row.gold_json === null ? null : String(row.gold_json)),
      prediction: parsePrediction(
        row.prediction_json === null ? null : String(row.prediction_json),
      ),
      error:
        row.error_json === null
          ? null
          : (JSON.parse(String(row.error_json)) as AnalyzeError),
      claimedAt: row.claimed_at === null ? null : Number(row.claimed_at),
    }));
    return {
      id: String(batchRow.id),
      createdAt: Number(batchRow.created_at),
      clips,
      parseIssues: JSON.parse(String(batchRow.parse_issues_json)) as string[],
    };
  }

  async claimNext(batchId: string, now = Date.now()): Promise<ClipRow | null> {
    const staleBefore = now - CLAIM_STALE_MS;
    const found = await this.client.execute({
      sql: `SELECT id FROM clips
            WHERE batch_id = ?
              AND (state = 'queued' OR (state = 'running' AND claimed_at IS NOT NULL AND claimed_at < ?))
            ORDER BY name
            LIMIT 1`,
      args: [batchId, staleBefore],
    });
    const id = found.rows[0]?.id;
    if (typeof id !== "string") {
      return null;
    }
    const updated = await this.client.execute({
      sql: `UPDATE clips SET state = 'running', claimed_at = ?
            WHERE id = ? AND (state = 'queued' OR state = 'running')`,
      args: [now, id],
    });
    if (updated.rowsAffected === 0) {
      return this.claimNext(batchId, now);
    }
    const batch = await this.get(batchId);
    return batch?.clips.find((clip) => clip.id === id) ?? null;
  }

  async complete(
    clipId: string,
    result: Result<ClipPrediction, AnalyzeError>,
  ): Promise<void> {
    const existing = await this.client.execute({
      sql: "SELECT state FROM clips WHERE id = ?",
      args: [clipId],
    });
    const state = existing.rows[0]?.state;
    if (state === "succeeded" || state === "failed") {
      return;
    }
    if (result.ok) {
      await this.client.execute({
        sql: `UPDATE clips SET state = 'succeeded', prediction_json = ?, error_json = NULL WHERE id = ?`,
        args: [autoAceJsonString(result.value), clipId],
      });
      return;
    }
    await this.client.execute({
      sql: `UPDATE clips SET state = 'failed', error_json = ? WHERE id = ?`,
      args: [JSON.stringify(result.error), clipId],
    });
  }
}
