import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireUserId } from "./lib/auth"
import { ownedOrNull } from "./lib/access"
import { methodValidator } from "./schema"
import { MAX_RUNNING_BATCHES, decideBatchLaunch } from "./lib/constants"
import { modelForMethod } from "../src/application/methods"

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
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
        storageId: v.optional(v.id("_storage")),
        goldJson: v.optional(v.string()),
      }),
    ),
  },
  returns: v.id("batches"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const createdAt = Date.now()
    const model = modelForMethod(args.method)
    const awaitingUpload = args.clips.some((clip) => !clip.storageId)
    const batchId = await ctx.db.insert("batches", {
      userId,
      name: args.name,
      status: awaitingUpload ? "uploading" : "draft",
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
        state: clip.storageId ? "queued" : "uploading",
        goldJson: clip.goldJson,
      })
    }
    await ctx.db.insert("logs", {
      userId,
      batchId,
      level: "info",
      message: awaitingUpload
        ? `Uploading ${args.clips.length} clip${args.clips.length === 1 ? "" : "s"}`
        : `Draft created with ${args.clips.length} clip${args.clips.length === 1 ? "" : "s"}`,
      createdAt,
    })
    return batchId
  },
})

export const attachClipStorage = mutation({
  args: {
    clipId: v.id("clips"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const clip = await ctx.db.get(args.clipId)
    if (!clip) {
      throw new Error("Clip not found")
    }
    const batch = await ctx.db.get(clip.batchId)
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found")
    }
    if (batch.status !== "uploading") {
      throw new Error("Batch is not awaiting upload")
    }
    if (clip.storageId && clip.state === "queued") {
      return null
    }
    await ctx.db.patch(args.clipId, {
      storageId: args.storageId,
      state: "queued",
    })
    return null
  },
})

export const failUpload = mutation({
  args: {
    batchId: v.id("batches"),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found")
    }
    if (batch.status !== "uploading") {
      return null
    }
    const now = Date.now()
    await ctx.db.patch(args.batchId, {
      status: "failed",
      completedAt: now,
    })
    await ctx.db.insert("logs", {
      userId,
      batchId: args.batchId,
      level: "error",
      message: args.message,
      createdAt: now,
    })
    return null
  },
})

export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("uploading"),
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
    return rows.filter(
      (row) =>
        row.status === "running" ||
        row.status === "queued" ||
        row.status === "uploading",
    )
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
      model: modelForMethod(args.method),
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
    if (batch.status === "uploading") {
      const clips = await ctx.db
        .query("clips")
        .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
        .collect()
      if (clips.some((clip) => !clip.storageId || clip.state === "uploading")) {
        throw new Error("Clips are still uploading")
      }
    }

    const method = args.method ?? batch.method
    const model = modelForMethod(method)
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
