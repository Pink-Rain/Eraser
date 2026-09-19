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

const staticCacheRuntime = join(
  root,
  "dist",
  "standalone",
  "node_modules",
  "vinext",
  "dist",
  "server",
  "static-file-cache.js",
)
const staticCacheSource = await readFile(staticCacheRuntime, "utf8")
const patchedStaticCache = staticCacheSource.replace(
  "relativePath: path.relative(base, batch[j]),",
  'relativePath: path.relative(base, batch[j]).split(path.sep).join("/"),',
)
if (patchedStaticCache === staticCacheSource) {
  throw new Error("Le serveur Windows n’a pas pu être adapté aux chemins de fichiers Windows.")
}
await writeFile(staticCacheRuntime, patchedStaticCache, "utf8")

const archive = join(root, "dist", "eraser-server.asar")
await createPackage(join(root, "dist", "standalone"), archive)
console.log(`Serveur autonome emballé dans ${archive}`)
