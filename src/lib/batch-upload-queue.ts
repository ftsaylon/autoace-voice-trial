import type { ParsedBatchInput } from "@/application/parse-batch"

const pendingByBatchId = new Map<string, ParsedBatchInput>()

export const stashPendingUpload = (
  batchId: string,
  parsed: ParsedBatchInput,
): void => {
  pendingByBatchId.set(batchId, parsed)
}

export const peekPendingUpload = (
  batchId: string,
): ParsedBatchInput | null => {
  return pendingByBatchId.get(batchId) ?? null
}

export const clearPendingUpload = (batchId: string): void => {
  pendingByBatchId.delete(batchId)
}
