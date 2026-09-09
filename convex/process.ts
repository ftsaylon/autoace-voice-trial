import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import { internal } from "./_generated/api"
import { CLAIM_STALE_MS } from "../src/domain/constants"
import { MAX_RUNNING_BATCHES } from "./lib/constants"

export const claimNext = internalMutation({
  args: { batchId: v.id("batches") },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId)
    if (!batch) {
      return null
    }
    const now = Date.now()
    const staleBefore = now - CLAIM_STALE_MS
    const clips = await ctx.db
      .query("clips")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect()
    const next = clips.find(
      (clip) =>
        clip.state === "queued" ||
        (clip.state === "running" &&
          clip.claimedAt !== undefined &&
          clip.claimedAt < staleBefore),
    )
    if (!next) {
      return null
    }
    await ctx.db.patch(next._id, {
      state: "running",
      claimedAt: now,
      startedAt: now,
      stage: "Starting",
    })
    return {
      clipId: next._id,
      batchId: next.batchId,
      name: next.name,
      storageId: next.storageId,
      userId: batch.userId,
      method: batch.method,
      model: batch.model,
    }
  },
})

export const setStage = internalMutation({
  args: {
    clipId: v.id("clips"),
    batchId: v.id("batches"),
    userId: v.id("users"),
    stage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.clipId, { stage: args.stage })
    await ctx.db.insert("logs", {
      userId: args.userId,
      batchId: args.batchId,
      clipId: args.clipId,
      level: "info",
      message: args.stage,
      createdAt: Date.now(),
    })
  },
})

export const completeClip = internalMutation({
  args: {
    clipId: v.id("clips"),
    ok: v.boolean(),
    predictionJson: v.optional(v.string()),
    errorJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId)
    if (!clip) {
      return
    }
    if (clip.state === "succeeded" || clip.state === "failed") {
      return
    }
    const now = Date.now()
    await ctx.db.patch(args.clipId, {
      state: args.ok ? "succeeded" : "failed",
      stage: args.ok ? "Done" : "Failed",
      predictionJson: args.ok ? args.predictionJson : undefined,
      errorJson: args.ok ? undefined : args.errorJson,
      finishedAt: now,
    })
    const batch = await ctx.db.get(clip.batchId)
    if (!batch) {
      return
    }
    const clips = await ctx.db
      .query("clips")
      .withIndex("by_batch", (q) => q.eq("batchId", clip.batchId))
      .collect()
    const succeededCount = clips.filter((row) => row.state === "succeeded").length
    const failedCount = clips.filter((row) => row.state === "failed").length
    await ctx.db.patch(clip.batchId, { succeededCount, failedCount })
    await ctx.db.insert("logs", {
      userId: batch.userId,
      batchId: clip.batchId,
      clipId: args.clipId,
      level: args.ok ? "info" : "error",
      message: args.ok
        ? `${clip.name} succeeded`
        : `${clip.name} failed: ${args.errorJson ?? "unknown error"}`,
      createdAt: now,
    })
  },
})

export const appendLog = internalMutation({
  args: {
    userId: v.id("users"),
    batchId: v.id("batches"),
    clipId: v.optional(v.id("clips")),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("logs", {
      userId: args.userId,
      batchId: args.batchId,
      clipId: args.clipId,
      level: args.level,
      message: args.message,
      createdAt: Date.now(),
    })
  },
})

export const finishBatchIfIdle = internalMutation({
  args: { batchId: v.id("batches") },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId)
    if (!batch) {
      return { finished: false }
    }
    const clips = await ctx.db
      .query("clips")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect()
    const pending = clips.some(
      (clip) => clip.state === "queued" || clip.state === "running",
    )
    if (pending) {
      return { finished: false }
    }
    const failedCount = clips.filter((clip) => clip.state === "failed").length
    const succeededCount = clips.filter((clip) => clip.state === "succeeded").length
    const now = Date.now()
    await ctx.db.patch(args.batchId, {
      status: failedCount > 0 && succeededCount === 0 ? "failed" : "complete",
      failedCount,
      succeededCount,
      completedAt: now,
    })
    await ctx.db.insert("logs", {
      userId: batch.userId,
      batchId: args.batchId,
      level: failedCount > 0 ? "warn" : "info",
      message:
        failedCount > 0
          ? `Batch finished with ${failedCount} failure${failedCount === 1 ? "" : "s"}`
          : "Batch finished successfully",
      createdAt: now,
    })
    return { finished: true }
  },
})

export const startNextQueued = internalMutation({
  args: {},
  handler: async (ctx) => {
    const running = await ctx.db
      .query("batches")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(MAX_RUNNING_BATCHES)
    if (running.length >= MAX_RUNNING_BATCHES) {
      return
    }
    const queued = await ctx.db
      .query("batches")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(20)
    const next = queued.sort((a, b) => a.createdAt - b.createdAt)[0]
    if (!next) {
      return
    }
    const now = Date.now()
    await ctx.db.patch(next._id, {
      status: "running",
      startedAt: next.startedAt ?? now,
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
  },
})

