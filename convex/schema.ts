import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

export const methodValidator = v.union(
  v.literal("fusion"),
  v.literal("baseline"),
  v.literal("lexical"),
  v.literal("prosody"),
  v.literal("gemini_only"),
)

export const batchStatusValidator = v.union(
  v.literal("draft"),
  v.literal("uploading"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed"),
)

export const runStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed"),
)

export const clipStateValidator = v.union(
  v.literal("uploading"),
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
  datasets: defineTable({
    userId: v.id("users"),
    name: v.string(),
    clipCount: v.number(),
    parseIssues: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_and_updated", ["userId", "updatedAt"]),
  datasetClips: defineTable({
    datasetId: v.id("datasets"),
    name: v.string(),
    storageId: v.id("_storage"),
    goldJson: v.optional(v.string()),
  }).index("by_dataset", ["datasetId"]),
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
    runCount: v.optional(v.number()),
    methodIds: v.optional(v.array(methodValidator)),
    datasetId: v.optional(v.id("datasets")),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_created", ["userId", "createdAt"])
    .index("by_userId_and_status_and_createdAt", ["userId", "status", "createdAt"])
    .index("by_status", ["status"]),
  clips: defineTable({
    batchId: v.id("batches"),
    name: v.string(),
    storageId: v.optional(v.id("_storage")),
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
  runs: defineTable({
    batchId: v.id("batches"),
    method: methodValidator,
    model: v.string(),
    status: runStatusValidator,
    clipCount: v.number(),
    succeededCount: v.number(),
    failedCount: v.number(),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_batch", ["batchId"])
    .index("by_batch_and_created", ["batchId", "createdAt"])
    .index("by_status", ["status"]),
  clipResults: defineTable({
    runId: v.id("runs"),
    clipId: v.id("clips"),
    batchId: v.id("batches"),
    state: clipStateValidator,
    stage: v.optional(v.string()),
    predictionJson: v.optional(v.string()),
    errorJson: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_run", ["runId"])
    .index("by_run_and_state", ["runId", "state"])
    .index("by_clip", ["clipId"])
    .index("by_batch", ["batchId"]),
  logs: defineTable({
    userId: v.id("users"),
    batchId: v.id("batches"),
    clipId: v.optional(v.id("clips")),
    runId: v.optional(v.id("runs")),
    level: logLevelValidator,
    message: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_and_created", ["userId", "createdAt"])
    .index("by_batch_and_created", ["batchId", "createdAt"])
    .index("by_run_and_created", ["runId", "createdAt"]),
  userSettings: defineTable({
    userId: v.id("users"),
    defaultMethod: methodValidator,
  }).index("by_user", ["userId"]),
})
