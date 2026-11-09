/**
 * Téléchargement et installation des extensions (lib/extensions.ts), sur l'ordinateur qui fait
 * tourner ce serveur : même principe que les mises à jour sans réinstallation
 * (desktop/hot-update.cjs). La dernière version publiée dans les Releases GitHub du dépôt de
 * l'extension est téléchargée, son empreinte vérifiée, puis rangée dans
 * `<données>/extensions/<id>/<version>/` ; `current.json` désigne celle qui sert. La version
 * d'avant reste à côté ; les plus anciennes sont effacées.
 *
 * Tout se passe dans le serveur local : aucune enveloppe Electron à changer pour qu'une
 * extension arrive ou se mette à jour. Seuls les fichiers de l'extension sont écrits, jamais
 * hors de son dossier.
 */
import { createHash, randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { gunzipSync } from "node:zlib"

import {
  compareVersions,
  linkedExtensions,
  EXTENSION_API_VERSION,
  EXTENSION_MANIFEST_ASSET,
  EXTENSION_PACK_FORMAT,
  manifestFiles,
  parseExtensionManifest,
  safeExtensionPath,
  type ExtensionDefinition,
  type ExtensionManifest,
} from "@/lib/extensions"
import { discardResponse, timedFetch } from "@/lib/timed-fetch"

const RELEASES_TIMEOUT_MS = 15_000
const DOWNLOAD_TIMEOUT_MS = 120_000
/** GitHub limite les lectures anonymes (60 par heure et par adresse) : une réponse sert 10 min. */
const PUBLISHED_FRESH_MS = 10 * 60_000
const MAX_PACK_BYTES = 60 * 1024 * 1024

/** Le dossier des extensions de cette installation ; null hors de l'application Windows. */
export function extensionsDirectory(): string | null {
  if (process.env.ERASER_EXTENSIONS_DIR) return process.env.ERASER_EXTENSIONS_DIR
  const data = process.env.ERASER_DESKTOP_DATA_DIR
  return data ? join(data, "extensions") : null
}

/** Les Releases du dépôt ; remplaçable pour les tests (un faux GitHub local, « {repo} » dans l'adresse). */
function releasesUrl(repository: string) {
  const template = process.env.ERASER_EXTENSIONS_RELEASES_URL
  return template ? template.replace("{repo}", repository) : `https://api.github.com/repos/${repository}/releases?per_page=10`
}

const githubHeaders = { Accept: "application/vnd.github+json", "User-Agent": "Eraser-desktop" }

export type PublishedExtension =
  | { status: "published"; version: string; api: number; manifest: ExtensionManifest; packUrl: string }
  /** Le dépôt répond mais n'a encore rien publié. */
  | { status: "none" }
  /** Dépôt absent ou privé, GitHub injoignable. */
  | { status: "unreachable"; error: string }
  /** Une version publiée qu'Eraser ne sait pas lire (manifeste ou paquet manquant, autre extension). */
  | { status: "invalid"; error: string }

type GithubRelease = { draft?: boolean; assets?: Array<{ name?: string; browser_download_url?: string }> }

const publishedCache = new Map<string, { at: number; value: Promise<PublishedExtension> }>()

/**
 * La dernière version publiée d'une extension (gardée 10 min). `force` relit GitHub, sauf si la
 * dernière lecture a moins de `forceFloorMs` (le bouton que tout le monde peut cliquer).
 */
export function latestPublished(definition: ExtensionDefinition, force = false, forceFloorMs = 0): Promise<PublishedExtension> {
  const cached = publishedCache.get(definition.id)
  if (cached && Date.now() - cached.at < (force ? forceFloorMs : PUBLISHED_FRESH_MS)) return cached.value
  const value = readLatestPublished(definition)
  publishedCache.set(definition.id, { at: Date.now(), value })
  // Une panne de réseau ne reste pas en mémoire 10 min : la prochaine demande réessaie.
  void value.then((result) => { if (result.status === "unreachable" && publishedCache.get(definition.id)?.value === value) publishedCache.delete(definition.id) })
  return value
}

async function readLatestPublished(definition: ExtensionDefinition): Promise<PublishedExtension> {
  let releases: GithubRelease[]
  try {
    const response = await timedFetch(releasesUrl(definition.repository), { headers: githubHeaders }, RELEASES_TIMEOUT_MS, "EXTENSION_RELEASES")
    if (response.status === 404) { await discardResponse(response); return { status: "unreachable", error: "Dépôt introuvable : il n'existe pas ou n'est pas public." } }
    if (!response.ok) { await discardResponse(response); return { status: "unreachable", error: `GitHub a répondu ${response.status}.` } }
    releases = await response.json() as GithubRelease[]
  } catch {
    return { status: "unreachable", error: "GitHub ne répond pas (pas de connexion à Internet ?)." }
  }
  if (!Array.isArray(releases)) return { status: "unreachable", error: "Réponse de GitHub illisible." }
  // GitHub range les versions de la plus récente à la plus ancienne.
  const release = releases.find((entry) => !entry.draft && entry.assets?.some((asset) => asset.name === EXTENSION_MANIFEST_ASSET))
  if (!release) return { status: "none" }
  const assetUrl = (name: string) => release.assets?.find((asset) => asset.name === name)?.browser_download_url ?? null
  let manifest: ExtensionManifest | null
  try {
    const response = await timedFetch(assetUrl(EXTENSION_MANIFEST_ASSET)!, { headers: { "User-Agent": githubHeaders["User-Agent"] } }, RELEASES_TIMEOUT_MS, "EXTENSION_MANIFEST")
    if (!response.ok) { await discardResponse(response); return { status: "unreachable", error: `Manifeste : GitHub a répondu ${response.status}.` } }
    manifest = parseExtensionManifest(await response.json())
  } catch {
    return { status: "unreachable", error: `GitHub ne répond pas ou ${EXTENSION_MANIFEST_ASSET} est illisible.` }
  }
  if (!manifest) return { status: "invalid", error: `${EXTENSION_MANIFEST_ASSET} est incomplet ou illisible.` }
  if (manifest.id !== definition.id) return { status: "invalid", error: `${EXTENSION_MANIFEST_ASSET} décrit l'extension « ${manifest.id} », pas « ${definition.id} ».` }
  const packUrl = assetUrl(manifest.pack)
  if (!packUrl) return { status: "invalid", error: `La version ${manifest.version} n'a pas de fichier ${manifest.pack}.` }
  return { status: "published", version: manifest.version, api: manifest.api, manifest, packUrl }
}

export type InstalledExtension = {
  id: string
  version: string
  api: number
  /** Le module de ses pages ; null : l'extension n'a pas de page (API 3). */
  entry: string | null
  styles: string[]
  /** Le module lancé au démarrage, sur toutes les pages (API 3). */
  boot: string | null
  /** Ses feuilles de style posées sur toutes les pages (API 3). */
  globalStyles: string[]
  server: string | null
  installedAt: string
  /** Le dossier de cette version. */
  directory: string
}

type CurrentFile = { version: string; manifest: ExtensionManifest; installedAt: string; previous?: string | null }

function extensionDirectory(id: string) {
  const root = extensionsDirectory()
  return root && /^[a-z0-9-]+$/.test(id) ? join(root, id) : null
}

async function readCurrent(id: string): Promise<CurrentFile | null> {
  const directory = extensionDirectory(id)
  if (!directory) return null
  try {
    const value = JSON.parse(await readFile(join(directory, "current.json"), "utf8")) as Partial<CurrentFile>
    const manifest = parseExtensionManifest(value.manifest)
    if (!manifest || manifest.id !== id || typeof value.version !== "string" || value.version !== manifest.version) return null
    return { version: value.version, manifest, installedAt: typeof value.installedAt === "string" ? value.installedAt : "", previous: typeof value.previous === "string" ? value.previous : null }
  } catch {
    return null
  }
}

/**
 * Les extensions installées sur cet ordinateur, gardées en mémoire pour la coque (rien n'est lu à
 * chaque page) : lues une fois au premier appel, tenues à jour par chaque installation.
 */
let installedForShell: Map<string, InstalledExtension> | null = null
let installedReading: Promise<void> | null = null

function readInstalledForShell() {
  if (!installedReading) {
    const found = new Map<string, InstalledExtension>()
    installedForShell = found
    installedReading = Promise.all(linkedExtensions.map(async (extension) => {
      const installed = await readInstalledExtension(extension.id).catch(() => null)
      if (installed && !found.has(extension.id)) found.set(extension.id, installed)
    })).then(() => undefined, () => undefined)
  }
  return installedReading
}

export function knownInstalledVersions(): Array<{ id: string; version: string }> {
  void readInstalledForShell()
  return [...installedForShell!.values()].map(({ id, version }) => ({ id, version }))
}

/** Ce que la coque lance sur toutes les pages : une extension qu'Eraser sait faire tourner, son module de démarrage et ses styles. */
export type ShellExtension = { id: string; version: string; boot: string | null; globalStyles: string[] }

/**
 * Les extensions installées pour la coque (app/layout.tsx). Le premier appel attend la lecture du
 * disque (quelques fichiers `current.json`, une fois par lancement) : dès la première page, les
 * styles d'une extension sont posés avant l'affichage.
 */
export async function shellExtensions(): Promise<ShellExtension[]> {
  await readInstalledForShell()
  return [...installedForShell!.values()]
    .filter((installed) => installed.api <= EXTENSION_API_VERSION)
    .map(({ id, version, boot, globalStyles }) => ({ id, version, boot, globalStyles }))
}

/** La version installée sur cet ordinateur, si son point d'entrée (page ou démarrage) est bien là. */
export async function readInstalledExtension(id: string): Promise<InstalledExtension | null> {
  const directory = extensionDirectory(id)
  const current = await readCurrent(id)
  if (!directory || !current) return null
  const versionDirectory = join(directory, current.version)
  const { manifest } = current
  // Son point d'entrée (sa page, sinon son module de démarrage) doit être là.
  const entry = await stat(join(versionDirectory, ...(manifest.entry ?? manifest.boot ?? "").split("/"))).catch(() => null)
  if (!entry?.isFile()) return null
  return { id, version: manifest.version, api: manifest.api, entry: manifest.entry, styles: manifest.styles, boot: manifest.boot, globalStyles: manifest.globalStyles, server: manifest.server, installedAt: current.installedAt, directory: versionDirectory }
}

/**
 * Le chemin d'un fichier d'une version installée (la version servie ou la précédente, qu'une
 * page ouverte avant la mise à jour peut encore demander) ; null hors du dossier ou absent.
 */
export async function extensionFile(id: string, version: string, path: string): Promise<string | null> {
  const directory = extensionDirectory(id)
  const safe = safeExtensionPath(path)
  if (!directory || !safe || !/^[0-9a-z.+-]+$/i.test(version) || version.startsWith(".")) return null
  const file = join(directory, version, ...safe.split("/"))
  const info = await stat(file).catch(() => null)
  return info?.isFile() ? file : null
}

/** Les fichiers d'un paquet décompressé, ou null s'il n'en est pas un ou sort de son dossier. */
export function parseExtensionPack(text: string): Map<string, Uint8Array> | null {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  if (!raw || typeof raw !== "object" || (raw as { format?: unknown }).format !== EXTENSION_PACK_FORMAT) return null
  const files = (raw as { files?: unknown }).files
  if (!files || typeof files !== "object" || Array.isArray(files)) return null
  const result = new Map<string, Uint8Array>()
  for (const [name, content] of Object.entries(files as Record<string, unknown>)) {
    const path = safeExtensionPath(name)
    if (!path || typeof content !== "string") return null
    result.set(path, Uint8Array.from(Buffer.from(content, "base64")))
  }
  return result.size ? result : null
}

async function installPublished(definition: ExtensionDefinition, published: Extract<PublishedExtension, { status: "published" }>): Promise<InstalledExtension> {
  const directory = extensionDirectory(definition.id)
  if (!directory) throw new Error("Les extensions ne s'installent que dans l'application Windows.")
  const { manifest } = published
  const response = await timedFetch(published.packUrl, { headers: { "User-Agent": githubHeaders["User-Agent"] } }, DOWNLOAD_TIMEOUT_MS, "EXTENSION_DOWNLOAD")
  if (!response.ok) { await discardResponse(response); throw new Error(`Téléchargement refusé par GitHub (${response.status}).`) }
  const packed = Buffer.from(await response.arrayBuffer())
  if (packed.length > MAX_PACK_BYTES) throw new Error("Paquet trop lourd.")
  if (createHash("sha256").update(packed).digest("hex") !== manifest.sha256) throw new Error("L'empreinte du paquet ne correspond pas au manifeste : rien n'a été installé.")
  let files: Map<string, Uint8Array> | null
  try { files = parseExtensionPack(gunzipSync(packed).toString("utf8")) } catch { files = null }
  if (!files) throw new Error("Paquet illisible.")
  for (const needed of manifestFiles(manifest)) {
    if (!files.has(needed)) throw new Error(`Le paquet n'a pas ${needed}.`)
  }

  await mkdir(directory, { recursive: true })
  const staging = join(directory, `.installation-${randomUUID()}`)
  try {
    for (const [path, content] of files) {
      const target = join(staging, ...path.split("/"))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content)
    }
    const final = join(directory, manifest.version)
    await rm(final, { recursive: true, force: true })
    await rename(staging, final)
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }

  const previous = (await readCurrent(definition.id))?.version ?? null
  const current: CurrentFile = { version: manifest.version, manifest, installedAt: new Date().toISOString(), previous: previous === manifest.version ? null : previous }
  const temporary = join(directory, `current.${randomUUID()}.json`)
  await writeFile(temporary, JSON.stringify(current, null, 2), "utf8")
  await rename(temporary, join(directory, "current.json"))
  await cleanup(directory, [current.version, current.previous ?? ""])
  const installed = await readInstalledExtension(definition.id)
  if (!installed) throw new Error("L'extension installée est introuvable.")
  installedForShell?.set(definition.id, installed)
  return installed
}

