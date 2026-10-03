/**
 * Les références à une ligne d'index dans un texte : « {État:Sérénité} » (le nom, avec
 * son détail au survol) ou « {État:Sérénité:Type} » (la valeur d'une case, sans survol).
 *
 * Le menu de l'éditeur les enregistre comme un lien vers l'identifiant de la ligne
 * (« /reference/states/ETA-1A2B3C4D »), que Google Sheets garde tel quel. Le nom affiché
 * est relu à chaque affichage : renommer la ligne renomme toutes ses citations, sans
 * réécrire aucun texte. Sans dépendance au serveur.
 */
import { internalAppPath } from "@/lib/app-links"
import type { ColumnStyle } from "@/lib/index-columns"

export const REFERENCE_PATH = "/reference/"

/** L'index des objets, à côté des index du monde. */
export const OBJECT_REFERENCE_INDEX = "objects"

export type IndexReference = { index: string; id: string; column?: string }

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
}

export function referenceHref(reference: IndexReference) {
  const column = reference.column?.trim()
  return `${REFERENCE_PATH}${encodeURIComponent(reference.index)}/${encodeURIComponent(reference.id)}${column ? `?colonne=${encodeURIComponent(column)}` : ""}`
}

/** La référence d'un lien, ou null pour un lien ordinaire. Accepte l'adresse complète que garde Sheets. */
export function parseReferenceHref(href: string): IndexReference | null {
  const path = internalAppPath(String(href ?? "").replace(/&amp;/g, "&"))
  if (!path.startsWith(REFERENCE_PATH)) return null
  try {
    const url = new URL(path, "http://eraser.local")
    const [index, id] = url.pathname.slice(REFERENCE_PATH.length).split("/").map((part) => decodeURIComponent(part ?? "").trim())
    if (!index || !id) return null
    const column = url.searchParams.get("colonne")?.trim()
    return { index, id, ...(column ? { column } : {}) }
  } catch {
    return null
  }
}

/** Clé d'une référence (une ligne, ou une case d'une ligne). */
export function referenceKey(reference: IndexReference) {
  return `${reference.index}\u0001${reference.id}\u0001${fold(reference.column ?? "")}`
}

/** Le séparateur du libellé d'une case citée : « Sérénité › Type ». */
export const REFERENCE_COLUMN_SEPARATOR = " › "

/** Ce que l'éditeur écrit dans le lien : le nom, et la colonne quand c'en est une. */
export function referenceLabel(name: string, column?: string) {
  return column ? `${name}${REFERENCE_COLUMN_SEPARATOR}${column}` : name
}

/** Le nom de la ligne d'après le libellé d'un lien (repli quand l'identifiant n'est plus trouvé). */
export function referenceNameFromLabel(label: string) {
  const text = String(label ?? "").replace(/\s+/g, " ").trim()
  const cut = text.lastIndexOf(REFERENCE_COLUMN_SEPARATOR.trim())
  return cut > 0 ? text.slice(0, cut).trim() : text
}

// ---------------------------------------------------------------------------
// Le catalogue du menu « { »
// ---------------------------------------------------------------------------

/** Une ligne citable. */
export type ReferenceRow = { id: string; name: string; tab: string; tags?: string[] }

export type ReferenceIndex = {
  key: string
  title: string
  tabs: Array<{ name: string; columns: string[] }>
  rows: ReferenceRow[]
}

/**
 * Ce qu'on tape après « { » : « État », « Lieu », « Ville », « Attribut »… Un mot peut ne
 * viser qu'un onglet (`tab`) ou que les lignes portant une valeur (`tag`, le Type d'un
 * modificateur).
 */
export type ReferenceEntry = { index: string; label: string; hint: string; tab?: string; tag?: string }

export type ReferenceCatalog = { indexes: ReferenceIndex[]; entries: ReferenceEntry[] }

