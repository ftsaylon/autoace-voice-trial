import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireUserId } from "./lib/auth"
import { ownedOrNull } from "./lib/access"
import schema, { methodValidator } from "./schema"
import { failedResultsForRun } from "../src/application/run-policy"
import { MAX_RUNNING_BATCHES, decideBatchLaunch } from "./lib/constants"
import { MAX_CLIP_COUNT, MAX_RUNS_PER_BATCH } from "../src/domain/constants"
import { modelForMethod, type MethodId } from "../src/application/methods"
import {
  assertClipsReadyToRun,
  boundParseIssues,
  ensureRuns,
  insertRunsForMethods,
  listBatchClips,
  listRunResults,
  listRuns,
  overlayClip,
  pickViewingRun,
  requireMethodIds,
} from "./lib/runs"
import type { MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"

const launchResultValidator = v.union(
  v.object({ started: v.literal(true), reason: v.literal("running") }),
  v.object({
    started: v.literal(false),
    reason: v.union(v.literal("queued"), v.literal("already_running")),
  }),
)

const batchDoc = schema.doc("batches")
const clipDoc = schema.doc("clips")
const runDoc = schema.doc("runs")
const clipResultDoc = schema.doc("clipResults")

const launchBatch = async (
  ctx: MutationCtx,
  batchId: Id<"batches">,
) => {
  const batch = await ctx.db.get(batchId)
  if (!batch) {
    throw new Error("Batch not found")
  }
  if (batch.clipCount === 0) {
    throw new Error("No valid clips to process")
  }
  if (batch.status === "running") {
    return { started: false as const, reason: "already_running" as const }
  }
  const clips = await listBatchClips(ctx, batchId)
  assertClipsReadyToRun(clips)
  const runs = await listRuns(ctx, batchId)
  if (runs.length === 0) {
    throw new Error("No runs to start")
  }
  const now = Date.now()
  const running = await ctx.db
    .query("batches")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .take(MAX_RUNNING_BATCHES + 1)
  const othersRunning = running.filter((row) => row._id !== batchId).length
  const launch = decideBatchLaunch(othersRunning)

  if (launch === "queued") {
    await ctx.db.patch(batchId, {
      status: "queued",
      startedAt: batch.startedAt ?? now,
      completedAt: undefined,
    })
    await ctx.db.insert("logs", {
      userId: batch.userId,
      batchId,
      level: "info",
      message: "Queued until another batch finishes",
      createdAt: now,
    })
    return { started: false as const, reason: "queued" as const }
  }

  await ctx.db.patch(batchId, {
    status: "running",
    startedAt: batch.startedAt ?? now,
    completedAt: undefined,
  })
  await ctx.db.insert("logs", {
    userId: batch.userId,
    batchId,
    level: "info",
    message: "Batch processing started",
    createdAt: now,
  })
  await ctx.scheduler.runAfter(0, internal.processActions.processNext, {
    batchId,
  })
  return { started: true as const, reason: "running" as const }
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUserId(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const createDraft = mutation({
  args: {
    name: v.string(),
    method: methodValidator,
    methods: v.optional(v.array(methodValidator)),
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
    if (args.clips.length === 0) {
      throw new Error("No valid clips to process")
    }
    if (args.clips.length > MAX_CLIP_COUNT) {
      throw new Error(`Batch has ${args.clips.length} clips; the cap is ${MAX_CLIP_COUNT}`)
    }
    const createdAt = Date.now()
    const methodIds = requireMethodIds(
      args.methods && args.methods.length > 0 ? args.methods : [args.method],
    )
    const method = methodIds[0] ?? args.method
    const model = modelForMethod(method)
    const awaitingUpload = args.clips.some((clip) => !clip.storageId)
    const batchId = await ctx.db.insert("batches", {
      userId,
      name: args.name,
      status: awaitingUpload ? "uploading" : "draft",
      method,
      model,
      parseIssues: boundParseIssues(args.parseIssues),
      clipCount: args.clips.length,
      succeededCount: 0,
      failedCount: 0,
      createdAt,
      runCount: 0,
      methodIds,
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
  returns: v.array(batchDoc),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    if (args.status) {
      return await ctx.db
        .query("batches")
        .withIndex("by_userId_and_status_and_createdAt", (q) =>
          q.eq("userId", userId).eq("status", args.status!),
        )
        .order("desc")
        .take(100)
    }
    return await ctx.db
      .query("batches")
      .withIndex("by_user_and_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100)
  },
})

export const get = query({
  args: {
    batchId: v.id("batches"),
    runId: v.optional(v.id("runs")),
  },
  returns: v.union(
    v.object({
      batch: batchDoc,
      clips: v.array(clipDoc),
      runs: v.array(runDoc),
      viewingRun: v.union(runDoc, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = ownedOrNull(userId, await ctx.db.get(args.batchId))
    if (!batch) {
      return null
    }
    const clips = await listBatchClips(ctx, args.batchId)
    const runs = await listRuns(ctx, args.batchId)
    const viewingRun = pickViewingRun(runs, args.runId)
    const viewingResults = viewingRun
      ? await listRunResults(ctx, viewingRun._id)
      : []
    const resultByClip = new Map(
      viewingResults.map((row) => [row.clipId, row] as const),
    )
    return {
      batch,
      clips: clips.map((clip) => overlayClip(clip, resultByClip.get(clip._id))),
      runs,
      viewingRun,
    }
  },
})

export const listResultsForRuns = query({
  args: {
    batchId: v.id("batches"),
    runIds: v.array(v.id("runs")),
  },
  returns: v.array(clipResultDoc),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = ownedOrNull(userId, await ctx.db.get(args.batchId))
    if (!batch) {
      return []
    }
    const uniqueIds = [...new Set(args.runIds)]
    if (uniqueIds.length > MAX_RUNS_PER_BATCH) {
      throw new Error(`Load at most ${MAX_RUNS_PER_BATCH} runs`)
    }
    const runs = await listRuns(ctx, args.batchId)
    const allowed = new Set(runs.map((run) => run._id))
    const results = []
    for (const runId of uniqueIds) {
      if (!allowed.has(runId)) {
        continue
      }
      results.push(...(await listRunResults(ctx, runId)))
    }
    return results
  },
})

export const listMineActive = query({
  args: {},
  returns: v.array(batchDoc),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const statuses = ["running", "queued", "uploading"] as const
    const pages = await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query("batches")
          .withIndex("by_userId_and_status_and_createdAt", (q) =>
            q.eq("userId", userId).eq("status", status),
          )
          .order("desc")
          .take(50),
      ),
    )
    return pages.flat()
  },
})

export const setMethod = mutation({
  args: {
    batchId: v.id("batches"),
    method: methodValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found")
    }
    if (batch.status === "running") {
      throw new Error("Cannot change method while running")
    }
    const runs = await listRuns(ctx, args.batchId)
    if (runs.length > 0) {
      throw new Error("Method is chosen per run after the first start")
    }
    await ctx.db.patch(args.batchId, {
      method: args.method,
      model: modelForMethod(args.method),
      methodIds: [args.method],
    })
    return null
  },
})

export const start = mutation({
  args: {
    batchId: v.id("batches"),
    method: v.optional(methodValidator),
    methods: v.optional(v.array(methodValidator)),
  },
  returns: launchResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found")
    }
    assertClipsReadyToRun(await listBatchClips(ctx, args.batchId))
    let current = batch
    const existing = await ensureRuns(ctx, current)
    current = (await ctx.db.get(args.batchId)) ?? current
    if (existing.length === 0) {
      const methods: MethodId[] =
        args.methods && args.methods.length > 0
          ? args.methods
          : current.methodIds && current.methodIds.length > 0
            ? current.methodIds
            : args.method
              ? [args.method]
              : [current.method]
      await insertRunsForMethods(ctx, current, methods)
    }
    return await launchBatch(ctx, args.batchId)
  },
})

export const startRuns = mutation({
  args: {
    batchId: v.id("batches"),
    methods: v.array(methodValidator),
  },
  returns: launchResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found")
    }
    const methods = requireMethodIds(args.methods)
    assertClipsReadyToRun(await listBatchClips(ctx, args.batchId))
    await ensureRuns(ctx, batch)
    const current = (await ctx.db.get(args.batchId)) ?? batch
    await insertRunsForMethods(ctx, current, methods)
    return await launchBatch(ctx, args.batchId)
  },
})

