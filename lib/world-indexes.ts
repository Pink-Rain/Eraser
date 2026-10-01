import {
  clearSpreadsheetReadCache,
  columnName,
  configureStructuredSheet,
  deleteGoogleSheetRow,
  ensureJdrSheet,
  ensureSheetColumnCount,
  googleSheetsJson,
  readFormattedSheet,
  readRange,
  resolveJdrSheet,
  sheetTabRange,
  spreadsheetTabs,
  updateFormattedCell,
  updateRange,
} from "@/lib/google-sheets"
import { eq } from "drizzle-orm"

import { getDb } from "@/db"
import { sheetIndexSyncs } from "@/db/schema"
import { htmlToRichText } from "@/lib/google-sheet-rich-text"
import type { JdrSheetKey } from "@/lib/jdr-sheets"
import { customIndexEntry, idPrefixOf, isCustomIndexKey, listCustomIndexes } from "@/lib/custom-indexes"
import { choiceCorrection, newIndexId, type IndexColumnSpec } from "@/lib/index-columns"
import { findEntry, readSchema, upsertEntry, writeSchema } from "@/lib/index-schema"
import { columnMoves, headerProblem, isDisplayOnlyChange, tabProblem, type IndexEditorModel, type RelationTarget, type SchemaEntry, type SchemaOperation } from "@/lib/index-schema-shared"
import {
  ID_HEADER,
  foldName,
  isBuiltinWorldIndexKey,
  isNameColumn,
  linkEndCovers,
  splitNames,
  worldColumnPolicy,
  worldIndexDefinitions,
  worldIndexSeeds,
  worldColumnSpec,
  worldIndexLinks,
  type WorldIndexKey,
  type WorldIndexDefinition,
  type WorldIndexLink,
  type WorldIndexLinkEnd,
  type WorldIndexTabDefinition,
} from "@/lib/world-index-definitions"

export type WorldIndexRow = { rowNumber: number; values: string[]; html: string[] }

export type WorldIndexTable = { tabName: string; sheetId: number; headers: string[]; rows: WorldIndexRow[] }

/** Une colonne telle qu'Eraser la montre : son nom dans la feuille et son type effectif. */
export type WorldIndexColumn = { header: string; spec: IndexColumnSpec }

export type WorldIndexData = {
  key: WorldIndexKey
  webViewLink: string
  tables: WorldIndexTable[]
  /** La définition effective : onglets prévus par Eraser, ajoutés, moins ceux à la corbeille. */
  definition: WorldIndexDefinition
  /** Par onglet, les colonnes hors corbeille et leur type (schéma ou type par défaut). */
  columns: Record<string, WorldIndexColumn[]>
  /** Les colonnes liées de l'index : prévues par Eraser et créées dans l'éditeur. */
  links: WorldIndexLink[]
}

export function isWorldIndexKey(value: unknown): value is WorldIndexKey {
  return isBuiltinWorldIndexKey(value) || isCustomIndexKey(value)
}

/** Clé d'index du monde connue : prévue par Eraser, ou inscrite au registre des index personnalisés. */
export async function knownWorldIndexKey(value: unknown): Promise<WorldIndexKey | null> {
  if (isBuiltinWorldIndexKey(value)) return value
  if (isCustomIndexKey(value) && await customIndexEntry(value)) return value
  return null
}

type EffectiveIndex = {
  spreadsheetId: string
  webViewLink: string
  definition: WorldIndexDefinition
  schema: SchemaEntry[]
}

/** La définition effective de chaque index chargé : lue une fois, puis à chaque changement de schéma. */
const effectiveIndexes = new Map<WorldIndexKey, EffectiveIndex>()
const readyWorkbooks = new Set<string>()

function trashed(entry: SchemaEntry | undefined) {
  return Boolean(entry && (entry.deletedAt || entry.state === "supprimé"))
}

/**
 * Les onglets effectifs d'un index : ceux prévus par Eraser (moins ceux mis à la
 * corbeille ou supprimés) et ceux ajoutés depuis l'éditeur, avec leurs colonnes.
 */
function effectiveTabs(base: WorldIndexTabDefinition[], schema: SchemaEntry[]) {
  const kept = base.filter((tab) => !trashed(findEntry(schema, tab.name, "")))
    .map((tab) => ({
      ...tab,
      // Une colonne prévue par Eraser, renommée ou supprimée définitivement, n'est plus recréée.
      headers: tab.headers.filter((header) => !schema.some((entry) => foldName(entry.tab) === foldName(tab.name) && ((entry.origin && foldName(entry.origin) === foldName(header)) || (entry.state === "supprimé" && foldName(entry.column) === foldName(header))))),
    }))
  const added = schema.filter((entry) => !entry.column && entry.state === "ajouté" && !trashed(entry) && !base.some((tab) => tab.name === entry.tab)).map((entry): WorldIndexTabDefinition => {
    const columns = schema.filter((column) => column.tab === entry.tab && column.column && !trashed(column)).map((column) => column.column)
    return { name: entry.tab, itemLabel: "une ligne", headers: ["Nom", ...columns.filter((header) => !["nom", "id"].includes(foldName(header))), ID_HEADER], widths: [], idPrefix: idPrefixOf(entry.tab) }
  })
  // L'ordre choisi dans « Modifier » (place gardée sur la ligne de l'onglet) ; les autres gardent le leur, à la suite.
  const all = [...kept, ...added]
  const placeOf = (name: string, index: number) => { const spec = findEntry(schema, name, "")?.spec; return spec?.kind === "tab" && typeof spec.position === "number" ? spec.position : 1000 + index }
  return all.map((tab, index) => ({ tab, place: placeOf(tab.name, index) })).sort((left, right) => left.place - right.place).map((item) => item.tab)
}

async function loadEffectiveIndex(key: WorldIndexKey): Promise<EffectiveIndex> {
  if (isBuiltinWorldIndexKey(key)) {
    const sheet = await ensureJdrSheet(key)
    if (!sheet) throw new Error("WORLD_INDEX_SHEET_UNAVAILABLE")
    const schema = await readSchema(sheet.spreadsheetId).catch(() => [])
    const base = worldIndexDefinitions[key]
    return { spreadsheetId: sheet.spreadsheetId, webViewLink: sheet.webViewLink, schema, definition: { ...base, tabs: effectiveTabs(base.tabs, schema) } }
  }
  const entry = await customIndexEntry(key)
  if (!entry) throw new Error("WORLD_INDEX_NOT_FOUND")
  const schema = await readSchema(entry.spreadsheetId).catch(() => [])
  return {
    spreadsheetId: entry.spreadsheetId,
    webViewLink: `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/edit`,
    schema,
    definition: { key, sheetName: entry.sheetName, title: entry.title, path: `/ressources/index/${key}`, tabs: effectiveTabs([], schema), custom: true, description: entry.description },
  }
}

/**
 * Le classeur d'un index, relié ou créé au besoin (jamais en double : ensureJdrSheet
 * cherche d'abord une feuille du même nom dans Drive), avec tous ses onglets.
 */
async function workbook(key: WorldIndexKey, options: { refresh?: boolean } = {}) {
  let effective = options.refresh ? undefined : effectiveIndexes.get(key)
  if (!effective) {
    effective = await loadEffectiveIndex(key)
    effectiveIndexes.set(key, effective)
  }
  const { definition } = effective
  const readyKey = `${effective.spreadsheetId}:${key}:${definition.tabs.map((tab) => `${tab.name}=${tab.headers.join("|")}`).join(";")}`
  if (!readyWorkbooks.has(readyKey)) {
    const existing = await spreadsheetTabs(effective.spreadsheetId)
    for (const tab of definition.tabs) await ensureTab(effective.spreadsheetId, key, tab, existing)
    readyWorkbooks.add(readyKey)
  }
  return { spreadsheetId: effective.spreadsheetId, webViewLink: effective.webViewLink, definition, schema: effective.schema }
}

/** Relit la définition et le schéma d'un index (après une modification dans l'éditeur). */
export function forgetEffectiveIndex(key: WorldIndexKey) {
  effectiveIndexes.delete(key)
  worldIndexCache.delete(key)
}

/**
 * Un onglet et ses colonnes. Les colonnes sont retrouvées par leur nom : celles qui
 * manquent sont ajoutées à droite des existantes, sans toucher à ce qui est déjà
 * rempli ni à l'ordre choisi dans Sheets.
 */
