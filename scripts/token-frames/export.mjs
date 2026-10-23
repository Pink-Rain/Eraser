// Exporte les cadres de tokens du moteur de ClaudeIcones en images (public/token-frames).
// Le moteur ne tourne jamais dans Eraser : il faut ~25 s pour dessiner les cadres, l'appli
// ne fait que superposer les images (calque derrière, portrait, calque devant).
//
//   node scripts/token-frames/export.mjs <dossier ClaudeIcones>
//
// Playwright n'est pas une dépendance d'Eraser : PLAYWRIGHT_MODULE désigne un
// node_modules qui le contient, CHROMIUM_PATH un Chromium déjà installé si besoin.
// Les rayons affichés à la fin sont ceux de `lib/token-frames.ts`.
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"

const source = process.argv[2]
if (!source) throw new Error("Usage : node scripts/token-frames/export.mjs <dossier ClaudeIcones>")
const require = createRequire(process.env.PLAYWRIGHT_MODULE ? join(process.env.PLAYWRIGHT_MODULE, "/") : import.meta.url)
const { chromium } = require("playwright")

const work = await mkdtemp(join(tmpdir(), "eraser-token-frames-"))
await cp(join(source, "moteur"), work, { recursive: true })
await cp(new URL("./export.html", import.meta.url), join(work, "export.html"))
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const page = await browser.newPage()
page.on("pageerror", (error) => console.error("Erreur du moteur :", error.message))
await page.goto(`file://${join(work, "export.html")}`)
await page.waitForFunction(() => document.title === "ready")
const out = await page.evaluate(() => window.exportAll())
await browser.close()
await rm(work, { recursive: true, force: true })

const target = join(process.cwd(), "public", "token-frames")
await mkdir(target, { recursive: true })
const save = (name, dataUrl) => writeFile(join(target, `${name}.webp`), Buffer.from(dataUrl.split(",")[1], "base64"))
const baseNames = { vividBlue: "vivid-blue", blue: "enamel-blue", red: "enamel-red", gold: "gold" }
const radii = {}
for (const [group, entries] of Object.entries({ base: out.base, special: out.epic, door: out.door })) {
  for (const [id, layers] of Object.entries(entries)) {
    const name = group === "base" ? id.replace(/^[a-zA-Z]+/, (material) => baseNames[material]) : `${group}-${id}`
    await save(name, layers.front)
    if (layers.back) await save(`${name}-back`, layers.back)
    radii[name] = { radius: layers.radius, back: Boolean(layers.back) }
  }
}
for (const [id, dataUrl] of Object.entries(out.interior)) await save(`interior-${id}`, dataUrl)
console.log(JSON.stringify(radii, null, 1))
