export const normalizeAuthEmail = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    return trimmed
  }
  if (trimmed.includes("@")) {
    return trimmed
  }
  return `${trimmed}@eval.local`
}
