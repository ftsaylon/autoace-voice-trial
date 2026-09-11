import { v } from "convex/values"
import { internalMutation, type MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { CLAIM_STALE_MS, MAX_CLIP_COUNT } from "../src/domain/constants"
import { hasPendingRuns, inFlightToSchedule } from "../src/application/run-policy"
import { MAX_RUNNING_BATCHES } from "./lib/constants"
import { formatStoredAnalyzeError } from "../src/domain/errors"
import { methodValidator } from "./schema"
import {
  activateRun,
  completeRunIfIdle,
  failUnfinishedResults,
  listRuns,
  recountRun,
  syncBatchRunMeta,
} from "./lib/runs"

const claimedClipValidator = v.object({
  clipResultId: v.id("clipResults"),
  clipId: v.id("clips"),
  batchId: v.id("batches"),
  runId: v.id("runs"),
  name: v.string(),
  storageId: v.id("_storage"),
  userId: v.id("users"),
  method: methodValidator,
  model: v.string(),
})

type ClaimedClip = {
  clipResultId: Doc<"clipResults">["_id"]
  clipId: Doc<"clips">["_id"]
  batchId: Doc<"batches">["_id"]
  runId: Doc<"runs">["_id"]
  name: string
  storageId: Doc<"clips">["storageId"] & string
  userId: Doc<"users">["_id"]
  method: Doc<"runs">["method"]
  model: string
}

const claimFromRun = async (
  ctx: MutationCtx,
  batch: Doc<"batches">,
  run: Doc<"runs">,
  now: number,
  staleBefore: number,
): Promise<ClaimedClip | null> => {
  const running = await ctx.db
    .query("clipResults")
    .withIndex("by_run_and_state", (q) =>
      q.eq("runId", run._id).eq("state", "running"),
    )
    .take(MAX_CLIP_COUNT)
  const stale = running.find(
    (row) => row.claimedAt !== undefined && row.claimedAt < staleBefore,
  )
  const next =
    stale ??
    (await ctx.db
      .query("clipResults")
      .withIndex("by_run_and_state", (q) =>
        q.eq("runId", run._id).eq("state", "queued"),
      )
      .first())
  if (!next) {
    return null
  }
  const clip = await ctx.db.get(next.clipId)
  if (!clip?.storageId) {
    await ctx.db.patch(next._id, {
      state: "failed",
      stage: "Failed",
      predictionJson: undefined,
      errorJson: JSON.stringify({
        tag: "decode_failed",
        name: clip?.name ?? "clip",
        cause: "Audio is missing from storage",
      }),
      finishedAt: now,
    })
    await recountRun(ctx, run._id)
    return null
  }
  await ctx.db.patch(next._id, {
    state: "running",
    claimedAt: now,
    startedAt: now,
    stage: "Starting",
  })
  return {
    clipResultId: next._id,
    clipId: clip._id,
    batchId: batch._id,
    runId: run._id,
    name: clip.name,
    storageId: clip.storageId,
    userId: batch.userId,
    method: run.method,
    model: run.model,
  }
}

export const claimNextRound = internalMutation({
  args: { batchId: v.id("batches") },
  returns: v.array(claimedClipValidator),
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.status !== "running") {
      return []
    }
    const now = Date.now()
    const staleBefore = now - CLAIM_STALE_MS
    let runs = await listRuns(ctx, args.batchId)

    for (const run of runs) {
      if (run.status === "queued") {
        await activateRun(ctx, run, batch)
      }
    }
    runs = await listRuns(ctx, args.batchId)

    const claims = []
    let liveRunning = 0
    for (const run of runs) {
      if (run.status !== "running") {
        continue
      }
      const runningRows = await ctx.db
        .query("clipResults")
        .withIndex("by_run_and_state", (q) =>
          q.eq("runId", run._id).eq("state", "running"),
        )
        .take(MAX_CLIP_COUNT)
      liveRunning += runningRows.filter(
        (row) => row.claimedAt === undefined || row.claimedAt >= staleBefore,
      ).length
    }
    for (const run of runs) {
      if (run.status !== "running") {
        continue
      }
      while (inFlightToSchedule(liveRunning, 1) > 0) {
        const claimed = await claimFromRun(ctx, batch, run, now, staleBefore)
        if (!claimed) {
          await completeRunIfIdle(ctx, run)
          break
        }
        claims.push(claimed)
        liveRunning += 1
      }
    }
    return claims
  },
})

