import { readFile } from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { GEMINI_SYNC_ENV_NAMES } from "../src/adapters/gemini/gemini-env"
import { mergeEnvSources, parseEnvFile } from "../src/lib/parse-env-file"

const root = process.cwd()
const envPath = path.join(root, ".env.local")

const runConvex = (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn("npx", ["convex", ...args], {
      cwd: root,
      env: process.env,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })

const currentConvexValue = async (name: string): Promise<string | undefined> => {
  const result = await runConvex(["env", "get", name])
  if (result.code !== 0) {
    return undefined
  }
  const value = result.stdout.trim()
  return value ? value : undefined
}

const main = async () => {
  const fileEnv = await readFile(envPath, "utf8")
    .then(parseEnvFile)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return {} as Record<string, string>
      }
      throw error
    })

  const toSync = mergeEnvSources(fileEnv, process.env, GEMINI_SYNC_ENV_NAMES)

  if (Object.keys(toSync).length === 0) {
    console.warn(
      "No Gemini keys in .env.local. Fusion will fail until GOOGLE_GENERATIVE_AI_API_KEY is set on the Convex deployment.",
    )
    return
  }

  for (const [name, value] of Object.entries(toSync)) {
    const existing = await currentConvexValue(name)
    if (existing === value) {
      console.log(`Convex env ${name} already matches .env.local`)
      continue
    }
    const result = await runConvex(["env", "set", `${name}=${value}`])
    if (result.code !== 0) {
      console.warn(`Could not set Convex env ${name}: ${result.stderr || result.stdout}`)
      continue
    }
    console.log(`Synced ${name} to the Convex deployment`)
  }
}

main().catch((error: unknown) => {
  console.warn(
    "Could not sync Gemini env to Convex:",
    error instanceof Error ? error.message : error,
  )
})
