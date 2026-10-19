/**
 * L'Index des items servi par l'API du moteur des index (`/api/resources/world-indexes`, clé
 * « objects ») : ses données vues comme un index du moteur, et les écritures du moteur
 * traduites pour les fonctions des items. Une ligne y est toujours retrouvée par son ID (faute
 * d'ID, par son nom à sa place), une case par son en-tête : comme l'inventaire, les magasins et
 * l'ancienne page des items. Rien d'autre ne change dans Google Sheets.
 */
import {
  addObjectIndexRow,
  addObjectIndexRowWithValues,
  deleteObjectIndexRows,
  duplicateObjectIndexRows,
  insertObjectIndexRow,
  listObjectIndexTables,
  listObjectIndexTablesForDisplay,
  moveObjectIndexRow,
  normalizeObjectIndexChoices,
  refreshObjectIndexTables,
  updateObjectIndexCell,
  type ObjectIndexTable,
} from "@/lib/google-sheets"
import type { IndexEditorModel, SchemaOperation } from "@/lib/index-schema-shared"
import { objectEngineCellWrite, objectEngineColumnSpec, objectIndexEngineData, OBJECTS_ENGINE_KEY, type ObjectEngineData } from "@/lib/object-index-engine"
import type { ObjectIndexRowRef } from "@/lib/object-index-refs"
import { applyObjectSchemaOperations, objectEditorModel, objectSchemas } from "@/lib/object-schema"
import type { WorldIndexData } from "@/lib/world-indexes"

export { OBJECTS_ENGINE_KEY }

/** La clé du moteur est-elle celle de l'Index des items ? */
export function isObjectsEngineKey(value: unknown): value is typeof OBJECTS_ENGINE_KEY {
  return value === OBJECTS_ENGINE_KEY
}

/**
 * Les items tels que la page du moteur les reçoit. Leur clé (« objects ») n'est pas celle d'un
 * index du monde : seul le type de la définition diffère, le reste a la même forme.
 */
async function engineDataOf(tables: ObjectIndexTable[]): Promise<WorldIndexData> {
  const data: ObjectEngineData = objectIndexEngineData(tables, await objectSchemas(tables).catch(() => ({})))
  return data as unknown as WorldIndexData
}

/** Les items pour la page du moteur ; `refresh` : relus dans Google Sheets (« Actualiser »). */
export async function objectEngineData(options: { refresh?: boolean } = {}) {
  return engineDataOf(options.refresh ? await refreshObjectIndexTables() : await listObjectIndexTablesForDisplay())
}

/** Les items juste après une écriture : la copie gardée, que l'écriture a déjà mise à jour. */
async function freshEngineData() {
  return engineDataOf(await listObjectIndexTables())
}

/** Un onglet du moteur : son classeur, son onglet dans Google Sheets, et le tableau tel qu'il est gardé. */
async function originOf(tabName: string) {
  const tables = await listObjectIndexTables()
  const data = objectIndexEngineData(tables)
  const origin = data.origins[tabName]
  const table = origin ? tables.find((candidate) => candidate.fileId === origin.fileId && candidate.tabName === origin.tabName) : undefined
  if (!origin || !table) throw new Error("OBJECT_INDEX_CHANGED")
  return { origin, table, data }
}

/** Une ligne telle que le moteur la désigne (numéro, ID, nom). */
type EngineRow = { rowNumber: number; id?: string; name?: string }
const rowRef = (row: EngineRow): ObjectIndexRowRef => ({ id: (row.id ?? "").trim(), rowNumber: row.rowNumber, name: row.name?.replace(/<[^>]+>/g, "").trim() || undefined })

export type ObjectEngineWrite = {
  action?: string
  tabName: string
  row: EngineRow | null
  rows: EngineRow[]
  column?: number
  header?: string
  html?: string
  values?: unknown[]
  headers?: string[]
  toTab?: string
  count?: number
}

