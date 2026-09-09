import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireUserId } from "./lib/auth"
import { ownedOrNull } from "./lib/access"
import { methodValidator } from "./schema"
import { MAX_RUNNING_BATCHES, decideBatchLaunch } from "./lib/constants"

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const deleteStorageIds = mutation({
  args: {
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    for (const storageId of args.storageIds) {
      try {
        await ctx.storage.delete(storageId)
      } catch {
        // Already deleted or never written; cleanup must be idempotent.
      }
    }
  },
})

export const createDraft = mutation({
  args: {
    name: v.string(),
    method: methodValidator,
    parseIssues: v.array(v.string()),
    clips: v.array(
      v.object({
        name: v.string(),
        storageId: v.id("_storage"),
        goldJson: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const createdAt = Date.now()
    const model = args.method === "fusion" ? "gemini-3.6-flash" : "acoustic-baseline"
    const batchId = await ctx.db.insert("batches", {
      userId,
      name: args.name,
      status: "draft",
      method: args.method,
      model,
      parseIssues: args.parseIssues,
      clipCount: args.clips.length,
      succeededCount: 0,
      failedCount: 0,
      createdAt,
    })
    for (const clip of args.clips) {
      await ctx.db.insert("clips", {
        batchId,
        name: clip.name,
        storageId: clip.storageId,
        state: "queued",
        goldJson: clip.goldJson,
      })
    }
    await ctx.db.insert("logs", {
      userId,
      batchId,
      level: "info",
      message: `Draft created with ${args.clips.length} clip${args.clips.length === 1 ? "" : "s"}`,
      createdAt,
    })
    return batchId
  },
})

export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("queued"),
        v.literal("running"),
        v.literal("complete"),
        v.literal("failed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const rows = await ctx.db
      .query("batches")
      .withIndex("by_user_and_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100)
    if (!args.status) {
      return rows
    }
    return rows.filter((row) => row.status === args.status)
  },
})

export const get = query({
  args: { batchId: v.id("batches") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = ownedOrNull(userId, await ctx.db.get(args.batchId))
    if (!batch) {
      return null
    }
    const clips = await ctx.db
      .query("clips")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect()
    return { batch, clips }
  },
})

export const listMineActive = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const rows = await ctx.db
      .query("batches")
      .withIndex("by_user_and_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50)
    return rows.filter((row) => row.status === "running" || row.status === "queued")
  },
})

export const setMethod = mutation({
  args: {
    batchId: v.id("batches"),
    method: methodValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found")
    }
    if (batch.status === "running") {
      throw new Error("Cannot change method while running")
    }
    await ctx.db.patch(args.batchId, {
      method: args.method,
      model: args.method === "fusion" ? "gemini-3.6-flash" : "acoustic-baseline",
    })
  },
})

export const start = mutation({
  args: {
    batchId: v.id("batches"),
    method: v.optional(methodValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found")
    }
    if (batch.clipCount === 0) {
      throw new Error("No valid clips to process")
    }
    if (batch.status === "running") {
      return { started: false as const, reason: "already_running" as const }
    }

    const method = args.method ?? batch.method
    const model = method === "fusion" ? "gemini-3.6-flash" : "acoustic-baseline"
    const now = Date.now()
    const running = await ctx.db
      .query("batches")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(MAX_RUNNING_BATCHES + 1)
    const othersRunning = running.filter((row) => row._id !== args.batchId).length
    const launch = decideBatchLaunch(othersRunning)

    if (launch === "queued") {
      await ctx.db.patch(args.batchId, {
        status: "queued",
        method,
        model,
        startedAt: now,
      })
      await ctx.db.insert("logs", {
        userId,
        batchId: args.batchId,
        level: "info",
        message: "Queued until another batch finishes",
        createdAt: now,
      })
      return { started: false as const, reason: "queued" as const }
    }

    await ctx.db.patch(args.batchId, {
      status: "running",
      method,
      model,
      startedAt: now,
      completedAt: undefined,
    })
    await ctx.db.insert("logs", {
      userId,
      batchId: args.batchId,
      level: "info",
      message: `Run started using ${method}`,
      createdAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.processActions.processNext, {
      batchId: args.batchId,
    })
    return { started: true as const, reason: "running" as const }
  },
})

export const retry = mutation({
  args: {
    batchId: v.id("batches"),
    scope: v.union(v.literal("failed"), v.literal("all")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found")
    }
    if (batch.status === "running") {
      throw new Error("Wait for the current run to finish")
    }
    const clips = await ctx.db
      .query("clips")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect()
    let requeued = 0
    for (const clip of clips) {
      const should =
        args.scope === "all"
          ? clip.state === "failed" ||
            clip.state === "succeeded" ||
            clip.state === "running"
          : clip.state === "failed"
      if (!should) {
        continue
      }
      await ctx.db.patch(clip._id, {
        state: "queued",
        stage: undefined,
        predictionJson: undefined,
        errorJson: undefined,
        claimedAt: undefined,
        startedAt: undefined,
        finishedAt: undefined,
      })
      requeued += 1
    }
    if (requeued === 0) {
      return { requeued: 0 }
    }
    const now = Date.now()
    await ctx.db.patch(args.batchId, {
      status: "queued",
      succeededCount: args.scope === "all" ? 0 : batch.succeededCount,
      failedCount: 0,
      completedAt: undefined,
    })
    await ctx.db.insert("logs", {
      userId,
      batchId: args.batchId,
      level: "info",
      message:
        args.scope === "all"
          ? `Requeued all ${requeued} clips`
          : `Requeued ${requeued} failed clip${requeued === 1 ? "" : "s"}`,
      createdAt: now,
    })
    return { requeued }
  },
})
