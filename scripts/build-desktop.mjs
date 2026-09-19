import { spawn } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createPackage } from "@electron/asar"

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

const launcher = join(root, "dist", "standalone", "server.js")
const launcherSource = await readFile(launcher, "utf8")
const patchedLauncher = launcherSource.replace(
  'outDir: join(import.meta.dirname, "dist"),',
  'outDir: process.env.ERASER_SERVER_OUT_DIR || join(import.meta.dirname, "dist"),',
)
if (patchedLauncher === launcherSource) {
  throw new Error("Le lanceur autonome n’a pas pu être adapté au paquet Windows.")
}
await writeFile(launcher, patchedLauncher, "utf8")

const archive = join(root, "dist", "eraser-server.asar")
await createPackage(join(root, "dist", "standalone"), archive)
console.log(`Serveur autonome emballé dans ${archive}`)
