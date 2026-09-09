import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

export const methodValidator = v.union(v.literal("fusion"), v.literal("baseline"))

export const batchStatusValidator = v.union(
  v.literal("draft"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed"),
)

export const clipStateValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
)

export const logLevelValidator = v.union(
  v.literal("info"),
  v.literal("warn"),
  v.literal("error"),
)

export default defineSchema({
  ...authTables,
  batches: defineTable({
    userId: v.id("users"),
    name: v.string(),
    status: batchStatusValidator,
    method: methodValidator,
    model: v.string(),
    parseIssues: v.array(v.string()),
    clipCount: v.number(),
    succeededCount: v.number(),
    failedCount: v.number(),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_created", ["userId", "createdAt"])
    .index("by_status", ["status"]),
  clips: defineTable({
    batchId: v.id("batches"),
    name: v.string(),
    storageId: v.id("_storage"),
    state: clipStateValidator,
    stage: v.optional(v.string()),
    goldJson: v.optional(v.string()),
    predictionJson: v.optional(v.string()),
    errorJson: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_batch", ["batchId"])
    .index("by_batch_and_state", ["batchId", "state"]),
  logs: defineTable({
    userId: v.id("users"),
    batchId: v.id("batches"),
    clipId: v.optional(v.id("clips")),
    level: logLevelValidator,
    message: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_and_created", ["userId", "createdAt"])
    .index("by_batch_and_created", ["batchId", "createdAt"]),
  userSettings: defineTable({
    userId: v.id("users"),
    defaultMethod: methodValidator,
  }).index("by_user", ["userId"]),
})
