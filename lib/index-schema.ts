/**
 * L'onglet « Eraser · colonnes » d'un classeur : le type et les réglages de chaque
 * colonne, les colonnes renommées, ajoutées ou mises à la corbeille. Il voyage avec
 * la feuille, il est partagé par toutes les installations et reste lisible dans
 * Sheets. Le supprimer ramène simplement les colonnes à leur type par défaut.
 *
 * Il n'est créé qu'à la première modification faite dans « Modifier » : un classeur
 * qu'on n'a jamais modifié reste tel quel.
 */
import { onForgetGoogleData } from "@/lib/data-refresh"
import {
  cachedSpreadsheetTabs,
  clearSpreadsheetReadCache,
  googleSheetsJson,
  readRange,
  readRangeFreshWithOffset,
  sheetTabRange,
  spreadsheetTabs,
  updateRange,
} from "@/lib/google-sheets"
import type { IndexColumnSpec } from "@/lib/index-columns"
import { foldName, indexColumnKinds } from "@/lib/index-columns"
import { asBackgroundGoogleWork } from "@/lib/google-quota"
import { findEntry, SCHEMA_TAB, type SchemaEntry } from "@/lib/index-schema-shared"

const HEADERS = ["Onglet", "Colonne", "Nom d’origine", "Type et réglages (JSON)", "État", "Supprimé le"]

/**
 * Le schéma de chaque classeur, gardé en mémoire. Passé CACHE_MS, il est rendu aussitôt
 * et relu en arrière-plan (une modification faite ailleurs apparaît à la lecture
 * suivante), mais pas au-delà de STALE_MS : plus vieux, on attend sa relecture. Les
 * changements faits depuis Eraser relisent le schéma tout de suite (`refresh`).
 */
const cache = new Map<string, { expiresAt: number; promise: Promise<SchemaEntry[]>; loadedAt?: number; refreshing?: boolean }>()
const CACHE_MS = 5 * 60_000
const STALE_MS = 30 * 60_000

