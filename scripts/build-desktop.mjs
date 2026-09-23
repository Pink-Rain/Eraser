import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
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

// Les migrations voyagent avec le serveur : une mise à jour sans réinstallation
// (desktop/hot-update.cjs) apporte ainsi les siennes.
await cp(join(root, "drizzle"), join(root, "dist", "standalone", "migrations"), { recursive: true })

const archive = join(root, "dist", "eraser-server.asar")
await createPackage(join(root, "dist", "standalone"), archive)
console.log(`Serveur autonome emballé dans ${archive}`)

// Le serveur seul, compressé, et sa description : c'est ce que télécharge une
// installation existante pour se mettre à jour sans relancer l'installateur.
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
const bytes = await readFile(archive)
const updateFile = "eraser-update.asar.gz"
await writeFile(join(root, "dist", updateFile), gzipSync(bytes, { level: 9 }))
await writeFile(join(root, "dist", "eraser-update.json"), JSON.stringify({
  version: packageJson.version,
  shell: Number(packageJson.eraserShell) || 1,
  file: updateFile,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  size: bytes.length,
}, null, 2))
console.log(`Mise à jour sans réinstallation préparée : dist/${updateFile}`)
