/**
 * Les dossiers du créateur de pages : un rangement commun à toute la table pour retrouver ses
 * pages quand il y en a des centaines. Des dossiers imbriqués (`parent`), et la place de chaque
 * page (`placement` : la clé de la page → l'identifiant de son dossier ; absente : non rangée).
 *
 * Une page d'Eraser se range comme une autre, sans être reprise dans l'atelier : sa clé est son
 * adresse (« eraser:/regles/combat »), et la page de l'atelier qui la remplace garde la même
 * (`folderKeyOf`) — reprendre, publier ou mettre à la corbeille ne la déplace pas.
 *
 * Le rangement ne touche jamais une page : supprimer un dossier remonte ses pages et ses
 * sous-dossiers dans son parent. Il se garde sur le serveur partagé (lib/page-folders-store.ts),
 * jamais dans Google Sheets.
 *
 * Règles pures : l'explorateur des pages, l'éditeur du menu, le serveur et les tests s'en servent.
 * L'explorateur applique une opération tout de suite (`applyFolderOps`), le serveur la refait sur
 * le rangement relu : deux admins qui rangent en même temps ne s'écrasent pas.
 */
import type { MenuFolderEntry, MenuPageEntry } from "@/lib/app-menu"

export type PageFolder = { id: string; name: string; parent: string; icon?: string; emoji?: string }
export type PageFolders = { folders: PageFolder[]; placement: Record<string, string>; updatedAt: string; updatedBy: string }

export type FolderOp =
  | { op: "create"; id: string; name: string; parent: string }
  | { op: "rename"; id: string; name: string }
  | { op: "icon"; id: string; icon?: string; emoji?: string }
  | { op: "move-folder"; id: string; parent: string }
  | { op: "delete"; id: string }
  | { op: "place"; keys: string[]; folder: string }

export const FOLDER_LIMITS = { folders: 500, name: 80, depth: 12, placements: 5_000, ops: 400 } as const

export const ERASER_PAGE_KEY_PREFIX = "eraser:"

const isFolderId = (value: unknown): value is string => typeof value === "string" && /^d-[a-z0-9]{4,24}$/.test(value)
/** Une clé de page : l'identifiant d'une page de l'atelier, ou « eraser: » et l'adresse d'une page d'Eraser. */
export const isPageKey = (value: unknown): value is string => typeof value === "string" && (/^[A-Za-z0-9_-]{2,48}$/.test(value) || /^eraser:\/[^\s"'<>\\]{0,200}$/.test(value))
const folderName = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, FOLDER_LIMITS.name) : ""

/** La clé de rangement d'une page : son adresse d'Eraser si elle en remplace une, sinon son identifiant. */
export function folderKeyOf(page: { id: string; replaces?: string }) {
  return page.replaces ? `${ERASER_PAGE_KEY_PREFIX}${page.replaces}` : page.id
}
export const eraserFolderKey = (path: string) => `${ERASER_PAGE_KEY_PREFIX}${path}`

export const emptyFolders = (): PageFolders => ({ folders: [], placement: {}, updatedAt: "", updatedBy: "" })

/** Un identifiant de dossier neuf (« d-… »), tiré par l'explorateur pour ranger sans attendre le serveur. */
export function newFolderId(random: () => number = Math.random) {
  let out = ""
  for (let index = 0; index < 10; index += 1) out += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]
  return `d-${out}`
}

/** Les parents d'un dossier sont-ils tous connus, sans boucle ni profondeur excessive ? */
function reachesRoot(id: string, parents: Map<string, string>) {
  const seen = new Set<string>()
  let current = id
  while (current) {
    if (seen.has(current) || seen.size > FOLDER_LIMITS.depth) return false
    seen.add(current)
    const parent = parents.get(current)
    if (parent === undefined) return false
    current = parent
  }
  return true
}

/**
 * Un rangement lu (serveur partagé, requête), remis en forme : un dossier sans nom, en double,
 * dont le parent manque ou qui tourne en rond remonte à la racine ; une page rangée dans un
 * dossier inconnu redevient non rangée.
 */