/** Efface les versions qui ne servent plus et les installations interrompues. */
async function cleanup(directory: string, keep: string[]) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || keep.includes(entry.name)) continue
    await rm(join(directory, entry.name), { recursive: true, force: true }).catch(() => undefined)
  }
}

export type ExtensionCheck = {
  published: PublishedExtension
  installed: InstalledExtension | null
  /** Publiée pour une version plus récente d'Eraser : elle attend la mise à jour d'Eraser. */
  needsNewerEraser: boolean
  error: string | null
  checkedAt: string
}

const running = new Map<string, Promise<ExtensionCheck>>()
const lastChecks = new Map<string, ExtensionCheck>()

/** La dernière vérification faite par ce serveur pour une extension (pour l'administration). */
export function lastExtensionCheck(id: string) {
  return lastChecks.get(id) ?? null
}

/**
 * Installe ou met à jour une extension si une version plus récente, faite pour cette version
 * d'Eraser, est publiée. Une seule à la fois par extension ; une erreur laisse la version
 * installée en place.
 */
export function updateExtension(definition: ExtensionDefinition, options: { force?: boolean; forceFloorMs?: number } = {}): Promise<ExtensionCheck> {
  const pending = running.get(definition.id)
  if (pending) return pending
  const work = (async (): Promise<ExtensionCheck> => {
    const [published, installed] = await Promise.all([latestPublished(definition, options.force, options.forceFloorMs), readInstalledExtension(definition.id)])
    const result: ExtensionCheck = { published, installed, needsNewerEraser: false, error: null, checkedAt: new Date().toISOString() }
    if (published.status !== "published") return result
    if (published.api > EXTENSION_API_VERSION) return { ...result, needsNewerEraser: true }
    if (installed && compareVersions(published.version, installed.version) <= 0) return result
    try {
      return { ...result, installed: await installPublished(definition, published) }
    } catch (error) {
      return { ...result, error: error instanceof Error ? error.message : "Installation impossible." }
    }
  })()
  running.set(definition.id, work)
  return work.then((result) => { lastChecks.set(definition.id, result); return result }).finally(() => running.delete(definition.id))
}