async function ensureTab(spreadsheetId: string, key: WorldIndexKey, tab: WorldIndexTabDefinition, existing: Array<{ sheetId?: number; title: string }>) {
  const structure = { key: key as JdrSheetKey, name: effectiveIndexes.get(key)?.definition.sheetName ?? key, tabName: tab.name, frozenColumns: 1, headers: tab.headers, columnWidths: tab.widths.length === tab.headers.length ? tab.widths : tab.headers.map(() => 200) }
  if (!existing.some((candidate) => candidate.title === tab.name)) {
    const reply = await googleSheetsJson<{ replies?: Array<{ addSheet?: { properties?: { sheetId?: number } } }> }>(`spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab.name, gridProperties: { rowCount: 1000, columnCount: Math.max(tab.headers.length, 1), frozenRowCount: 1, frozenColumnCount: 1 } } } }] }),
    })
    const sheetId = reply.replies?.[0]?.addSheet?.properties?.sheetId
    if (sheetId === undefined) throw new Error("WORLD_INDEX_TAB_CREATION_FAILED")
    await configureStructuredSheet(spreadsheetId, structure, sheetId)
    return
  }
  clearSpreadsheetReadCache(spreadsheetId)
  const [firstRow = []] = await readRange(spreadsheetId, sheetTabRange(tab.name, "A1:AZ1"))
  let used = firstRow.length
  while (used > 0 && !firstRow[used - 1]?.trim()) used -= 1
  const present = new Set(firstRow.slice(0, used).map(foldName))
  const missing = tab.headers.filter((header) => !present.has(foldName(header)))
  if (!missing.length) return
  await ensureSheetColumnCount(spreadsheetId, tab.name, used + missing.length)
  const from = columnName(used + 1)
  const to = columnName(used + missing.length)
  await updateRange(spreadsheetId, sheetTabRange(tab.name, `${from}1:${to}1`), [missing], { valueInputOption: "RAW" })
}

function tabDefinition(key: WorldIndexKey, tabName: string) {
  const tab = effectiveIndexes.get(key)?.definition.tabs.find((candidate) => candidate.name === tabName)
  if (!tab) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
  return tab
}

/** Les onglets effectifs d'un index (chargé au besoin). */
async function tabsOf(key: WorldIndexKey) {
  return (await workbook(key)).definition.tabs
}

function headersOf(firstRow: string[], tab: WorldIndexTabDefinition, width: number) {
  return Array.from({ length: Math.max(width, tab.headers.length) }, (_, index) => firstRow[index]?.trim() || tab.headers[index] || `Colonne ${index + 1}`)
}

/** Lecture avec la mise en forme : c'est ce qu'affiche et modifie le tableau. */
async function readTable(spreadsheetId: string, key: WorldIndexKey, tabName: string): Promise<WorldIndexTable> {
  const tab = tabDefinition(key, tabName)
  const sheet = await readFormattedSheet(spreadsheetId, [tab.name], { light: true })
  const width = Math.max(0, ...sheet.rows.map((row) => row?.length ?? 0))
  const headers = headersOf((sheet.rows[0] ?? []).map((cell) => cell?.value ?? ""), tab, width)
  const body = sheet.rows.slice(1)
  let lastFilled = body.length - 1
  while (lastFilled >= 0 && !body[lastFilled]?.some((cell) => cell?.value.trim())) lastFilled -= 1
  // Une ligne vide entre deux lignes remplies reste affichée, comme dans Sheets : c'est
  // souvent une ligne qu'on vient d'insérer pour la remplir.
  const rows = body.flatMap((row, index) => index <= lastFilled
    ? [{
        rowNumber: index + 2,
        values: headers.map((_, column) => row?.[column]?.value ?? ""),
        html: headers.map((_, column) => row?.[column]?.html ?? ""),
      }]
    : [])
  return { tabName: sheet.tabName, sheetId: sheet.sheetId, headers, rows }
}

/**
 * Le type effectif d'une colonne : celui du schéma, sinon le type prévu par Eraser
 * (d'après son nom d'origine si elle a été renommée).
 */
export function effectiveColumnSpec(key: WorldIndexKey, tab: string, header: string, schema: SchemaEntry[]): IndexColumnSpec {
  const entry = findEntry(schema, tab, header)
  const base = worldColumnSpec(key, tab, entry?.origin || header)
  return entry?.spec ? { ...base, ...entry.spec } : base
}

/** Les colonnes d'un onglet hors corbeille, avec leur type. Une colonne en double n'apparaît qu'une fois. */
function columnsOf(key: WorldIndexKey, table: WorldIndexTable, schema: SchemaEntry[]): WorldIndexColumn[] {
  const seen = new Set<string>()
  return table.headers.flatMap((header) => {
    const folded = foldName(header)
    if (!header.trim() || seen.has(folded) || trashed(findEntry(schema, table.tabName, header))) return []
    seen.add(folded)
    return [{ header, spec: effectiveColumnSpec(key, table.tabName, header, schema) }]
  })
}

/** Les liens d'un index : ceux prévus par Eraser et ceux créés dans l'éditeur (déclarés des deux côtés). */
function linksOf(key: WorldIndexKey): WorldIndexLink[] {
  const schema = effectiveIndexes.get(key)?.schema ?? []
  const fromSchema = schema.flatMap((entry): WorldIndexLink[] => entry.column && !trashed(entry) && entry.spec?.kind === "linked" && entry.spec.link
    ? [[{ index: key, tab: entry.tab, column: entry.column }, entry.spec.link]]
    : [])
  return [...worldIndexLinks.filter(([left, right]) => left.index === key || right.index === key), ...fromSchema]
}

/**
 * Remplit un index prévu par Eraser avec ses lignes de départ, une seule fois : quand
 * tous ses onglets sont vides et que ce classeur n'a encore jamais été rempli depuis
 * cette installation. Une feuille qui a déjà des lignes n'est jamais touchée.
 */
async function seedEmptyIndex(key: WorldIndexKey, sheet: Awaited<ReturnType<typeof workbook>>, tables: WorldIndexTable[]) {
  const seed = isBuiltinWorldIndexKey(key) ? worldIndexSeeds[key]?.() : undefined
  if (!seed || tables.some((table) => table.rows.some((row) => row.values.some((value) => value.trim())))) return false
  const flag = `world-index-seed:${key}:${sheet.spreadsheetId}`
  const [done] = await getDb().select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, flag)).limit(1)
  if (done) return false
  for (const table of tables) {
    const rows = seed[table.tabName] ?? []
    if (!rows.length) continue
    const prefix = tabDefinition(key, table.tabName).idPrefix
    const values = rows.map((row) => table.headers.map((header) => {
      if (foldName(header) === foldName(ID_HEADER)) return newIndexId(prefix)
      const entry = Object.entries(row).find(([candidate]) => foldName(candidate) === foldName(header))
      return entry?.[1] ?? ""
    }))
    await updateRange(sheet.spreadsheetId, sheetTabRange(table.tabName, `A2:${columnName(table.headers.length)}${values.length + 1}`), values)
  }
  await getDb().insert(sheetIndexSyncs).values({ key: flag }).onConflictDoNothing()
  clearSpreadsheetReadCache(sheet.spreadsheetId)
  return true
}

async function loadWorldIndex(key: WorldIndexKey): Promise<WorldIndexData> {
  const sheet = await workbook(key)
  let tables = await Promise.all(sheet.definition.tabs.map((tab) => readTable(sheet.spreadsheetId, key, tab.name)))
  if (await seedEmptyIndex(key, sheet, tables)) tables = await Promise.all(sheet.definition.tabs.map((tab) => readTable(sheet.spreadsheetId, key, tab.name)))
  if (tables.some(needsIds)) scheduleIdBackfill(key)
  return {
    key,
    webViewLink: sheet.webViewLink,
    tables,
    definition: sheet.definition,
    columns: Object.fromEntries(tables.map((table) => [table.tabName, columnsOf(key, table, sheet.schema)])),
    links: linksOf(key),
  }
}

/** Une ligne remplie sans identifiant, ou avec celui d'une autre ligne (copiée dans Sheets). */
function needsIds(table: WorldIndexTable) {
  const column = columnOf(table.headers, ID_HEADER)
  if (column < 0) return false
  const seen = new Set<string>()
  return table.rows.some((row) => {
    if (!row.values.some((value, index) => index !== column && value.trim())) return false
    const id = (row.values[column] || "").trim()
    if (!id || seen.has(id)) return true
    seen.add(id)
    return false
  })
}

const backfilling = new Set<WorldIndexKey>()

/**
 * Donne un identifiant aux lignes qui n'en ont pas (lignes existantes, lignes
 * ajoutées dans Sheets) ou qui partagent celui d'une autre. Seules les cellules ID
 * concernées sont écrites ; rien d'autre n'est touché. Lancé après la lecture, dans
 * la file des écritures : il ne bloque jamais l'affichage.
 */
function scheduleIdBackfill(key: WorldIndexKey) {
  if (backfilling.has(key)) return
  backfilling.add(key)
  void serialized(async () => {
    const seen = new Set<string>()
    const data: Array<{ range: string; values: string[][] }> = []
    const patches: Array<{ tabName: string; rowNumber: number; column: number; id: string }> = []
    let spreadsheetId = ""
    for (const tab of await tabsOf(key)) {
      const table = await plainTable(key, tab.name)
      spreadsheetId = table.spreadsheetId
      const column = columnOf(table.headers, ID_HEADER)
      if (column < 0) continue
      table.rows.forEach((row, index) => {
        if (index === 0 || !row.some((value, position) => position !== column && value?.trim())) return
        const current = (row[column] || "").trim()
        if (current && !seen.has(current)) { seen.add(current); return }
        let id = newIndexId(tab.idPrefix)
        while (seen.has(id)) id = newIndexId(tab.idPrefix)
        seen.add(id)
        const cell = `${columnName(column + 1)}${index + 1}`
        data.push({ range: sheetTabRange(tab.name, `${cell}:${cell}`), values: [[id]] })
        patches.push({ tabName: tab.name, rowNumber: index + 1, column, id })
      })
    }
    if (!data.length) return
    await googleSheetsJson(`spreadsheets/${spreadsheetId}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) })
    clearSpreadsheetReadCache(spreadsheetId)
    for (const patch of patches) await patchCachedRow(key, patch.tabName, patch.rowNumber, [{ column: patch.column, html: patch.id }])
  }).catch((error) => console.error("WORLD_INDEX_ID_BACKFILL_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"))
    .finally(() => backfilling.delete(key))
}

