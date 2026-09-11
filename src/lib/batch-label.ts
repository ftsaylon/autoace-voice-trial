export const BATCH_CODE_PATTERN = /^\d{5}$/

export const isBatchCode = (name: string): boolean => {
  return BATCH_CODE_PATTERN.test(name.trim())
}

export type BatchLabelVariant = "full" | "compact"

export type BatchLabelParts = {
  codeLabel: string
  datasetName: string | null
}

export const getBatchLabelParts = (
  batch: { name: string; datasetName?: string | null },
  options?: { variant?: BatchLabelVariant },
): BatchLabelParts => {
  const name = batch.name.trim()
  const datasetName = batch.datasetName?.trim() || null
  const variant = options?.variant ?? "full"
  const codeLabel = isBatchCode(name)
    ? variant === "compact"
      ? `#${name}`
      : `Batch #${name}`
    : name
  return { codeLabel, datasetName }
}

export const formatBatchLabel = (
  batch: { name: string; datasetName?: string | null },
  options?: { variant?: BatchLabelVariant },
): string => {
  const { codeLabel, datasetName } = getBatchLabelParts(batch, options)
  if (datasetName) {
    return `${codeLabel} · ${datasetName}`
  }
  return codeLabel
}

export const joinBatchMeta = (
  ...parts: Array<string | null | undefined | false>
): string => {
  return parts.filter((part): part is string => Boolean(part)).join(" · ")
}
