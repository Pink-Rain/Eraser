import { AsyncLocalStorage } from "node:async_hooks"

import {
  appendRows,
  clearSpreadsheetReadCache,
  columnName,
  configureStructuredSheet,
  ensureJdrSheet,
  ensureSheetColumnCount,
  entitySheetLocation,
  forgetClassIndexSync,
  getCampaignForMj,
  getCharacterForMj,
  googleSheetsJson,
  listClassOptions,
  onSpreadsheetWrite,
  readFormattedSheet,
  readNamedColumns,
  readRange,
  readRangeFreshWithOffset,
  resolveJdrSheet,
  sheetTabAll,
  softDeleteItem,
  sheetTabRange,
  spreadsheetTabs,
  updateFormattedCell,
  updateRange,
} from "@/lib/google-sheets"
import { CREATURE_SPELLS_TAB, invalidateClassContentCaches, spellSheetLocation } from "@/lib/class-content"
import { eq } from "drizzle-orm"

import { getDb } from "@/db"
import type { AccountRecord } from "@/lib/auth-types"
import { sheetIndexSyncs } from "@/db/schema"
import { htmlToRichText } from "@/lib/google-sheet-rich-text"
import { sheetRangeStartRow } from "@/lib/google-sheet-values"
import type { JdrSheetKey } from "@/lib/jdr-sheets"
import { customIndexEntry, idPrefixOf, isCustomIndexKey, listCustomIndexes } from "@/lib/custom-indexes"
import { choiceCorrection, newIndexId, type IndexColumnSpec } from "@/lib/index-columns"
import { findEntry, readSchema, rewriteSchema, upsertEntry } from "@/lib/index-schema"
import { columnMoves, headerProblem, isDisplayOnlyChange, tabProblem, type IndexEditorModel, type RelationTarget, type SchemaEntry, type SchemaOperation } from "@/lib/index-schema-shared"
import {
  ID_HEADER,
  foldName,
  isBuiltinWorldIndexKey,
  isClassRankHeader,
  isEntityWorldIndexKey,
  isNameColumn,
  labelColumnIndex,
  linkEndCovers,
  nameColumnIndex,
  splitNames,
  worldColumnPolicy,
  worldIndexDefinitions,
  worldIndexColumnFills,
  worldIndexSeeds,
  worldColumnSpec,
  worldIndexLinks,
  type EntityWorldIndexKey,
  type WorldIndexKey,
  type WorldIndexDefinition,
  type WorldIndexLink,
  type WorldIndexLinkEnd,
  type WorldIndexTabDefinition,
  type WorldPolicyContext,
} from "@/lib/world-index-definitions"

export type WorldIndexRow = { rowNumber: number; values: string[]; html: string[] }

export type WorldIndexTable = {
  tabName: string
  sheetId: number
  headers: string[]
  rows: WorldIndexRow[]
  /**
   * Feuille lue en partie (les personnages : des centaines de colonnes) : la colonne de
   * Sheets de chaque colonne du tableau. Absent, elles se suivent depuis A.
   */
  columnsAt?: number[]
}

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
  /** Personnages et campagnes : propriétaire et liens de chaque ligne (par identifiant), lus à chaque requête. */
  extras?: EntityIndexExtras
}

export type EntityIndexLink = { label: string; href: string; title?: string; color?: string }