/**
 * Le contenu de chaque index, gardé en mémoire. Relire tout un classeur mis en forme
 * prend plusieurs secondes : on ne le fait plus qu'à l'ouverture, sur « Actualiser »,
 * après un changement de structure (ajout, suppression…) ou passé quelques minutes,
 * pour voir ce qui a été modifié directement dans Sheets. Une cellule enregistrée
 * depuis l'application est recopiée ici au lieu de tout relire.
 */
const WORLD_INDEX_CACHE_MS = 5 * 60_000
const worldIndexCache = new Map<WorldIndexKey, { expiresAt: number; promise: Promise<WorldIndexData> }>()

const lastLoaded = new Map<WorldIndexKey, WorldIndexData>()

export function getWorldIndex(key: WorldIndexKey, options: { refresh?: boolean } = {}): Promise<WorldIndexData> {
  const cached = worldIndexCache.get(key)
  if (!options.refresh && cached && cached.expiresAt > Date.now()) return cached.promise
  const promise = loadWorldIndex(key)
  worldIndexCache.set(key, { expiresAt: Date.now() + WORLD_INDEX_CACHE_MS, promise })
  promise.then((data) => { if (worldIndexCache.get(key)?.promise === promise) lastLoaded.set(key, data) }, () => undefined)
  // Une lecture ratée ne doit pas rester en mémoire : la suivante réessaie.
  promise.catch(() => { if (worldIndexCache.get(key)?.promise === promise) worldIndexCache.delete(key) })
  return promise
}

/**
 * Pour ceux qui lisent un index sans l'afficher (la fiche de personnage) : la dernière
 * version chargée tout de suite, relue en arrière-plan quand elle a vieilli. Seule la
 * toute première lecture attend Google Sheets.
 */
export function getWorldIndexQuick(key: WorldIndexKey): Promise<WorldIndexData> {
  const cached = worldIndexCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  // Sans entrée en mémoire, l'index vient de changer (ligne ajoutée, structure) : on attend sa relecture.
  const previous = cached ? lastLoaded.get(key) : undefined
  const loading = getWorldIndex(key)
  if (!previous) return loading
  loading.catch(() => undefined)
  return Promise.resolve(previous)
}

function invalidateWorldIndexes(keys: Iterable<WorldIndexKey>) {
  for (const key of keys) worldIndexCache.delete(key)
}

/** Les index qu'un changement dans `key` peut toucher par ses colonnes liées. */
function linkedIndexes(key: WorldIndexKey) {
  const keys = new Set<WorldIndexKey>([key])
  for (const [left, right] of linksOf(key)) {
    keys.add(left.index)
    keys.add(right.index)
  }
  return keys
}

function escapeCellHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />")
}

/** Recopie dans la mémoire des cellules qu'on vient d'écrire dans Sheets. */
async function patchCachedRow(key: WorldIndexKey, tabName: string, rowNumber: number, cells: Array<{ column: number; html: string }>) {
  const entry = worldIndexCache.get(key)
  if (!entry) return
  const data = await entry.promise.catch(() => null)
  const row = data?.tables.find((table) => table.tabName === tabName)?.rows.find((candidate) => candidate.rowNumber === rowNumber)
  if (!row) return invalidateWorldIndexes([key])
  for (const { column, html } of cells) {
    const rich = /<[a-z]/i.test(html)
    row.values[column] = rich ? htmlToRichText(html).text : html
    row.html[column] = rich ? html : escapeCellHtml(html)
  }
}

function columnOf(headers: string[], name: string) {
  return headers.findIndex((header) => foldName(header) === foldName(name))
}

/**
 * Les écritures liées passent une par une. Deux cellules enregistrées coup sur coup
 * cherchaient sinon la même entité en même temps, ne la trouvaient ni l'une ni
 * l'autre, et la créaient deux fois. Le serveur tourne dans un seul processus
 * (l'application Windows) : une file en mémoire suffit.
 */
let linkQueue: Promise<unknown> = Promise.resolve()

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = linkQueue.then(task, task)
  linkQueue = run.catch(() => undefined)
  return run
}

/**
 * Valeurs brutes d'un onglet, relues depuis Google à chaque fois : une entité ajoutée
 * à la main dans Sheets doit être vue tout de suite, sinon elle serait recréée.
 */
async function plainTable(key: WorldIndexKey, tabName: string) {
  const sheet = await workbook(key)
  const tab = tabDefinition(key, tabName)
  clearSpreadsheetReadCache(sheet.spreadsheetId)
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange(tabName, "A1:AZ"))
  const headers = headersOf(rows[0] ?? [], tab, Math.max(0, ...rows.map((row) => row.length)))
  return { spreadsheetId: sheet.spreadsheetId, headers, rows }
}

type PlainTable = Awaited<ReturnType<typeof plainTable>>

function rowName(table: PlainTable, rowIndex: number) {
  const nameColumn = columnOf(table.headers, "Nom")
  return nameColumn >= 0 ? (table.rows[rowIndex]?.[nameColumn] || "").replace(/\s+/g, " ").trim() : ""
}

function findRowByName(table: PlainTable, name: string) {
  const nameColumn = columnOf(table.headers, "Nom")
  if (nameColumn < 0) return -1
  return table.rows.findIndex((row, index) => index > 0 && foldName(row[nameColumn] || "") === foldName(name))
}

async function writeCell(table: PlainTable, tabName: string, rowIndex: number, column: number, value: string) {
  const cell = `${columnName(column + 1)}${rowIndex + 1}`
  await updateRange(table.spreadsheetId, sheetTabRange(tabName, `${cell}:${cell}`), [[value]], { valueInputOption: "RAW" })
  ;(table.rows[rowIndex] ||= [])[column] = value
}

/**
 * Écrit une ligne complète juste sous la dernière ligne remplie, en colonne A. L'ajout
 * « append » de Google devine lui-même où commence le tableau et pouvait décaler les
 * valeurs d'une ou plusieurs colonnes : on choisit la ligne nous-mêmes.
 */
