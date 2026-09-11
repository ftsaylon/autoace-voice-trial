import type { MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"

export const BATCH_CODE_LENGTH = 5

export const formatBatchCode = (sequence: number): string => {
  return String(sequence).padStart(BATCH_CODE_LENGTH, "0")
}

export const allocateBatchName = async (
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<string> => {
  const existing = await ctx.db
    .query("batches")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()
  return formatBatchCode(existing.length + 1)
}