export const setStage = internalMutation({
  args: {
    clipResultId: v.id("clipResults"),
    clipId: v.id("clips"),
    batchId: v.id("batches"),
    runId: v.id("runs"),
    userId: v.id("users"),
    stage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.clipResultId, { stage: args.stage })
    await ctx.db.insert("logs", {
      userId: args.userId,
      batchId: args.batchId,
      clipId: args.clipId,
      runId: args.runId,
      level: "info",
      message: args.stage,
      createdAt: Date.now(),
    })
    return null
  },
})

export const completeClip = internalMutation({
  args: {
    clipResultId: v.id("clipResults"),
    ok: v.boolean(),
    predictionJson: v.optional(v.string()),
    errorJson: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db.get(args.clipResultId)
    if (!result) {
      return null
    }
    if (result.state === "succeeded" || result.state === "failed") {
      return null
    }
    const now = Date.now()
    await ctx.db.patch(args.clipResultId, {
      state: args.ok ? "succeeded" : "failed",
      stage: args.ok ? "Done" : "Failed",
      predictionJson: args.ok ? args.predictionJson : undefined,
      errorJson: args.ok ? undefined : args.errorJson,
      finishedAt: now,
    })
    const run = await recountRun(ctx, result.runId)
    const batch = await ctx.db.get(result.batchId)
    const clip = await ctx.db.get(result.clipId)
    if (batch && clip) {
      await ctx.db.insert("logs", {
        userId: batch.userId,
        batchId: result.batchId,
        clipId: result.clipId,
        runId: result.runId,
        level: args.ok ? "info" : "error",
        message: args.ok
          ? `${clip.name} succeeded${run ? ` (${run.method})` : ""}`
          : `${clip.name} failed: ${formatStoredAnalyzeError(args.errorJson)}`,
        createdAt: now,
      })
    }
    return null
  },
})

export const failRunUnavailable = internalMutation({
  args: {
    runId: v.id("runs"),
    errorJson: v.string(),
    message: v.string(),
  },
  returns: v.object({ failed: v.number() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) {
      return { failed: 0 }
    }
    const failed = await failUnfinishedResults(ctx, args.runId, args.errorJson)
    const batch = await ctx.db.get(run.batchId)
    if (batch) {
      await ctx.db.insert("logs", {
        userId: batch.userId,
        batchId: run.batchId,
        runId: run._id,
        level: "error",
        message: args.message,
        createdAt: Date.now(),
      })
    }
    return { failed }
  },
})

export const appendLog = internalMutation({
  args: {
    userId: v.id("users"),
    batchId: v.id("batches"),
    clipId: v.optional(v.id("clips")),
    runId: v.optional(v.id("runs")),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("logs", {
      userId: args.userId,
      batchId: args.batchId,
      clipId: args.clipId,
      runId: args.runId,
      level: args.level,
      message: args.message,
      createdAt: Date.now(),
    })
    return null
  },
})

export const finishBatchIfIdle = internalMutation({
  args: { batchId: v.id("batches") },
  returns: v.object({ finished: v.boolean() }),
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.status === "uploading") {
      return { finished: false }
    }
    const runs = await listRuns(ctx, args.batchId)
    if (hasPendingRuns(runs)) {
      return { finished: false }
    }
    if (runs.length === 0) {
      return { finished: false }
    }
    const now = Date.now()
    const anySuccess = runs.some((run) => run.succeededCount > 0)
    const allFailed = runs.every(
      (run) => run.status === "failed" || (run.failedCount > 0 && run.succeededCount === 0),
    )
    await ctx.db.patch(args.batchId, {
      status: !anySuccess && allFailed ? "failed" : "complete",
      completedAt: now,
    })
    await syncBatchRunMeta(ctx, args.batchId)
    await ctx.db.insert("logs", {
      userId: batch.userId,
      batchId: args.batchId,
      level: !anySuccess && allFailed ? "warn" : "info",
      message:
        !anySuccess && allFailed
          ? "Batch finished with no successful clips"
          : `Batch finished · ${runs.length} run${runs.length === 1 ? "" : "s"}`,
      createdAt: now,
    })
    return { finished: true }
  },
})

export const startNextQueued = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const running = await ctx.db
      .query("batches")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(MAX_RUNNING_BATCHES)
    if (running.length >= MAX_RUNNING_BATCHES) {
      return null
    }
    const next = await ctx.db
      .query("batches")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .order("asc")
      .first()
    if (!next) {
      return null
    }
    const now = Date.now()
    await ctx.db.patch(next._id, {
      status: "running",
      startedAt: next.startedAt ?? now,
      completedAt: undefined,
    })
    await ctx.db.insert("logs", {
      userId: next.userId,
      batchId: next._id,
      level: "info",
      message: "Dequeued and started",
      createdAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.processActions.processNext, {
      batchId: next._id,
    })
    return null
  },
})
