import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"

const root = process.cwd()
const vinext = join(root, "node_modules", "vinext", "dist", "cli.js")

await mkdir(join(root, "release"), { recursive: true })

const child = spawn(process.execPath, [vinext, "build"], {
  cwd: root,
  env: {
    ...process.env,
    ERASER_DESKTOP: "1",
    NODE_ENV: "production",
  },
  stdio: "inherit",
})

child.on("error", (error) => {
  console.error("Impossible de démarrer la compilation Windows.", error)
  process.exitCode = 1
})

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Compilation interrompue par ${signal}.`)
    process.exitCode = 1
    return
  }
  process.exitCode = code ?? 1
})
