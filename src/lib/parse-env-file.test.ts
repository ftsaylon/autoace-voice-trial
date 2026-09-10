import { describe, expect, it } from "vitest"
import { mergeEnvSources, parseEnvFile, pickNonEmptyEnv } from "./parse-env-file"

describe("parseEnvFile", () => {
  it("skips comments, blanks, and empty values after trim", () => {
    const parsed = parseEnvFile(`
# comment
GOOGLE_GENERATIVE_AI_API_KEY="abc123"
GEMINI_MODEL=gemini-3.5-flash-lite
EMPTY=
WHITESPACE=   
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
`)
    expect(parsed.GOOGLE_GENERATIVE_AI_API_KEY).toBe("abc123")
    expect(parsed.GEMINI_MODEL).toBe("gemini-3.5-flash-lite")
    expect(parsed.EMPTY).toBe("")
    expect(parsed.WHITESPACE).toBe("")
    expect(parsed.NEXT_PUBLIC_CONVEX_URL).toBe("http://127.0.0.1:3210")
  })
})

describe("pickNonEmptyEnv", () => {
  it("drops empty and whitespace values", () => {
    expect(
      pickNonEmptyEnv(
        {
          GOOGLE_GENERATIVE_AI_API_KEY: " key ",
          GEMINI_API_KEY: "",
          GEMINI_MODEL: "   ",
        },
        ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL"],
      ),
    ).toEqual({ GOOGLE_GENERATIVE_AI_API_KEY: "key" })
  })
})

describe("mergeEnvSources", () => {
  it("lets .env.local win over process.env and ignores empty file values", () => {
    expect(
      mergeEnvSources(
        { GOOGLE_GENERATIVE_AI_API_KEY: "", GEMINI_MODEL: "from-file" },
        {
          GOOGLE_GENERATIVE_AI_API_KEY: "from-process",
          GEMINI_MODEL: "from-process",
        },
        ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_MODEL"],
      ),
    ).toEqual({
      GOOGLE_GENERATIVE_AI_API_KEY: "from-process",
      GEMINI_MODEL: "from-file",
    })
  })
})
