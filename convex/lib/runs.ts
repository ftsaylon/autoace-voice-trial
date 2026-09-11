import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { unfinishedResults } from "../../src/application/run-policy"
import {
  MAX_METHODS_PER_START,
  modelForMethod,
  type MethodId,
} from "../../src/application/methods"
import {
  MAX_CLIP_COUNT,
  MAX_PARSE_ISSUE_LENGTH,
  MAX_PARSE_ISSUES,
  MAX_RUNS_PER_BATCH,
} from "../../src/domain/constants"

type RunStatus = "queued" | "running" | "complete" | "failed"

type DbCtx = MutationCtx | QueryCtx

type TakeQuery<T> = {
  take: (n: number) => Promise<T[]>
}

export const uniqueMethodIds = (methods: MethodId[]): MethodId[] => {
  const seen = new Set<MethodId>()
  const unique: MethodId[] = []
  for (const method of methods) {
    if (seen.has(method)) {
      continue
    }
    seen.add(method)
    unique.push(method)
  }
  return unique
}

export const requireMethodIds = (methods: MethodId[]): MethodId[] => {
  const unique = uniqueMethodIds(methods)
  if (unique.length === 0) {
    throw new Error("Pick at least one method")
  }
  if (unique.length > MAX_METHODS_PER_START) {
    throw new Error(`Pick at most ${MAX_METHODS_PER_START} methods`)
  }
  return unique
}

export const boundParseIssues = (issues: string[]): string[] => {
  return issues
    .slice(0, MAX_PARSE_ISSUES)
    .map((issue) => issue.slice(0, MAX_PARSE_ISSUE_LENGTH))
}

export const runHasFullResultSet = (
  results: Array<{ state: string }>,
  clipCount: number,
): boolean => {
  return (
    results.length === clipCount && unfinishedResults(results).length === 0
  )
}

export const takeAllBounded = async <T>(
  query: TakeQuery<T>,
  limit: number,
  label: string,
): Promise<T[]> => {
  const rows = await query.take(limit + 1)
  if (rows.length > limit) {
    throw new Error(`${label} exceeded the cap of ${limit}`)
  }
  return rows
}

export const listRuns = async (
  ctx: DbCtx,
  batchId: Id<"batches">,
): Promise<Doc<"runs">[]> => {
  return await takeAllBounded(
    ctx.db
      .query("runs")
      .withIndex("by_batch_and_created", (q) => q.eq("batchId", batchId)),
    MAX_RUNS_PER_BATCH,
    "Runs on this batch",
  )
}

export const listRunResults = async (
  ctx: DbCtx,
  runId: Id<"runs">,
): Promise<Doc<"clipResults">[]> => {
  return await takeAllBounded(
    ctx.db.query("clipResults").withIndex("by_run", (q) => q.eq("runId", runId)),
    MAX_CLIP_COUNT,
    "Clip results on this run",
  )
}

export const listBatchClips = async (
  ctx: DbCtx,
  batchId: Id<"batches">,
): Promise<Doc<"clips">[]> => {
  return await takeAllBounded(
    ctx.db.query("clips").withIndex("by_batch", (q) => q.eq("batchId", batchId)),
    MAX_CLIP_COUNT,
    "Clips on this batch",
  )
}

export const overlayClip = (
  clip: Doc<"clips">,
  result: Doc<"clipResults"> | undefined,
): Doc<"clips"> => {
  if (!result) {
    return clip
  }
  return {
    ...clip,
    state: result.state,
    stage: result.stage,
    predictionJson: result.predictionJson,
    errorJson: result.errorJson,
    claimedAt: result.claimedAt,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
  }
}

export const pickViewingRun = (
  runs: Doc<"runs">[],
  runId?: Id<"runs">,
): Doc<"runs"> | null => {
  if (runs.length === 0) {
    return null
  }
  if (runId) {
    return runs.find((run) => run._id === runId) ?? runs[runs.length - 1] ?? null
  }
  return (
    runs.find((run) => run.status === "running") ??
    runs.find((run) => run.status === "queued") ??
    runs[runs.length - 1] ??
    null
  )
}