export type EntityIndexExtras = {
  /** L'intitulé de la colonne de liens : « Campagnes » d'un personnage, « Personnages » d'une campagne. */
  linksLabel: string
  rows: Record<string, {
    /** La case « Joueur » ou « MJ » telle quelle, et ses comptes (un ou plusieurs). */
    ownerUid: string
    ownerUids: string[]
    ownerName: string
    ownerDetail: string
    links: EntityIndexLink[]
    /** À la corbeille (montré seulement à un administrateur, qui peut la restaurer ou la supprimer). */
    trashed?: boolean
  }>
  /** Comptes à qui attribuer une ligne : seulement pour un administrateur. */
  accounts: AccountRecord[]
  canAssign: boolean
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
  /** Les réglages d'un autre index du même classeur (les sorts des créatures, dans celui des créatures). */
  foreign: SchemaEntry[]
  /**
   * Le schéma n'a pas pu être lu : l'index s'affiche sans ses réglages, mais rien n'y est
   * ajouté ni écrit (il recréerait les colonnes renommées ou supprimées). Relu à la demande suivante.
   */
  degraded?: boolean
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

/** Le classeur d'un index d'entités : la feuille que lit le reste d'Eraser. */
function entityLocation(key: EntityWorldIndexKey) {
  if (key === "class-spells") return spellSheetLocation("classes")
  if (key === "creature-spells") return spellSheetLocation("creatures")
  return entitySheetLocation(key)
}

/**
 * Le schéma d'un classeur pour un index. `strict` (avant d'écrire) : relu à l'instant, et
 * une lecture ratée arrête tout ; un schéma vide réécrit effaçait tous les réglages. Sinon
 * (affichage) : une lecture ratée montre l'index sans ses réglages, marqué `degraded`.
 */
async function schemaFor(key: WorldIndexKey, spreadsheetId: string, strict: boolean) {
  if (strict) return { all: await readSchema(spreadsheetId, { refresh: true }), degraded: false }
  try {
    return { all: await readSchema(spreadsheetId), degraded: false }
  } catch (error) {
    console.error("WORLD_INDEX_SCHEMA_READ_FAILED", key, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return { all: [] as SchemaEntry[], degraded: true }
  }
}

async function loadEffectiveIndex(key: WorldIndexKey, options: { strict?: boolean } = {}): Promise<EffectiveIndex> {
  const strict = Boolean(options.strict)
  if (isBuiltinWorldIndexKey(key)) {
    const base = worldIndexDefinitions[key]
    if (isEntityWorldIndexKey(key)) {
      const sheet = await entityLocation(key)
      const { all, degraded } = await schemaFor(key, sheet.spreadsheetId, strict)
      // L'onglet porte le nom qu'il a dans Sheets ; seuls ses réglages concernent cet index.
      const tabs = base.tabs.map((tab, index) => index === 0 ? { ...tab, name: sheet.tabName } : tab)
      const own = (entry: SchemaEntry) => tabs.some((tab) => foldName(tab.name) === foldName(entry.tab))
      const schema = all.filter(own)
      return { spreadsheetId: sheet.spreadsheetId, webViewLink: sheet.webViewLink, schema, foreign: all.filter((entry) => !own(entry)), definition: { ...base, tabs: effectiveTabs(tabs, schema) }, degraded }
    }
    const sheet = await ensureJdrSheet(key as JdrSheetKey)
    if (!sheet) throw new Error("WORLD_INDEX_SHEET_UNAVAILABLE")
    const { all, degraded } = await schemaFor(key, sheet.spreadsheetId, strict)
    // L'onglet des sorts des créatures vit dans le classeur des créatures : ses réglages sont les siens.
    const foreign = (entry: SchemaEntry) => key === "creatures" && foldName(entry.tab) === foldName(CREATURE_SPELLS_TAB)
    const schema = all.filter((entry) => !foreign(entry))
    return { spreadsheetId: sheet.spreadsheetId, webViewLink: sheet.webViewLink, schema, foreign: all.filter(foreign), definition: { ...base, tabs: effectiveTabs(base.tabs, schema) }, degraded }
  }
  const entry = await customIndexEntry(key)
  if (!entry) throw new Error("WORLD_INDEX_NOT_FOUND")
  const { all: schema, degraded } = await schemaFor(key, entry.spreadsheetId, strict)
  return {
    spreadsheetId: entry.spreadsheetId,
    webViewLink: `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/edit`,
    schema,
    foreign: [],
    definition: { key, sheetName: entry.sheetName, title: entry.title, path: `/ressources/index/${key}`, tabs: effectiveTabs([], schema), custom: true, description: entry.description },
    degraded,
  }
}

/**
 * Le classeur d'un index, relié ou créé au besoin (jamais en double : ensureJdrSheet
 * cherche d'abord une feuille du même nom dans Drive), avec tous ses onglets. `strict` :
 * son schéma relu à l'instant, avant de le modifier.
 */
async function workbook(key: WorldIndexKey, options: { refresh?: boolean; strict?: boolean } = {}) {
  let effective = options.refresh || options.strict ? undefined : effectiveIndexes.get(key)
  // Un schéma qui n'avait pas pu être lu est relu à la demande suivante.
  if (!effective || effective.degraded) {
    effective = await loadEffectiveIndex(key, { strict: options.strict })
    effectiveIndexes.set(key, effective)
  }
  const { definition } = effective
  const readyKey = `${effective.spreadsheetId}:${key}:${definition.tabs.map((tab) => `${tab.name}=${tab.headers.join("|")}`).join(";")}`
  // Sans son schéma, un index ne reçoit aucune colonne : il recréerait celles qu'on a renommées ou supprimées.
  if (!effective.degraded && !readyWorkbooks.has(readyKey)) {
    // Les en-têtes d'un index d'entités appartiennent au code de sa feuille (alias compris) :
    // le moteur n'en ajoute aucun, il les lit.
    if (!definition.entity) {
      const existing = await spreadsheetTabs(effective.spreadsheetId)
      for (const tab of definition.tabs) await ensureTab(effective.spreadsheetId, key, tab, existing)
    }
    readyWorkbooks.add(readyKey)
  }
  return { spreadsheetId: effective.spreadsheetId, webViewLink: effective.webViewLink, definition, schema: effective.schema, foreign: effective.foreign, degraded: Boolean(effective.degraded) }
}

/** Le classeur d'un index avant d'y écrire : sans son schéma (lecture ratée), on n'écrit rien. */
async function writableWorkbook(key: WorldIndexKey) {
  const sheet = await workbook(key)
  if (sheet.degraded) throw new Error("WORLD_INDEX_SCHEMA_UNAVAILABLE")
  return sheet
}

/** Relit la définition et le schéma d'un index (après une modification dans l'éditeur). */
export function forgetEffectiveIndex(key: WorldIndexKey) {
  effectiveIndexes.delete(key)
  worldIndexCache.delete(key)
}

/**
 * Oublie tout ce qui a été lu d'un classeur, pour chacun de ses index : les créatures et les
 * sorts des créatures partagent le leur, et le schéma de l'un porte les réglages de l'autre.
 */
function forgetWorkbook(spreadsheetId: string) {
  for (const [key, effective] of [...effectiveIndexes]) if (effective.spreadsheetId === spreadsheetId) forgetEffectiveIndex(key)
  for (const name of [...sheetIds.keys()]) if (name.startsWith(`${spreadsheetId}\u0001`)) sheetIds.delete(name)
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
  // Relue à l'instant : c'est d'après elle que les colonnes manquantes sont placées.
  const [firstRow = []] = (await readRangeFreshWithOffset(spreadsheetId, sheetTabRange(tab.name, "1:1"))).rows
  let used = firstRow.length
  while (used > 0 && !firstRow[used - 1]?.trim()) used -= 1
  // Une colonne renommée par Eraser : seul son en-tête est réécrit, ses valeurs restent.
  for (const [legacy, renamed] of tab.renamedHeaders ?? []) {
    if (firstRow.slice(0, used).some((header) => foldName(header) === foldName(renamed))) continue
    const position = firstRow.slice(0, used).findIndex((header) => foldName(header) === foldName(legacy))
    if (position < 0) continue
    const cell = `${columnName(position + 1)}1`
    await updateRange(spreadsheetId, sheetTabRange(tab.name, `${cell}:${cell}`), [[renamed]], { valueInputOption: "RAW" })
    firstRow[position] = renamed
  }
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

function headersOf(firstRow: string[], tab: WorldIndexTabDefinition, width: number, entity = false) {
  // Un index d'entités ne devine jamais une colonne sans en-tête par sa place.
  return Array.from({ length: entity ? width : Math.max(width, tab.headers.length) }, (_, index) => firstRow[index]?.trim() || (entity ? "" : tab.headers[index]) || `Colonne ${index + 1}`)
}

/**
 * Les personnages : seules les colonnes de l'index (et celles ajoutées dans « Modifier »)
 * sont lues, chacune retrouvée par son nom. La feuille en a des centaines.
 */
async function readPartialTable(spreadsheetId: string, key: WorldIndexKey, tab: WorldIndexTabDefinition, wanted: string[]): Promise<WorldIndexTable> {
  clearSpreadsheetReadCache(spreadsheetId)
  const [firstRow = []] = await readRange(spreadsheetId, sheetTabRange(tab.name, "1:1"))
  const added = (effectiveIndexes.get(key)?.schema ?? []).filter((entry) => entry.column && foldName(entry.tab) === foldName(tab.name)).map((entry) => entry.column)
  const keep = new Set([...wanted, ...added].map(foldName))
  const seen = new Set<string>()
  const columnsAt = firstRow.flatMap((header, index) => {
    const folded = foldName(header)
    if (!header.trim() || !keep.has(folded) || seen.has(folded)) return []
    seen.add(folded)
    return [index]
  })
  const sheet = await readFormattedSheet(spreadsheetId, [tab.name], { light: true, ranges: columnsAt.length ? columnsAt.map((index) => `${columnName(index + 1)}:${columnName(index + 1)}`) : ["A1:A1"] })
  const headers = columnsAt.map((index) => firstRow[index].trim())
  const body = sheet.rows.slice(1)
  let lastFilled = body.length - 1
  while (lastFilled >= 0 && !columnsAt.some((index) => body[lastFilled]?.[index]?.value.trim())) lastFilled -= 1
  const rows = body.flatMap((row, index) => index <= lastFilled
    ? [{ rowNumber: index + 2, values: columnsAt.map((column) => row?.[column]?.value ?? ""), html: columnsAt.map((column) => row?.[column]?.html ?? "") }]
    : [])
  rememberSheetId(spreadsheetId, sheet.tabName, sheet.sheetId)
  return { tabName: sheet.tabName, sheetId: sheet.sheetId, headers, rows, columnsAt }
}

/** Lecture avec la mise en forme : c'est ce qu'affiche et modifie le tableau. */
async function readTable(spreadsheetId: string, key: WorldIndexKey, tabName: string): Promise<WorldIndexTable> {
  const tab = tabDefinition(key, tabName)
  const entity = isBuiltinWorldIndexKey(key) ? worldIndexDefinitions[key].entity : undefined
  if (entity?.readHeaders) return withHtmlTextColumns(key, await readPartialTable(spreadsheetId, key, tab, entity.readHeaders))
  const sheet = await readFormattedSheet(spreadsheetId, [tab.name], { light: true })
  const width = Math.max(0, ...sheet.rows.map((row) => row?.length ?? 0))
  const headers = headersOf((sheet.rows[0] ?? []).map((cell) => cell?.value ?? ""), tab, width, Boolean(entity))
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
  rememberSheetId(spreadsheetId, sheet.tabName, sheet.sheetId)
  return withHtmlTextColumns(key, { tabName: sheet.tabName, sheetId: sheet.sheetId, headers, rows })
}

/**
 * L'identifiant d'onglet (sheetId) de chaque onglet lu, gardé une minute : les écritures
 * mises en forme le demandent. Oublié à chaque changement d'onglets fait depuis Eraser.
 */
const sheetIds = new Map<string, { sheetId: number; expiresAt: number }>()

function rememberSheetId(spreadsheetId: string, tabName: string, sheetId: number) {
  sheetIds.set(`${spreadsheetId}\u0001${tabName}`, { sheetId, expiresAt: Date.now() + 60_000 })
}

async function sheetIdOf(spreadsheetId: string, tabName: string) {
  const known = sheetIds.get(`${spreadsheetId}\u0001${tabName}`)
  if (known && known.expiresAt > Date.now()) return known.sheetId
  const sheetId = (await spreadsheetTabs(spreadsheetId)).find((tab) => tab.title === tabName)?.sheetId
  if (sheetId === undefined) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
  rememberSheetId(spreadsheetId, tabName, sheetId)
  return sheetId
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

/**
 * Les colonnes d'un onglet hors corbeille, avec leur type. Une colonne en double n'apparaît
 * qu'une fois. Un index d'entités les range dans l'ordre choisi dans « Modifier », gardé dans
 * le schéma : sa feuille, elle, ne bouge pas.
 */
function columnsOf(key: WorldIndexKey, table: WorldIndexTable, schema: SchemaEntry[]): WorldIndexColumn[] {
  const seen = new Set<string>()
  const columns = table.headers.flatMap((header) => {
    const folded = foldName(header)
    if (!header.trim() || seen.has(folded) || trashed(findEntry(schema, table.tabName, header))) return []
    seen.add(folded)
    return [{ header, spec: effectiveColumnSpec(key, table.tabName, header, schema) }]
  })
  const tabSpec = findEntry(schema, table.tabName, "")?.spec
  const order = tabSpec?.kind === "tab" ? tabSpec.columns ?? [] : []
  if (!order.length) return columns
  const place = (header: string, index: number) => { const at = order.findIndex((name) => foldName(name) === foldName(header)); return at >= 0 ? at : order.length + index }
  return columns.map((column, index) => ({ column, place: place(column.header, index) })).sort((left, right) => left.place - right.place).map((item) => item.column)
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

/**
 * Remplit une fois les cases d'une colonne ajoutée après coup (worldIndexColumnFills),
 * seulement si la colonne est encore entièrement vide : rien de ce qu'on y a écrit n'est
 * jamais remplacé.
 */
async function fillNewColumns(key: WorldIndexKey, sheet: Awaited<ReturnType<typeof workbook>>, tables: WorldIndexTable[]) {
  const fills = isBuiltinWorldIndexKey(key) ? worldIndexColumnFills[key] ?? [] : []
  let wrote = false
  for (const fill of fills) {
    const table = tables.find((candidate) => candidate.tabName === fill.tab)
    const column = table ? columnOf(table.headers, fill.column) : -1
    if (!table || column < 0 || table.rows.some((row) => row.values[column]?.trim())) continue
    const flag = `world-index-fill:${key}:${fill.tab}:${fill.column}:${sheet.spreadsheetId}`
    const [done] = await getDb().select().from(sheetIndexSyncs).where(eq(sheetIndexSyncs.key, flag)).limit(1)
    if (done) continue
    const data = table.rows.flatMap((row) => {
      const named = Object.fromEntries(table.headers.map((header, index) => [header, row.values[index] ?? ""]))
      const value = fill.valueFor(named)
      const cell = `${columnName(column + 1)}${row.rowNumber}`
      return value ? [{ range: sheetTabRange(fill.tab, `${cell}:${cell}`), values: [[value]] }] : []
    })
    if (data.length) {
      await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) })
      clearSpreadsheetReadCache(sheet.spreadsheetId)
      wrote = true
    }
    await getDb().insert(sheetIndexSyncs).values({ key: flag }).onConflictDoNothing()
  }
  return wrote
}

async function loadWorldIndex(key: WorldIndexKey): Promise<WorldIndexData> {
  const sheet = await workbook(key)
  let tables = await Promise.all(sheet.definition.tabs.map((tab) => readTable(sheet.spreadsheetId, key, tab.name)))
  // Sans son schéma (lecture ratée), l'index est seulement affiché : rien n'y est écrit.
  if (!sheet.degraded) {
    if (await seedEmptyIndex(key, sheet, tables)) tables = await Promise.all(sheet.definition.tabs.map((tab) => readTable(sheet.spreadsheetId, key, tab.name)))
    else if (await fillNewColumns(key, sheet, tables)) tables = await Promise.all(sheet.definition.tabs.map((tab) => readTable(sheet.spreadsheetId, key, tab.name)))
    // Un index d'entités ne reçoit d'identifiant que sur une ligne qui n'en a pas : celui d'une
    // ligne existante (personnage, campagne…) n'est jamais réécrit, même en double. Un sort sans
    // ID, lui, n'en reçoit pas d'ici : lib/class-content.ts lui en donne un, tiré de son contenu,
    // relu après écriture. Donnés chacun de son côté, deux ID différents visaient le même sort.
    const spells = key === "class-spells" || key === "creature-spells"
    if (!spells && (sheet.definition.entity ? sheet.definition.entity.rowCommands && tables.some((table) => needsIds(table, true)) : tables.some((table) => needsIds(table)))) scheduleIdBackfill(key)
  }
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
function needsIds(table: WorldIndexTable, missingOnly = false) {
  const column = columnOf(table.headers, ID_HEADER)
  if (column < 0) return false
  const seen = new Set<string>()
  return table.rows.some((row) => {
    if (!row.values.some((value, index) => index !== column && value.trim())) return false
    const id = (row.values[column] || "").trim()
    if (!id || (!missingOnly && seen.has(id))) return true
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
    const patches: Array<{ tabName: string; row: CachedRowIdentity; cells: Array<{ header: string; html: string }> }> = []
    let spreadsheetId = ""
    const entity = isBuiltinWorldIndexKey(key) ? worldIndexDefinitions[key].entity : undefined
    for (const tab of await tabsOf(key)) {
      const table = await plainTable(key, tab.name)
      spreadsheetId = table.spreadsheetId
      const column = columnOf(table.headers, ID_HEADER)
      if (column < 0) continue
      table.rows.forEach((row, index) => {
        if (index === 0 || !row.some((value, position) => position !== column && value?.trim())) return
        const current = (row[column] || "").trim()
        // Index d'entités : un identifiant existant, même en double, n'est jamais changé.
        if (current && (entity || !seen.has(current))) { seen.add(current); return }
        let id = newIndexId(tab.idPrefix)
        while (seen.has(id)) id = newIndexId(tab.idPrefix)
        seen.add(id)
        const cell = `${columnName(column + 1)}${index + 1}`
        data.push({ range: sheetTabRange(tab.name, `${cell}:${cell}`), values: [[id]] })
        const cells = [{ header: table.headers[column], html: id }]
        // La ligne d'un PNJ saisie sans page reçoit celle de la bibliothèque, comme un ajout.
        for (const [header, value] of Object.entries(entity?.addDefaults ?? {})) {
          const at = columnOf(table.headers, header)
          if (at < 0 || (row[at] ?? "").trim()) continue
          const target = `${columnName(at + 1)}${index + 1}`
          data.push({ range: sheetTabRange(tab.name, `${target}:${target}`), values: [[value]] })
          cells.push({ header: table.headers[at], html: value })
        }
        patches.push({ tabName: tab.name, row: { rowNumber: index + 1, id: current, label: rowLabel(table, index) }, cells })
      })
    }
    if (!data.length) return
    await googleSheetsJson(`spreadsheets/${spreadsheetId}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) })
    clearSpreadsheetReadCache(spreadsheetId)
    for (const patch of patches) await patchCachedRow(key, patch.tabName, patch.row, patch.cells)
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
/** Au-delà, la version gardée est trop vieille pour être rendue sans attendre. */
const WORLD_INDEX_STALE_MS = 30 * 60_000
/** Un index lu sans son schéma (lecture ratée) n'est gardé que le temps de réessayer. */
const WORLD_INDEX_DEGRADED_MS = 15_000

function cacheLifetime(key: WorldIndexKey) {
  return effectiveIndexes.get(key)?.degraded ? WORLD_INDEX_DEGRADED_MS : WORLD_INDEX_CACHE_MS
}
type WorldIndexCacheEntry = { expiresAt: number; promise: Promise<WorldIndexData>; loadedAt?: number; refreshing?: boolean; refreshFailed?: boolean; patchedAt?: number }
const worldIndexCache = new Map<WorldIndexKey, WorldIndexCacheEntry>()

const lastLoaded = new Map<WorldIndexKey, WorldIndexData>()

export function getWorldIndex(key: WorldIndexKey, options: { refresh?: boolean } = {}): Promise<WorldIndexData> {
  const cached = worldIndexCache.get(key)
  if (!options.refresh && cached && cached.expiresAt > Date.now()) return cached.promise
  // Passé quelques minutes, l'index gardé est rendu tout de suite et relu en arrière-plan
  // (pour voir ce qui a été changé directement dans Sheets) : la page n'attend plus.
  if (!options.refresh && cached?.loadedAt && !cached.refreshFailed && Date.now() - cached.loadedAt < WORLD_INDEX_STALE_MS) {
    if (!cached.refreshing) {
      cached.refreshing = true
      const startedAt = Date.now()
      const fresh = loadWorldIndex(key)
      fresh.then((data) => {
        // Changé entre-temps (écriture, « Actualiser ») : la nouvelle entrée l'emporte.
        if (worldIndexCache.get(key) !== cached) return
        // Une cellule enregistrée pendant la relecture : la relecture a pu la manquer, on
        // garde la version corrigée et on relira plus tard.
        if ((cached.patchedAt ?? 0) >= startedAt) { cached.refreshing = false; return }
        lastLoaded.set(key, data)
        worldIndexCache.set(key, { expiresAt: Date.now() + cacheLifetime(key), promise: Promise.resolve(data), loadedAt: Date.now() })
      }, () => { cached.refreshing = false; cached.refreshFailed = true })
    }
    return cached.promise
  }
  const promise = loadWorldIndex(key)
  const entry: WorldIndexCacheEntry = { expiresAt: Date.now() + WORLD_INDEX_CACHE_MS, promise }
  worldIndexCache.set(key, entry)
  promise.then((data) => { if (worldIndexCache.get(key) === entry) { lastLoaded.set(key, data); entry.loadedAt = Date.now(); entry.expiresAt = Date.now() + cacheLifetime(key) } }, () => undefined)
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

/** Ce qui reconnaît une ligne gardée en mémoire : son numéro, et son identifiant et son nom avant l'écriture. */
type CachedRowIdentity = { rowNumber: number; id: string; label: string }

/** La ligne gardée en mémoire est-elle bien celle qu'on vient de lire dans Sheets ? */
function cachedRowIs(table: WorldIndexTable, row: WorldIndexRow, expected: CachedRowIdentity) {
  const idColumn = columnOf(table.headers, ID_HEADER)
  const labelColumn = labelColumnIndex(table.headers)
  const id = idColumn >= 0 ? (row.values[idColumn] ?? "").trim() : ""
  return id === expected.id && foldName(labelColumn >= 0 ? row.values[labelColumn] ?? "" : "") === foldName(expected.label)
}

/**
 * Recopie dans la mémoire des cellules qu'on vient d'écrire dans Sheets, par le nom de leur
 * colonne. Seulement si la mémoire montre bien cette ligne à ce numéro (même identifiant,
 * même nom) : sinon elle date d'avant un changement fait ailleurs, et elle est relue.
 */
async function patchCachedRow(key: WorldIndexKey, tabName: string, expected: CachedRowIdentity, cells: Array<{ header: string; html: string }>) {
  const entry = worldIndexCache.get(key)
  if (!entry) return
  // Une cellule qu'on vient d'écrire rend l'index frais : sans ça, la lecture suivante
  // relançait une relecture de Google qui pouvait encore renvoyer l'ancienne valeur et
  // effacer celle qu'on venait d'enregistrer (un FX changé redevenait l'ancien).
  entry.patchedAt = Date.now()
  entry.expiresAt = Math.max(entry.expiresAt, Date.now() + WORLD_INDEX_CACHE_MS)
  const data = await entry.promise.catch(() => null)
  const table = data?.tables.find((candidate) => candidate.tabName === tabName)
  const row = table?.rows.find((candidate) => candidate.rowNumber === expected.rowNumber)
  if (!table || !row || !cachedRowIs(table, row, expected)) return invalidateWorldIndexes([key])
  for (const cell of cells) {
    const column = columnOf(table.headers, cell.header)
    if (column < 0) continue
    const html = cell.html
    const rich = /<[a-z]/i.test(html)
    row.values[column] = rich ? htmlToRichText(html).text : html
    row.html[column] = rich ? html : escapeCellHtml(html)
  }
}

function columnOf(headers: string[], name: string) {
  return headers.findIndex((header) => foldName(header) === foldName(name))
}

/** Une colonne dont la case garde son HTML en texte (le « Contenu » du vocabulaire) : écrite telle quelle. */
function isHtmlTextColumn(key: WorldIndexKey, header: string) {
  return (entityOf(key)?.htmlTextHeaders ?? []).some((name) => foldName(name) === foldName(header))
}

/**
 * Les cases HTML-en-texte d'un tableau lu : leur texte est le HTML à afficher (la page et la
 * fiche le mettent en forme), et leur valeur simple le texte sans balises (recherche, tri).
 */
function withHtmlTextColumns(key: WorldIndexKey, table: WorldIndexTable): WorldIndexTable {
  const columns = table.headers.flatMap((header, index) => isHtmlTextColumn(key, header) ? [index] : [])
  if (!columns.length) return table
  return {
    ...table,
    rows: table.rows.map((row) => {
      const values = [...row.values]
      const html = [...row.html]
      for (const column of columns) {
        const raw = row.values[column] ?? ""
        html[column] = raw
        values[column] = /<[a-z]/i.test(raw) ? htmlToRichText(raw).text : raw
      }
      return { ...row, values, html }
    }),
  }
}

/**
 * Les écritures liées passent une par une. Deux cellules enregistrées coup sur coup
 * cherchaient sinon la même entité en même temps, ne la trouvaient ni l'une ni
 * l'autre, et la créaient deux fois. Le serveur tourne dans un seul processus
 * (l'application Windows) : une file en mémoire suffit.
 */
let linkQueue: Promise<unknown> = Promise.resolve()
/**
 * Les tâches du moteur : une écriture faite pendant l'une d'elles (et seulement elle) est la
 * sienne, la mémoire est déjà corrigée par le moteur lui-même.
 */
const engineTask = new AsyncLocalStorage<true>()

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const tracked = () => engineTask.run(true, task)
  const run = linkQueue.then(tracked, tracked)
  linkQueue = run.catch(() => undefined)
  return run
}

/**
 * Une écriture d'Eraser hors du moteur (un PNJ enregistré dans sa campagne, une fiche, une
 * classe créée) : l'index de ce classeur est relu à la prochaine ouverture, même si une
 * tâche du moteur tourne au même moment ailleurs. Une écriture du moteur dans les classes ou
 * les sorts fait relire leurs pages.
 */
onSpreadsheetWrite((spreadsheetId) => {
  const own = engineTask.getStore() === true
  for (const [key, effective] of effectiveIndexes) {
    if (effective.spreadsheetId !== spreadsheetId) continue
    if (!own) { worldIndexCache.delete(key); continue }
    if (key === "classes" || key === "class-spells" || key === "creature-spells") invalidateClassContentCaches()
    if (key === "classes") void forgetClassIndexSync().catch(() => undefined)
  }
})

/** Ce qu'un index d'entités permet (absent : un index du monde ordinaire). */
function entityOf(key: WorldIndexKey) {
  return isBuiltinWorldIndexKey(key) ? worldIndexDefinitions[key].entity : undefined
}

/**
 * Personnages, campagnes et classes naissent de leurs pages (compte, dossier, liens) et
 * partent à la corbeille : le tableau n'en ajoute, n'en copie ni n'en supprime aucune ligne.
 */
function assertRowCommands(key: WorldIndexKey, action: "add" | "insert" | "duplicate" | "delete" | "move" = "add") {
  const entity = entityOf(key)
  if (!entity || entity.rowCommands) return
  // Personnages et campagnes : seulement dupliquer (supprimer passe par la corbeille).
  if (entity.trashKind && action === "duplicate") return
  throw new Error("WORLD_INDEX_ROWS_LOCKED")
}

/**
 * Une ligne telle que la page l'a vue. Son numéro n'est qu'un indice : une autre installation
 * (ou Sheets) a pu ajouter, retirer ou trier des lignes depuis. Elle est retrouvée par son
 * identifiant ; une ligne qui n'en a pas encore, par son nom (`name`) à ce numéro.
 */
export type WorldIndexRowRef = { rowNumber: number; id?: string; name?: string }

/**
 * Ce qu'une écriture fait à une ligne, soumis à l'appelant avant d'écrire (les droits d'un
 * compte sur un personnage ou une campagne) : l'identifiant de la ligne relue dans la feuille
 * et les colonnes écrites. Lève une erreur pour refuser.
 */
export type WorldIndexRowGuard = (row: { id: string; headers: string[] }) => Promise<void>

/**
 * Personnages et campagnes, pour un MJ : seulement les lignes auxquelles il a accès (ses
 * campagnes, les personnages de ses campagnes et les siens), jamais la case du propriétaire
 * (« Joueur », « MJ »), qu'un administrateur change depuis l'administration. Rien à vérifier
 * pour un administrateur ni pour les autres index.
 */
export function worldIndexRowGuard(key: WorldIndexKey, account: { uid: string; role: string }): WorldIndexRowGuard | undefined {
  if (account.role === "admin" || (key !== "characters" && key !== "campaigns")) return undefined
  const owner = key === "characters" ? "Joueur" : "MJ"
  return async ({ id, headers }) => {
    if (headers.some((header) => foldName(header) === foldName(owner))) throw new Error("WORLD_INDEX_OWNER_LOCKED")
    const reachable = id ? (key === "characters" ? await getCharacterForMj(account.uid, id) : await getCampaignForMj(account.uid, id)) : null
    if (!reachable) throw new Error("WORLD_INDEX_WRITE_DENIED")
  }
}

/**
 * « Supprimer » un personnage ou une campagne : mise à la corbeille, comme depuis sa page.
 * Rien n'est effacé de Sheets ; `allowed` dit si ce compte peut le faire pour cet élément.
 * L'élément est celui dont la page a montré l'identifiant, jamais celui qui occupe
 * maintenant son numéro de ligne.
 */
export async function trashWorldIndexRows(key: WorldIndexKey, rows: WorldIndexRowRef[], allowed: (kind: "character" | "campaign", id: string) => Promise<boolean>) {
  const kind = entityOf(key)?.trashKind
  if (!kind) throw new Error("WORLD_INDEX_ROWS_LOCKED")
  const ids = [...new Set(rows.map((row) => (row.id ?? "").trim()).filter(Boolean))]
  for (const id of ids) if (!await allowed(kind, id)) throw new Error("WORLD_INDEX_TRASH_DENIED")
  for (const id of ids) await softDeleteItem(kind, id)
  invalidateWorldIndexes([key])
}

/** La lecture brute d'un onglet : `rows[0]` est la ligne d'en-têtes, `rows[i]` la ligne i + 1 de la feuille. */
type PlainTable = { spreadsheetId: string; headers: string[]; rows: string[][] }

/**
 * Valeurs brutes d'un onglet, relues dans Google à chaque fois : c'est d'après elles que se
 * décide où écrire (une entité ajoutée à la main dans Sheets doit être vue tout de suite,
 * sinon elle serait recréée). Lecture POST, jamais servie par un cache : un GET identique
 * peut être resservi pendant le rendu d'une page. Une feuille immense (les personnages)
 * n'est lue que dans les colonnes `wanted` (plus l'ID, le nom et les colonnes liées).
 */
async function plainTable(key: WorldIndexKey, tabName: string, wanted?: readonly string[]): Promise<PlainTable> {
  const sheet = await workbook(key)
  const tab = tabDefinition(key, tabName)
  const entity = entityOf(key)
  let rows: string[][]
  if (wanted && entity?.readHeaders) {
    const read = await readNamedColumns(sheet.spreadsheetId, tabName, [], [ID_HEADER, entity.nameHeader, ...linkEndsOf(key, tabName).map(([end]) => end.column), ...wanted], { fresh: true })
    rows = [read.columns.headers, ...read.rows]
  } else {
    const read = await readRangeFreshWithOffset(sheet.spreadsheetId, sheetTabAll(tabName))
    // Google peut rendre l'onglet à partir de sa première ligne remplie.
    rows = [...Array.from({ length: Math.max(0, read.startRow - 1) }, () => [] as string[]), ...read.rows]
  }
  const headers = headersOf(rows[0] ?? [], tab, Math.max(0, ...rows.map((row) => row.length)), Boolean(sheet.definition.entity))
  return { spreadsheetId: sheet.spreadsheetId, headers, rows }
}

/** L'identifiant d'une ligne lue (« » s'il n'y en a pas). */
function rowId(table: PlainTable, rowIndex: number) {
  const column = columnOf(table.headers, ID_HEADER)
  return column >= 0 ? (table.rows[rowIndex]?.[column] ?? "").trim() : ""
}

/** Ce qui reconnaît une ligne sans identifiant : son nom (ou sa première colonne). */
function rowLabel(table: PlainTable, rowIndex: number) {
  const column = labelColumnIndex(table.headers)
  return column >= 0 ? table.rows[rowIndex]?.[column] ?? "" : ""
}

/** Le nom vu par la page (texte, ou HTML d'une case enrichie) est-il celui de la feuille ? */
function sameLabel(seen: string, current: string) {
  const now = foldName(current)
  return foldName(seen) === now || foldName(htmlToRichText(seen).text) === now
}

/**
 * La case vue par la page est-elle encore celle de la feuille ? Comparées en texte : la page
 * voit une case enrichie en HTML, Sheets en texte ; les espaces ne comptent pas.
 */
function sameCellText(seen: string, current: string) {
  const squeeze = (value: string) => value.replace(/\s+/g, " ").trim()
  const now = squeeze(current)
  return squeeze(seen) === now || squeeze(htmlToRichText(seen).text) === now
}

/**
 * La ligne que la page désigne, dans une lecture fraîche de l'onglet (sa place dans
 * `table.rows`) : celle qui porte son identifiant, où qu'elle soit maintenant. Un identifiant
 * disparu ou porté par deux lignes, ou (ligne sans identifiant) un autre nom à ce numéro :
 * refusé, plutôt que d'écrire ou de supprimer dans la ligne voisine.
 */
function resolveRow(table: PlainTable, ref: WorldIndexRowRef) {
  if (!Number.isInteger(ref.rowNumber) || ref.rowNumber < 2) throw new Error("WORLD_INDEX_ROW_NOT_FOUND")
  const id = (ref.id ?? "").trim()
  const idColumn = columnOf(table.headers, ID_HEADER)
  if (id && idColumn >= 0) {
    const found = table.rows.flatMap((row, index) => index > 0 && (row?.[idColumn] ?? "").trim() === id ? [index] : [])
    if (found.length > 1) throw new Error("WORLD_INDEX_ROW_DUPLICATE")
    if (!found.length) throw new Error("WORLD_INDEX_ROW_CHANGED")
    return found[0]
  }
  if (!sameLabel(ref.name ?? "", rowLabel(table, ref.rowNumber - 1))) throw new Error("WORLD_INDEX_ROW_CHANGED")
  return ref.rowNumber - 1
}

/** Comme `resolveRow`, sans erreur : -1 si la ligne n'est plus sûrement là. */
function findRow(table: PlainTable, ref: WorldIndexRowRef) {
  try { return resolveRow(table, ref) } catch { return -1 }
}

/**
 * Ce qui désigne une ligne lue, pour la retrouver dans une lecture suivante : son identifiant
 * s'il n'est qu'à elle (une ligne copiée dans Sheets partage celui de l'original), sinon son
 * nom à son numéro.
 */
function refOf(table: PlainTable, rowIndex: number): WorldIndexRowRef {
  const id = rowId(table, rowIndex)
  const own = Boolean(id) && table.rows.filter((_, index) => index > 0 && rowId(table, index) === id).length === 1
  return { rowNumber: rowIndex + 1, id: own ? id : "", name: rowLabel(table, rowIndex) }
}

/** La ligne lue telle que la mémoire doit la montrer à ce numéro : même identifiant, même nom. */
function cachedIdentityOf(table: PlainTable, rowIndex: number): CachedRowIdentity {
  return { rowNumber: rowIndex + 1, id: rowId(table, rowIndex), label: rowLabel(table, rowIndex) }
}

/**
 * Supprime des lignes en une seule requête, de la dernière à la première : retirer une
 * ligne décale toutes les suivantes. Les numéros viennent d'une lecture faite à l'instant.
 */
async function deleteRows(spreadsheetId: string, tabName: string, rowNumbers: number[]) {
  const ordered = [...new Set(rowNumbers)].filter((rowNumber) => rowNumber >= 2).sort((left, right) => right - left)
  if (!ordered.length) return
  const sheetId = await sheetIdOf(spreadsheetId, tabName)
  await googleSheetsJson(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: ordered.map((rowNumber) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } })) }),
  })
  clearSpreadsheetReadCache(spreadsheetId)
}

function rowName(table: PlainTable, rowIndex: number) {
  const nameColumn = nameColumnIndex(table.headers)
  return nameColumn >= 0 ? (table.rows[rowIndex]?.[nameColumn] || "").replace(/\s+/g, " ").trim() : ""
}

function findRowByName(table: PlainTable, name: string) {
  const nameColumn = nameColumnIndex(table.headers)
  if (nameColumn < 0) return -1
  return table.rows.findIndex((row, index) => index > 0 && foldName(row[nameColumn] || "") === foldName(name))
}

async function writeCell(table: PlainTable, tabName: string, rowIndex: number, column: number, value: string) {
  const cell = `${columnName(column + 1)}${rowIndex + 1}`
  await updateRange(table.spreadsheetId, sheetTabRange(tabName, `${cell}:${cell}`), [[value]], { valueInputOption: "RAW" })
  ;(table.rows[rowIndex] ||= [])[column] = value
}

/**
 * Ajoute une ligne complète sous la dernière ligne remplie, en colonne A, avec `appendRows` :
 * Google la place lui-même, d'un seul envoi. Écrite à un numéro choisi d'après une lecture,
 * elle écrasait la ligne qu'un autre ajout (ailleurs dans Eraser ou dans une autre
 * installation) venait d'y mettre. Les valeurs suivent les colonnes de `table` ; elles sont
 * rangées par leur nom dans celles de l'onglet relu. Renvoie la ligne écrite et son
 * identifiant.
 */
async function writeNewRow(key: WorldIndexKey, table: PlainTable, tabName: string, provided: string[]) {
  const current = await plainTable(key, tabName)
  // Rangées par nom de colonne : une colonne ajoutée ou déplacée entre-temps ne décale rien ;
  // une colonne en double ne reçoit la valeur qu'une fois (la première, celle qu'on voit).
  const given = new Map<string, string>()
  table.headers.forEach((header, index) => { if (!given.has(foldName(header))) given.set(foldName(header), provided[index] ?? "") })
  const placed = new Set<string>()
  const named = current.headers.map((header) => {
    const name = foldName(header)
    if (placed.has(name)) return ""
    placed.add(name)
    return given.get(name) ?? ""
  })
  // Toute nouvelle ligne reçoit son identifiant (une ligne déplacée garde le sien).
  const idColumn = columnOf(current.headers, ID_HEADER)
  if (idColumn >= 0 && !(named[idColumn] ?? "").trim()) named[idColumn] = newIndexId(tabDefinition(key, tabName).idPrefix)
  // Une ligne d'index d'entités reçoit ce que son code attend (la page d'un PNJ, ses dates).
  const entity = entityOf(key)
  const now = new Date().toISOString()
  const values = entity ? current.headers.map((header, index) => {
    const value = named[index] ?? ""
    if (value.trim()) return value
    const preset = Object.entries(entity.addDefaults ?? {}).find(([candidate]) => foldName(candidate) === foldName(header))?.[1]
    if (preset !== undefined) return preset
    return [foldName("Créé le"), foldName("Modifié le")].includes(foldName(header)) ? now : value
  }) : named
  const { updatedRange } = await appendRows(current.spreadsheetId, sheetTabRange(tabName, `A:${columnName(Math.max(1, values.length))}`), [values], { valueInputOption: "RAW" })
  const id = idColumn >= 0 ? (values[idColumn] ?? "").trim() : ""
  // appendRows la retrouve par son texte, depuis le bas ; à défaut, son identifiant la désigne.
  const rowNumber = sheetRangeStartRow(updatedRange) ?? (id ? findRow(await plainTable(key, tabName), { rowNumber: 2, id }) + 1 : 0)
  if (rowNumber < 2) throw new Error("WORLD_INDEX_ROW_ADDED_UNSEEN")
  return { rowNumber, id }
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
  const nameColumn = nameColumnIndex(table.headers)
  const linkColumn = columnOf(table.headers, end.column)
  if (nameColumn < 0 || linkColumn < 0) return false
  // Un personnage, une campagne ou une classe ne naît pas d'un nom saisi ailleurs.
  if (rowIndex <= 0 && entityOf(end.index)?.addHref) return false
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

/**
 * Propage les colonnes liées d'une ligne vers les index d'en face. La ligne vient d'être
 * écrite : relue, et retrouvée par son identifiant si une autre a bougé entre-temps.
 */
async function syncRowLinks(key: WorldIndexKey, tabName: string, row: WorldIndexRowRef, changed: Set<WorldIndexKey>) {
  const ends = linkEndsOf(key, tabName)
  if (!ends.length) return
  const table = await plainTable(key, tabName, [])
  const rowIndex = findRow(table, row)
  const name = rowIndex > 0 ? rowName(table, rowIndex) : ""
  if (!name) return
  for (const [end, other] of ends) {
    const column = columnOf(table.headers, end.column)
    if (column < 0) continue
    for (const target of splitNames(table.rows[rowIndex]?.[column] || "")) {
      if (isSelfLink(key, tabName, other, target, name)) continue
      if (await addLink(other, target, name)) changed.add(other.index)
    }
  }
}

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
    const table = await plainTable(key, tab.name, known.filter((header) => pointsHere(tab.name, header)))
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

/**
 * Une cellule, avec sa mise en forme. La ligne est celle que la page a vue (retrouvée par son
 * identifiant), la colonne celle qui porte ce nom ; `previous` est ce que la page y montrait :
 * une case changée entre-temps (dans Sheets, par quelqu'un d'autre) n'est jamais écrasée sans
 * avoir été vue. Si elle est liée, l'autre côté suit : noms ajoutés inscrits (et créés au
 * besoin), noms effacés retirés, entité renommée renommée partout où elle est citée. Renvoie
 * les index modifiés par les liens.
 */
export function updateWorldIndexCell(key: WorldIndexKey, tabName: string, row: WorldIndexRowRef, header: string, html: string, options: { previous?: string; guard?: WorldIndexRowGuard } = {}) {
  return serialized(async () => {
    const sheet = await writableWorkbook(key)
    const before = await plainTable(key, tabName, [header])
    const rowIndex = resolveRow(before, row)
    const column = columnOf(before.headers, header)
    if (column < 0) throw new Error("WORLD_INDEX_COLUMN_NOT_FOUND")
    const target = before.headers[column]
    await options.guard?.({ id: rowId(before, rowIndex), headers: [target] })
    const current = before.rows[rowIndex]?.[column] ?? ""
    if (options.previous !== undefined && !sameCellText(options.previous, current)) throw new Error("WORLD_INDEX_CELL_CHANGED")
    // Une case HTML-en-texte (le vocabulaire) garde son HTML tel quel, comme l'écrit sa page.
    if (isHtmlTextColumn(key, target)) await writeCell(before, tabName, rowIndex, column, html)
    else await updateFormattedCell({ spreadsheetId: sheet.spreadsheetId, sheetId: await sheetIdOf(sheet.spreadsheetId, tabName), rowNumber: rowIndex + 1, column, html })
    await patchCachedRow(key, tabName, cachedIdentityOf(before, rowIndex), [{ header: target, html }])
    const newValue = htmlToRichText(html).text.replace(/\s+/g, " ").trim()
    const previousName = isNameColumn(target) ? current.replace(/\s+/g, " ").trim() : ""
    if (previousName && newValue && foldName(previousName) !== foldName(newValue)) await renameLinkedChoices(key, tabName, previousName, newValue)
    const ends = linkEndsOf(key, tabName)
    const linkedEnd = ends.find(([end]) => foldName(end.column) === foldName(target))
    if (!linkedEnd && !(isNameColumn(target) && ends.length > 0)) return []
    const changed = new Set<WorldIndexKey>()
    const oldName = rowName(before, rowIndex)

    if (linkedEnd && oldName) {
      // Noms effacés de la cellule : l'autre côté les oublie aussi.
      const [end, other] = linkedEnd
      const kept = new Set(splitNames(newValue).map(foldName))
      for (const removed of splitNames(before.rows[rowIndex]?.[columnOf(before.headers, end.column)] || "")) {
        if (!kept.has(foldName(removed)) && await removeLink(other, removed, oldName)) changed.add(other.index)
      }
    }
    if (isNameColumn(target) && oldName && newValue && foldName(oldName) !== foldName(newValue)) {
      // Entité renommée : chaque ligne qui la citait reçoit le nouveau nom.
      for (const [end, other] of ends) {
        for (const linked of splitNames(before.rows[rowIndex]?.[columnOf(before.headers, end.column)] || "")) {
          if (await removeLink(other, linked, oldName, newValue)) changed.add(other.index)
        }
      }
    }
    // Une ligne sans identifiant est reconnue par son nom : le nouveau, s'il vient de changer.
    const written = refOf(before, rowIndex)
    await syncRowLinks(key, tabName, column === labelColumnIndex(before.headers) ? { ...written, name: newValue } : written, changed)
    invalidateWorldIndexes(changed)
    return [...changed]
  })
}

/**
 * Le formulaire d'ajout : les valeurs arrivent en HTML, les cellules gardent leur mise en
 * forme. `headers` : les colonnes que suivent les valeurs, telles que la page les a vues.
 */
export function addWorldIndexRow(key: WorldIndexKey, tabName: string, provided: string[], headers?: string[]) {
  return serialized(async () => {
    assertRowCommands(key)
    const sheet = await writableWorkbook(key)
    const sent = headers ?? (await getWorldIndex(key)).tables.find((candidate) => candidate.tabName === tabName)?.headers
    if (!sent) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
    const current = await plainTable(key, tabName)
    // Les valeurs suivent les colonnes de la page ; on les range par nom dans celles de Sheets
    // (une colonne en double ne reçoit la valeur qu'une fois : la première, celle qu'on voit).
    const given = new Map<string, string>()
    sent.forEach((header, index) => { if (!given.has(foldName(header))) given.set(foldName(header), String(provided[index] ?? "").slice(0, 50_000)) })
    const placed = new Set<string>()
    const html = current.headers.map((header) => {
      const name = foldName(header)
      if (placed.has(name)) return ""
      placed.add(name)
      return given.get(name) ?? ""
    })
    // Une case HTML-en-texte (le vocabulaire) est écrite avec son HTML, comme sa page l'écrit.
    const htmlText = current.headers.map((header) => isHtmlTextColumn(key, header))
    const plain = html.map((value, column) => htmlText[column] ? value : htmlToRichText(value).text)
    const nameColumn = nameColumnIndex(current.headers)
    if (nameColumn >= 0 && !plain[nameColumn].trim()) throw new Error("WORLD_INDEX_NAME_REQUIRED")
    // Une entité du même nom existe déjà (créée par un lien, par exemple) : on la
    // complète au lieu d'en créer une seconde. Pas dans un index d'entités : deux PNJs
    // (ou deux sorts) peuvent porter le même nom.
    const existing = nameColumn >= 0 && !entityOf(key) ? findRowByName(current, plain[nameColumn]) : -1
    // Les cases écrites : seules elles reçoivent ensuite leur mise en forme.
    const filled = new Set<number>()
    let row: WorldIndexRowRef
    if (existing > 0) {
      // Compléter, jamais remplacer : une case déjà remplie garde sa valeur ; une colonne liée
      // reçoit seulement les noms qui lui manquent.
      for (const [column, value] of plain.entries()) {
        if (column === nameColumn || !value.trim()) continue
        const previous = current.rows[existing][column] || ""
        if (linkEndsOf(key, tabName).some(([end]) => foldName(end.column) === foldName(current.headers[column]))) {
          const merged = splitNames(`${previous}, ${value}`).join(", ")
          if (merged !== previous) await writeCell(current, tabName, existing, column, merged)
          continue
        }
        if (previous.trim()) continue
        await writeCell(current, tabName, existing, column, value)
        filled.add(column)
      }
      row = refOf(current, existing)
    } else {
      const created = await writeNewRow(key, current, tabName, plain)
      plain.forEach((_, column) => filled.add(column))
      row = { ...created, name: plain[labelColumnIndex(current.headers)] ?? "" }
    }
    const rich = html.flatMap((value, column) => /<[a-z]/i.test(value) && filled.has(column) && !htmlText[column] ? [{ header: current.headers[column], html: value }] : [])
    if (rich.length) {
      // Relue avant la mise en forme : la ligne a pu descendre (une autre insérée au-dessus entre-temps).
      const after = await plainTable(key, tabName, [])
      const rowIndex = resolveRow(after, row)
      const sheetId = await sheetIdOf(sheet.spreadsheetId, tabName)
      for (const cell of rich) await updateFormattedCell({ spreadsheetId: sheet.spreadsheetId, sheetId, rowNumber: rowIndex + 1, column: columnOf(after.headers, cell.header), html: cell.html })
    }
    const changed = new Set<WorldIndexKey>([key])
    await syncRowLinks(key, tabName, row, changed)
    invalidateWorldIndexes(changed)
    return [...changed].filter((changedKey) => changedKey !== key)
  })
}

/**
 * « Ajouter une ligne » ou « plusieurs » : des lignes vides juste sous la ligne `anchor`
 * (retrouvée par son identifiant), avec la mise en forme de la ligne du dessus.
 */
export function insertWorldIndexRows(key: WorldIndexKey, tabName: string, anchor: WorldIndexRowRef, count: number) {
  return serialized(async () => {
    assertRowCommands(key, "insert")
    const sheet = await writableWorkbook(key)
    const rows = Math.max(1, Math.min(100, Math.trunc(count) || 1))
    const table = await plainTable(key, tabName, [])
    const rowIndex = resolveRow(table, anchor)
    const sheetId = await sheetIdOf(sheet.spreadsheetId, tabName)
    await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 1 + rows }, inheritFromBefore: true } }] }),
    })
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    await insertCachedRows(key, tabName, cachedIdentityOf(table, rowIndex), rows)
  })
}

/**
 * Des lignes vides insérées sous `anchor` : la mémoire est décalée au lieu d'être relue (des
 * lignes vides en fin de tableau n'y seraient sinon plus visibles), et marquée : une relecture
 * lancée avant ne la remplace pas. Seulement si elle montre bien cette ligne à ce numéro ;
 * sinon elle date d'avant un changement fait ailleurs, et elle est relue.
 */
async function insertCachedRows(key: WorldIndexKey, tabName: string, anchor: CachedRowIdentity, count: number) {
  const entry = worldIndexCache.get(key)
  if (!entry) return
  const data = await entry.promise.catch(() => null)
  const table = data?.tables.find((candidate) => candidate.tabName === tabName)
  const row = table?.rows.find((candidate) => candidate.rowNumber === anchor.rowNumber)
  if (!table || !row || !cachedRowIs(table, row, anchor) || worldIndexCache.get(key) !== entry) return invalidateWorldIndexes([key])
  entry.patchedAt = Date.now()
  entry.expiresAt = Math.max(entry.expiresAt, Date.now() + WORLD_INDEX_CACHE_MS)
  for (const candidate of table.rows) if (candidate.rowNumber > anchor.rowNumber) candidate.rowNumber += count
  const position = table.rows.findIndex((candidate) => candidate.rowNumber > anchor.rowNumber)
  const blanks = Array.from({ length: count }, (_, offset) => ({ rowNumber: anchor.rowNumber + offset + 1, values: table.headers.map(() => ""), html: table.headers.map(() => "") }))
  table.rows.splice(position < 0 ? table.rows.length : position, 0, ...blanks)
}

/**
 * La copie apparaît juste sous l'originale, mise en forme comprise, avec son propre
 * identifiant. Les lignes sont retrouvées par leur identifiant et toutes copiées d'une seule
 * requête, de la dernière à la première. Dans les sorts des classes, la copie n'a aucun rang
 * de classe : un rang n'admet que trois sorts, ils se choisissent depuis la classe.
 */
export function duplicateWorldIndexRows(key: WorldIndexKey, tabName: string, rows: WorldIndexRowRef[], options: { guard?: WorldIndexRowGuard } = {}) {
  return serialized(async () => {
    assertRowCommands(key, "duplicate")
    const sheet = await writableWorkbook(key)
    const table = await plainTable(key, tabName, [])
    const indexes = [...new Set(rows.map((row) => resolveRow(table, row)))].sort((left, right) => right - left)
    for (const index of indexes) await options.guard?.({ id: rowId(table, index), headers: [] })
    if (!indexes.length) return
    const sheetId = await sheetIdOf(sheet.spreadsheetId, tabName)
    // Un index d'entités copie toute la ligne (un personnage a des centaines de colonnes hors du tableau).
    const columns = entityOf(key) ? {} : { startColumnIndex: 0, endColumnIndex: table.headers.length }
    const idColumn = columnOf(table.headers, ID_HEADER)
    const prefix = tabDefinition(key, tabName).idPrefix
    const ranks = key === "class-spells" ? await classRankColumns(table.headers) : []
    const cell = (rowIndex: number, column: number, value: string) => ({ updateCells: {
      range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: column, endColumnIndex: column + 1 },
      rows: [{ values: [value ? { userEnteredValue: { stringValue: value } } : {}] }],
      fields: "userEnteredValue",
    } })
    const requests = indexes.flatMap((index) => [
      { insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: index + 1, endIndex: index + 2 }, inheritFromBefore: true } },
      { copyPaste: {
        source: { sheetId, startRowIndex: index, endRowIndex: index + 1, ...columns },
        destination: { sheetId, startRowIndex: index + 1, endRowIndex: index + 2, ...columns },
        pasteType: "PASTE_NORMAL",
      } },
      ...(idColumn >= 0 ? [cell(index + 1, idColumn, newIndexId(prefix))] : []),
      ...ranks.map((column) => cell(index + 1, column, "")),
    ])
    await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) })
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    invalidateWorldIndexes([key])
  })
}

/** Les colonnes de rang des classes (une par classe) dans la feuille des sorts des classes. */
async function classRankColumns(headers: string[]) {
  const classNames = (await listClassOptions()).map((item) => item.name)
  return headers.flatMap((header, index) => isClassRankHeader(header, classNames) ? [index] : [])
}

/**
 * Supprime des lignes, retrouvées par leur identifiant : deux homonymes ne se confondent
 * jamais. Avant, l'entité supprimée est retirée des colonnes liées qui la citaient ; puis
 * l'onglet est relu, et chaque ligne retrouvée de nouveau avant d'être supprimée.
 */
export function deleteWorldIndexRows(key: WorldIndexKey, tabName: string, rows: WorldIndexRowRef[]) {
  return serialized(async () => {
    assertRowCommands(key, "delete")
    const sheet = await writableWorkbook(key)
    const before = await plainTable(key, tabName, [])
    const targets = [...new Set(rows.map((row) => resolveRow(before, row)))].map((index) => refOf(before, index))
    const deletedNames = new Set(targets.map((target) => foldName(rowName(before, target.rowNumber - 1))))
    for (const target of targets) {
      const name = rowName(before, target.rowNumber - 1)
      if (!name) continue
      for (const [end, other] of linkEndsOf(key, tabName)) {
        for (const linked of splitNames(before.rows[target.rowNumber - 1]?.[columnOf(before.headers, end.column)] || "")) {
          // Une ligne supprimée en même temps n'a pas besoin d'être nettoyée.
          if (linkEndCovers(other, key, tabName) && deletedNames.has(foldName(linked))) continue
          await removeLink(other, linked, name)
        }
      }
    }
    // Le nettoyage a pu écrire dans cet onglet, et d'autres y ajouter ou retirer des lignes :
    // relu, chaque ligne y est retrouvée de nouveau par son identifiant.
    const fresh = await plainTable(key, tabName, [])
    await deleteRows(sheet.spreadsheetId, tabName, targets.map((target) => resolveRow(fresh, target) + 1))
    invalidateWorldIndexes(linkedIndexes(key))
  })
}

/**
 * Plusieurs colonnes d'une même ligne, nommées par leur en-tête : c'est la fiche d'une
 * créature, dont la plupart des champs ne sont pas affichés dans le tableau. Seules les
 * valeurs modifiées sont écrites, pour ne pas effacer la mise en forme des autres. La ligne
 * est retrouvée par son identifiant ; `previous` (ce que la fiche montrait de chaque champ)
 * fait tout refuser si l'un d'eux a changé entre-temps ailleurs.
 */
export function updateWorldIndexFields(key: WorldIndexKey, tabName: string, row: WorldIndexRowRef, fields: Record<string, string>, options: { previous?: Record<string, string>; guard?: WorldIndexRowGuard } = {}) {
  return serialized(async () => {
    const sheet = await writableWorkbook(key)
    const table = await plainTable(key, tabName, Object.keys(fields))
    const rowIndex = resolveRow(table, row)
    const current = table.rows[rowIndex] ?? []
    const nameColumn = nameColumnIndex(table.headers)
    const oldName = nameColumn >= 0 ? String(current[nameColumn] ?? "").trim() : ""
    // Tout est vérifié avant d'écrire : une colonne disparue, un nom vide ou un champ changé ailleurs n'écrit rien.
    const targets = Object.entries(fields).map(([header, raw]) => ({ header, column: columnOf(table.headers, header), value: String(raw ?? "").slice(0, 50_000) }))
    if (targets.some((target) => target.column < 0)) throw new Error("WORLD_INDEX_COLUMN_NOT_FOUND")
    if (targets.some((target) => target.column === nameColumn && !target.value.trim())) throw new Error("WORLD_INDEX_NAME_REQUIRED")
    await options.guard?.({ id: rowId(table, rowIndex), headers: targets.map((target) => table.headers[target.column]) })
    for (const target of targets) {
      const seen = options.previous?.[target.header]
      if (seen !== undefined && !sameCellText(seen, current[target.column] ?? "")) throw new Error("WORLD_INDEX_CELL_CHANGED")
    }
    const rowNumber = rowIndex + 1
    const data: Array<{ range: string; values: string[][] }> = []
    const formatted: Array<{ column: number; html: string }> = []
    const written: Array<{ header: string; html: string }> = []
    for (const target of targets) {
      if ((current[target.column] ?? "") === target.value) continue
      written.push({ header: table.headers[target.column], html: target.value })
      // Texte enrichi : écrit avec sa mise en forme plutôt qu'avec ses balises.
      // (Sauf une case HTML-en-texte, le vocabulaire : son HTML est écrit tel quel.)
      if (/<[a-z]/i.test(target.value) && !isHtmlTextColumn(key, table.headers[target.column])) { formatted.push({ column: target.column, html: target.value }); continue }
      const cell = `${columnName(target.column + 1)}${rowNumber}`
      data.push({ range: sheetTabRange(tabName, `${cell}:${cell}`), values: [[target.value]] })
    }
    if (data.length) {
      await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "RAW", data }),
      })
      clearSpreadsheetReadCache(sheet.spreadsheetId)
    }
    if (formatted.length) {
      const sheetId = await sheetIdOf(sheet.spreadsheetId, tabName)
      for (const cell of formatted) await updateFormattedCell({ spreadsheetId: sheet.spreadsheetId, sheetId, rowNumber, column: cell.column, html: cell.html })
    }
    await patchCachedRow(key, tabName, cachedIdentityOf(table, rowIndex), written)
    const nameField = Object.entries(fields).find(([header]) => columnOf(table.headers, header) === nameColumn)?.[1]
    const newName = nameField === undefined ? "" : htmlToRichText(String(nameField)).text.replace(/\s+/g, " ").trim()
    if (oldName && newName && foldName(oldName) !== foldName(newName)) await renameLinkedChoices(key, tabName, oldName, newName)
    return written.length
  })
}

/**
 * Déplace des lignes vers un autre onglet du même index (un lieu créé par un lien
 * arrive dans le premier onglet, on le range ensuite). Les colonnes sont recopiées
 * par leur nom, la ligne d'origine est ensuite retirée. Les liens suivent d'eux-mêmes :
 * ils désignent une entité par son nom, quel que soit son onglet. Les lignes sont
 * retrouvées par leur identifiant, avant la copie comme avant la suppression.
 */
export function moveWorldIndexRows(key: WorldIndexKey, fromTab: string, toTab: string, rows: WorldIndexRowRef[]) {
  return serialized(async () => {
    if (fromTab === toTab) return
    assertRowCommands(key, "move")
    const sheet = await writableWorkbook(key)
    if (!(await tabsOf(key)).some((tab) => tab.name === toTab)) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
    const source = await plainTable(key, fromTab)
    const target = await plainTable(key, toTab)
    const moved: WorldIndexRowRef[] = []
    for (const index of [...new Set(rows.map((row) => resolveRow(source, row)))].sort((left, right) => left - right)) {
      const row = source.rows[index]
      if (!row?.some((value) => value.trim())) continue
      const values = target.headers.map((header) => {
        const column = columnOf(source.headers, header)
        return column >= 0 ? row[column] ?? "" : ""
      })
      await writeNewRow(key, target, toTab, values)
      moved.push(refOf(source, index))
    }
    if (!moved.length) return
    // Les lignes d'origine, retrouvées dans l'onglet relu : une ligne ajoutée ou retirée
    // ailleurs entre-temps ne fait pas supprimer la voisine.
    const fresh = await plainTable(key, fromTab)
    await deleteRows(sheet.spreadsheetId, fromTab, moved.map((row) => resolveRow(fresh, row) + 1))
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
export function ensureWorldIndexEntry(key: WorldIndexKey, tabName: string, name: string, fields: Record<string, string> = {}) {
  return serialized(async () => {
    const clean = name.replace(/\s+/g, " ").trim()
    if (!clean) return false
    for (const tab of await tabsOf(key)) {
      if (findRowByName(await plainTable(key, tab.name), clean) > 0) return false
    }
    const table = await plainTable(key, tabName)
    const nameColumn = nameColumnIndex(table.headers)
    if (nameColumn < 0 || entityOf(key)?.addHref) return false
    // Les autres champs donnés (le Type d'une liste filtrée) sont écrits avec le nom.
    const extra = new Map(Object.entries(fields).map(([header, value]) => [foldName(header), value.trim()]))
    await writeNewRow(key, table, tabName, table.headers.map((header, index) => index === nameColumn ? clean : extra.get(foldName(header)) ?? ""))
    invalidateWorldIndexes([key])
    return true
  })
}

// ---------------------------------------------------------------------------
// « Modifier » : le schéma d'un index du monde
// ---------------------------------------------------------------------------

/**
 * Ce que les verrous ont besoin de savoir en plus de la définition : les classes, dont chacune
 * a sa colonne de rang dans les sorts des classes (sous son ID ou sous son nom).
 */
async function policyContext(key: WorldIndexKey): Promise<WorldPolicyContext> {
  if (key !== "class-spells") return {}
  return { classNames: (await listClassOptions()).map((item) => item.name) }
}

/** Ce que l'éditeur montre d'un index : ses onglets, ses colonnes, leurs verrous et raisons. */
export async function worldEditorModel(key: WorldIndexKey): Promise<IndexEditorModel> {
  const data = await getWorldIndex(key)
  const links = data.links
  // Pour l'affichage seulement : l'écriture relit les classes et refuse si elle ne le peut pas.
  const context = await policyContext(key).catch((error) => {
    console.error("WORLD_INDEX_POLICY_CONTEXT_FAILED", key, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return {}
  })
  const firstTab = data.definition.tabs[0]?.name
  const linkedTabs = new Set(links.flatMap(([end]) => end.index === key && end.tab !== "*" ? [end.tab] : []))
  const entity = entityOf(key)
  const tabs = data.tables.map((table): IndexEditorModel["tabs"][number] => {
    if (entity) {
      const reason = "Onglet lu par Eraser sous ce nom : c’est la feuille de cet index."
      return {
        name: table.tabName,
        columns: (data.columns[table.tabName] ?? []).map((column) => ({ header: column.header, spec: column.spec, policy: worldColumnPolicy(key, table.tabName, column.header, links, context) })),
        remove: false,
        removeReason: reason,
        rename: false,
        renameReason: reason,
        addColumns: true,
      }
    }
    const locked = table.tabName === firstTab
      ? "Premier onglet : une ligne créée par un lien (un nom saisi ailleurs) arrive ici."
      : linkedTabs.has(table.tabName) ? "Une colonne liée d’un autre onglet ou d’un autre index vise cet onglet." : ""
    // Un onglet prévu par Eraser est lu par son nom ; un onglet visé par une colonne liée aussi.
    const planned = isBuiltinWorldIndexKey(key) && worldIndexDefinitions[key].tabs.some((tab) => foldName(tab.name) === foldName(table.tabName))
    const renameReason = planned ? "Onglet prévu par Eraser : il est retrouvé par son nom (créations, liens, statistiques)." : linkedTabs.has(table.tabName) ? "Une colonne liée vise cet onglet par son nom." : ""
    return {
      name: table.tabName,
      columns: (data.columns[table.tabName] ?? []).map((column) => ({ header: column.header, spec: column.spec, policy: worldColumnPolicy(key, table.tabName, column.header, links, context) })),
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
  return { family: "world", key, title: data.definition.title, tabs, addTabs: !entity, relationTargets: await worldRelationTargets(), deleteIndex }
}

/** Les index du monde qu'une relation peut viser, avec leurs onglets et colonnes. */
export async function worldRelationTargets(): Promise<RelationTarget[]> {
  const builtin = Object.values(worldIndexDefinitions).map((definition) => ({
    index: definition.key,
    title: definition.title,
    tabs: effectiveIndexes.get(definition.key)?.definition.tabs.map((tab) => ({ name: tab.name, columns: tab.headers })) ?? definition.tabs.map((tab) => ({ name: tab.name, columns: tab.headers })),
  }))
  // Le registre illisible un instant : la liste des cibles s'en passe (rien n'est écrit d'ici).
  const entries = await listCustomIndexes().catch((error) => {
    console.error("WORLD_INDEX_RELATION_TARGETS_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return []
  })
  const custom = await Promise.all(entries.map(async (entry) => {
    const tabs = await tabsOf(entry.key).catch(() => [] as WorldIndexTabDefinition[])
    return { index: entry.key, title: entry.title, tabs: tabs.map((tab) => ({ name: tab.name, columns: tab.headers })) }
  }))
  return [...builtin, ...custom]
}

async function writeHeader(spreadsheetId: string, tabName: string, column: number, header: string) {
  const cell = `${columnName(column + 1)}1`
  await updateRange(spreadsheetId, sheetTabRange(tabName, `${cell}:${cell}`), [[header]], { valueInputOption: "RAW" })
}

/** Ajoute une colonne à droite de la dernière colonne remplie de l'en-tête, relu à l'instant. */
async function appendHeader(spreadsheetId: string, tabName: string, header: string) {
  const [firstRow = []] = (await readRangeFreshWithOffset(spreadsheetId, sheetTabRange(tabName, "1:1"))).rows
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
 * L'index visé et son schéma sont relus à l'instant : celui d'un classeur partagé (les
 * créatures et leurs sorts) porte aussi les réglages de l'autre index, jamais réécrits d'avant.
 */
async function ensureReciprocal(key: WorldIndexKey, tab: string, header: string, link: NonNullable<IndexColumnSpec["link"]>) {
  const target = await workbook(link.index, { strict: true })
  const tabs = link.tab === "*" ? target.definition.tabs.map((item) => item.name) : [link.tab]
  for (const targetTab of tabs) await appendHeader(target.spreadsheetId, targetTab, link.column)
  await rewriteSchema(target.spreadsheetId, (entries) => {
    for (const targetTab of tabs) upsertEntry(entries, targetTab, link.column, { spec: { kind: "linked", also: ["rich"], link: { index: key, tab, column: header } }, deletedAt: "" })
  })
  forgetWorkbook(target.spreadsheetId)
}

/** La ligne d'un onglet dans le schéma : sa place, et pour un index d'entités l'ordre d'affichage de ses colonnes. */
function setTabSpec(entries: SchemaEntry[], tab: string, changes: Pick<IndexColumnSpec, "position" | "columns">) {
  const current = findEntry(entries, tab, "")?.spec
  upsertEntry(entries, tab, "", { spec: { ...(current?.kind === "tab" ? current : {}), kind: "tab", ...changes } })
}

/**
 * Applique les changements de l'éditeur, un par un, dans la file des écritures. Une
 * opération verrouillée est refusée même si l'interface l'avait laissée passer. Ce que
 * chaque opération change au schéma est rejoué, à la fin, sur le schéma relu à l'instant :
 * rien n'est écrit d'un schéma vieilli ou mal lu, ni par-dessus un changement fait ailleurs.
 * Un index d'entités (sa feuille sert aussi ailleurs dans Eraser) ne voit jamais ses colonnes
 * déplacées ni ses en-têtes lus par Eraser renommés.
 */
export function applyWorldSchemaOperations(key: WorldIndexKey, operations: SchemaOperation[]) {
  return serialized(async () => {
    const sheet = await workbook(key, { strict: true })
    // Une copie de travail : chaque vérification voit les opérations précédentes.
    const schema = sheet.schema.map((entry) => ({ ...entry }))
    const edits: Array<(entries: SchemaEntry[]) => void> = []
    const edit = (change: (entries: SchemaEntry[]) => void) => { change(schema); edits.push(change) }
    const links = linksOf(key)
    const context = await policyContext(key)
    const entity = entityOf(key)
    const now = new Date().toISOString()
    try {
      for (const operation of operations) {
        // Un index d'entités garde son seul onglet, celui que lit Eraser.
        if (entity && ["add-tab", "order-tabs", "rename-tab", "remove-tab"].includes(operation.op)) throw new Error("INDEX_SCHEMA_LOCKED:Onglet lu par Eraser sous ce nom : c’est la feuille de cet index.")
        if (operation.op === "add-tab") {
          const problem = tabProblem(operation.name, [...(await spreadsheetTabs(sheet.spreadsheetId)).map((tab) => tab.title)])
          if (problem) throw new Error(`INDEX_SCHEMA_INVALID:${problem}`)
          const name = operation.name.replace(/\s+/g, " ").trim()
          const columns = operation.columns.filter((column) => !["nom", "id"].includes(foldName(column.header)))
          await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: name, gridProperties: { rowCount: 1000, columnCount: Math.max(26, columns.length + 2), frozenRowCount: 1, frozenColumnCount: 1 } } } }] }) })
          const headers = ["Nom", ...columns.map((column) => column.header.trim()), ID_HEADER]
          await updateRange(sheet.spreadsheetId, sheetTabRange(name, `A1:${columnName(headers.length)}1`), [headers], { valueInputOption: "RAW" })
          edit((entries) => upsertEntry(entries, name, "", { state: "ajouté", deletedAt: "" }))
          for (const column of columns) {
            const header = column.header.trim()
            edit((entries) => upsertEntry(entries, name, header, { spec: column.spec, state: "ajouté", deletedAt: "" }))
            if (column.spec.kind === "linked" && column.spec.link) await ensureReciprocal(key, name, header, column.spec.link)
          }
          continue
        }
        if (operation.op === "order-tabs") {
          const existing = await spreadsheetTabs(sheet.spreadsheetId)
          const requests: unknown[] = []
          operation.tabs.forEach((name, position) => {
            edit((entries) => setTabSpec(entries, name, { position }))
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
          edit((entries) => { for (const entry of entries) if (entry.tab === tab.name) entry.tab = to })
          clearSpreadsheetReadCache(sheet.spreadsheetId)
          continue
        }
        if (operation.op === "order-columns") {
          // Un index d'entités : ses colonnes ne bougent pas dans la feuille (d'autres pages la
          // lisent). L'ordre choisi n'est que celui de l'affichage, gardé dans le schéma.
          if (entity) {
            const headers = operation.headers.map((header) => header.replace(/\s+/g, " ").trim()).filter(Boolean)
            edit((entries) => setTabSpec(entries, tab.name, { columns: headers }))
            continue
          }
          const [firstRow = []] = (await readRangeFreshWithOffset(sheet.spreadsheetId, sheetTabRange(tab.name, "1:1"))).rows
          const moves = columnMoves(firstRow, operation.headers)
          if (moves.length) {
            const sheetId = await sheetIdOf(sheet.spreadsheetId, tab.name)
            await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: moves.map((move) => ({ moveDimension: { source: { sheetId, dimension: "COLUMNS", startIndex: move.from, endIndex: move.from + 1 }, destinationIndex: move.to } })) }) })
            clearSpreadsheetReadCache(sheet.spreadsheetId)
          }
          continue
        }
        if (operation.op === "remove-tab") {
          const model = await worldEditorModel(key)
          const target = model.tabs.find((candidate) => candidate.name === tab.name)
          assertPolicy(Boolean(target?.remove), [target?.removeReason ?? ""])
          edit((entries) => upsertEntry(entries, tab.name, "", { deletedAt: now }))
          continue
        }
        const table = await plainTable(key, tab.name, [])
        if (operation.op === "add-column") {
          const problem = headerProblem(operation.header, table.headers)
          if (problem) throw new Error(`INDEX_SCHEMA_INVALID:${problem}`)
          const header = operation.header.replace(/\s+/g, " ").trim()
          await appendHeader(sheet.spreadsheetId, tab.name, header)
          edit((entries) => upsertEntry(entries, tab.name, header, { spec: operation.spec, state: "ajouté", deletedAt: "" }))
          if (operation.spec.kind === "linked" && operation.spec.link) await ensureReciprocal(key, tab.name, header, operation.spec.link)
          continue
        }
        const column = columnOf(table.headers, operation.header)
        if (column < 0) throw new Error("WORLD_INDEX_COLUMN_NOT_FOUND")
        const policy = worldColumnPolicy(key, tab.name, operation.header, links, context)
        if (operation.op === "rename") {
          // Une colonne qu'Eraser lit dans la feuille d'un index d'entités garde son nom, même
          // déverrouillée : la renommer dans Sheets la couperait des pages qui la lisent.
          assertPolicy(policy.rename || (Boolean(operation.force) && !entity), policy.reasons)
          const problem = headerProblem(operation.to, table.headers, operation.header)
          if (problem) throw new Error(`INDEX_SCHEMA_INVALID:${problem}`)
          const to = operation.to.replace(/\s+/g, " ").trim()
          const from = operation.header
          await writeHeader(sheet.spreadsheetId, tab.name, column, to)
          const planned = tab.headers.some((header) => foldName(header) === foldName(from))
          edit((entries) => {
            const entry = findEntry(entries, tab.name, from)
            // Une colonne prévue par Eraser garde son nom d'origine : elle n'est pas recréée.
            if (entry) Object.assign(entry, { column: to, origin: entry.origin || (planned && !entry.state ? from : "") })
            else entries.push({ tab: tab.name, column: to, origin: planned ? from : "", spec: null, state: "", deletedAt: "" })
            // Les Recherches et Agrégats qui suivaient cette colonne suivent son nouveau nom.
            for (const other of entries) {
              if (other.tab !== tab.name || !other.spec) continue
              if (other.spec.lookup?.via && foldName(other.spec.lookup.via) === foldName(from)) other.spec = { ...other.spec, lookup: { ...other.spec.lookup, via: to } }
              if (other.spec.rollup?.via && foldName(other.spec.rollup.via) === foldName(from)) other.spec = { ...other.spec, rollup: { ...other.spec.rollup, via: to } }
            }
            // L'ordre d'affichage gardé pour un index d'entités suit le nouveau nom.
            const order = findEntry(entries, tab.name, "")?.spec
            if (order?.kind === "tab" && order.columns) setTabSpec(entries, tab.name, { columns: order.columns.map((header) => foldName(header) === foldName(from) ? to : header) })
          })
          continue
        }
        if (operation.op === "spec") {
          const current = effectiveColumnSpec(key, tab.name, operation.header, schema)
          if (!isDisplayOnlyChange(current, operation.spec)) assertPolicy(policy.type || Boolean(operation.force), policy.reasons)
          edit((entries) => upsertEntry(entries, tab.name, operation.header, { spec: operation.spec }))
          if (operation.spec.kind === "linked" && operation.spec.link && !current.link) await ensureReciprocal(key, tab.name, operation.header, operation.spec.link)
          continue
        }
        if (operation.op === "remove-column") {
          // À la corbeille dans le schéma seulement : la colonne reste dans la feuille.
          assertPolicy(policy.remove || Boolean(operation.force), policy.reasons)
          edit((entries) => upsertEntry(entries, tab.name, operation.header, { deletedAt: now }))
        }
      }
      if (edits.length) await rewriteSchema(sheet.spreadsheetId, (entries) => { for (const change of edits) change(entries) })
    } finally {
      // Les onglets ou colonnes ont pu changer même si une opération a été refusée en route.
      forgetWorkbook(sheet.spreadsheetId)
      readyWorkbooks.clear()
    }
    return getWorldIndex(key, { refresh: true })
  })
}

// ---------------------------------------------------------------------------
// Corbeille : colonnes et onglets supprimés depuis l'éditeur
// ---------------------------------------------------------------------------

export type IndexTrashItem = { family: "world" | "objects"; key: string; title: string; tab: string; column: string; deletedAt: string; filled: number }

/** Le classeur d'un index existe-t-il déjà ? (sans le créer) */
async function existingWorkbook(key: WorldIndexKey) {
  if (effectiveIndexes.has(key)) return true
  if (key === "class-spells") return true
  if (key === "creature-spells") {
    // L'onglet des sorts n'est pas créé pour autant : on regarde seulement s'il existe.
    const creatures = await resolveJdrSheet("creatures")
    return Boolean(creatures && (await spreadsheetTabs(creatures.spreadsheetId)).some((tab) => tab.title === CREATURE_SPELLS_TAB))
  }
  return Boolean(await resolveJdrSheet(key as JdrSheetKey))
}

/** Les colonnes et onglets à la corbeille de tous les index du monde. */
export async function listWorldIndexTrash(): Promise<IndexTrashItem[]> {
  const keys: WorldIndexKey[] = [...Object.keys(worldIndexDefinitions) as WorldIndexKey[], ...(await listCustomIndexes()).map((entry) => entry.key)]
  const unreadable = (key: WorldIndexKey) => (error: unknown) => {
    // La corbeille de cet index n'est pas montrée cette fois : on le dit dans le journal, sans la croire vide.
    console.error("WORLD_INDEX_TRASH_READ_FAILED", key, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return null
  }
  const items = await Promise.all(keys.map(async (key) => {
    // Un index jamais ouvert n'a ni classeur ni corbeille : il n'est pas créé pour autant.
    if (isBuiltinWorldIndexKey(key) && !await existingWorkbook(key).catch(unreadable(key))) return []
    const effective = await loadEffectiveIndex(key, { strict: true }).catch(unreadable(key))
    if (!effective) return []
    return effective.schema.filter((entry) => entry.deletedAt && entry.state !== "supprimé").map((entry): IndexTrashItem => ({ family: "world", key, title: effective.definition.title, tab: entry.tab, column: entry.column, deletedAt: entry.deletedAt, filled: 0 }))
  }))
  return items.flat()
}

/** Restaure une colonne ou un onglet de la corbeille, dans le schéma relu à l'instant. */
export function restoreWorldIndexTrash(key: WorldIndexKey, tab: string, column: string) {
  return serialized(async () => {
    const effective = await loadEffectiveIndex(key, { strict: true })
    if (!findEntry(effective.schema, tab, column)) throw new Error("INDEX_TRASH_NOT_FOUND")
    try {
      await rewriteSchema(effective.spreadsheetId, (entries) => {
        const entry = findEntry(entries, tab, column)
        if (!entry) throw new Error("INDEX_TRASH_NOT_FOUND")
        entry.deletedAt = ""
      })
    } finally {
      forgetWorkbook(effective.spreadsheetId)
      readyWorkbooks.clear()
    }
  })
}

/**
 * Suppression définitive : la colonne (ou l'onglet) est effacée de Google Sheets. Le
 * schéma garde une trace « supprimé » pour qu'Eraser ne la recrée pas. Vérifié dans le
 * schéma et l'en-tête relus à l'instant ; jamais dans la feuille d'un index d'entités
 * (personnages, campagnes, PNJ, classes, sorts : d'autres pages d'Eraser la lisent), ni
 * quand plusieurs colonnes portent ce nom (on ne saurait pas laquelle effacer).
 */
export function purgeWorldIndexTrash(key: WorldIndexKey, tab: string, column: string) {
  return serialized(async () => {
    if (entityOf(key)) throw new Error("INDEX_TRASH_ENTITY_LOCKED")
    const effective = await loadEffectiveIndex(key, { strict: true })
    const entry = findEntry(effective.schema, tab, column)
    if (!entry?.deletedAt) throw new Error("INDEX_TRASH_NOT_FOUND")
    const tabs = await spreadsheetTabs(effective.spreadsheetId)
    const sheetId = tabs.find((candidate) => candidate.title === tab)?.sheetId
    try {
      if (sheetId !== undefined) {
        if (!column) {
          await googleSheetsJson(`spreadsheets/${effective.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteSheet: { sheetId } }] }) })
        } else {
          const [firstRow = []] = (await readRangeFreshWithOffset(effective.spreadsheetId, sheetTabRange(tab, "1:1"))).rows
          const found = firstRow.flatMap((header, index) => foldName(header) === foldName(column) ? [index] : [])
          if (found.length > 1) throw new Error("INDEX_TRASH_AMBIGUOUS")
          if (found.length) await googleSheetsJson(`spreadsheets/${effective.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "COLUMNS", startIndex: found[0], endIndex: found[0] + 1 } } }] }) })
        }
      }
      // Une colonne ou un onglet ajouté depuis Eraser disparaît du schéma ; un élément prévu
      // par Eraser y reste marqué « supprimé » pour ne jamais être recréé.
      const planned = !column
        ? isBuiltinWorldIndexKey(key) && worldIndexDefinitions[key].tabs.some((candidate) => candidate.name === tab)
        : Boolean(entry.origin) || (isBuiltinWorldIndexKey(key) && worldIndexDefinitions[key].tabs.some((candidate) => candidate.name === tab && candidate.headers.some((header) => foldName(header) === foldName(column))))
      await rewriteSchema(effective.spreadsheetId, (entries) => {
        const current = findEntry(entries, tab, column)
        if (!current) return entries
        return planned
          ? entries.map((candidate) => candidate === current ? { ...candidate, state: "supprimé" as const } : candidate)
          : entries.filter((candidate) => candidate !== current && !(column === "" && candidate.tab === tab))
      })
    } finally {
      clearSpreadsheetReadCache(effective.spreadsheetId)
      forgetWorkbook(effective.spreadsheetId)
      readyWorkbooks.clear()
    }
  })
}
