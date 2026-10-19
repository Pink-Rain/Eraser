/**
 * L'Index des items dans le moteur commun des index : l'adaptateur présente les tableaux du
 * dossier « Objets » comme les données d'un index du moteur (onglets, colonnes et leur type,
 * lignes), sans rien lire de plus dans Google ni rien écrire. La page des items est celle du
 * moteur (WorldIndexManager, clé « objects ») ; le serveur traduit ses écritures pour les
 * fonctions des items (lib/object-index-engine-server.ts).
 *
 * Chaque onglet du moteur garde son fichier et son onglet d'origine (`origins`) : les
 * écritures retrouvent la ligne par son ID, comme l'inventaire et les magasins.
 * Règles pures : la page, le serveur et les tests s'en servent.
 */
import type { ObjectIndexTable } from "@/lib/google-sheets"
import { foldName, objectColumnSpec, type IndexColumnSpec } from "@/lib/index-columns"
import { headerOccurrence, objectIndexRowRef } from "@/lib/object-index-refs"
import { findEntry, isTrashedEntry, type SchemaEntry } from "@/lib/index-schema-shared"
import type { WorldIndexTabDefinition } from "@/lib/world-index-definitions"
import type { WorldIndexColumn, WorldIndexTable } from "@/lib/world-indexes"

export const OBJECTS_ENGINE_KEY = "objects"

/** D'où vient un onglet du moteur : le classeur et l'onglet de Google Sheets. */
export type ObjectEngineOrigin = { fileId: string; fileName: string; tabName: string; sheetId: number; webViewLink: string }

export type ObjectEngineData = {
  key: typeof OBJECTS_ENGINE_KEY
  webViewLink: string
  tables: WorldIndexTable[]
  definition: { key: typeof OBJECTS_ENGINE_KEY; sheetName: string; title: string; path: string; itemLabel: string; tabs: WorldIndexTabDefinition[] }
  columns: Record<string, WorldIndexColumn[]>
  links: []
  /** Par nom d'onglet du moteur : son classeur et son onglet d'origine. */
  origins: Record<string, ObjectEngineOrigin>
}

/**
 * Le nom d'un onglet dans le moteur. Après le regroupement, tout est dans un seul classeur :
 * l'onglet garde son nom (« Armes »). Avant, deux classeurs peuvent avoir un onglet du même
 * nom : le nom du classeur le précède alors (« Index Objet › Armes »).
 */
export function objectEngineTabName(table: Pick<ObjectIndexTable, "fileId" | "fileName" | "tabName">, tables: Array<Pick<ObjectIndexTable, "fileId" | "tabName">>) {
  const files = new Set(tables.map((candidate) => candidate.fileId))
  const clash = tables.some((candidate) => candidate.fileId !== table.fileId && foldName(candidate.tabName) === foldName(table.tabName))
  return files.size > 1 && clash ? `${table.fileName} › ${table.tabName}` : table.tabName
}

/** Le type d'une colonne d'items : celui reconnu par son en-tête, avec les réglages de « Modifier ». */
export function objectEngineColumnSpec(table: Pick<ObjectIndexTable, "headers" | "columnSpecs">, header: string): IndexColumnSpec {
  const base = objectColumnSpec(header, table.headers)
  const saved = table.columnSpecs?.[foldName(header)]
  return saved ? { ...base, ...saved } : base
}

/** Les tableaux d'items vus comme un index du moteur. `schemas` (par classeur) : les colonnes à la corbeille n'y sont pas. */
export function objectIndexEngineData(tables: ObjectIndexTable[], schemas: Record<string, SchemaEntry[]> = {}): ObjectEngineData {
  const origins: Record<string, ObjectEngineOrigin> = {}
  const columns: Record<string, WorldIndexColumn[]> = {}
  const engineTables: WorldIndexTable[] = []
  const tabs: WorldIndexTabDefinition[] = []
  for (const table of tables) {
    const name = objectEngineTabName(table, tables)
    // Un même nom deux fois (onglets homonymes d'un même classeur) : impossible dans Sheets, mais
    // on ne fusionne jamais deux tableaux par erreur.
    if (origins[name]) continue
    origins[name] = { fileId: table.fileId, fileName: table.fileName, tabName: table.tabName, sheetId: table.sheetId, webViewLink: table.webViewLink }
    engineTables.push({ tabName: name, sheetId: table.sheetId, headers: [...table.headers], rows: table.rows.map((row) => ({ rowNumber: row.rowNumber, values: [...row.values], html: [...row.html] })) })
    // Une colonne sans en-tête n'a ni type ni réglage : elle reste dans la feuille, hors du moteur.
    columns[name] = table.headers.flatMap((header) => header.trim() && !isTrashedEntry(findEntry(schemas[table.fileId] ?? [], table.tabName, header)) ? [{ header, spec: objectEngineColumnSpec(table, header) }] : [])
    tabs.push({ name, itemLabel: "un item", headers: [...table.headers], widths: table.headers.map(() => 0), idPrefix: "OBJ" })
  }
  return {
    key: OBJECTS_ENGINE_KEY,
    webViewLink: tables[0]?.webViewLink ?? "",
    tables: engineTables,
    definition: { key: OBJECTS_ENGINE_KEY, sheetName: "Index des objets", title: "Items", path: "/ressources/index-des-objets", itemLabel: "un item", tabs },
    columns,
    links: [],
    origins,
  }
}

/**
 * Une écriture du moteur traduite pour l'API des items (étape suivante de la migration) :
 * l'onglet du moteur redevient son classeur et son onglet, la ligne est désignée par son
 * numéro et son ID, la case par son en-tête et son rang parmi les en-têtes identiques.
 */
export function objectEngineCellWrite(data: Pick<ObjectEngineData, "origins" | "tables">, write: { tabName: string; rowNumber: number; rowId?: string; header: string; html: string; column?: number }) {
  const origin = data.origins[write.tabName]
  const table = data.tables.find((candidate) => candidate.tabName === write.tabName)
  if (!origin || !table) throw new Error("OBJECT_INDEX_CHANGED")
  // La colonne que la page a écrite (une « Rareté » peut revenir) ; à défaut, la première de cet en-tête.
  const column = write.column !== undefined && table.headers[write.column]?.trim() === write.header.trim() ? write.column : table.headers.findIndex((header) => header.trim() === write.header.trim())
  if (column < 0) throw new Error("OBJECT_INDEX_CHANGED")
  const row = table.rows.find((candidate) => candidate.rowNumber === write.rowNumber)
  if (!row) throw new Error("OBJECT_INDEX_CHANGED")
  // La même désignation que la page des items : l'ID de la ligne (vérifié au moment d'écrire) et son numéro.
  const ref = objectIndexRowRef(table.headers, row)
  return { action: "update-cell" as const, fileId: origin.fileId, tabName: origin.tabName, row: { ...ref, ...(write.rowId ? { id: write.rowId } : {}) }, header: table.headers[column], occurrence: headerOccurrence(table.headers, column), html: write.html }
}
