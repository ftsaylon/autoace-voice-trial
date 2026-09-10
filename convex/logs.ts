import { v } from "convex/values"
import { query } from "./_generated/server"
import { requireUserId } from "./lib/auth"
import { ownedOrNull } from "./lib/access"
import schema from "./schema"

export const listForUser = query({
  args: {
    batchId: v.optional(v.id("batches")),
    limit: v.optional(v.number()),
  },
  returns: v.array(schema.doc("logs")),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const limit = Math.min(args.limit ?? 200, 400)
    if (args.batchId) {
      const batch = ownedOrNull(userId, await ctx.db.get(args.batchId))
      if (!batch) {
        return []
      }
      return await ctx.db
        .query("logs")
        .withIndex("by_batch_and_created", (q) => q.eq("batchId", args.batchId!))
        .order("desc")
        .take(limit)
    }
    return await ctx.db
      .query("logs")
      .withIndex("by_user_and_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit)
  },
})
