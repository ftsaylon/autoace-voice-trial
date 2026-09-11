import { defineApp } from "convex/server"
import { v } from "convex/values"

const app = defineApp({
  env: {
    GOOGLE_GENERATIVE_AI_API_KEY: v.optional(v.string()),
    GEMINI_API_KEY: v.optional(v.string()),
    GOOGLE_API_KEY: v.optional(v.string()),
    GEMINI_MODEL: v.optional(v.string()),
  },
})

export default app