const clipStateForBackfill = (
  state: Doc<"clips">["state"],
): Doc<"clipResults">["state"] => {
  return state === "uploading" ? "queued" : state
}

const runStatusForBackfill = (status: Doc<"batches">["status"]): RunStatus => {
  if (status === "queued") {
    return "queued"
  }
  if (status === "running") {
    return "running"
  }
  if (status === "failed") {
    return "failed"
  }
  return "complete"
}

export const storedClips = (clips: Doc<"clips">[]): Doc<"clips">[] => {
  return clips.filter((clip) => clip.storageId && clip.state !== "uploading")
}

export const assertClipsReadyToRun = (clips: Doc<"clips">[]): Doc<"clips">[] => {
  if (clips.some((clip) => !clip.storageId || clip.state === "uploading")) {
    throw new Error("Clips are still uploading")
  }
  const stored = storedClips(clips)
  if (stored.length === 0) {
    throw new Error("No valid clips to process")
  }
  return stored
}

export const syncBatchRunMeta = async (
  ctx: MutationCtx,
  batchId: Id<"batches">,
): Promise<Doc<"batches"> | null> => {
  const batch = await ctx.db.get(batchId)
  if (!batch) {
    return null
  }
  const runs = await listRuns(ctx, batchId)
  const methodIds = uniqueMethodIds(runs.map((run) => run.method))
  const active =
    runs.find((run) => run.status === "running") ??
    runs.find((run) => run.status === "queued") ??
    runs[runs.length - 1]
  await ctx.db.patch(batchId, {
    runCount: runs.length,
    methodIds: methodIds.length > 0 ? methodIds : batch.methodIds ?? [batch.method],
    ...(active
      ? {
          method: active.method,
          model: active.model,
          succeededCount: active.succeededCount,
          failedCount: active.failedCount,
        }
      : {}),
  })
  return await ctx.db.get(batchId)
}

export const ensureRuns = async (
  ctx: MutationCtx,
  batch: Doc<"batches">,
): Promise<Doc<"runs">[]> => {
  const existing = await listRuns(ctx, batch._id)
  if (existing.length > 0) {
    if (batch.runCount === undefined) {
      await syncBatchRunMeta(ctx, batch._id)
    }
    return existing
  }
  if (batch.status === "draft" || batch.status === "uploading") {
    return []
  }
  const clips = await listBatchClips(ctx, batch._id)
  const now = Date.now()
  const runId = await ctx.db.insert("runs", {
    batchId: batch._id,
    method: batch.method,
    model: batch.model,
    status: runStatusForBackfill(batch.status),
    clipCount: batch.clipCount,
    succeededCount: batch.succeededCount,
    failedCount: batch.failedCount,
    createdAt: batch.startedAt ?? batch.createdAt,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
  })
  for (const clip of clips) {
    await ctx.db.insert("clipResults", {
      runId,
      clipId: clip._id,
      batchId: batch._id,
      state: clipStateForBackfill(clip.state),
      stage: clip.stage,
      predictionJson: clip.predictionJson,
      errorJson: clip.errorJson,
      claimedAt: clip.claimedAt,
      startedAt: clip.startedAt,
      finishedAt: clip.finishedAt,
    })
  }
  await ctx.db.patch(batch._id, {
    runCount: 1,
    methodIds: [batch.method],
  })
  await ctx.db.insert("logs", {
    userId: batch.userId,
    batchId: batch._id,
    runId,
    level: "info",
    message: `Backfilled ${batch.method} run from existing clip results`,
    createdAt: now,
  })
  return await listRuns(ctx, batch._id)
}

export const filterNovelMethods = (
  existing: Doc<"runs">[],
  methods: MethodId[],
): MethodId[] => {
  const usedMethods = new Set(existing.map((run) => run.method))
  const unique = requireMethodIds(methods)
  return unique.filter((method) => !usedMethods.has(method))
}

