import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { unfinishedResults } from "../../src/application/run-policy"
import { modelForMethod, type MethodId } from "../../src/application/methods"

type RunStatus = "queued" | "running" | "complete" | "failed"

type DbCtx = MutationCtx | QueryCtx

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

export const listRuns = async (
  ctx: DbCtx,
  batchId: Id<"batches">,
): Promise<Doc<"runs">[]> => {
  return await ctx.db
    .query("runs")
    .withIndex("by_batch_and_created", (q) => q.eq("batchId", batchId))
    .take(100)
}

export const listRunResults = async (
  ctx: DbCtx,
  runId: Id<"runs">,
): Promise<Doc<"clipResults">[]> => {
  return await ctx.db
    .query("clipResults")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .take(100)
}

export const listBatchClips = async (
  ctx: DbCtx,
  batchId: Id<"batches">,
): Promise<Doc<"clips">[]> => {
  return await ctx.db
    .query("clips")
    .withIndex("by_batch", (q) => q.eq("batchId", batchId))
    .take(100)
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
  return runs[runs.length - 1] ?? null
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

export const insertRunsForMethods = async (
  ctx: MutationCtx,
  batch: Doc<"batches">,
  methods: MethodId[],
): Promise<Id<"runs">[]> => {
  if (methods.length === 0) {
    throw new Error("Pick at least one method")
  }
  const clips = await listBatchClips(ctx, batch._id)
  const stored = clips.filter((clip) => clip.storageId)
  if (stored.length === 0) {
    throw new Error("No valid clips to process")
  }
  const now = Date.now()
  const ids: Id<"runs">[] = []
  for (const method of methods) {
    const runId = await ctx.db.insert("runs", {
      batchId: batch._id,
      method,
      model: modelForMethod(method),
      status: "queued",
      clipCount: stored.length,
      succeededCount: 0,
      failedCount: 0,
      createdAt: now,
    })
    for (const clip of stored) {
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
      message: `Queued ${method} run with ${stored.length} clip${stored.length === 1 ? "" : "s"}`,
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
  if (unfinishedResults(results).length > 0) {
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