async function writeNewRow(key: WorldIndexKey, table: PlainTable, tabName: string, provided: string[]) {
  // Toute nouvelle ligne reçoit son identifiant (une ligne déplacée garde le sien).
  const idColumn = columnOf(table.headers, ID_HEADER)
  const values = idColumn >= 0 && !(provided[idColumn] ?? "").trim()
    ? table.headers.map((_, index) => index === idColumn ? newIndexId(tabDefinition(key, tabName).idPrefix) : provided[index] ?? "")
    : provided
  let rowIndex = table.rows.length
  while (rowIndex > 1 && !(table.rows[rowIndex - 1] ?? []).some((value) => value.trim())) rowIndex -= 1
  const range = sheetTabRange(tabName, `A${rowIndex + 1}:${columnName(values.length)}${rowIndex + 1}`)
  try {
    await updateRange(table.spreadsheetId, range, [values], { valueInputOption: "RAW" })
  } catch {
    // La grille est pleine : on lui ajoute des lignes puis on réessaie.
    const tabs = await spreadsheetTabs(table.spreadsheetId)
    const sheetId = tabs.find((tab) => tab.title === tabName)?.sheetId
    if (sheetId === undefined) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
    await googleSheetsJson(`spreadsheets/${table.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ appendDimension: { sheetId, dimension: "ROWS", length: 500 } }] }) })
    await updateRange(table.spreadsheetId, range, [values], { valueInputOption: "RAW" })
  }
  table.rows[rowIndex] = [...values]
  return rowIndex + 1
}

/** La ligne `name` parmi les onglets couverts par `end` ; -1 si elle n'existe nulle part. */
async function locateLinked(end: WorldIndexLinkEnd, name: string) {
  const tabs = end.tab === "*" ? (await tabsOf(end.index)).map((tab) => tab.name) : [end.tab]
  for (const tab of tabs) {
    const table = await plainTable(end.index, tab)
    const rowIndex = findRowByName(table, name)
    if (rowIndex > 0) return { tab, table, rowIndex }
  }
  // Absente : elle sera créée dans le premier onglet couvert.
  return { tab: tabs[0], table: await plainTable(end.index, tabs[0]), rowIndex: -1 }
}

/** Inscrit `value` dans la colonne `end` de la ligne `targetName`, créée au besoin. */
async function addLink(end: WorldIndexLinkEnd, targetName: string, value: string) {
  const { tab, table, rowIndex } = await locateLinked(end, targetName)
  const nameColumn = columnOf(table.headers, "Nom")
  const linkColumn = columnOf(table.headers, end.column)
  if (nameColumn < 0 || linkColumn < 0) return false
  if (rowIndex > 0) {
    const current = splitNames(table.rows[rowIndex][linkColumn] || "")
    if (current.some((name) => foldName(name) === foldName(value))) return false
    await writeCell(table, tab, rowIndex, linkColumn, [...current, value].join(", "))
    return true
  }
  await writeNewRow(end.index, table, tab, table.headers.map((_, index) => index === nameColumn ? targetName : index === linkColumn ? value : ""))
  return true
}

/**
 * Retire `value` de la colonne `end` de la ligne `targetName`, ou l'y renomme en
 * `replacement`. Seul le lien bouge : l'entité d'en face n'est jamais supprimée.
 */
async function removeLink(end: WorldIndexLinkEnd, targetName: string, value: string, replacement?: string) {
  const { tab, table, rowIndex } = await locateLinked(end, targetName)
  const linkColumn = columnOf(table.headers, end.column)
  if (linkColumn < 0 || rowIndex <= 0) return false
  const current = splitNames(table.rows[rowIndex][linkColumn] || "")
  if (!current.some((name) => foldName(name) === foldName(value))) return false
  const next = replacement
    ? splitNames(current.map((name) => foldName(name) === foldName(value) ? replacement : name).join(", "))
    : current.filter((name) => foldName(name) !== foldName(value))
  await writeCell(table, tab, rowIndex, linkColumn, next.join(", "))
  return true
}

/** Les colonnes liées d'un onglet, chacune avec la colonne qui lui répond. */
function linkEndsOf(key: WorldIndexKey, tabName: string) {
  return linksOf(key).flatMap((pair) => ([[pair[0], pair[1]], [pair[1], pair[0]]] as const).filter(([end]) => linkEndCovers(end, key, tabName)))
}

function isSelfLink(key: WorldIndexKey, tabName: string, other: WorldIndexLinkEnd, target: string, name: string) {
  // Un peuple n'est pas son propre ancêtre.
  return linkEndCovers(other, key, tabName) && foldName(target) === foldName(name)
}

/** Propage les colonnes liées d'une ligne vers les index d'en face. */
async function syncRowLinks(key: WorldIndexKey, tabName: string, rowNumber: number, changed: Set<WorldIndexKey>) {
  const table = await plainTable(key, tabName)
  const name = rowName(table, rowNumber - 1)
  if (!name) return
  for (const [end, other] of linkEndsOf(key, tabName)) {
    const column = columnOf(table.headers, end.column)
    if (column < 0) continue
    for (const target of splitNames(table.rows[rowNumber - 1]?.[column] || "")) {
      if (isSelfLink(key, tabName, other, target, name)) continue
      if (await addLink(other, target, name)) changed.add(other.index)
    }
  }
}

/** L'onglet tel qu'il est en mémoire : pas besoin de relire tout le classeur pour écrire une cellule. */
async function tableFor(key: WorldIndexKey, tabName: string) {
  const [sheet, data] = await Promise.all([workbook(key), getWorldIndex(key)])
  const table = data.tables.find((candidate) => candidate.tabName === tabName)
  if (!table) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
  return { sheet, table }
}

/**
 * Une cellule, avec sa mise en forme. Si elle est liée, l'autre côté suit : noms
 * ajoutés inscrits (et créés au besoin), noms effacés retirés, entité renommée
 * renommée partout où elle est citée. Renvoie les index modifiés par les liens.
 */
/**
 * Une ligne renommée : les listes liées du même index qui la citaient prennent le nouveau
 * nom (la Caractéristique des compétences quand on renomme une caractéristique…). Seules
 * les cellules qui citaient l'ancien nom sont réécrites.
 */
async function renameLinkedChoices(key: WorldIndexKey, tabName: string, oldName: string, newName: string) {
  const { schema } = await workbook(key)
  const pointsHere = (tab: string, header: string) => { const spec = effectiveColumnSpec(key, tab, header, schema); return spec.kind === "linked-choice" && spec.source?.index === key && spec.source.tab === tabName }
  let touched = false
  for (const tab of await tabsOf(key)) {
    // Sans liste liée vers cet onglet (d'après la définition et le schéma), rien à relire.
    const known = [...tab.headers, ...schema.filter((entry) => entry.tab === tab.name && entry.column).map((entry) => entry.column)]
    if (!known.some((header) => pointsHere(tab.name, header))) continue
    const table = await plainTable(key, tab.name)
    const data: Array<{ range: string; values: string[][] }> = []
    table.headers.forEach((header, column) => {
      if (!pointsHere(tab.name, header)) return
      table.rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) return
        const names = splitNames(row[column] ?? "")
        if (!names.some((name) => foldName(name) === foldName(oldName))) return
        const next = names.map((name) => foldName(name) === foldName(oldName) ? newName : name).join(", ")
        const cell = `${columnName(column + 1)}${rowIndex + 1}`
        data.push({ range: sheetTabRange(tab.name, `${cell}:${cell}`), values: [[next]] })
      })
    })
    if (!data.length) continue
    await googleSheetsJson(`spreadsheets/${table.spreadsheetId}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) })
    clearSpreadsheetReadCache(table.spreadsheetId)
    touched = true
  }
  if (touched) invalidateWorldIndexes([key])
}