function parseSpec(value: string): IndexColumnSpec | null {
  if (!value.trim()) return null
  try {
    const parsed = JSON.parse(value) as IndexColumnSpec
    if (!parsed || typeof parsed !== "object" || typeof parsed.kind !== "string") return null
    // Le type « Icône » de l'alpha.91 a été retiré : une colonne enregistrée avec lui
    // redevient un Fichier image (la colonne d'images qui existait déjà).
    if ((parsed.kind as string) === "icon") return { ...parsed, kind: "file", file: { accept: "image" } }
    // Un type inconnu de cette version : la colonne garde son type par défaut.
    return parsed.kind in indexColumnKinds ? parsed : null
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

/**
 * Les lignes du schéma d'un classeur ; aucune si l'onglet n'existe pas encore. Une lecture
 * ratée échoue (elle n'est jamais prise pour un schéma vide). `refresh` : relu à l'instant
 * dans Sheets, ce que fait toute écriture du schéma.
 */
export function readSchema(spreadsheetId: string, options: { refresh?: boolean } = {}) {
  const cached = cache.get(spreadsheetId)
  if (!options.refresh && cached && cached.expiresAt > Date.now()) return cached.promise
  if (!options.refresh && cached?.loadedAt && Date.now() - cached.loadedAt < STALE_MS) {
    if (!cached.refreshing) {
      cached.refreshing = true
      // Relecture d'arrière-plan : elle cède la place aux pages quand Google est saturé.
      const fresh = asBackgroundGoogleWork(() => loadSchema(spreadsheetId))
      fresh.then((entries) => { if (cache.get(spreadsheetId) === cached) cache.set(spreadsheetId, { expiresAt: Date.now() + CACHE_MS, promise: Promise.resolve(entries), loadedAt: Date.now() }) }, () => { cached.refreshing = false })
    }
    return cached.promise
  }
  const promise = loadSchema(spreadsheetId, Boolean(options.refresh))
  const entry: { expiresAt: number; promise: Promise<SchemaEntry[]>; loadedAt?: number } = { expiresAt: Date.now() + CACHE_MS, promise }
  cache.set(spreadsheetId, entry)
  promise.then(() => { entry.loadedAt = Date.now() }, () => { if (cache.get(spreadsheetId) === entry) cache.delete(spreadsheetId) })
  return promise
}

async function loadSchema(spreadsheetId: string, fresh = false) {
  // Avant d'écrire, la liste des onglets est relue ; pour afficher, la copie en mémoire suffit
  // quand l'onglet du schéma y est (absent de la copie, il est cherché dans Google).
  const tabs = await (fresh ? spreadsheetTabs(spreadsheetId) : cachedSpreadsheetTabs(spreadsheetId, [SCHEMA_TAB]))
  if (!tabs.some((tab) => tab.title === SCHEMA_TAB)) return []
  // Lu directement dans Sheets, sans vider le cache des autres onglets du classeur.
  const { rows } = await readRangeFreshWithOffset(spreadsheetId, sheetTabRange(SCHEMA_TAB, "A2:F"))
  return rows.flatMap((row): SchemaEntry[] => row[0]?.trim()
    ? [{ tab: row[0].trim(), column: (row[1] ?? "").trim(), origin: (row[2] ?? "").trim(), spec: parseSpec(row[3] ?? ""), state: parseState(row[4] ?? ""), deletedAt: (row[5] ?? "").trim() }]
    : [])
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

/**
 * Réécrit tout le schéma d'un classeur (il ne compte que quelques dizaines de lignes).
 * `entries` doit venir d'une lecture du moment : voir `rewriteSchema`.
 */
export async function writeSchema(spreadsheetId: string, entries: SchemaEntry[]) {
  await ensureSchemaTab(spreadsheetId)
  const rows = entries.map((entry) => [entry.tab, entry.column, entry.origin, entry.spec ? JSON.stringify(entry.spec) : "", entry.state, entry.deletedAt])
  // Les anciennes lignes en trop sont vidées : le schéma écrit est le schéma complet. Leur
  // nombre est relu (lignes vides comprises) ; une lecture ratée arrête l'écriture plutôt que
  // de laisser des lignes d'avant à la suite.
  const previous = await readRangeFreshWithOffset(spreadsheetId, sheetTabRange(SCHEMA_TAB, "A2:F"))
  const used = previous.rows.length ? previous.startRow - 2 + previous.rows.length : 0
  const blanks = Array.from({ length: Math.max(0, used - rows.length) }, () => HEADERS.map(() => ""))
  const all = [...rows, ...blanks]
  if (all.length) await updateRange(spreadsheetId, sheetTabRange(SCHEMA_TAB, `A2:F${all.length + 1}`), all, { valueInputOption: "RAW" })
  cache.delete(spreadsheetId)
}

/**
 * Modifie le schéma d'un classeur à partir de sa version relue à l'instant dans Sheets :
 * jamais d'une copie gardée en mémoire (une autre installation a pu le changer, ou l'autre
 * index du même classeur), ni d'une lecture ratée (tous les réglages seraient effacés).
 * `change` y applique les modifications d'Eraser, puis le schéma est réécrit.
 */
export async function rewriteSchema(spreadsheetId: string, change: (entries: SchemaEntry[]) => SchemaEntry[] | void) {
  const entries = (await readSchema(spreadsheetId, { refresh: true })).map((entry) => ({ ...entry }))
  await writeSchema(spreadsheetId, change(entries) ?? entries)
}

/** Les lignes du schéma telles qu'écrites dans la feuille (types inconnus compris). */
export async function readRawSchemaRows(spreadsheetId: string) {
  const tabs = await spreadsheetTabs(spreadsheetId)
  if (!tabs.some((tab) => tab.title === SCHEMA_TAB)) return [] as string[][]
  clearSpreadsheetReadCache(spreadsheetId)
  return (await readRange(spreadsheetId, sheetTabRange(SCHEMA_TAB, "A2:F"))).filter((row) => row[0]?.trim())
}

/** Ajoute des lignes brutes au schéma d'un classeur (regroupement des index d'objets). */
export async function appendRawSchemaRows(spreadsheetId: string, rows: string[][]) {
  if (!rows.length) return
  await ensureSchemaTab(spreadsheetId)
  const previous = await readRawSchemaRows(spreadsheetId)
  const width = HEADERS.length
  const all = [...previous, ...rows].map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""))
  await updateRange(spreadsheetId, sheetTabRange(SCHEMA_TAB, `A2:F${all.length + 1}`), all, { valueInputOption: "RAW" })
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

// « Actualiser » (administrateur, MJ) : les réglages de colonnes sont relus dans Google.
onForgetGoogleData((scope) => { if (scope === "all") cache.clear() })
