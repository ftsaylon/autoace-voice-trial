import { v } from "convex/values"
import { query } from "./_generated/server"
import { requireUserId } from "./lib/auth"
import { ownedOrNull } from "./lib/access"

export const listForUser = query({
  args: {
    batchId: v.optional(v.id("batches")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const limit = Math.min(args.limit ?? 200, 400)
    if (args.batchId) {
      const batch = ownedOrNull(userId, await ctx.db.get(args.batchId))
      if (!batch) {
        return []
      }
      const page = await ctx.db
        .query("logs")
        .withIndex("by_batch_and_created", (q) => q.eq("batchId", args.batchId!))
        .order("desc")
        .take(limit)
      return page
    }
    return await ctx.db
      .query("logs")
      .withIndex("by_user_and_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit)
  },
})