export function updateWorldIndexCell(key: WorldIndexKey, tabName: string, rowNumber: number, column: number, html: string) {
  return serialized(async () => {
    const { sheet, table } = await tableFor(key, tabName)
    if (!table.rows.some((row) => row.rowNumber === rowNumber) || !Number.isInteger(column) || column < 0 || column >= table.headers.length) throw new Error("WORLD_INDEX_ROW_NOT_FOUND")
    const header = table.headers[column]
    const ends = linkEndsOf(key, tabName)
    const linkedEnd = ends.find(([end]) => foldName(end.column) === foldName(header))
    const touchesLinks = Boolean(linkedEnd) || (isNameColumn(header) && ends.length > 0)
    const previousName = isNameColumn(header) ? (table.rows.find((row) => row.rowNumber === rowNumber)?.values[column] ?? "").replace(/\s+/g, " ").trim() : ""
    const before = touchesLinks ? await plainTable(key, tabName) : null
    await updateFormattedCell({ spreadsheetId: sheet.spreadsheetId, sheetId: table.sheetId, rowNumber, column, html })
    await patchCachedRow(key, tabName, rowNumber, [{ column, html }])
    const renamedTo = htmlToRichText(html).text.replace(/\s+/g, " ").trim()
    if (previousName && renamedTo && foldName(previousName) !== foldName(renamedTo)) await renameLinkedChoices(key, tabName, previousName, renamedTo)
    const changed = new Set<WorldIndexKey>()
    if (!before) return []
    const oldName = rowName(before, rowNumber - 1)
    const newValue = htmlToRichText(html).text.replace(/\s+/g, " ").trim()

    if (linkedEnd && oldName) {
      // Noms effacés de la cellule : l'autre côté les oublie aussi.
      const [end, other] = linkedEnd
      const kept = new Set(splitNames(newValue).map(foldName))
      for (const removed of splitNames(before.rows[rowNumber - 1]?.[columnOf(before.headers, end.column)] || "")) {
        if (!kept.has(foldName(removed)) && await removeLink(other, removed, oldName)) changed.add(other.index)
      }
    }
    if (isNameColumn(header) && oldName && newValue && foldName(oldName) !== foldName(newValue)) {
      // Entité renommée : chaque ligne qui la citait reçoit le nouveau nom.
      for (const [end, other] of ends) {
        for (const target of splitNames(before.rows[rowNumber - 1]?.[columnOf(before.headers, end.column)] || "")) {
          if (await removeLink(other, target, oldName, newValue)) changed.add(other.index)
        }
      }
    }
    await syncRowLinks(key, tabName, rowNumber, changed)
    invalidateWorldIndexes(changed)
    return [...changed]
  })
}

/** Le formulaire d'ajout : les valeurs arrivent en HTML, les cellules gardent leur mise en forme. */
export function addWorldIndexRow(key: WorldIndexKey, tabName: string, provided: string[]) {
  return serialized(async () => {
    const { sheet, table } = await tableFor(key, tabName)
    const html = table.headers.map((_, index) => String(provided[index] ?? "").slice(0, 50_000))
    const plain = html.map((value) => htmlToRichText(value).text)
    const nameColumn = columnOf(table.headers, "Nom")
    if (nameColumn >= 0 && !plain[nameColumn].trim()) throw new Error("WORLD_INDEX_NAME_REQUIRED")
    const current = await plainTable(key, tabName)
    // Une entité du même nom existe déjà (créée par un lien, par exemple) : on la
    // complète au lieu d'en créer une seconde.
    const existing = nameColumn >= 0 ? findRowByName(current, plain[nameColumn]) : -1
    let rowNumber: number
    if (existing > 0) {
      rowNumber = existing + 1
      for (const [column, value] of plain.entries()) {
        if (column === nameColumn || !value.trim()) continue
        const previous = current.rows[existing][column] || ""
        const merged = linkEndsOf(key, tabName).some(([end]) => foldName(end.column) === foldName(table.headers[column]))
          ? splitNames(`${previous}, ${value}`).join(", ")
          : value
        await writeCell(current, tabName, existing, column, merged)
      }
    } else {
      rowNumber = await writeNewRow(key, current, tabName, plain)
    }
    for (const [column, value] of html.entries()) {
      if (/<[a-z]/i.test(value)) await updateFormattedCell({ spreadsheetId: sheet.spreadsheetId, sheetId: table.sheetId, rowNumber, column, html: value })
    }
    const changed = new Set<WorldIndexKey>([key])
    await syncRowLinks(key, tabName, rowNumber, changed)
    invalidateWorldIndexes(changed)
    return [...changed].filter((changedKey) => changedKey !== key)
  })
}

/**
 * « Ajouter une ligne » ou « plusieurs » : des lignes vides juste sous `afterRowNumber`,
 * avec la mise en forme de la ligne du dessus. La mémoire est décalée au lieu d'être
 * relue : des lignes vides en fin de tableau n'y seraient sinon plus visibles.
 */
export function insertWorldIndexRows(key: WorldIndexKey, tabName: string, afterRowNumber: number, count: number) {
  return serialized(async () => {
    const { sheet, table } = await tableFor(key, tabName)
    const rows = Math.max(1, Math.min(100, Math.trunc(count) || 1))
    if (!Number.isInteger(afterRowNumber) || afterRowNumber < 1) throw new Error("WORLD_INDEX_ROW_NOT_FOUND")
    await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ insertDimension: { range: { sheetId: table.sheetId, dimension: "ROWS", startIndex: afterRowNumber, endIndex: afterRowNumber + rows }, inheritFromBefore: afterRowNumber > 1 } }] }),
    })
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    for (const row of table.rows) if (row.rowNumber > afterRowNumber) row.rowNumber += rows
    const position = table.rows.findIndex((row) => row.rowNumber > afterRowNumber)
    const blanks = Array.from({ length: rows }, (_, offset) => ({ rowNumber: afterRowNumber + offset + 1, values: table.headers.map(() => ""), html: table.headers.map(() => "") }))
    table.rows.splice(position < 0 ? table.rows.length : position, 0, ...blanks)
  })
}

/** La copie apparaît juste sous l'originale, mise en forme comprise. */
export function duplicateWorldIndexRows(key: WorldIndexKey, tabName: string, rowNumbers: number[]) {
  return serialized(async () => {
  const { sheet, table } = await tableFor(key, tabName)
  for (const rowNumber of [...rowNumbers].sort((left, right) => right - left)) {
    if (!table.rows.some((row) => row.rowNumber === rowNumber)) continue
    await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [
        { insertDimension: { range: { sheetId: table.sheetId, dimension: "ROWS", startIndex: rowNumber, endIndex: rowNumber + 1 }, inheritFromBefore: true } },
        { copyPaste: {
          source: { sheetId: table.sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: 0, endColumnIndex: table.headers.length },
          destination: { sheetId: table.sheetId, startRowIndex: rowNumber, endRowIndex: rowNumber + 1, startColumnIndex: 0, endColumnIndex: table.headers.length },
          pasteType: "PASTE_NORMAL",
        } },
      ] }),
    })
    // La copie reçoit son propre identifiant.
    const idColumn = columnOf(table.headers, ID_HEADER)
    if (idColumn >= 0) {
      const cell = `${columnName(idColumn + 1)}${rowNumber + 1}`
      await updateRange(sheet.spreadsheetId, sheetTabRange(tabName, `${cell}:${cell}`), [[newIndexId(tabDefinition(key, tabName).idPrefix)]], { valueInputOption: "RAW" })
    }
  }
  clearSpreadsheetReadCache(sheet.spreadsheetId)
  invalidateWorldIndexes([key])
  })
}

/**
 * Du bas vers le haut : retirer une ligne décale toutes les suivantes. Avant, l'entité
 * supprimée est retirée des colonnes liées qui la citaient.
 */
export function deleteWorldIndexRows(key: WorldIndexKey, tabName: string, rowNumbers: number[]) {
  return serialized(async () => {
    const { sheet, table } = await tableFor(key, tabName)
    const before = await plainTable(key, tabName)
    const targets = [...new Set(rowNumbers)].filter((rowNumber) => table.rows.some((row) => row.rowNumber === rowNumber)).sort((left, right) => right - left)
    const deletedNames = new Set(targets.map((rowNumber) => foldName(rowName(before, rowNumber - 1))))
    for (const rowNumber of targets) {
      const name = rowName(before, rowNumber - 1)
      if (!name) continue
      for (const [end, other] of linkEndsOf(key, tabName)) {
        for (const target of splitNames(before.rows[rowNumber - 1]?.[columnOf(before.headers, end.column)] || "")) {
          // Une ligne supprimée en même temps n'a pas besoin d'être nettoyée.
          if (linkEndCovers(other, key, tabName) && deletedNames.has(foldName(target))) continue
          await removeLink(other, target, name)
        }
      }
    }
    // Les lignes ont pu bouger pendant le nettoyage : on les retrouve par leur nom.
    const fresh = await plainTable(key, tabName)
    const freshNumbers = targets.map((rowNumber) => {
      const name = rowName(before, rowNumber - 1)
      const index = name ? findRowByName(fresh, name) : rowNumber - 1
      return index > 0 ? index + 1 : rowNumber
    }).sort((left, right) => right - left)
    for (const rowNumber of freshNumbers) await deleteGoogleSheetRow(sheet.spreadsheetId, tabName, rowNumber, table.sheetId)
    invalidateWorldIndexes(linkedIndexes(key))
  })
}

