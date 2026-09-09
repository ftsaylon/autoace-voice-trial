export const TRIAL_USERNAME = "autoace"
export const TRIAL_EMAIL = "autoace@eval.local"
export const TRIAL_PASSWORD = "trial-eval-2026"

export const normalizeAuthEmail = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    return trimmed
  }
  if (
    trimmed === TRIAL_USERNAME ||
    trimmed.toLowerCase() === TRIAL_EMAIL
  ) {
    return TRIAL_EMAIL
  }
  if (trimmed.includes("@")) {
    return trimmed
  }
  return `${trimmed}@eval.local`
}
