/**
 * Côté serveur des références « {État:Sérénité} » : la liste de ce qu'on peut citer (le
 * menu « { » de l'éditeur) et la résolution d'une référence en nom, détail ou valeur de
 * case, pour l'affichage. Une ligne est retrouvée par son identifiant : renommée, elle
 * reste la même ligne. Lire ne crée jamais de classeur.
 */
import { listObjectIndexTables, resolveJdrSheet, type ObjectIndexTable } from "@/lib/google-sheets"
import { listCustomIndexes } from "@/lib/custom-indexes"
import { foldName, isIdHeader, normalizeSpec, objectColumnSpec } from "@/lib/index-columns"
import { citedCell, columnAt, objectNameHeaders, rowDetails, type SourceRow, type SourceTable } from "@/lib/index-references-cells"
import { entityReferenceKeys, isEntityReferenceKey, loadEntitySource } from "@/lib/index-references-entities"
import {
  entryLabelFromItemLabel,
  OBJECT_REFERENCE_INDEX,
  referenceKey,
  type ReferenceCatalog,
  type ReferenceEntry,
  type ReferenceIndex,
  type ReferenceRequest,
  type ResolvedReference,
} from "@/lib/index-references"
import type { JdrSheetKey } from "@/lib/jdr-sheets"
import { isBuiltinWorldIndexKey, isEntityWorldIndexKey, isNameColumn, worldIndexDefinitions, type WorldIndexKey } from "@/lib/world-index-definitions"
import { getWorldIndexQuick } from "@/lib/world-indexes"

/**
 * Un index qu'on peut citer. `entity` : personnages, campagnes, PNJs, classes, sorts (leurs
 * onglets ne deviennent pas des mots du menu, leurs lignes `unlisted` n'y sont pas
 * proposées, et un joueur n'en lit pas les colonnes privées).
 */
type Source = {
  key: string
  title: string
  itemLabel?: string
  tabs: Array<{ name: string; itemLabel?: string }>
  tables: Array<SourceTable & { unlisted?: boolean }>
  entity?: boolean
  hiddenForPlayers?: (column: string) => boolean
}


/** Un index du monde (prévu par Eraser ou créé dans « Nouvel index ») tel que le lit l'application. */
async function worldSource(key: WorldIndexKey): Promise<Source> {
  const data = await getWorldIndexQuick(key)
  return {
    key,
    title: data.definition.title,
    itemLabel: data.definition.itemLabel,
    tabs: data.definition.tabs.map((tab) => ({ name: tab.name, itemLabel: tab.itemLabel })),
    tables: data.tables.map((table) => {
      const columns = data.columns[table.tabName] ?? []
      const specs = new Map(columns.map((column) => [foldName(column.header), normalizeSpec(column.spec)]))
      const id = table.headers.findIndex(isIdHeader)
      const name = table.headers.findIndex(isNameColumn)
      return {
        tab: table.tabName,
        headers: table.headers,
        columns: columns.map((column) => column.header),
        name,
        specs,
        rows: id < 0 || name < 0 ? [] : table.rows.flatMap((row) => {
          const rowId = (row.values[id] ?? "").trim()
          const rowName = (row.values[name] ?? "").trim()
          return rowId && rowName ? [{ id: rowId, name: rowName, values: row.values, html: row.html }] : []
        }),
      }
    }),
  }
}

/** L'identifiant d'un objet, le même que celui de l'inventaire (ID de la ligne, sinon sa place). */
export function objectReferenceId(table: Pick<ObjectIndexTable, "fileId" | "sheetId" | "headers">, row: { rowNumber: number; values: string[] }) {
  const id = columnAt(table.headers, ["ID", "Identifiant"])
  return (id >= 0 ? (row.values[id] ?? "").trim() : "") || `DRIVE-${table.fileId}-${table.sheetId}-${row.rowNumber}`
}