/**
 * Plusieurs colonnes d'une même ligne, nommées par leur en-tête : c'est la fiche d'une
 * créature, dont la plupart des champs ne sont pas affichés dans le tableau. Seules les
 * valeurs modifiées sont écrites, pour ne pas effacer la mise en forme des autres.
 */
export function updateWorldIndexFields(key: WorldIndexKey, tabName: string, rowNumber: number, fields: Record<string, string>) {
  return serialized(async () => {
    const table = await plainTable(key, tabName)
    const rowIndex = rowNumber - 1
    if (rowIndex < 1 || !table.rows[rowIndex]?.some((value) => value.trim())) throw new Error("WORLD_INDEX_ROW_NOT_FOUND")
    const nameColumn = columnOf(table.headers, "Nom")
    const oldName = nameColumn >= 0 ? String(table.rows[rowIndex]?.[nameColumn] ?? "").trim() : ""
    const data: Array<{ range: string; values: string[][] }> = []
    const formatted: Array<{ column: number; html: string }> = []
    const written = new Map<string, number>()
    for (const [header, raw] of Object.entries(fields)) {
      const column = columnOf(table.headers, header)
      if (column < 0) continue
      const value = String(raw ?? "").slice(0, 50_000)
      if (column === nameColumn && !value.trim()) throw new Error("WORLD_INDEX_NAME_REQUIRED")
      if ((table.rows[rowIndex][column] ?? "") === value) continue
      // Texte enrichi : écrit avec sa mise en forme plutôt qu'avec ses balises.
      if (/<[a-z]/i.test(value)) { formatted.push({ column, html: value }); continue }
      const cell = `${columnName(column + 1)}${rowNumber}`
      const range = sheetTabRange(tabName, `${cell}:${cell}`)
      written.set(range, column)
      data.push({ range, values: [[value]] })
    }
    if (data.length) {
      await googleSheetsJson(`spreadsheets/${table.spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "RAW", data }),
      })
      clearSpreadsheetReadCache(table.spreadsheetId)
    }
    if (formatted.length) {
      const tabs = await spreadsheetTabs(table.spreadsheetId)
      const sheetId = tabs.find((tab) => tab.title === tabName)?.sheetId
      if (sheetId === undefined) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
      for (const cell of formatted) await updateFormattedCell({ spreadsheetId: table.spreadsheetId, sheetId, rowNumber, column: cell.column, html: cell.html })
    }
    await patchCachedRow(key, tabName, rowNumber, [
      ...data.map((entry) => ({ column: written.get(entry.range) ?? -1, html: entry.values[0][0] })),
      ...formatted,
    ].filter((cell) => cell.column >= 0))
    const nameField = Object.entries(fields).find(([header]) => columnOf(table.headers, header) === nameColumn)?.[1]
    const newName = nameField === undefined ? "" : htmlToRichText(String(nameField)).text.replace(/\s+/g, " ").trim()
    if (oldName && newName && foldName(oldName) !== foldName(newName)) await renameLinkedChoices(key, tabName, oldName, newName)
    return data.length + formatted.length
  })
}

/**
 * Déplace des lignes vers un autre onglet du même index (un lieu créé par un lien
 * arrive dans le premier onglet, on le range ensuite). Les colonnes sont recopiées
 * par leur nom, la ligne d'origine est ensuite retirée. Les liens suivent d'eux-mêmes :
 * ils désignent une entité par son nom, quel que soit son onglet.
 */
export function moveWorldIndexRows(key: WorldIndexKey, fromTab: string, toTab: string, rowNumbers: number[]) {
  return serialized(async () => {
    if (fromTab === toTab) return
    if (!(await tabsOf(key)).some((tab) => tab.name === toTab)) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
    const source = await plainTable(key, fromTab)
    const target = await plainTable(key, toTab)
    const moved: number[] = []
    for (const rowNumber of [...new Set(rowNumbers)].sort((left, right) => left - right)) {
      const row = source.rows[rowNumber - 1]
      if (rowNumber < 2 || !row?.some((value) => value.trim())) continue
      const values = target.headers.map((header) => {
        const column = columnOf(source.headers, header)
        return column >= 0 ? row[column] ?? "" : ""
      })
      await writeNewRow(key, target, toTab, values)
      moved.push(rowNumber)
    }
    const { sheet, table } = await tableFor(key, fromTab)
    for (const rowNumber of moved.sort((left, right) => right - left)) await deleteGoogleSheetRow(sheet.spreadsheetId, fromTab, rowNumber, table.sheetId)
    invalidateWorldIndexes([key])
  })
}

/**
 * Après une fusion de sorts : les créatures qui citaient un sort supprimé citent
 * désormais le sort gardé. Ne crée jamais le classeur des créatures s'il n'existe pas.
 */
export function renameCreatureSpells(oldNames: string[], newName: string) {
  return serialized(async () => {
    const stored = await resolveJdrSheet("creatures")
    if (!stored || !oldNames.length || !newName.trim()) return 0
    const table = await plainTable("creatures", worldIndexDefinitions.creatures.tabs[0].name)
    const replaced = new Set(oldNames.map(foldName))
    const data: Array<{ range: string; values: string[][] }> = []
    for (const header of ["Sorts actifs", "Sorts passifs"]) {
      const column = columnOf(table.headers, header)
      if (column < 0) continue
      table.rows.forEach((row, index) => {
        if (index === 0) return
        const names = splitNames(row[column] || "")
        if (!names.some((name) => replaced.has(foldName(name)))) return
        const next = splitNames(names.map((name) => replaced.has(foldName(name)) ? newName : name).join(", ")).join(", ")
        const cell = `${columnName(column + 1)}${index + 1}`
        data.push({ range: sheetTabRange(worldIndexDefinitions.creatures.tabs[0].name, `${cell}:${cell}`), values: [[next]] })
      })
    }
    if (data.length) {
      await googleSheetsJson(`spreadsheets/${table.spreadsheetId}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) })
      clearSpreadsheetReadCache(table.spreadsheetId)
      invalidateWorldIndexes(["creatures"])
    }
    return data.length
  })
}

/**
 * Corrige l'orthographe des listes déroulantes : « Aggressif » devient « Agressif ».
 * Seules les cellules mal écrites d'une colonne à liste sont réécrites, par leur
 * valeur ; une valeur hors liste n'est jamais touchée. Renvoie le nombre corrigé.
 */
