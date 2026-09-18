import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = process.cwd()
const serverDirectory = join(root, "dist", "standalone")
const dataDirectory = await mkdtemp(join(tmpdir(), "eraser-desktop-test-"))
let child
let logs = ""

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      probe.close(() => resolve(address.port))
    })
  })
}

async function waitFor(url) {
  let lastError
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child?.exitCode !== null) throw new Error(`Le serveur local s’est arrêté avec le code ${child?.exitCode}.`)
    try {
      const response = await fetch(url, { redirect: "manual" })
      if (response.status < 500) return response.status
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError || new Error("Le serveur local n’a pas répondu.")
}

try {
  const port = await freePort()
  child = spawn(process.execPath, [join(serverDirectory, "server.js")], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      ERASER_DESKTOP: "1",
      ERASER_DESKTOP_DATA_DIR: dataDirectory,
      ERASER_MIGRATIONS_DIR: join(root, "drizzle"),
      GOOGLE_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.on("data", (chunk) => { logs += String(chunk) })
  child.stderr.on("data", (chunk) => { logs += String(chunk) })
  const status = await waitFor(`http://127.0.0.1:${port}/connexion`)
  console.log(`Serveur local Eraser vérifié (HTTP ${status}).`)
} catch (error) {
  if (logs.trim()) console.error(logs.trim())
  console.error(error)
  throw error
} finally {
  if (child && child.exitCode === null) {
    const stopped = new Promise((resolve) => child.once("exit", resolve))
    child.kill()
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
  }
  await rm(dataDirectory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
}