async function objectSource(): Promise<Source> {
  const tables = await listObjectIndexTables()
  return {
    key: OBJECT_REFERENCE_INDEX,
    title: "Objets",
    itemLabel: "un objet",
    tabs: tables.map((table) => ({ name: table.tabName })),
    tables: tables.map((table) => {
      const name = columnAt(table.headers, objectNameHeaders)
      const specs = new Map(table.headers.map((header) => [foldName(header), normalizeSpec({ ...objectColumnSpec(header, table.headers), ...(table.columnSpecs?.[foldName(header)] ?? {}) })]))
      return {
        tab: table.tabName,
        headers: table.headers,
        columns: table.headers.filter((header) => header.trim() && !/^Colonne \d+$/.test(header)),
        name,
        specs,
        rows: name < 0 ? [] : table.rows.flatMap((row) => {
          const rowName = (row.values[name] ?? "").trim()
          return rowName ? [{ id: objectReferenceId(table, row), name: rowName, values: row.values, html: row.html }] : []
        }),
      }
    }),
  }
}

/**
 * Les index qu'on peut citer : ceux du monde déjà reliés dans Drive (jamais créés ici),
 * l'index des objets, les index personnalisés, puis les index d'entités (personnages,
 * campagnes, PNJs, classes, sorts) : un mot déjà pris par un index du monde le reste.
 */
async function sourceKeys() {
  // Les index d'entités sont aussi sur le moteur, mais se citent avec leurs règles (ce qu'un joueur voit).
  const builtin = await Promise.all(Object.keys(worldIndexDefinitions).filter((key) => !isEntityWorldIndexKey(key)).map(async (key) => (await resolveJdrSheet(key as JdrSheetKey).catch(() => null)) ? key : null))
  const custom = (await listCustomIndexes().catch(() => [])).map((entry) => entry.key)
  const entities = await entityReferenceKeys().catch(() => [])
  return [...builtin.filter((key): key is string => Boolean(key)), OBJECT_REFERENCE_INDEX, ...custom, ...entities]
}

