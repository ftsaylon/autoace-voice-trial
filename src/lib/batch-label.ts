export const BATCH_CODE_PATTERN = /^\d{5}$/

export const isBatchCode = (name: string): boolean => {
  return BATCH_CODE_PATTERN.test(name.trim())
}

export const formatBatchLabel = (batch: { name: string }): string => {
  const name = batch.name.trim()
  if (isBatchCode(name)) {
    return `Batch #${name}`
  }
  return name
}
