/**
 * Les index créés depuis Eraser (« Nouvel index »). Leur liste vit dans un classeur du
 * Drive, « Eraser · Index personnalisés », partagé par toutes les installations comme
 * les autres feuilles. Chaque index a son propre classeur ; ses onglets et ses colonnes
 * sont décrits dans son onglet « Eraser · colonnes ».
 *
 * Règle du projet : un classeur n'est jamais recréé s'il existe déjà sous ce nom dans
 * le Drive. Il est relié, et ses onglets sont gardés.
 */
import { createGoogleSpreadsheet, findGoogleSpreadsheetByName, trashDriveFile } from "@/lib/google-drive"
import { appendRows, clearSpreadsheetReadCache, columnName, googleSheetsJson, readRange, sheetTabRange, spreadsheetTabs, updateRange } from "@/lib/google-sheets"
import { foldName, newIndexId, type IndexColumnSpec } from "@/lib/index-columns"
import { SCHEMA_TAB, type SchemaEntry } from "@/lib/index-schema-shared"
import { readSchema, writeSchema } from "@/lib/index-schema"

export const CUSTOM_INDEX_PREFIX = "perso-"
const REGISTRY_NAME = "Eraser · Index personnalisés"
const REGISTRY_TAB = "Index"
const REGISTRY_HEADERS = ["Clé", "Titre", "Classeur", "ID du classeur", "Description", "Créé le", "Supprimé le"]

export type CustomIndexEntry = {
  key: `${typeof CUSTOM_INDEX_PREFIX}${string}`
  title: string
  sheetName: string
  spreadsheetId: string
  description: string
  createdAt: string
  /** Mis à la corbeille depuis « Modifier » : caché, restaurable depuis la corbeille. */
  deletedAt: string
  /** La ligne du registre (pour la marquer). */
  row: number
}

let registryCache: { expiresAt: number; promise: Promise<{ spreadsheetId: string | null; entries: CustomIndexEntry[] }> } | null = null

function loadedRegistry(options: { refresh?: boolean } = {}) {
  if (!options.refresh && registryCache && registryCache.expiresAt > Date.now()) return registryCache.promise
  const promise = loadRegistry()
  registryCache = { expiresAt: Date.now() + 60_000, promise }
  promise.catch(() => { registryCache = null })
  return promise
}

export function isCustomIndexKey(value: unknown): value is CustomIndexEntry["key"] {
  return typeof value === "string" && value.startsWith(CUSTOM_INDEX_PREFIX) && /^[a-z0-9-]{3,80}$/.test(value)
}

async function loadRegistry() {
  const file = await findGoogleSpreadsheetByName(REGISTRY_NAME)
  if (!file) return { spreadsheetId: null, entries: [] }
  const rows = await readRange(file.id, sheetTabRange(REGISTRY_TAB, "A2:G")).catch(() => [] as string[][])
  const entries = rows.flatMap((row, index): CustomIndexEntry[] => isCustomIndexKey(row[0]?.trim()) && row[3]?.trim()
    ? [{ key: row[0].trim() as CustomIndexEntry["key"], title: row[1]?.trim() || row[0].trim(), sheetName: row[2]?.trim() || "", spreadsheetId: row[3].trim(), description: row[4]?.trim() || "", createdAt: row[5]?.trim() || "", deletedAt: row[6]?.trim() || "", row: index + 2 }]
    : [])
  return { spreadsheetId: file.id, entries }
}

/** Les index personnalisés (hors corbeille), gardés une minute en mémoire. */
export function listCustomIndexes(options: { refresh?: boolean } = {}) {
  return loadedRegistry(options).then((registry) => registry.entries.filter((entry) => !entry.deletedAt))
}

/** Les index personnalisés à la corbeille. */
export function listTrashedCustomIndexes() {
  return loadedRegistry({ refresh: true }).then((registry) => registry.entries.filter((entry) => entry.deletedAt))
}

async function markRegistryRow(key: string, values: (entry: CustomIndexEntry) => string[] | null) {
  const registry = await loadedRegistry({ refresh: true })
  const entry = registry.entries.find((candidate) => candidate.key === key)
  if (!registry.spreadsheetId || !entry) throw new Error("CUSTOM_INDEX_NOT_FOUND")
  const row = values(entry)
  if (row) {
    await updateRange(registry.spreadsheetId, sheetTabRange(REGISTRY_TAB, "G1:G1"), [[REGISTRY_HEADERS[6]]], { valueInputOption: "RAW" })
    await updateRange(registry.spreadsheetId, sheetTabRange(REGISTRY_TAB, `A${entry.row}:G${entry.row}`), [row], { valueInputOption: "RAW" })
  }
  registryCache = null
  return entry
}

const rowOf = (entry: CustomIndexEntry, deletedAt: string) => [entry.key, entry.title, entry.sheetName, entry.spreadsheetId, entry.description, entry.createdAt, deletedAt]

/** Met un index créé dans Eraser à la corbeille : caché partout, son classeur reste intact. */
export function trashCustomIndex(key: string) {
  return markRegistryRow(key, (entry) => rowOf(entry, new Date().toISOString()))
}

export function restoreCustomIndex(key: string) {
  return markRegistryRow(key, (entry) => entry.deletedAt ? rowOf(entry, "") : null)
}

/**
 * Suppression définitive d'un index à la corbeille : son classeur part dans la corbeille
 * du Drive (récupérable encore 30 jours par Google), sa ligne du registre est effacée.
 */