export function cleanPageFolders(input: unknown): PageFolders {
  let value = input
  if (typeof value === "string") { try { value = JSON.parse(value) } catch { return emptyFolders() } }
  if (!value || typeof value !== "object") return emptyFolders()
  const raw = value as Record<string, unknown>
  const folders: PageFolder[] = []
  const ids = new Set<string>()
  for (const item of Array.isArray(raw.folders) ? raw.folders : []) {
    if (!item || typeof item !== "object" || folders.length >= FOLDER_LIMITS.folders) continue
    const entry = item as Record<string, unknown>
    if (!isFolderId(entry.id) || ids.has(entry.id)) continue
    const folder: PageFolder = { id: entry.id, name: folderName(entry.name) || "Dossier", parent: isFolderId(entry.parent) ? entry.parent : "" }
    if (typeof entry.icon === "string" && /^[a-z0-9-]{1,60}$/.test(entry.icon)) folder.icon = entry.icon
    const emoji = typeof entry.emoji === "string" ? [...entry.emoji.trim()].slice(0, 4).join("") : ""
    if (emoji) folder.emoji = emoji
    ids.add(folder.id)
    folders.push(folder)
  }
  const parents = new Map(folders.map((folder) => [folder.id, ids.has(folder.parent) ? folder.parent : ""]))
  for (const folder of folders) {
    folder.parent = parents.get(folder.id) ?? ""
    if (!reachesRoot(folder.id, parents)) { folder.parent = ""; parents.set(folder.id, "") }
  }
  const placement: Record<string, string> = {}
  let count = 0
  if (raw.placement && typeof raw.placement === "object") {
    for (const [key, folder] of Object.entries(raw.placement as Record<string, unknown>)) {
      if (count >= FOLDER_LIMITS.placements || !isPageKey(key) || !isFolderId(folder) || !ids.has(folder)) continue
      placement[key] = folder
      count += 1
    }
  }
  const text = (field: unknown) => typeof field === "string" ? field.slice(0, 120) : ""
  return { folders, placement, updatedAt: text(raw.updatedAt), updatedBy: text(raw.updatedBy) }
}

/** Une demande d'opération (requête de l'explorateur), remise en forme ; `null` si elle n'en est pas une. */
export function cleanFolderOp(input: unknown): FolderOp | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const parent = isFolderId(raw.parent) ? raw.parent : ""
  switch (raw.op) {
    case "create": return isFolderId(raw.id) ? { op: "create", id: raw.id, name: folderName(raw.name) || "Nouveau dossier", parent } : null
    case "rename": return isFolderId(raw.id) && folderName(raw.name) ? { op: "rename", id: raw.id, name: folderName(raw.name) } : null
    case "icon": {
      if (!isFolderId(raw.id)) return null
      const icon = typeof raw.icon === "string" && /^[a-z0-9-]{1,60}$/.test(raw.icon) ? raw.icon : undefined
      const emoji = typeof raw.emoji === "string" && raw.emoji.trim() ? [...raw.emoji.trim()].slice(0, 4).join("") : undefined
      return { op: "icon", id: raw.id, icon, emoji }
    }
    case "move-folder": return isFolderId(raw.id) ? { op: "move-folder", id: raw.id, parent } : null
    case "delete": return isFolderId(raw.id) ? { op: "delete", id: raw.id } : null
    case "place": {
      const keys = (Array.isArray(raw.keys) ? raw.keys : []).filter(isPageKey).slice(0, FOLDER_LIMITS.placements)
      return keys.length ? { op: "place", keys, folder: isFolderId(raw.folder) ? raw.folder : "" } : null
    }
    default: return null
  }
}

/** Le dossier et tous ceux qu'il contient, à toute profondeur. */
export function folderAndDescendants(state: Pick<PageFolders, "folders">, id: string) {
  const out = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const folder of state.folders) if (out.has(folder.parent) && !out.has(folder.id)) { out.add(folder.id); grew = true }
  }
  return out
}

/** Le chemin d'un dossier, de la racine jusqu'à lui (fil d'Ariane). */
export function folderPath(state: Pick<PageFolders, "folders">, id: string): PageFolder[] {
  const byId = new Map(state.folders.map((folder) => [folder.id, folder]))
  const path: PageFolder[] = []
  let current = byId.get(id)
  while (current && path.length <= FOLDER_LIMITS.depth) {
    path.unshift(current)
    current = current.parent ? byId.get(current.parent) : undefined
  }
  return path
}

/** « Lore › Dieux » : le chemin d'un dossier en mots ; "" pour la racine. */
export function folderPathLabel(state: Pick<PageFolders, "folders">, id: string) {
  return folderPath(state, id).map((folder) => folder.name).join(" › ")
}

const byName = (left: PageFolder, right: PageFolder) => left.name.localeCompare(right.name, "fr", { numeric: true, sensitivity: "base" })

/** Les sous-dossiers directs (`parent` vide : ceux de la racine), par nom. */
export function childFolders(state: Pick<PageFolders, "folders">, parent: string) {
  return state.folders.filter((folder) => folder.parent === parent).sort(byName)
}

