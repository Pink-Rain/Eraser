import { spawn } from "node:child_process"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"

const root = process.cwd()
const vinext = join(root, "node_modules", "vinext", "dist", "cli.js")

await mkdir(join(root, "release"), { recursive: true })
await rm(join(root, "dist"), { recursive: true, force: true })

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

console.log(`Serveur autonome préparé dans ${join(root, "dist", "standalone")}`)
