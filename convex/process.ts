import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import { internal } from "./_generated/api"
import { CLAIM_STALE_MS } from "../src/domain/constants"
import { MAX_RUNNING_BATCHES } from "./lib/constants"
import {
  activateRun,
  completeRunIfIdle,
  listRunResults,
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
  method: v.string(),
  model: v.string(),
})

export const claimNext = internalMutation({
  args: { batchId: v.id("batches") },
  returns: v.union(claimedClipValidator, v.null()),
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.status === "uploading") {
      return null
    }
    const now = Date.now()
    const staleBefore = now - CLAIM_STALE_MS
    const runs = await listRuns(ctx, args.batchId)

    const claimFromRun = async (run: typeof runs[number]) => {
      const results = await listRunResults(ctx, run._id)
      const next = results.find(
        (row) =>
          row.state === "queued" ||
          (row.state === "running" &&
            row.claimedAt !== undefined &&
            row.claimedAt < staleBefore),
      )
      if (!next) {
        return null
      }
      const clip = await ctx.db.get(next.clipId)
      if (!clip?.storageId) {
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

    const running = runs.find((run) => run.status === "running")
    if (running) {
      const claimed = await claimFromRun(running)
      if (claimed) {
        return claimed
      }
      await completeRunIfIdle(ctx, running)
    }

    const queued = runs
      .filter((run) => run.status === "queued")
      .sort((a, b) => a.createdAt - b.createdAt)
    for (const run of queued) {
      await activateRun(ctx, run, batch)
      const claimed = await claimFromRun(run)
      if (claimed) {
        return claimed
      }
      await completeRunIfIdle(ctx, run)
    }

    return null
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
          : `${clip.name} failed: ${args.errorJson ?? "unknown error"}`,
        createdAt: now,
      })
    }
    return null
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
    const pendingRuns = runs.some(
      (run) => run.status === "queued" || run.status === "running",
    )
    if (pendingRuns) {
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
    const queued = await ctx.db
      .query("batches")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(20)
    const next = queued.sort((a, b) => a.createdAt - b.createdAt)[0]
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
