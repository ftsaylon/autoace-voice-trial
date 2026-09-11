import type { MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export const nextAvailableDatasetName = (
  preferred: string,
  existingNames: readonly string[],
): string => {
  const taken = new Set(existingNames)
  if (!taken.has(preferred)) {
    return preferred
  }

  const suffixPattern = new RegExp(`^${escapeRegExp(preferred)} \\((\\d+)\\)$`)
  let maxCopy = 0
  for (const name of existingNames) {
    if (name === preferred) {
      maxCopy = Math.max(maxCopy, 0)
      continue
    }
    const match = name.match(suffixPattern)
    if (match) {
      maxCopy = Math.max(maxCopy, Number.parseInt(match[1] ?? "0", 10))
    }
  }

  return `${preferred} (${maxCopy + 1})`
}

export const allocateUniqueDatasetName = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  preferred: string,
): Promise<string> => {
  const existing = await ctx.db
    .query("datasets")
    .withIndex("by_user_and_updated", (q) => q.eq("userId", userId))
    .collect()
  return nextAvailableDatasetName(
    preferred,
    existing.map((dataset) => dataset.name),
  )
}