/**
 * Une écriture du moteur sur les items. Rend les items relus (sauf pour une case : la frappe
 * reste fluide, comme dans les autres index), et le nombre de cases corrigées pour
 * « Corriger N fautes ».
 */
export async function objectEngineWrite(write: ObjectEngineWrite): Promise<{ data?: WorldIndexData; corrected?: number }> {
  if (write.action === "normalize-choices") {
    const corrected = await normalizeObjectIndexChoices((table, header) => objectEngineColumnSpec(table, header))
    return { corrected, data: await freshEngineData() }
  }
  const { origin, table, data } = await originOf(write.tabName)
  if (write.action === "update-cell" && write.row && typeof write.header === "string" && typeof write.html === "string") {
    // La ligne par son ID, la case par son en-tête et son rang parmi les en-têtes identiques.
    const cell = objectEngineCellWrite(data, { tabName: write.tabName, rowNumber: write.row.rowNumber, rowId: write.row.id, header: write.header, html: write.html, column: write.column })
    await updateObjectIndexCell(cell.fileId, cell.tabName, { ...cell.row, header: cell.header, occurrence: cell.occurrence }, cell.html)
    return {}
  }
  if (write.action === "add" && Array.isArray(write.values)) {
    const headers = write.headers ?? table.headers
    const pairs = headers.map((header, index): [string, string] => [header, String(write.values?.[index] ?? "")])
    if (pairs.some(([header, value]) => header.trim() && value.trim())) await addObjectIndexRowWithValues(origin.fileId, origin.tabName, pairs.filter(([header]) => header.trim()))
    else await addObjectIndexRow(origin.fileId, origin.tabName)
  } else if (write.action === "insert" && write.row) {
    await insertObjectIndexRow(origin.fileId, origin.tabName, rowRef(write.row), typeof write.count === "number" ? write.count : 1)
  } else if (write.action === "duplicate" && write.rows.length) {
    await duplicateObjectIndexRows(origin.fileId, origin.tabName, write.rows.map(rowRef))
  } else if (write.action === "delete" && write.rows.length) {
    await deleteObjectIndexRows(origin.fileId, origin.tabName, write.rows.map(rowRef))
  } else if (write.action === "move" && write.rows.length && typeof write.toTab === "string") {
    // Vers un autre onglet : l'item garde son ID, les colonnes qui manquent à l'arrivée y sont ajoutées.
    const target = (await originOf(write.toTab)).origin
    // Du bas vers le haut : retirer une ligne ne décale pas celles qui restent à déplacer.
    for (const row of [...write.rows].sort((left, right) => right.rowNumber - left.rowNumber)) await moveObjectIndexRow(origin.fileId, origin.tabName, rowRef(row), target.fileId, target.tabName)
  } else throw new Error("INVALID_WORLD_INDEX_ACTION")
  return { data: await freshEngineData() }
}

/** Le seul classeur des items (après le regroupement) : « Modifier » s'applique à lui. */
async function objectsFileId() {
  const files = [...new Set((await listObjectIndexTables()).map((table) => table.fileId))]
  if (!files.length) throw new Error("OBJECT_INDEX_NOT_FOUND")
  if (files.length > 1) throw new Error("INDEX_SCHEMA_INVALID:Les items sont encore répartis dans plusieurs classeurs : regroupe-les d’abord en un seul « Index des objets ».")
  return files[0]
}

/** Ce que « Modifier » montre des items, pour la page du moteur. */
export async function objectEngineEditorModel(): Promise<IndexEditorModel> {
  return { ...await objectEditorModel(await objectsFileId()), key: OBJECTS_ENGINE_KEY }
}

/** Les changements de « Modifier » appliqués aux items ; rend les items relus. */
export async function applyObjectEngineSchema(operations: SchemaOperation[]) {
  await applyObjectSchemaOperations(await objectsFileId(), operations)
  return freshEngineData()
}
