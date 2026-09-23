/* eslint-disable @typescript-eslint/no-require-imports */
// Mises à jour sans réinstallation.
//
// Presque chaque version ne change que le serveur local (eraser-server.asar) : les
// pages, les API, les migrations. L'enveloppe Electron (fenêtre, barre de titre,
// ce fichier) change rarement. Chaque préversion publie donc, à côté de
// l'installateur, le serveur seul (eraser-update.asar.gz) et sa description
// (eraser-update.json). Quand l'enveloppe installée sait le faire tourner, Eraser
// télécharge ce serveur, vérifie son empreinte, le range dans %APPDATA%/Eraser/updates
// et le démarre à la place de celui de l'installation. L'installateur n'est utilisé
// que si l'enveloppe elle-même a changé (champ `eraserShell` de package.json).
const { app, net } = require("electron")
// Le fs d'Electron traite les fichiers .asar comme des dossiers : pour écrire, lire
// ou supprimer une archive elle-même, il faut le fs d'origine.
const fs = require("original-fs")
const { createHash } = require("node:crypto")
const { join } = require("node:path")
const { gunzipSync } = require("node:zlib")

// Remplaçable uniquement pour les tests (un faux GitHub local).
const RELEASES_URL = process.env.ERASER_UPDATE_RELEASES_URL || "https://api.github.com/repos/Pink-Rain/Eraser/releases?per_page=20"
const MANIFEST_ASSET = "eraser-update.json"
/** Version de l'enveloppe installée. À incrémenter dès que desktop/ ou Electron change. */
const SHELL = Number(require("../package.json").eraserShell) || 1

function updatesDirectory() {
  return join(app.getPath("userData"), "updates")
}

/** « 0.1.1-alpha.52 » → [0, 1, 1, 52]. Une version finale passe après ses préversions. */
function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9a-z]+\.(\d+))?$/i.exec(String(value || "").trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? Infinity : Number(match[4])]
}

function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return 0
  for (let index = 0; index < 4; index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
  return 0
}

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

function writeJson(path, value) {
  fs.mkdirSync(updatesDirectory(), { recursive: true })
  fs.writeFileSync(path, JSON.stringify(value, null, 2), "utf8")
}

const currentPath = () => join(updatesDirectory(), "current.json")
const failedPath = () => join(updatesDirectory(), "failed.json")

/**
 * Le serveur téléchargé à utiliser au démarrage, s'il y en a un : plus récent que la
 * version installée, prévu pour cette enveloppe, présent sur le disque et jamais
 * tombé en panne.
 */
function activeBundle() {
  const current = readJson(currentPath())
  if (!current || typeof current.version !== "string" || typeof current.file !== "string") return null
  if (!(Number(current.shell) <= SHELL)) return null
  if (compareVersions(current.version, app.getVersion()) <= 0) return null
  if (readJson(failedPath())?.version === current.version) return null
  const path = join(updatesDirectory(), current.file)
  if (!fs.existsSync(path)) return null
  return { version: current.version, path }
}

/** Retire les serveurs téléchargés qui ne servent plus (un fichier ouvert reste en place). */
function cleanup() {
  const keep = activeBundle()
  let names = []
  try {
    names = fs.readdirSync(updatesDirectory())
  } catch {
    return
  }
  if (!keep) {
    try { fs.rmSync(currentPath(), { force: true }) } catch { /* rien à retirer */ }
  }
  for (const name of names) {
    if (!/\.asar(\.tmp)?$/.test(name)) continue
    if (keep && join(updatesDirectory(), name) === keep.path) continue
    try { fs.rmSync(join(updatesDirectory(), name), { force: true }) } catch { /* encore utilisé : au prochain démarrage */ }
  }
}

/** Ce serveur n'a pas démarré : on revient à la version installée et on ne le reprend plus. */
function markFailed(version) {
  writeJson(failedPath(), { version, failedAt: new Date().toISOString() })
}

async function fetchJson(url) {
  const response = await net.fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Eraser-desktop" }, cache: "no-store" })
  if (!response.ok) throw new Error(`GitHub a répondu ${response.status}.`)
  return response.json()
}

async function download(url) {
  const response = await net.fetch(url, { headers: { "User-Agent": "Eraser-desktop" }, cache: "no-store" })
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}).`)
  return Buffer.from(await response.arrayBuffer())
}

let pending = null

/**
 * Cherche la dernière version publiée. Renvoie :
 * - `none` : rien de plus récent que `runningVersion` ;
 * - `ready` : le nouveau serveur est téléchargé, vérifié et sera utilisé au prochain
 *   démarrage du serveur local ;
 * - `full` : cette version demande l'installateur (enveloppe modifiée, ou pas de
 *   serveur seul publié).
 */
function check(runningVersion) {
  pending ||= (async () => {
    const releases = await fetchJson(RELEASES_URL)
    const newest = (Array.isArray(releases) ? releases : [])
      .filter((release) => !release.draft && parseVersion(release.tag_name))
      .sort((left, right) => compareVersions(right.tag_name, left.tag_name))[0]
    if (!newest || compareVersions(newest.tag_name, runningVersion) <= 0) return { kind: "none" }
    const version = String(newest.tag_name).replace(/^v/i, "")
    const assets = Array.isArray(newest.assets) ? newest.assets : []
    const manifestAsset = assets.find((asset) => asset.name === MANIFEST_ASSET)
    if (!manifestAsset) return { kind: "full", version }
    const manifest = await fetchJson(manifestAsset.browser_download_url)
    if (manifest.version !== version || !(Number(manifest.shell) <= SHELL)) return { kind: "full", version }
    // Un serveur déjà tombé en panne ne sera pas repris : l'installateur prend le relais.
    if (readJson(failedPath())?.version === version) return { kind: "full", version }
    const file = `eraser-server-${version}.asar`
    const target = join(updatesDirectory(), file)
    const current = readJson(currentPath())
    if (current?.version === version && current.sha256 === manifest.sha256 && fs.existsSync(target)) return { kind: "ready", version }
    const bundleAsset = assets.find((asset) => asset.name === manifest.file)
    if (!bundleAsset) return { kind: "full", version }
    const archive = gunzipSync(await download(bundleAsset.browser_download_url))
    const sha256 = createHash("sha256").update(archive).digest("hex")
    if (sha256 !== manifest.sha256) throw new Error("Le fichier téléchargé est incomplet ou abîmé.")
    fs.mkdirSync(updatesDirectory(), { recursive: true })
    const temporary = `${target}.tmp`
    fs.writeFileSync(temporary, archive)
    fs.renameSync(temporary, target)
    writeJson(currentPath(), { version, file, shell: Number(manifest.shell), sha256, downloadedAt: new Date().toISOString() })
    return { kind: "ready", version }
  })().finally(() => { pending = null })
  return pending
}

module.exports = { SHELL, activeBundle, check, cleanup, compareVersions, markFailed }
