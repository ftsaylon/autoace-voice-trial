import { mutation, query } from "./_generated/server"
import { requireUserId } from "./lib/auth"
import { methodValidator } from "./schema"
import { METHODS } from "../src/application/methods"

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    return {
      defaultMethod: existing?.defaultMethod ?? "fusion",
      productionModel: METHODS.fusion.model,
      costCeilingUsdPerMinute: 0.003,
    }
  },
})

export const setDefaultMethod = mutation({
  args: { defaultMethod: methodValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { defaultMethod: args.defaultMethod })
      return
    }
    await ctx.db.insert("userSettings", {
      userId,
      defaultMethod: args.defaultMethod,
    })
  },
})
