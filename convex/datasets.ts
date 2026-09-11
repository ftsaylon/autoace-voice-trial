import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireUserId } from "./lib/auth"
import { ownedOrNull } from "./lib/access"
import schema from "./schema"
import { boundParseIssues } from "./lib/runs"
import { allocateUniqueDatasetName } from "./lib/datasetNames"
import { MAX_CLIP_COUNT } from "../src/domain/constants"
import type { Id } from "./_generated/dataModel"

const datasetDoc = schema.doc("datasets")
const datasetClipDoc = schema.doc("datasetClips")

export const list = query({
  args: {},
  returns: v.array(datasetDoc),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    return await ctx.db
      .query("datasets")
      .withIndex("by_user_and_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100)
  },
})

export const get = query({
  args: { datasetId: v.id("datasets") },
  returns: v.union(
    v.object({
      dataset: datasetDoc,
      clips: v.array(datasetClipDoc),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const dataset = ownedOrNull(userId, await ctx.db.get(args.datasetId))
    if (!dataset) {
      return null
    }
    const clips = await ctx.db
      .query("datasetClips")
      .withIndex("by_dataset", (q) => q.eq("datasetId", args.datasetId))
      .collect()
    return { dataset, clips }
  },
})

export const create = mutation({
  args: {
    preferredName: v.optional(v.string()),
    parseIssues: v.array(v.string()),
    clips: v.array(
      v.object({
        name: v.string(),
        storageId: v.id("_storage"),
        goldJson: v.optional(v.string()),
      }),
    ),
  },
  returns: v.id("datasets"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    if (args.clips.length === 0) {
      throw new Error("No valid clips to save")
    }
    if (args.clips.length > MAX_CLIP_COUNT) {
      throw new Error(`Dataset has ${args.clips.length} clips; the cap is ${MAX_CLIP_COUNT}`)
    }
    const fallbackName = `${args.clips.length} clip${args.clips.length === 1 ? "" : "s"}`
    const preferred = args.preferredName?.trim() || fallbackName
    const name = await allocateUniqueDatasetName(ctx, userId, preferred)
    const now = Date.now()
    const datasetId = await ctx.db.insert("datasets", {
      userId,
      name,
      clipCount: args.clips.length,
      parseIssues: boundParseIssues(args.parseIssues),
      createdAt: now,
      updatedAt: now,
    })
    for (const clip of args.clips) {
      await ctx.db.insert("datasetClips", {
        datasetId,
        name: clip.name,
        storageId: clip.storageId,
        goldJson: clip.goldJson,
      })
    }
    return datasetId
  },
})

export const touchUpdated = async (
  ctx: { db: { patch: (id: Id<"datasets">, value: { updatedAt: number }) => Promise<void> } },
  datasetId: Id<"datasets">,
): Promise<void> => {
  await ctx.db.patch(datasetId, { updatedAt: Date.now() })
}
