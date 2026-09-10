export const GEMINI_API_KEY_ENV_NAMES = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
] as const

export const GEMINI_MODEL_ENV_NAME = "GEMINI_MODEL"

export const GEMINI_SYNC_ENV_NAMES = [
  ...GEMINI_API_KEY_ENV_NAMES,
  GEMINI_MODEL_ENV_NAME,
] as const

export const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export const resolveGeminiApiKey = (override?: string): string | undefined => {
  const fromOverride = override?.trim()
  if (fromOverride) {
    return fromOverride
  }
  for (const name of GEMINI_API_KEY_ENV_NAMES) {
    const value = readEnv(name)
    if (value) {
      return value
    }
  }
  return undefined
}

export const classifierIsConfigured = (override?: string): boolean => {
  return Boolean(resolveGeminiApiKey(override))
}
