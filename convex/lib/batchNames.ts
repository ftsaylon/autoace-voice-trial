import type { MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { MAX_BATCHES_PER_USER } from "../../src/domain/constants"
import { BATCH_CODE_PATTERN } from "../../src/lib/batch-label"

export const BATCH_CODE_LENGTH = 5

export const formatBatchCode = (sequence: number): string => {
  return String(sequence).padStart(BATCH_CODE_LENGTH, "0")
}

export const sequenceFromBatchName = (name: string): number | null => {
  const trimmed = name.trim()
  if (!BATCH_CODE_PATTERN.test(trimmed)) {
    return null
  }
  return Number.parseInt(trimmed, 10)
}

const nextSequenceFromExistingBatches = async (
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<number> => {
  const existing = await ctx.db
    .query("batches")
    .withIndex("by_user_and_created", (q) => q.eq("userId", userId))
    .take(MAX_BATCHES_PER_USER)
  let maxSequence = 0
  for (const batch of existing) {
    const sequence = sequenceFromBatchName(batch.name)
    if (sequence !== null && sequence > maxSequence) {
      maxSequence = sequence
    }
  }
  return maxSequence + 1
}

export const allocateBatchName = async (
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<string> => {
  const counter = await ctx.db
    .query("batchNameCounters")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
  if (!counter) {
    const sequence = await nextSequenceFromExistingBatches(ctx, userId)
    await ctx.db.insert("batchNameCounters", {
      userId,
      next: sequence + 1,
    })
    return formatBatchCode(sequence)
  }
  const sequence = counter.next
  await ctx.db.patch(counter._id, { next: sequence + 1 })
  return formatBatchCode(sequence)
}