async function loadSource(key: string, options: { cited?: readonly string[] } = {}): Promise<Source | null> {
  try {
    if (isEntityReferenceKey(key)) {
      const source = await loadEntitySource(key, options)
      return source ? { ...source, entity: true } : null
    }
    if (key === OBJECT_REFERENCE_INDEX) return await objectSource()
    if (isBuiltinWorldIndexKey(key) && !isEntityWorldIndexKey(key)) return (await resolveJdrSheet(key as JdrSheetKey)) ? await worldSource(key) : null
    if ((await listCustomIndexes()).some((entry) => entry.key === key)) return await worldSource(key as WorldIndexKey)
    return null
  } catch (error) {
    console.error("INDEX_REFERENCE_SOURCE_FAILED", key, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return null
  }
}

// ---------------------------------------------------------------------------
// Le catalogue du menu « { »
// ---------------------------------------------------------------------------

/** Les mots du menu : l'index, chacun de ses onglets s'il en a plusieurs, les types de modificateurs. */
function entriesOf(source: Source, rows: ReferenceIndex["rows"]): ReferenceEntry[] {
  const entries: ReferenceEntry[] = []
  const base = entryLabelFromItemLabel(source.itemLabel) || entryLabelFromItemLabel(source.tabs.length === 1 ? source.tabs[0]?.itemLabel : "") || source.title
  entries.push({ index: source.key, label: base, hint: source.title })
  if (source.tabs.length > 1 && !source.entity) {
    for (const tab of source.tabs) entries.push({ index: source.key, label: entryLabelFromItemLabel(tab.itemLabel) || tab.name, hint: `${source.title} · ${tab.name}`, tab: tab.name })
  }
  // « Attribut », « Matériau », « Rune » : les lignes d'« Armes - Modificateurs » de ce type.
  if (source.key === "weapon-modifiers") {
    const types = new Map<string, string>()
    for (const row of rows) for (const tag of row.tags ?? []) if (!types.has(foldName(tag))) types.set(foldName(tag), tag)
    for (const tag of types.values()) entries.push({ index: source.key, label: tag, hint: source.title, tag })
  }
  return entries
}

let catalogCache: { at: number; promise: Promise<ReferenceCatalog> } | null = null

async function buildCatalog(): Promise<ReferenceCatalog> {
  const sources = (await Promise.all((await sourceKeys()).map((key) => loadSource(key)))).filter((source): source is Source => Boolean(source))
  const indexes: ReferenceIndex[] = []
  const entries: ReferenceEntry[] = []
  const used = new Set<string>()
  for (const source of sources) {
    const rows = source.tables.filter((table) => !table.unlisted).flatMap((table) => {
      const type = source.key === "weapon-modifiers" ? columnAt(table.headers, ["Type"]) : -1
      return table.rows.map((row) => ({ id: row.id, name: row.name, tab: table.tab, ...(type >= 0 && row.values[type]?.trim() ? { tags: row.values[type].split(/\s*[,;|]\s*/).filter(Boolean) } : {}) }))
    })
    indexes.push({ key: source.key, title: source.title, tabs: source.tables.filter((table) => !table.unlisted).map((table) => ({ name: table.tab, columns: table.columns })), rows })
    // Deux index ne se disputent pas un mot : le premier le garde.
    for (const entry of entriesOf(source, rows)) {
      const folded = foldName(entry.label)
      if (!folded || used.has(folded)) continue
      used.add(folded)
      entries.push(entry)
    }
  }
  return { indexes, entries }
}

/** Le catalogue, gardé 20 secondes : une seule lecture pour tous les éditeurs ouverts. */
export function referenceCatalog(options: { fresh?: boolean } = {}) {
  if (!options.fresh && catalogCache && Date.now() - catalogCache.at < 20_000) return catalogCache.promise
  const promise = buildCatalog()
  catalogCache = { at: Date.now(), promise }
  promise.catch(() => { if (catalogCache?.promise === promise) catalogCache = null })
  return promise
}

// ---------------------------------------------------------------------------
// La résolution
// ---------------------------------------------------------------------------

/**
 * Résout des références. `byName` : une ligne introuvable par son identifiant est cherchée
 * par son nom (MJ et admins seulement ; un joueur ne voit que les lignes citées).
 * `player` : les colonnes privées d'une entité (notes MJ d'un PNJ…) restent introuvables.
 */
export async function resolveReferences(requests: ReferenceRequest[], options: { byName: boolean; player?: boolean }) {
  const results: Record<string, ResolvedReference | null> = {}
  const keys = [...new Set(requests.map((request) => request.index))]
  // Les colonnes citées de chaque index (la feuille des personnages n'est lue que pour elles).
  const cited = (key: string) => [...new Set(requests.filter((request) => request.index === key && request.column).map((request) => request.column!))]
  const sources = new Map(await Promise.all(keys.map(async (key) => [key, await loadSource(key, { cited: cited(key) })] as const)))
  for (const request of requests) {
    const source = sources.get(request.index)
    const key = referenceKey(request)
    results[key] = null
    if (!source) continue
    let found: { table: SourceTable; row: SourceRow } | null = null
    for (const table of source.tables) {
      const row = table.rows.find((candidate) => candidate.id === request.id)
      if (row) { found = { table, row }; break }
    }
    if (!found && options.byName && request.name?.trim()) {
      for (const table of source.tables) {
        const row = table.rows.find((candidate) => foldName(candidate.name) === foldName(request.name!))
        if (row) { found = { table, row }; break }
      }
    }
    if (!found) continue
    const { table, row } = found
    const base: ResolvedReference = { index: source.key, id: row.id, tab: table.tab, name: row.name }
    if (request.column && options.player && source.hiddenForPlayers?.(request.column)) continue
    if (request.column) {
      const cell = citedCell(table, row, request.column)
      results[key] = cell ? { ...base, ...cell } : null
    } else {
      results[key] = { ...base, ...rowDetails(table, row, { object: source.key === OBJECT_REFERENCE_INDEX }) }
    }
  }
  return results
}
