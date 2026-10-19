/**
 * Les colonnes de l'Index des items : leur type effectif et leur corbeille (Administration ›
 * Corbeille). Le classeur des items a son onglet « Eraser · colonnes » ; « Modifier » passe
 * par le moteur des index, comme pour tout index (lib/world-indexes.ts).
 */
import {
  clearSpreadsheetReadCache,
  googleSheetsJson,
  readRangeFreshWithOffset,
  sheetTabRange,
  spreadsheetTabs,
  type ObjectIndexTable,
} from "@/lib/google-sheets"
import { foldName, objectColumnSpec, type IndexColumnSpec } from "@/lib/index-columns"
import { findEntry, readSchema, writeSchema } from "@/lib/index-schema"
import type { SchemaEntry } from "@/lib/index-schema-shared"
import { objectCatalog } from "@/lib/object-catalog"
import type { IndexTrashItem } from "@/lib/world-indexes"

/** Le type effectif d'une colonne d'objets : celui du schéma, sinon reconnu par son nom. */
export function effectiveObjectSpec(header: string, headers: string[], schema: SchemaEntry[], tab: string): IndexColumnSpec {
  const base = objectColumnSpec(header, headers)
  const entry = findEntry(schema, tab, header)
  return entry?.spec ? { ...base, ...entry.spec } : base
}

/**
 * La ligne 1 d'un onglet, relue sans cache (POST) : c'est elle qui dit où écrire. Une
 * lecture gardée en mémoire, ou servie deux fois pendant la même requête, faisait renommer,
 * déplacer ou supprimer une autre colonne quand l'ordre avait changé entre-temps.
 */
async function freshFirstRow(fileId: string, tabName: string) {
  const read = await readRangeFreshWithOffset(fileId, sheetTabRange(tabName, "A1:AZ1"))
  return read.startRow === 1 ? (read.rows[0] ?? []).map((value) => String(value ?? "")) : []
}

export async function listObjectIndexTrash(): Promise<IndexTrashItem[]> {
  const tables = await objectCatalog().catch(() => [] as ObjectIndexTable[])
  const files = new Map(tables.map((table) => [table.fileId, table.fileName]))
  const items = await Promise.all([...files].map(async ([fileId, fileName]) => (await readSchema(fileId).catch(() => [] as SchemaEntry[]))
    .filter((entry) => entry.deletedAt && entry.state !== "supprimé")
    .map((entry): IndexTrashItem => ({ family: "objects", key: fileId, title: `Items · ${fileName}`, tab: entry.tab, column: entry.column, deletedAt: entry.deletedAt, filled: 0 }))))
  return items.flat()
}

export async function restoreObjectIndexTrash(fileId: string, tab: string, column: string) {
  const schema = [...await readSchema(fileId, { refresh: true })]
  const entry = findEntry(schema, tab, column)
  if (!entry) throw new Error("INDEX_TRASH_NOT_FOUND")
  entry.deletedAt = ""
  await writeSchema(fileId, schema)
}

export async function purgeObjectIndexTrash(fileId: string, tab: string, column: string) {
  const schema = [...await readSchema(fileId, { refresh: true })]
  const entry = findEntry(schema, tab, column)
  if (!entry?.deletedAt) throw new Error("INDEX_TRASH_NOT_FOUND")
  const sheetId = (await spreadsheetTabs(fileId)).find((candidate) => candidate.title === tab)?.sheetId
  if (sheetId !== undefined) {
    if (!column) await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteSheet: { sheetId } }] }) })
    else {
      const firstRow = await freshFirstRow(fileId, tab)
      const index = firstRow.findIndex((header) => foldName(header) === foldName(column))
      if (index >= 0) await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 } } }] }) })
    }
  }
  await writeSchema(fileId, schema.filter((candidate) => candidate !== entry && !(column === "" && candidate.tab === tab)))
  clearSpreadsheetReadCache(fileId)
}
