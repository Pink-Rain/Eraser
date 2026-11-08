/**
 * Les extensions d'Eraser : des morceaux de l'application qui vivent dans leur propre dépôt
 * GitHub, publiés à part, téléchargés et mis à jour par chaque installation sans réinstaller
 * Eraser. Règles pures, communes à la page d'administration, au serveur et aux tests ; le
 * téléchargement est dans lib/extensions-install.ts, les réglages dans lib/extensions-store.ts.
 *
 * Une extension est liée à Eraser ici, dans le code, jamais depuis l'application. Toutes les
 * installations reçoivent toutes les extensions liées, et tout compte connecté peut ouvrir leur
 * adresse : les droits se règlent par module, dans chaque extension (selon `eraser.account`), et
 * les API d'Eraser les vérifient toujours. Ne jamais renommer un identifiant déjà lié : il nomme
 * le dossier d'installation, l'adresse de la page et ses données sur le serveur partagé.
 *
 * Format d'une version publiée (Releases GitHub du dépôt de l'extension) :
 * - `eraser-extension.json` : le manifeste (`ExtensionManifest`) ;
 * - le paquet qu'il nomme (`eraser-extension.pack.gz` d'office) : un JSON compressé (gzip)
 *   `{ format: "eraser-extension-pack", files: { "main.js": "<base64>", … } }`, que
 *   `scripts/pack-extension.mjs` fabrique. Son empreinte SHA-256 est dans le manifeste.
 */

/**
 * La version de ce qu'Eraser offre aux extensions (`window.EraserExtensions`, l'objet donné à
 * `mount`, le contexte de leur partie serveur). Une extension qui en demande une plus récente
 * attend qu'Eraser soit à jour. À incrémenter quand on ajoute quelque chose dont une extension
 * aura besoin ; ne jamais retirer ce qu'une version précédente offrait.
 */
export const EXTENSION_API_VERSION = 2

export const EXTENSION_MANIFEST_ASSET = "eraser-extension.json"
export const EXTENSION_PACK_ASSET = "eraser-extension.pack.gz"
export const EXTENSION_PACK_FORMAT = "eraser-extension-pack"

export type ExtensionDefinition = {
  /** Identifiant stable : dossier d'installation, adresse `/extension/<id>`, clé des réglages. */
  id: string
  name: string
  description: string
  /** Le dépôt GitHub public qui publie l'extension (« Propriétaire/Nom »). */
  repository: string
}

/** Les extensions liées à Eraser. Une nouvelle s'ajoute ici, avec son dépôt. */
export const linkedExtensions: ExtensionDefinition[] = [
  { id: "doc", name: "Eraser Doc", description: "Les documents de campagne : lettres, affiches, parchemins à donner aux joueurs.", repository: "Pink-Rain/Eraser_doc" },
  { id: "map", name: "Eraser Map", description: "Le tabletop : cartes, tokens et table partagée en direct.", repository: "Pink-Rain/Eraser_map" },
  { id: "page", name: "Eraser Page", description: "L'atelier des pages : créer et modifier les pages d'Eraser et le menu.", repository: "Pink-Rain/Eraser_page" },
]

export function linkedExtension(id: string): ExtensionDefinition | null {
  return linkedExtensions.find((extension) => extension.id === id) ?? null
}

export type ExtensionManifest = {
  id: string
  version: string
  /** La version d'`EXTENSION_API_VERSION` dont l'extension a besoin. */
  api: number
  /** Le module chargé par la page : il exporte `mount(élément, eraser)`. */
  entry: string
  /** Feuilles de style posées avec la page. */
  styles: string[]
  /** Partie serveur facultative : un module qui exporte `default.fetch(requête, eraser)` ou `handle`. */
  server: string | null
  /** Le nom du paquet parmi les fichiers de la version publiée. */
  pack: string
  sha256: string
}

/** Un manifeste relu, ou null s'il est incomplet ou désigne un chemin hors de l'extension. */
export function parseExtensionManifest(value: unknown): ExtensionManifest | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  const version = typeof raw.version === "string" ? raw.version.trim().replace(/^v/i, "") : ""
  const api = typeof raw.api === "number" && Number.isInteger(raw.api) && raw.api >= 1 ? raw.api : 0
  const entry = typeof raw.entry === "string" ? safeExtensionPath(raw.entry) : null
  const styles = Array.isArray(raw.styles) ? raw.styles.map((style) => (typeof style === "string" ? safeExtensionPath(style) : null)) : []
  // Absente : pas de partie serveur. Présente mais hors du dossier : manifeste refusé.
  const server = raw.server === undefined || raw.server === null || raw.server === "" ? null : (typeof raw.server === "string" && safeExtensionPath(raw.server)) || undefined
  const pack = raw.pack === undefined ? EXTENSION_PACK_ASSET : typeof raw.pack === "string" && /^[\w.-]+$/.test(raw.pack) ? raw.pack : ""
  const sha256 = typeof raw.sha256 === "string" && /^[0-9a-f]{64}$/i.test(raw.sha256) ? raw.sha256.toLowerCase() : ""
  if (!/^[a-z0-9-]+$/.test(id) || !parseVersion(version) || !api || !entry || styles.some((style) => !style) || server === undefined || !pack || !sha256) return null
  return { id, version, api, entry, styles: styles as string[], server, pack, sha256 }
}

/**
 * Un chemin de fichier de l'extension, relatif et sans détour (« .. », chemin absolu, lecteur
 * Windows, barre oblique inverse) : null sinon. Rien d'une extension n'est écrit ni lu hors de
 * son dossier.
 */
export function safeExtensionPath(value: string): string | null {
  const path = value.trim()
  if (!path || path.length > 300 || path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[a-z]:/i.test(path)) return null
  const parts = path.split("/")
  if (parts.some((part) => !part || part === "." || part === "..")) return null
  return parts.join("/")
}

/** « 1.2.3 », « v1.2.3 », « 1.2.3-alpha.4 » → [1, 2, 3, 4] ; une version finale passe après ses préversions. */
export function parseVersion(value: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9a-z]+\.(\d+))?$/i.exec(String(value || "").trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? Infinity : Number(match[4])]
}

export function compareVersions(left: string, right: string) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return 0
  for (let index = 0; index < 4; index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
  return 0
}

const contentTypes: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  html: "text/html; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  woff2: "font/woff2",
  woff: "font/woff",
  wasm: "application/wasm",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
}

export function extensionContentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? ""
  return contentTypes[extension] ?? "application/octet-stream"
}
