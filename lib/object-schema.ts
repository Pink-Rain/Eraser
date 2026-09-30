/**
 * « Modifier » pour l'Index des objets : chaque classeur du dossier « Objets » a son
 * propre onglet « Eraser · colonnes ». Les colonnes que l'inventaire, les boutiques et
 * la table lisent par leur nom sont verrouillées (on peut changer leur affichage).
 */
import {
  clearObjectIndexTableCache,
  clearSpreadsheetReadCache,
  columnName,
  ensureSheetColumnCount,
  googleSheetsJson,
  listObjectIndexTables,
  readRange,
  sheetTabRange,
  spreadsheetTabs,
  updateRange,
  type ObjectIndexTable,
} from "@/lib/google-sheets"
import { foldName, isIdHeader, objectColumnSpec, type IndexColumnSpec } from "@/lib/index-columns"
import { findEntry, readSchema, upsertEntry, writeSchema } from "@/lib/index-schema"
import { headerProblem, objectColumnPolicy, tabProblem, type IndexEditorModel, type SchemaEntry, type SchemaOperation } from "@/lib/index-schema-shared"
import type { IndexTrashItem } from "@/lib/world-indexes"
import { worldRelationTargets } from "@/lib/world-indexes"

function trashed(entry: SchemaEntry | undefined) {
  return Boolean(entry && (entry.deletedAt || entry.state === "supprimé"))
}

/** Le type effectif d'une colonne d'objets : celui du schéma, sinon reconnu par son nom. */
export function effectiveObjectSpec(header: string, headers: string[], schema: SchemaEntry[], tab: string): IndexColumnSpec {
  const base = objectColumnSpec(header, headers)
  const entry = findEntry(schema, tab, header)
  return entry?.spec ? { ...base, ...entry.spec } : base
}

/** Les schémas des classeurs d'objets, pour l'affichage de l'index. */
export async function objectSchemas(tables: ObjectIndexTable[]) {
  const files = [...new Set(tables.map((table) => table.fileId))]
  const entries = await Promise.all(files.map(async (fileId) => [fileId, await readSchema(fileId).catch(() => [] as SchemaEntry[])] as const))
  return Object.fromEntries(entries)
}

export async function objectEditorModel(fileId: string): Promise<IndexEditorModel> {
  const tables = (await listObjectIndexTables()).filter((table) => table.fileId === fileId)
  if (!tables.length) throw new Error("OBJECT_INDEX_NOT_FOUND")
  const schema = await readSchema(fileId)
  return {
    family: "objects",
    key: fileId,
    title: tables[0].fileName,
    addTabs: true,
    relationTargets: await worldRelationTargets(),
    tabs: tables.map((table) => ({
      name: table.tabName,
      columns: table.headers.filter((header) => header.trim() && !trashed(findEntry(schema, table.tabName, header))).map((header) => ({
        header,
        spec: effectiveObjectSpec(header, table.headers, schema, table.tabName),
        policy: objectColumnPolicy(header),
      })),
      remove: tables.length > 1,
      removeReason: tables.length > 1 ? undefined : "C’est le seul tableau de ce classeur : il doit en garder au moins un.",
      addColumns: true,
    })),
  }
}

async function appendHeader(fileId: string, tabName: string, header: string) {
  clearSpreadsheetReadCache(fileId)
  const [firstRow = []] = await readRange(fileId, sheetTabRange(tabName, "A1:AZ1"))
  let used = firstRow.length
  while (used > 0 && !firstRow[used - 1]?.trim()) used -= 1
  if (firstRow.slice(0, used).some((existing) => foldName(existing) === foldName(header))) return
  await ensureSheetColumnCount(fileId, tabName, used + 1)
  const cell = `${columnName(used + 1)}1`
  await updateRange(fileId, sheetTabRange(tabName, `${cell}:${cell}`), [[header]], { valueInputOption: "RAW" })
}

function locked(allowed: boolean, reasons: string[]) {
  if (!allowed) throw new Error(`INDEX_SCHEMA_LOCKED:${reasons.join(" ")}`)
}

