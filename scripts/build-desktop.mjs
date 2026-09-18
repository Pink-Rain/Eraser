import { spawn } from "node:child_process"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { createPackage } from "@electron/asar"

const root = process.cwd()
const vinext = join(root, "node_modules", "vinext", "dist", "cli.js")

await mkdir(join(root, "release"), { recursive: true })

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [vinext, "build"], {
    cwd: root,
    env: {
      ...process.env,
      ERASER_DESKTOP: "1",
      NODE_ENV: "production",
    },
    stdio: "inherit",
  })
  child.once("error", reject)
  child.once("exit", (code, signal) => {
    if (signal) return reject(new Error(`Compilation interrompue par ${signal}.`))
    if (code !== 0) return reject(new Error(`La compilation Windows a échoué (code ${code ?? "inconnu"}).`))
    resolve()
  })
})

const archive = join(root, "dist", "eraser-server.asar")
await rm(archive, { force: true })
await createPackage(join(root, "dist", "standalone"), archive)
console.log(`Serveur autonome emballé dans ${archive}`)