export const insertRunsForMethods = async (
  ctx: MutationCtx,
  batch: Doc<"batches">,
  methods: MethodId[],
): Promise<Id<"runs">[]> => {
  const clips = assertClipsReadyToRun(await listBatchClips(ctx, batch._id))
  const existing = await listRuns(ctx, batch._id)
  const novel = filterNovelMethods(existing, methods)
  if (novel.length === 0) {
    throw new Error("All selected methods already ran on this batch")
  }
  if (existing.length + novel.length > MAX_RUNS_PER_BATCH) {
    throw new Error(`This batch already has ${MAX_RUNS_PER_BATCH} runs`)
  }
  const now = Date.now()
  const ids: Id<"runs">[] = []
  for (const method of novel) {
    const runId = await ctx.db.insert("runs", {
      batchId: batch._id,
      method,
      model: modelForMethod(method),
      status: "queued",
      clipCount: clips.length,
      succeededCount: 0,
      failedCount: 0,
      createdAt: now,
    })
    for (const clip of clips) {
      await ctx.db.insert("clipResults", {
        runId,
        clipId: clip._id,
        batchId: batch._id,
        state: "queued",
      })
    }
    await ctx.db.insert("logs", {
      userId: batch.userId,
      batchId: batch._id,
      runId,
      level: "info",
      message: `Queued ${method} run with ${clips.length} clip${clips.length === 1 ? "" : "s"}`,
      createdAt: now,
    })
    ids.push(runId)
  }
  await syncBatchRunMeta(ctx, batch._id)
  return ids
}

export const recountRun = async (
  ctx: MutationCtx,
  runId: Id<"runs">,
): Promise<Doc<"runs"> | null> => {
  const run = await ctx.db.get(runId)
  if (!run) {
    return null
  }
  const results = await listRunResults(ctx, runId)
  const succeededCount = results.filter((row) => row.state === "succeeded").length
  const failedCount = results.filter((row) => row.state === "failed").length
  await ctx.db.patch(runId, { succeededCount, failedCount })
  await ctx.db.patch(run.batchId, { succeededCount, failedCount })
  return await ctx.db.get(runId)
}

export const completeRunIfIdle = async (
  ctx: MutationCtx,
  run: Doc<"runs">,
): Promise<boolean> => {
  const results = await listRunResults(ctx, run._id)
  if (!runHasFullResultSet(results, run.clipCount)) {
    return false
  }
  const failedCount = results.filter((row) => row.state === "failed").length
  const succeededCount = results.filter((row) => row.state === "succeeded").length
  const now = Date.now()
  const failed = failedCount > 0 && succeededCount === 0
  const batch = await ctx.db.get(run.batchId)
  await ctx.db.patch(run._id, {
    status: failed ? "failed" : "complete",
    failedCount,
    succeededCount,
    completedAt: now,
  })
  if (batch) {
    await ctx.db.insert("logs", {
      userId: batch.userId,
      batchId: run.batchId,
      runId: run._id,
      level: failed ? "warn" : "info",
      message: failed
        ? `${run.method} finished with ${failedCount} failure${failedCount === 1 ? "" : "s"}`
        : `${run.method} finished successfully`,
      createdAt: now,
    })
  }
  return true
}

export const failUnfinishedResults = async (
  ctx: MutationCtx,
  runId: Id<"runs">,
  errorJson: string,
): Promise<number> => {
  const results = await listRunResults(ctx, runId)
  const now = Date.now()
  let failed = 0
  for (const row of unfinishedResults(results)) {
    await ctx.db.patch(row._id, {
      state: "failed",
      stage: "Failed",
      predictionJson: undefined,
      errorJson,
      finishedAt: now,
    })
    failed += 1
  }
  const run = await recountRun(ctx, runId)
  if (run) {
    await completeRunIfIdle(ctx, run)
  }
  return failed
}

export const activateRun = async (
  ctx: MutationCtx,
  run: Doc<"runs">,
  batch: Doc<"batches">,
): Promise<void> => {
  const now = Date.now()
  await ctx.db.patch(run._id, {
    status: "running",
    startedAt: run.startedAt ?? now,
  })
  await ctx.db.patch(batch._id, {
    method: run.method,
    model: run.model,
    succeededCount: run.succeededCount,
    failedCount: run.failedCount,
  })
  await ctx.db.insert("logs", {
    userId: batch.userId,
    batchId: batch._id,
    runId: run._id,
    level: "info",
    message: `Run started using ${run.method}`,
    createdAt: now,
  })
}