// L'import natif de Node, hors de la compilation : la partie serveur d'une extension est un
// fichier du disque, inconnu au moment de construire Eraser.
const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<Record<string, unknown>>

type ServerHandler = (request: Request, eraser: unknown) => unknown

/** Fait répondre la partie serveur d'une extension installée (`default.fetch`, `handle` ou `default`). */
export async function runExtensionServer(installed: InstalledExtension, request: Request, eraser: unknown): Promise<Response> {
  if (!installed.server) return new Response("Cette extension n'a pas de partie serveur.", { status: 404 })
  const loaded = await nativeImport(pathToFileURL(join(installed.directory, ...installed.server.split("/"))).href)
  const fallback = loaded.default as { fetch?: ServerHandler } | ServerHandler | undefined
  const target = typeof fallback === "object" && fallback && typeof fallback.fetch === "function" ? fallback : null
  const handler = target ? target.fetch! : typeof loaded.handle === "function" ? loaded.handle as ServerHandler : typeof fallback === "function" ? fallback : null
  if (!handler) return new Response("La partie serveur de cette extension n'exporte ni `default.fetch` ni `handle`.", { status: 500 })
  const response = await handler.call(target ?? loaded, request, eraser)
  return response instanceof Response ? response : new Response("La partie serveur de cette extension n'a pas rendu de réponse.", { status: 500 })
}
