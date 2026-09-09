import type { BatchRepository } from "./ports";

export type RequeueScope = "failed" | "all";

export async function requeueBatch(
  repo: BatchRepository,
  batchId: string,
  scope: RequeueScope,
): Promise<{ requeued: number } | null> {
  const batch = await repo.get(batchId);
  if (!batch) {
    return null;
  }
  const requeued = await repo.requeueClips(batchId, scope);
  return { requeued };
}
