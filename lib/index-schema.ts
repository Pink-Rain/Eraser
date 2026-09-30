/**
 * L'onglet « Eraser · colonnes » d'un classeur : le type et les réglages de chaque
 * colonne, les colonnes renommées, ajoutées ou mises à la corbeille. Il voyage avec
 * la feuille, il est partagé par toutes les installations et reste lisible dans
 * Sheets. Le supprimer ramène simplement les colonnes à leur type par défaut.
 *
 * Il n'est créé qu'à la première modification faite dans « Modifier » : un classeur
 * qu'on n'a jamais modifié reste tel quel.
 */
import {
  clearSpreadsheetReadCache,
  googleSheetsJson,
  readRange,
  sheetTabRange,
  spreadsheetTabs,
  updateRange,
} from "@/lib/google-sheets"
import type { IndexColumnSpec } from "@/lib/index-columns"
import { foldName } from "@/lib/index-columns"
import { findEntry, SCHEMA_TAB, type SchemaEntry } from "@/lib/index-schema-shared"

const HEADERS = ["Onglet", "Colonne", "Nom d’origine", "Type et réglages (JSON)", "État", "Supprimé le"]

const cache = new Map<string, { expiresAt: number; promise: Promise<SchemaEntry[]> }>()
const CACHE_MS = 60_000

function parseSpec(value: string): IndexColumnSpec | null {
  if (!value.trim()) return null
  try {
    const parsed = JSON.parse(value) as IndexColumnSpec
    return parsed && typeof parsed === "object" && typeof parsed.kind === "string" ? parsed : null
  } catch {
    return null
  }
}

function parseState(value: string): SchemaEntry["state"] {
  const folded = foldName(value)
  if (folded === "ajoute") return "ajouté"
  if (folded === "corbeille") return "corbeille"
  if (folded === "supprime") return "supprimé"
  return ""
}

/** Les lignes du schéma d'un classeur ; aucune si l'onglet n'existe pas encore. */
export function readSchema(spreadsheetId: string, options: { refresh?: boolean } = {}) {
  const cached = cache.get(spreadsheetId)
  if (!options.refresh && cached && cached.expiresAt > Date.now()) return cached.promise
  const promise = (async () => {
    const tabs = await spreadsheetTabs(spreadsheetId)
    if (!tabs.some((tab) => tab.title === SCHEMA_TAB)) return []
    clearSpreadsheetReadCache(spreadsheetId)
    const rows = await readRange(spreadsheetId, sheetTabRange(SCHEMA_TAB, "A2:F"))
    return rows.flatMap((row): SchemaEntry[] => row[0]?.trim()
      ? [{ tab: row[0].trim(), column: (row[1] ?? "").trim(), origin: (row[2] ?? "").trim(), spec: parseSpec(row[3] ?? ""), state: parseState(row[4] ?? ""), deletedAt: (row[5] ?? "").trim() }]
      : [])
  })()
  cache.set(spreadsheetId, { expiresAt: Date.now() + CACHE_MS, promise })
  promise.catch(() => { if (cache.get(spreadsheetId)?.promise === promise) cache.delete(spreadsheetId) })
  return promise
}

/** Crée l'onglet de schéma, caché, s'il n'existe pas. */
async function ensureSchemaTab(spreadsheetId: string) {
  const tabs = await spreadsheetTabs(spreadsheetId)
  if (tabs.some((tab) => tab.title === SCHEMA_TAB)) return
  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SCHEMA_TAB, hidden: true, gridProperties: { rowCount: 200, columnCount: HEADERS.length, frozenRowCount: 1 } } } }] }),
  })
  await updateRange(spreadsheetId, sheetTabRange(SCHEMA_TAB, `A1:F1`), [HEADERS], { valueInputOption: "RAW" })
}

/** Réécrit tout le schéma d'un classeur (il ne compte que quelques dizaines de lignes). */
export async function writeSchema(spreadsheetId: string, entries: SchemaEntry[]) {
  await ensureSchemaTab(spreadsheetId)
  const rows = entries.map((entry) => [entry.tab, entry.column, entry.origin, entry.spec ? JSON.stringify(entry.spec) : "", entry.state, entry.deletedAt])
  // Les anciennes lignes en trop sont vidées : le schéma écrit est le schéma complet.
  const previous = await readSchema(spreadsheetId, { refresh: true }).catch(() => [])
  const blanks = Array.from({ length: Math.max(0, previous.length - rows.length) }, () => HEADERS.map(() => ""))
  const all = [...rows, ...blanks]
  if (all.length) await updateRange(spreadsheetId, sheetTabRange(SCHEMA_TAB, `A2:F${all.length + 1}`), all, { valueInputOption: "RAW" })
  cache.delete(spreadsheetId)
}

/** La ligne d'une colonne (ou d'un onglet quand `column` est vide). */
export { findEntry } from "@/lib/index-schema-shared"

/** Crée ou met à jour une ligne du schéma. */
export function upsertEntry(entries: SchemaEntry[], tab: string, column: string, changes: Partial<SchemaEntry>) {
  const existing = findEntry(entries, tab, column)
  if (existing) Object.assign(existing, changes)
  else entries.push({ tab, column, origin: "", spec: null, state: "", deletedAt: "", ...changes })
  return entries
}

export function forgetSchemaCache(spreadsheetId: string) {
  cache.delete(spreadsheetId)
}