/** « un état » → « État », « une ligne » → "" (trop vague pour servir de mot). */
export function entryLabelFromItemLabel(itemLabel: string | undefined) {
  const bare = String(itemLabel ?? "").trim().replace(/^(?:(?:une|un|des|les|le|la)\s+|l['’]\s*)/i, "").trim()
  if (!bare || fold(bare) === "ligne") return ""
  return bare.charAt(0).toLocaleUpperCase("fr") + bare.slice(1)
}

export function entryRows(catalog: ReferenceCatalog, entry: ReferenceEntry) {
  const index = catalog.indexes.find((candidate) => candidate.key === entry.index)
  if (!index) return []
  return index.rows.filter((row) => (!entry.tab || row.tab === entry.tab) && (!entry.tag || (row.tags ?? []).some((tag) => fold(tag) === fold(entry.tag!))))
}

export function entryColumns(catalog: ReferenceCatalog, index: string, tab: string) {
  return catalog.indexes.find((candidate) => candidate.key === index)?.tabs.find((candidate) => candidate.name === tab)?.columns ?? []
}

/** Le mot tapé après « { » : une correspondance exacte d'abord, puis le début d'un mot. */
export function findEntry(catalog: ReferenceCatalog, typed: string) {
  const wanted = fold(typed)
  if (!wanted) return null
  return catalog.entries.find((entry) => fold(entry.label) === wanted)
    ?? catalog.entries.find((entry) => fold(entry.label).startsWith(wanted))
    ?? null
}

export function findRow(rows: ReferenceRow[], typed: string) {
  const wanted = fold(typed)
  if (!wanted) return null
  return rows.find((row) => fold(row.name) === wanted) ?? null
}

/** Recherche souple : chaque mot tapé doit se trouver quelque part, sans accents ni casse. */
export function matchesQuery(text: string, query: string) {
  return queryScore(text, query) > 0
}

/**
 * La pertinence d'un texte pour ce qui est tapé : 4 identique, 3 commence pareil, 2 un de
 * ses mots commence pareil, 1 contient chaque mot tapé, 0 sans rapport. Rien de tapé : 1.
 */
export function queryScore(text: string, query: string) {
  const haystack = fold(text)
  const wanted = fold(query)
  if (!wanted) return 1
  if (haystack === wanted) return 4
  if (haystack.startsWith(wanted)) return 3
  if (haystack.split(/[\s'’-]+/).some((word) => word.startsWith(wanted))) return 2
  return wanted.split(" ").filter(Boolean).every((word) => haystack.includes(word)) ? 1 : 0
}

/** Les éléments qui correspondent, les plus pertinents d'abord (l'ordre d'origine départage). */
export function rankByQuery<T>(items: T[], textOf: (item: T) => string, query: string) {
  return items.map((item, position) => ({ item, position, score: queryScore(textOf(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.position - right.position)
    .map((entry) => entry.item)
}

export { fold as foldReferenceText }

// ---------------------------------------------------------------------------
// La résolution, pour l'affichage
// ---------------------------------------------------------------------------

/** Ce qu'une référence demande : sa ligne, et la case quand c'en est une. `name` : repli par le nom. */
export type ReferenceRequest = IndexReference & { name?: string }

/** Comment une case citée s'affiche : le style imposé de sa colonne, la couleur de ses choix. */
export type ReferenceLook = { style?: ColumnStyle; options?: Array<{ value: string; color?: string }>; unit?: string; kind?: string; multiple?: boolean }

export type ResolvedReference = {
  index: string
  id: string
  tab: string
  name: string
  nameHtml?: string
  /** Le style imposé à la colonne du nom de son index. */
  nameStyle?: ColumnStyle
  /** Une ligne de l'Index des objets : de quoi dessiner son icône comme dans l'inventaire. */
  object?: { icon: string; type: string; subtype: string }
  /** Le survol d'une ligne : son type, sa description, sa couleur, son icône, son image. */
  type?: string
  descriptionHtml?: string
  color?: string
  icon?: string
  image?: string
  /** Une case citée : sa colonne, sa valeur (mise en forme comprise) et son rendu. */
  column?: string
  value?: string
  valueHtml?: string
  look?: ReferenceLook
}

/** Le plus de références qu'une demande peut résoudre d'un coup. */
export const MAX_REFERENCE_REQUESTS = 300