/** Les dossiers dans l'ordre de l'arbre (parent avant ses enfants, frères par nom), avec leur profondeur. */
export function flattenFolders(state: Pick<PageFolders, "folders">): Array<{ folder: PageFolder; depth: number }> {
  const out: Array<{ folder: PageFolder; depth: number }> = []
  const walk = (parent: string, depth: number) => { for (const folder of childFolders(state, parent)) { out.push({ folder, depth }); if (depth < FOLDER_LIMITS.depth) walk(folder.id, depth + 1) } }
  walk("", 0)
  return out
}

/** Le dossier d'une page (clé), "" si elle n'est pas rangée. */
export function folderOf(state: Pick<PageFolders, "placement">, key: string) {
  return state.placement[key] ?? ""
}

function applyOne(state: PageFolders, op: FolderOp): PageFolders {
  const ids = new Set(state.folders.map((folder) => folder.id))
  switch (op.op) {
    case "create": {
      if (ids.has(op.id) || state.folders.length >= FOLDER_LIMITS.folders) return state
      const parent = ids.has(op.parent) ? op.parent : ""
      if (parent && folderPath(state, parent).length >= FOLDER_LIMITS.depth) return state
      return { ...state, folders: [...state.folders, { id: op.id, name: folderName(op.name) || "Nouveau dossier", parent }] }
    }
    case "rename":
      return { ...state, folders: state.folders.map((folder) => folder.id === op.id ? { ...folder, name: folderName(op.name) || folder.name } : folder) }
    case "icon":
      return { ...state, folders: state.folders.map((folder) => folder.id === op.id ? { id: folder.id, name: folder.name, parent: folder.parent, ...(op.icon ? { icon: op.icon } : {}), ...(op.emoji ? { emoji: op.emoji } : {}) } : folder) }
    case "move-folder": {
      if (!ids.has(op.id)) return state
      const parent = ids.has(op.parent) ? op.parent : ""
      // Jamais dans lui-même ni dans un de ses sous-dossiers.
      if (parent && folderAndDescendants(state, op.id).has(parent)) return state
      return { ...state, folders: state.folders.map((folder) => folder.id === op.id ? { ...folder, parent } : folder) }
    }
    case "delete": {
      const gone = state.folders.find((folder) => folder.id === op.id)
      if (!gone) return state
      // Rien ne se perd : ses sous-dossiers et ses pages remontent d'un cran.
      const placement: Record<string, string> = {}
      for (const [key, folder] of Object.entries(state.placement)) {
        const next = folder === gone.id ? gone.parent : folder
        if (next) placement[key] = next
      }
      return { ...state, folders: state.folders.filter((folder) => folder.id !== gone.id).map((folder) => folder.parent === gone.id ? { ...folder, parent: gone.parent } : folder), placement }
    }
    case "place": {
      const folder = ids.has(op.folder) ? op.folder : ""
      const placement = { ...state.placement }
      for (const key of op.keys) {
        if (!isPageKey(key)) continue
        if (folder) placement[key] = folder
        else delete placement[key]
      }
      return { ...state, placement }
    }
  }
}

/** Applique des opérations dans l'ordre ; une opération qui ne s'applique plus (dossier supprimé entre-temps) est sans effet. */
export function applyFolderOps(state: PageFolders, ops: FolderOp[]): PageFolders {
  return ops.slice(0, FOLDER_LIMITS.ops).reduce(applyOne, state)
}

/** Le nombre de pages de chaque dossier, sous-dossiers compris (`keys` : les pages montrées). */
export function folderCounts(state: PageFolders, keys: string[]) {
  const counts = new Map<string, number>()
  const parents = new Map(state.folders.map((folder) => [folder.id, folder.parent]))
  for (const key of keys) {
    let current = state.placement[key] ?? ""
    const seen = new Set<string>()
    while (current && !seen.has(current)) {
      seen.add(current)
      counts.set(current, (counts.get(current) ?? 0) + 1)
      current = parents.get(current) ?? ""
    }
  }
  return counts
}

/**
 * Les dossiers tels que le menu les montre (lib/app-menu.ts) : leurs pages (`pages` : celles que
 * le lecteur peut ouvrir, avec leur clé de rangement), par titre, et leurs sous-dossiers.
 */
export function menuFolderEntries(state: PageFolders, pages: Array<{ key: string; page: MenuPageEntry }>): Record<string, MenuFolderEntry> {
  const out: Record<string, MenuFolderEntry> = {}
  for (const folder of state.folders) out[folder.id] = { label: folder.name, pages: [], children: childFolders(state, folder.id).map((child) => child.id) }
  for (const { key, page } of pages) {
    const folder = state.placement[key]
    if (folder && out[folder]) out[folder].pages.push(page)
  }
  for (const entry of Object.values(out)) entry.pages.sort((left, right) => left.title.localeCompare(right.title, "fr", { numeric: true, sensitivity: "base" }))
  return out
}