export function normalizeWorldIndexChoices(key: WorldIndexKey) {
  return serialized(async () => {
    let spreadsheetId = ""
    const data: Array<{ range: string; values: string[][] }> = []
    const { schema } = await workbook(key)
    for (const tab of await tabsOf(key)) {
      const table = await plainTable(key, tab.name)
      spreadsheetId = table.spreadsheetId
      table.headers.forEach((header, column) => {
        const spec = effectiveColumnSpec(key, tab.name, header, schema)
        if (spec.kind !== "choice" || !spec.options) return
        table.rows.forEach((row, index) => {
          if (index === 0) return
          const fixed = choiceCorrection(row[column] || "", spec.options!)
          if (!fixed) return
          const cell = `${columnName(column + 1)}${index + 1}`
          data.push({ range: sheetTabRange(tab.name, `${cell}:${cell}`), values: [[fixed]] })
        })
      })
    }
    if (data.length) {
      await googleSheetsJson(`spreadsheets/${spreadsheetId}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) })
      clearSpreadsheetReadCache(spreadsheetId)
      invalidateWorldIndexes([key])
    }
    return data.length
  })
}

/**
 * Liste déroulante liée : le nom choisi existe-t-il dans l'index source ? Sinon sa
 * ligne y est créée, comme pour une colonne liée. Renvoie `true` si une ligne a été créée.
 */
export function ensureWorldIndexEntry(key: WorldIndexKey, tabName: string, name: string) {
  return serialized(async () => {
    const clean = name.replace(/\s+/g, " ").trim()
    if (!clean) return false
    for (const tab of await tabsOf(key)) {
      if (findRowByName(await plainTable(key, tab.name), clean) > 0) return false
    }
    const table = await plainTable(key, tabName)
    const nameColumn = columnOf(table.headers, "Nom")
    if (nameColumn < 0) return false
    await writeNewRow(key, table, tabName, table.headers.map((_, index) => index === nameColumn ? clean : ""))
    invalidateWorldIndexes([key])
    return true
  })
}

// ---------------------------------------------------------------------------
// « Modifier » : le schéma d'un index du monde
// ---------------------------------------------------------------------------

/** Ce que l'éditeur montre d'un index : ses onglets, ses colonnes, leurs verrous et raisons. */
export async function worldEditorModel(key: WorldIndexKey): Promise<IndexEditorModel> {
  const data = await getWorldIndex(key)
  const links = data.links
  const firstTab = data.definition.tabs[0]?.name
  const linkedTabs = new Set(links.flatMap(([end]) => end.index === key && end.tab !== "*" ? [end.tab] : []))
  const tabs = data.tables.map((table): IndexEditorModel["tabs"][number] => {
    const locked = table.tabName === firstTab
      ? "Premier onglet : une ligne créée par un lien (un nom saisi ailleurs) arrive ici."
      : linkedTabs.has(table.tabName) ? "Une colonne liée d’un autre onglet ou d’un autre index vise cet onglet." : ""
    // Un onglet prévu par Eraser est lu par son nom ; un onglet visé par une colonne liée aussi.
    const planned = isBuiltinWorldIndexKey(key) && worldIndexDefinitions[key].tabs.some((tab) => foldName(tab.name) === foldName(table.tabName))
    const renameReason = planned ? "Onglet prévu par Eraser : il est retrouvé par son nom (créations, liens, statistiques)." : linkedTabs.has(table.tabName) ? "Une colonne liée vise cet onglet par son nom." : ""
    return {
      name: table.tabName,
      columns: (data.columns[table.tabName] ?? []).map((column) => ({ header: column.header, spec: column.spec, policy: worldColumnPolicy(key, table.tabName, column.header, links) })),
      remove: !locked,
      removeReason: locked || undefined,
      rename: !renameReason,
      renameReason: renameReason || undefined,
      addColumns: true,
    }
  })
  const deleteIndex = isBuiltinWorldIndexKey(key)
    ? { allowed: false, reason: "Index prévu par Eraser : le code le lit (fiches, colonnes liées, création de personnage, statistiques). On peut en supprimer des onglets et des colonnes, pas l’index entier." }
    : { allowed: true }
  return { family: "world", key, title: data.definition.title, tabs, addTabs: true, relationTargets: await worldRelationTargets(), deleteIndex }
}

/** Les index du monde qu'une relation peut viser, avec leurs onglets et colonnes. */
export async function worldRelationTargets(): Promise<RelationTarget[]> {
  const builtin = Object.values(worldIndexDefinitions).map((definition) => ({
    index: definition.key,
    title: definition.title,
    tabs: effectiveIndexes.get(definition.key)?.definition.tabs.map((tab) => ({ name: tab.name, columns: tab.headers })) ?? definition.tabs.map((tab) => ({ name: tab.name, columns: tab.headers })),
  }))
  const custom = await Promise.all((await listCustomIndexes()).map(async (entry) => {
    const tabs = await tabsOf(entry.key).catch(() => [] as WorldIndexTabDefinition[])
    return { index: entry.key, title: entry.title, tabs: tabs.map((tab) => ({ name: tab.name, columns: tab.headers })) }
  }))
  return [...builtin, ...custom]
}

async function writeHeader(spreadsheetId: string, tabName: string, column: number, header: string) {
  const cell = `${columnName(column + 1)}1`
  await updateRange(spreadsheetId, sheetTabRange(tabName, `${cell}:${cell}`), [[header]], { valueInputOption: "RAW" })
}

/** Ajoute une colonne à droite de la dernière colonne remplie de l'en-tête. */
async function appendHeader(spreadsheetId: string, tabName: string, header: string) {
  clearSpreadsheetReadCache(spreadsheetId)
  const [firstRow = []] = await readRange(spreadsheetId, sheetTabRange(tabName, "A1:AZ1"))
  let used = firstRow.length
  while (used > 0 && !firstRow[used - 1]?.trim()) used -= 1
  if (firstRow.slice(0, used).some((existing) => foldName(existing) === foldName(header))) return
  await ensureSheetColumnCount(spreadsheetId, tabName, used + 1)
  await writeHeader(spreadsheetId, tabName, used, header)
}

function assertPolicy(allowed: boolean, reasons: string[]) {
  if (!allowed) throw new Error(`INDEX_SCHEMA_LOCKED:${reasons.join(" ")}`)
}

/**
 * Crée l'autre côté d'une colonne liée : la colonne qui lui répond dans l'index visé,
 * déclarée dans son propre schéma. Une colonne déjà présente est reprise telle quelle.
 */
async function ensureReciprocal(key: WorldIndexKey, tab: string, header: string, link: NonNullable<IndexColumnSpec["link"]>) {
  const target = await workbook(link.index)
  const tabs = link.tab === "*" ? target.definition.tabs.map((item) => item.name) : [link.tab]
  const schema = [...target.schema]
  for (const targetTab of tabs) {
    await appendHeader(target.spreadsheetId, targetTab, link.column)
    upsertEntry(schema, targetTab, link.column, { spec: { kind: "linked", also: ["rich"], link: { index: key, tab, column: header } }, deletedAt: "" })
  }
  await writeSchema(target.spreadsheetId, schema)
  forgetEffectiveIndex(link.index)
}

/**
 * Applique les changements de l'éditeur, un par un, dans la file des écritures. Une
 * opération verrouillée est refusée même si l'interface l'avait laissée passer.
 */
export function applyWorldSchemaOperations(key: WorldIndexKey, operations: SchemaOperation[]) {
  return serialized(async () => {
    const sheet = await workbook(key, { refresh: true })
    const schema = [...sheet.schema]
    const links = linksOf(key)
    const now = new Date().toISOString()
    for (const operation of operations) {
      if (operation.op === "add-tab") {
        const problem = tabProblem(operation.name, [...(await spreadsheetTabs(sheet.spreadsheetId)).map((tab) => tab.title)])
        if (problem) throw new Error(`INDEX_SCHEMA_INVALID:${problem}`)
        const name = operation.name.replace(/\s+/g, " ").trim()
        const columns = operation.columns.filter((column) => !["nom", "id"].includes(foldName(column.header)))
        await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: name, gridProperties: { rowCount: 1000, columnCount: Math.max(26, columns.length + 2), frozenRowCount: 1, frozenColumnCount: 1 } } } }] }) })
        const headers = ["Nom", ...columns.map((column) => column.header.trim()), ID_HEADER]
        await updateRange(sheet.spreadsheetId, sheetTabRange(name, `A1:${columnName(headers.length)}1`), [headers], { valueInputOption: "RAW" })
        upsertEntry(schema, name, "", { state: "ajouté", deletedAt: "" })
        for (const column of columns) {
          upsertEntry(schema, name, column.header.trim(), { spec: column.spec, state: "ajouté", deletedAt: "" })
          if (column.spec.kind === "linked" && column.spec.link) await ensureReciprocal(key, name, column.header.trim(), column.spec.link)
        }
        continue
      }
      if (operation.op === "order-tabs") {
        const existing = await spreadsheetTabs(sheet.spreadsheetId)
        const requests: unknown[] = []
        operation.tabs.forEach((name, position) => {
          upsertEntry(schema, name, "", { spec: { kind: "tab", position } })
          const sheetId = existing.find((candidate) => candidate.title === name)?.sheetId
          if (sheetId !== undefined) requests.push({ updateSheetProperties: { properties: { sheetId, index: position }, fields: "index" } })
        })
        if (requests.length) await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) })
        continue
      }
      const tab = sheet.definition.tabs.find((candidate) => candidate.name === operation.tab)
      if (!tab) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
      if (operation.op === "rename-tab") {
        const model = await worldEditorModel(key)
        const target = model.tabs.find((candidate) => candidate.name === tab.name)
        assertPolicy(Boolean(target?.rename), [target?.renameReason ?? ""])
        const existing = await spreadsheetTabs(sheet.spreadsheetId)
        const problem = tabProblem(operation.to, existing.map((candidate) => candidate.title).filter((title) => title !== tab.name))
        if (problem) throw new Error(`INDEX_SCHEMA_INVALID:${problem}`)
        const to = operation.to.replace(/\s+/g, " ").trim()
        const sheetId = existing.find((candidate) => candidate.title === tab.name)?.sheetId
        if (sheetId === undefined) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
        await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId, title: to }, fields: "title" } }] }) })
        for (const entry of schema) if (entry.tab === tab.name) entry.tab = to
        clearSpreadsheetReadCache(sheet.spreadsheetId)
        continue
      }
      if (operation.op === "order-columns") {
        clearSpreadsheetReadCache(sheet.spreadsheetId)
        const [firstRow = []] = await readRange(sheet.spreadsheetId, sheetTabRange(tab.name, "A1:AZ1"))
        const moves = columnMoves(firstRow, operation.headers)
        const sheetId = (await spreadsheetTabs(sheet.spreadsheetId)).find((candidate) => candidate.title === tab.name)?.sheetId
        if (moves.length && sheetId !== undefined) {
          await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: moves.map((move) => ({ moveDimension: { source: { sheetId, dimension: "COLUMNS", startIndex: move.from, endIndex: move.from + 1 }, destinationIndex: move.to } })) }) })
          clearSpreadsheetReadCache(sheet.spreadsheetId)
        }
        continue
      }
      if (operation.op === "remove-tab") {
        const model = await worldEditorModel(key)
        const target = model.tabs.find((candidate) => candidate.name === tab.name)
        assertPolicy(Boolean(target?.remove), [target?.removeReason ?? ""])
        upsertEntry(schema, tab.name, "", { deletedAt: now })
        continue
      }
      const table = await plainTable(key, tab.name)
      if (operation.op === "add-column") {
        const problem = headerProblem(operation.header, table.headers)
        if (problem) throw new Error(`INDEX_SCHEMA_INVALID:${problem}`)
        const header = operation.header.replace(/\s+/g, " ").trim()
        await appendHeader(sheet.spreadsheetId, tab.name, header)
        upsertEntry(schema, tab.name, header, { spec: operation.spec, state: "ajouté", deletedAt: "" })
        if (operation.spec.kind === "linked" && operation.spec.link) await ensureReciprocal(key, tab.name, header, operation.spec.link)
        continue
      }
      const column = columnOf(table.headers, operation.header)
      if (column < 0) throw new Error("WORLD_INDEX_COLUMN_NOT_FOUND")
      const policy = worldColumnPolicy(key, tab.name, operation.header, links)
      const entry = findEntry(schema, tab.name, operation.header)
      if (operation.op === "rename") {
        assertPolicy(policy.rename, policy.reasons)
        const problem = headerProblem(operation.to, table.headers, operation.header)
        if (problem) throw new Error(`INDEX_SCHEMA_INVALID:${problem}`)
        const to = operation.to.replace(/\s+/g, " ").trim()
        await writeHeader(sheet.spreadsheetId, tab.name, column, to)
        // Une colonne prévue par Eraser garde son nom d'origine : elle n'est pas recréée.
        const planned = tab.headers.some((header) => foldName(header) === foldName(operation.header)) && !entry?.state
        if (entry) Object.assign(entry, { column: to, origin: entry.origin || (planned ? operation.header : "") })
        else schema.push({ tab: tab.name, column: to, origin: planned ? operation.header : "", spec: null, state: "", deletedAt: "" })
        // Les Recherches et Agrégats qui suivaient cette colonne suivent son nouveau nom.
        for (const other of schema) {
          if (other.tab !== tab.name || !other.spec) continue
          if (other.spec.lookup?.via && foldName(other.spec.lookup.via) === foldName(operation.header)) other.spec.lookup.via = to
          if (other.spec.rollup?.via && foldName(other.spec.rollup.via) === foldName(operation.header)) other.spec.rollup.via = to
        }
        continue
      }
      if (operation.op === "spec") {
        const current = effectiveColumnSpec(key, tab.name, operation.header, schema)
        if (!isDisplayOnlyChange(current, operation.spec)) assertPolicy(policy.type, policy.reasons)
        upsertEntry(schema, tab.name, operation.header, { spec: operation.spec })
        if (operation.spec.kind === "linked" && operation.spec.link && !current.link) await ensureReciprocal(key, tab.name, operation.header, operation.spec.link)
        continue
      }
      if (operation.op === "remove-column") {
        assertPolicy(policy.remove, policy.reasons)
        upsertEntry(schema, tab.name, operation.header, { deletedAt: now })
      }
    }
    await writeSchema(sheet.spreadsheetId, schema)
    forgetEffectiveIndex(key)
    readyWorkbooks.clear()
    return getWorldIndex(key, { refresh: true })
  })
}

// ---------------------------------------------------------------------------
// Corbeille : colonnes et onglets supprimés depuis l'éditeur
// ---------------------------------------------------------------------------

export type IndexTrashItem = { family: "world" | "objects"; key: string; title: string; tab: string; column: string; deletedAt: string; filled: number }

/** Les colonnes et onglets à la corbeille de tous les index du monde. */
export async function listWorldIndexTrash(): Promise<IndexTrashItem[]> {
  const keys: WorldIndexKey[] = [...Object.keys(worldIndexDefinitions) as WorldIndexKey[], ...(await listCustomIndexes()).map((entry) => entry.key)]
  const items = await Promise.all(keys.map(async (key) => {
    // Un index jamais ouvert n'a ni classeur ni corbeille : il n'est pas créé pour autant.
    if (isBuiltinWorldIndexKey(key) && !await resolveJdrSheet(key).catch(() => null)) return []
    const effective = await loadEffectiveIndex(key).catch(() => null)
    if (!effective) return []
    return effective.schema.filter((entry) => entry.deletedAt && entry.state !== "supprimé").map((entry): IndexTrashItem => ({ family: "world", key, title: effective.definition.title, tab: entry.tab, column: entry.column, deletedAt: entry.deletedAt, filled: 0 }))
  }))
  return items.flat()
}

/** Restaure une colonne ou un onglet de la corbeille. */
export function restoreWorldIndexTrash(key: WorldIndexKey, tab: string, column: string) {
  return serialized(async () => {
    const effective = await loadEffectiveIndex(key)
    const schema = [...effective.schema]
    const entry = findEntry(schema, tab, column)
    if (!entry) throw new Error("INDEX_TRASH_NOT_FOUND")
    entry.deletedAt = ""
    await writeSchema(effective.spreadsheetId, schema)
    forgetEffectiveIndex(key)
    readyWorkbooks.clear()
  })
}

/**
 * Suppression définitive : la colonne (ou l'onglet) est effacée de Google Sheets. Le
 * schéma garde une trace « supprimé » pour qu'Eraser ne la recrée pas.
 */
export function purgeWorldIndexTrash(key: WorldIndexKey, tab: string, column: string) {
  return serialized(async () => {
    const effective = await loadEffectiveIndex(key)
    const schema = [...effective.schema]
    const entry = findEntry(schema, tab, column)
    if (!entry?.deletedAt) throw new Error("INDEX_TRASH_NOT_FOUND")
    const tabs = await spreadsheetTabs(effective.spreadsheetId)
    const sheetId = tabs.find((candidate) => candidate.title === tab)?.sheetId
    if (sheetId !== undefined) {
      if (!column) {
        await googleSheetsJson(`spreadsheets/${effective.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteSheet: { sheetId } }] }) })
      } else {
        clearSpreadsheetReadCache(effective.spreadsheetId)
        const [firstRow = []] = await readRange(effective.spreadsheetId, sheetTabRange(tab, "A1:AZ1"))
        const index = firstRow.findIndex((header) => foldName(header) === foldName(column))
        if (index >= 0) await googleSheetsJson(`spreadsheets/${effective.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 } } }] }) })
      }
    }
    // Une colonne ou un onglet ajouté depuis Eraser disparaît du schéma ; un élément prévu
    // par Eraser y reste marqué « supprimé » pour ne jamais être recréé.
    const planned = !column
      ? isBuiltinWorldIndexKey(key) && worldIndexDefinitions[key].tabs.some((candidate) => candidate.name === tab)
      : Boolean(entry.origin) || (isBuiltinWorldIndexKey(key) && worldIndexDefinitions[key].tabs.some((candidate) => candidate.name === tab && candidate.headers.some((header) => foldName(header) === foldName(column))))
    const next = planned
      ? schema.map((candidate) => candidate === entry ? { ...candidate, state: "supprimé" as const } : candidate)
      : schema.filter((candidate) => candidate !== entry && !(column === "" && candidate.tab === tab))
    await writeSchema(effective.spreadsheetId, next)
    clearSpreadsheetReadCache(effective.spreadsheetId)
    forgetEffectiveIndex(key)
    readyWorkbooks.clear()
  })
}