export async function applyObjectSchemaOperations(fileId: string, operations: SchemaOperation[]) {
  const tables = (await listObjectIndexTables()).filter((table) => table.fileId === fileId)
  if (!tables.length) throw new Error("OBJECT_INDEX_NOT_FOUND")
  const schema = [...await readSchema(fileId, { refresh: true })]
  const now = new Date().toISOString()
  for (const operation of operations) {
    if (operation.op === "add-tab") {
      const problem = tabProblem(operation.name, (await spreadsheetTabs(fileId)).map((tab) => tab.title))
      if (problem) throw new Error(`INDEX_SCHEMA_INVALID:${problem}`)
      const name = operation.name.replace(/\s+/g, " ").trim()
      const headers = ["ID", "Nom", ...operation.columns.map((column) => column.header.trim()).filter((header) => !["nom", "id"].includes(foldName(header)))]
      await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: name, gridProperties: { rowCount: 1000, columnCount: Math.max(26, headers.length), frozenRowCount: 1 } } } }] }) })
      await updateRange(fileId, sheetTabRange(name, `A1:${columnName(headers.length)}1`), [headers], { valueInputOption: "RAW" })
      upsertEntry(schema, name, "", { state: "ajouté", deletedAt: "" })
      for (const column of operation.columns) if (!["nom", "id"].includes(foldName(column.header))) upsertEntry(schema, name, column.header.trim(), { spec: column.spec, state: "ajouté", deletedAt: "" })
      continue
    }
    const table = tables.find((candidate) => candidate.tabName === operation.tab)
    if (!table) throw new Error("OBJECT_INDEX_NOT_FOUND")
    if (operation.op === "remove-tab") {
      locked(tables.length > 1, ["C’est le seul tableau de ce classeur : il doit en garder au moins un."])
      upsertEntry(schema, table.tabName, "", { deletedAt: now })
      continue
    }
    if (operation.op === "add-column") {
      const problem = headerProblem(operation.header, table.headers)
      if (problem) throw new Error(`INDEX_SCHEMA_INVALID:${problem}`)
      const header = operation.header.replace(/\s+/g, " ").trim()
      await appendHeader(fileId, table.tabName, header)
      upsertEntry(schema, table.tabName, header, { spec: operation.spec, state: "ajouté", deletedAt: "" })
      continue
    }
    const column = table.headers.findIndex((header) => foldName(header) === foldName(operation.header))
    if (column < 0) throw new Error("OBJECT_INDEX_COLUMN_NOT_FOUND")
    const policy = objectColumnPolicy(operation.header)
    if (operation.op === "rename") {
      locked(policy.rename, policy.reasons)
      const problem = headerProblem(operation.to, table.headers, operation.header)
      if (problem) throw new Error(`INDEX_SCHEMA_INVALID:${problem}`)
      const to = operation.to.replace(/\s+/g, " ").trim()
      const cell = `${columnName(column + 1)}1`
      await updateRange(fileId, sheetTabRange(table.tabName, `${cell}:${cell}`), [[to]], { valueInputOption: "RAW" })
      const entry = findEntry(schema, table.tabName, operation.header)
      if (entry) entry.column = to
      continue
    }
    if (operation.op === "spec") {
      const current = effectiveObjectSpec(operation.header, table.headers, schema, table.tabName)
      const onlyDisplay = current.kind === operation.spec.kind && JSON.stringify({ ...current, hidden: undefined, description: undefined }) === JSON.stringify({ ...operation.spec, hidden: undefined, description: undefined })
      if (!onlyDisplay) locked(policy.type, policy.reasons)
      // Une colonne d'objets reste du texte dans Sheets : les relations entre index n'y sont pas proposées.
      if (["linked", "lookup", "rollup"].includes(operation.spec.kind)) throw new Error("INDEX_SCHEMA_INVALID:Les relations entre index ne sont pas encore proposées pour les objets.")
      upsertEntry(schema, table.tabName, operation.header, { spec: operation.spec })
      continue
    }
    if (operation.op === "remove-column") {
      locked(policy.remove && !isIdHeader(operation.header), policy.reasons)
      upsertEntry(schema, table.tabName, operation.header, { deletedAt: now })
    }
  }
  await writeSchema(fileId, schema)
  clearObjectIndexTableCache()
  return listObjectIndexTables()
}

export async function listObjectIndexTrash(): Promise<IndexTrashItem[]> {
  const tables = await listObjectIndexTables().catch(() => [] as ObjectIndexTable[])
  const files = new Map(tables.map((table) => [table.fileId, table.fileName]))
  const items = await Promise.all([...files].map(async ([fileId, fileName]) => (await readSchema(fileId).catch(() => [] as SchemaEntry[]))
    .filter((entry) => entry.deletedAt && entry.state !== "supprimé")
    .map((entry): IndexTrashItem => ({ family: "objects", key: fileId, title: `Objets · ${fileName}`, tab: entry.tab, column: entry.column, deletedAt: entry.deletedAt, filled: 0 }))))
  return items.flat()
}

export async function restoreObjectIndexTrash(fileId: string, tab: string, column: string) {
  const schema = [...await readSchema(fileId, { refresh: true })]
  const entry = findEntry(schema, tab, column)
  if (!entry) throw new Error("INDEX_TRASH_NOT_FOUND")
  entry.deletedAt = ""
  await writeSchema(fileId, schema)
  clearObjectIndexTableCache()
}

export async function purgeObjectIndexTrash(fileId: string, tab: string, column: string) {
  const schema = [...await readSchema(fileId, { refresh: true })]
  const entry = findEntry(schema, tab, column)
  if (!entry?.deletedAt) throw new Error("INDEX_TRASH_NOT_FOUND")
  const sheetId = (await spreadsheetTabs(fileId)).find((candidate) => candidate.title === tab)?.sheetId
  if (sheetId !== undefined) {
    if (!column) await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteSheet: { sheetId } }] }) })
    else {
      clearSpreadsheetReadCache(fileId)
      const [firstRow = []] = await readRange(fileId, sheetTabRange(tab, "A1:AZ1"))
      const index = firstRow.findIndex((header) => foldName(header) === foldName(column))
      if (index >= 0) await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 } } }] }) })
    }
  }
  await writeSchema(fileId, schema.filter((candidate) => candidate !== entry && !(column === "" && candidate.tab === tab)))
  clearSpreadsheetReadCache(fileId)
  clearObjectIndexTableCache()
}
