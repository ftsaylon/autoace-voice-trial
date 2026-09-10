import { afterEach, describe, expect, it } from "vitest"
import { classifierIsConfigured, resolveGeminiApiKey } from "./gemini-env"

const KEYS = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
] as const

const snapshot = Object.fromEntries(KEYS.map((name) => [name, process.env[name]]))

afterEach(() => {
  for (const name of KEYS) {
    if (snapshot[name] === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = snapshot[name]
    }
  }
})

describe("resolveGeminiApiKey", () => {
  it("prefers an explicit override", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "from-env"
    expect(resolveGeminiApiKey("  override  ")).toBe("override")
  })

  it("reads GOOGLE_GENERATIVE_AI_API_KEY with bracket access", () => {
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_API_KEY
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = " google-key "
    expect(resolveGeminiApiKey()).toBe("google-key")
    expect(classifierIsConfigured()).toBe(true)
  })

  it("falls back to GEMINI_API_KEY then GOOGLE_API_KEY", () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    delete process.env.GOOGLE_API_KEY
    process.env.GEMINI_API_KEY = "gemini-key"
    expect(resolveGeminiApiKey()).toBe("gemini-key")

    delete process.env.GEMINI_API_KEY
    process.env.GOOGLE_API_KEY = "google-api-key"
    expect(resolveGeminiApiKey()).toBe("google-api-key")
  })

  it("treats missing and whitespace-only values as unconfigured", () => {
    for (const name of KEYS) {
      process.env[name] = "   "
    }
    expect(resolveGeminiApiKey()).toBeUndefined()
    expect(classifierIsConfigured()).toBe(false)
    expect(classifierIsConfigured("")).toBe(false)
  })
})