export async function purgeCustomIndex(key: string) {
  const entry = (await loadedRegistry({ refresh: true })).entries.find((candidate) => candidate.key === key)
  if (!entry?.deletedAt) throw new Error("CUSTOM_INDEX_NOT_FOUND")
  await trashDriveFile(entry.spreadsheetId)
  await markRegistryRow(key, () => ["", "", "", "", "", "", ""])
}

export async function customIndexEntry(key: string) {
  return (await listCustomIndexes()).find((entry) => entry.key === key) ?? null
}

/** Le classeur du registre, relié s'il existe, créé sinon. */
async function registrySpreadsheet() {
  const existing = await findGoogleSpreadsheetByName(REGISTRY_NAME)
  if (existing) return existing.id
  const created = await createGoogleSpreadsheet(REGISTRY_NAME)
  const tabs = await spreadsheetTabs(created.id)
  const first = tabs[0]
  if (first?.sheetId !== undefined && first.title !== REGISTRY_TAB) {
    await googleSheetsJson(`spreadsheets/${created.id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId: first.sheetId, title: REGISTRY_TAB }, fields: "title" } }] }) })
  }
  await updateRange(created.id, sheetTabRange(REGISTRY_TAB, "A1:F1"), [REGISTRY_HEADERS], { valueInputOption: "RAW" })
  return created.id
}

function slugOf(title: string) {
  return title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "index"
}

export type NewIndexTab = { name: string; columns: Array<{ header: string; spec: IndexColumnSpec }> }

/** Le préfixe des identifiants d'un onglet : trois lettres de son nom. */
export function idPrefixOf(name: string) {
  const letters = name.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z]/gi, "").toUpperCase()
  return (letters + "IDX").slice(0, 3)
}

/**
 * Crée un index : son classeur (ou relie celui qui porte déjà ce nom), ses onglets avec
 * « Nom » en tête et « ID » à la fin, son schéma, puis l'inscrit au registre.
 */
export async function createCustomIndex(input: { title: string; description: string; tabs: NewIndexTab[] }) {
  const title = input.title.replace(/\s+/g, " ").trim()
  if (!title || title.length > 60) throw new Error("CUSTOM_INDEX_TITLE_INVALID")
  if (!input.tabs.length) throw new Error("CUSTOM_INDEX_TABS_REQUIRED")
  const existing = (await loadedRegistry({ refresh: true })).entries
  const same = existing.find((entry) => foldName(entry.title) === foldName(title))
  if (same) throw new Error(same.deletedAt ? "CUSTOM_INDEX_TRASHED" : "CUSTOM_INDEX_EXISTS")
  let key = `${CUSTOM_INDEX_PREFIX}${slugOf(title)}` as CustomIndexEntry["key"]
  while (existing.some((entry) => entry.key === key)) key = `${CUSTOM_INDEX_PREFIX}${slugOf(title)}-${newIndexId("X").slice(2, 6).toLowerCase()}` as CustomIndexEntry["key"]
  const sheetName = `Index · ${title}`

  const linked = await findGoogleSpreadsheetByName(sheetName)
  const file = linked ?? await createGoogleSpreadsheet(sheetName)
  const tabs = await spreadsheetTabs(file.id)
  const schema: SchemaEntry[] = linked ? await readSchema(file.id, { refresh: true }) : []
  for (const [position, tab] of input.tabs.entries()) {
    const headers = ["Nom", ...tab.columns.map((column) => column.header).filter((header) => !["nom", "id"].includes(foldName(header))), "ID"]
    const present = tabs.find((candidate) => candidate.title === tab.name)
    if (!present) {
      // Un classeur neuf a déjà un premier onglet vide : il devient le premier onglet de l'index.
      const blank = !linked && position === 0 ? tabs.find((candidate) => candidate.title !== SCHEMA_TAB) : undefined
      if (blank?.sheetId !== undefined) {
        await googleSheetsJson(`spreadsheets/${file.id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId: blank.sheetId, title: tab.name, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } }, fields: "title,gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } }] }) })
      } else {
        await googleSheetsJson(`spreadsheets/${file.id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab.name, gridProperties: { rowCount: 1000, columnCount: Math.max(26, headers.length), frozenRowCount: 1, frozenColumnCount: 1 } } } }] }) })
      }
      await updateRange(file.id, sheetTabRange(tab.name, `A1:${columnName(headers.length)}1`), [headers], { valueInputOption: "RAW" })
    }
    if (!schema.some((entry) => entry.tab === tab.name && !entry.column)) schema.push({ tab: tab.name, column: "", origin: "", spec: null, state: "ajouté", deletedAt: "" })
    for (const column of tab.columns) {
      if (["nom", "id"].includes(foldName(column.header))) continue
      if (!schema.some((entry) => entry.tab === tab.name && foldName(entry.column) === foldName(column.header))) schema.push({ tab: tab.name, column: column.header, origin: "", spec: column.spec, state: "ajouté", deletedAt: "" })
    }
  }
  await writeSchema(file.id, schema)
  clearSpreadsheetReadCache(file.id)

  const registryId = await registrySpreadsheet()
  const entry: CustomIndexEntry = { key, title, sheetName, spreadsheetId: file.id, description: input.description.trim().slice(0, 200), createdAt: new Date().toISOString(), deletedAt: "", row: 0 }
  await appendRows(registryId, sheetTabRange(REGISTRY_TAB, "A:G"), [rowOf(entry, "")], { valueInputOption: "RAW" })
  registryCache = null
  return { entry, linked: Boolean(linked) }
}
