import { v } from "convex/values"
import { query } from "./_generated/server"
import { requireUserId } from "./lib/auth"
import { ownedOrNull } from "./lib/access"
import schema from "./schema"

export const listForRun = query({
  args: {
    runId: v.id("runs"),
    limit: v.optional(v.number()),
  },
  returns: v.array(schema.doc("logs")),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const run = await ctx.db.get(args.runId)
    if (!run) {
      return []
    }
    const batch = ownedOrNull(userId, await ctx.db.get(run.batchId))
    if (!batch) {
      return []
    }
    const limit = Math.min(args.limit ?? 200, 400)
    return await ctx.db
      .query("logs")
      .withIndex("by_run_and_created", (q) => q.eq("runId", args.runId))
      .order("desc")
      .take(limit)
  },
})