export const retryRun = mutation({
  args: {
    runId: v.id("runs"),
  },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const run = await ctx.db.get(args.runId)
    if (!run) {
      throw new Error("Run not found")
    }
    const batch = await ctx.db.get(run.batchId)
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found")
    }
    if (batch.status === "running") {
      throw new Error("Wait for the current run to finish")
    }
    const results = failedResultsForRun(await listRunResults(ctx, args.runId), args.runId)
    let requeued = 0
    for (const row of results) {
      await ctx.db.patch(row._id, {
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
    await ctx.db.patch(args.runId, {
      status: "queued",
      failedCount: 0,
      completedAt: undefined,
    })
    await ctx.db.patch(run.batchId, {
      completedAt: undefined,
    })
    await ctx.db.insert("logs", {
      userId,
      batchId: run.batchId,
      runId: args.runId,
      level: "info",
      message: `Requeued ${requeued} failed clip${requeued === 1 ? "" : "s"} on ${run.method}`,
      createdAt: now,
    })
    await launchBatch(ctx, run.batchId)
    return { requeued }
  },
})

export const retry = mutation({
  args: {
    batchId: v.id("batches"),
    scope: v.union(v.literal("failed"), v.literal("all")),
  },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const batch = await ctx.db.get(args.batchId)
    if (!batch || batch.userId !== userId) {
      throw new Error("Batch not found")
    }
    if (batch.status === "running") {
      throw new Error("Wait for the current run to finish")
    }
    const runs = await ensureRuns(ctx, batch)
    const latest = runs[runs.length - 1]
    if (!latest) {
      return { requeued: 0 }
    }
    if (args.scope === "all") {
      await insertRunsForMethods(ctx, (await ctx.db.get(args.batchId)) ?? batch, [
        latest.method,
      ])
      await launchBatch(ctx, args.batchId)
      const current = await ctx.db.get(args.batchId)
      return { requeued: current?.clipCount ?? 0 }
    }
    const results = failedResultsForRun(await listRunResults(ctx, latest._id), latest._id)
    let requeued = 0
    for (const row of results) {
      await ctx.db.patch(row._id, {
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
    await ctx.db.patch(latest._id, {
      status: "queued",
      failedCount: 0,
      completedAt: undefined,
    })
    await ctx.db.insert("logs", {
      userId,
      batchId: args.batchId,
      runId: latest._id,
      level: "info",
      message: `Requeued ${requeued} failed clip${requeued === 1 ? "" : "s"} on ${latest.method}`,
      createdAt: Date.now(),
    })
    await launchBatch(ctx, args.batchId)
    return { requeued }
  },
})
