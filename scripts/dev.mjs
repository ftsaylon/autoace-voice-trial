import { spawn } from "node:child_process"
import { createServer } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const host = process.env.HOST ?? "0.0.0.0"
const preferredPort = Number(process.env.PORT) || 43123

const getFreePort = (port) =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on("error", (error) => {
      if (error && "code" in error && error.code === "EADDRINUSE") {
        resolve(getFreePort(port + 1))
        return
      }
      reject(error)
    })
    server.listen(port, host, () => {
      const address = server.address()
      const found = typeof address === "object" && address ? address.port : port
      server.close((closeError) => {
        if (closeError) {
          reject(closeError)
          return
        }
        resolve(found)
      })
    })
  })

const port = await getFreePort(preferredPort)
if (port !== preferredPort) {
  console.log(`Port ${preferredPort} is in use. Starting on http://localhost:${port}`)
}

const nextBin = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  ".bin",
  "next",
)

const child = spawn(nextBin, ["dev", "--hostname", host, "--port", String(port)], {
  stdio: "inherit",
})

const handleStop = (signal) => {
  child.kill(signal)
}

process.on("SIGINT", handleStop)
process.on("SIGTERM", handleStop)

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
