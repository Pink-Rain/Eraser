/**
 * Les réglages partagés des index : onglets-fenêtres et presets d'onglets. Ils vivent
 * dans un classeur du Drive, « Eraser · Réglages des index », lisible et modifiable dans
 * Sheets, partagé par toutes les installations.
 *
 * Règles du projet : le classeur n'est jamais recréé s'il existe déjà sous ce nom (il
 * est relié), et il n'est créé qu'au premier enregistrement, jamais en lisant. Supprimer
 * un réglage le marque (« Supprimé le ») au lieu d'effacer sa ligne : c'est réversible.
 * Les colonnes sont retrouvées par leur nom : les déplacer dans Sheets ne change rien.
 */
import { createGoogleSpreadsheet, findGoogleSpreadsheetByName } from "@/lib/google-drive"
import { appendRows, canonicalRow, canonicalRows, canonicalWrites, clearSpreadsheetReadCache, columnName, ensureNamedColumns, googleSheetsJson, namedAppendRange, readNamedSheet, sheetTabRange, spreadsheetTabs, updateRange, updateRanges } from "@/lib/google-sheets"
import { sheetColumns, type SheetCell, type SheetColumns } from "@/lib/sheet-columns"
import { newIndexId } from "@/lib/index-columns"
import { parsePresetColumns, presetColumnsOf, type ColumnPreset, type PresetColumn } from "@/lib/index-presets"
import { parseViewConditions, type IndexView, type ViewCondition } from "@/lib/index-views"

const SETTINGS_NAME = "Eraser · Réglages des index"
const VIEWS_TAB = "Onglets-fenêtres"
const PRESETS_TAB = "Presets"
const VIEW_HEADERS = ["ID", "Index", "Nom", "Source", "Conditions (JSON)", "Toutes ou une", "Ordre", "Modifié le", "Supprimé le"]
const PRESET_HEADERS = ["ID", "Nom", "Description", "Colonnes (JSON)", "Modifié le", "Supprimé le"]

let workbookCache: { expiresAt: number; id: string | null } | null = null

async function settingsWorkbook(create: boolean) {
  if (workbookCache && workbookCache.expiresAt > Date.now() && (workbookCache.id || !create)) return workbookCache.id
  const found = await findGoogleSpreadsheetByName(SETTINGS_NAME)
  let id = found?.id ?? null
  if (!id && create) id = (await createGoogleSpreadsheet(SETTINGS_NAME)).id
  if (id && create) await ensureTabs(id)
  workbookCache = { expiresAt: Date.now() + 60_000, id }
  return id
}

/** Les deux onglets et leurs en-têtes ; le premier onglet vide d'un classeur neuf est réutilisé. */
async function ensureTabs(id: string) {
  const tabs = await spreadsheetTabs(id)
  for (const [name, headers] of [[VIEWS_TAB, VIEW_HEADERS], [PRESETS_TAB, PRESET_HEADERS]] as const) {
    if (tabs.some((tab) => tab.title === name)) continue
    const blank = tabs.find((tab) => /^(Feuille|Sheet)\s*1$/i.test(tab.title))
    if (blank?.sheetId !== undefined) {
      await googleSheetsJson(`spreadsheets/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId: blank.sheetId, title: name, gridProperties: { frozenRowCount: 1 } }, fields: "title,gridProperties.frozenRowCount" } }] }) })
      blank.title = name
    } else {
      await googleSheetsJson(`spreadsheets/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: name, gridProperties: { rowCount: 500, columnCount: headers.length, frozenRowCount: 1 } } } }] }) })
    }
    await updateRange(id, sheetTabRange(name, `A1:${columnName(headers.length)}1`), [[...headers]], { valueInputOption: "RAW" })
  }
  clearSpreadsheetReadCache(id)
}

/** Les lignes d'un onglet, chacune remise dans l'ordre prévu (`headers`), et ses colonnes. */
async function rowsOf(tab: string, headers: readonly string[], create = false): Promise<{ id: string | null; columns: SheetColumns; rows: string[][] }> {
  const id = await settingsWorkbook(create)
  const none = { columns: sheetColumns([], headers), rows: [] as string[][] }
  if (!id) return { id: null, ...none }
  const read = await readNamedSheet(id, tab, headers).catch(() => null)
  if (!read) return { id, ...none }
  const columns = create ? await ensureNamedColumns(id, tab, read.columns) : read.columns
  return { id, columns, rows: read.rows.map((row) => canonicalRow(columns, row)) }
}

/** Une ligne décrite dans l'ordre prévu, écrite à sa place ou ajoutée à la fin. */
async function writeRow(id: string, tab: string, columns: SheetColumns, existing: number, values: SheetCell[]) {
  if (existing >= 0) await updateRanges(id, canonicalWrites(tab, columns, `A${existing + 2}:${columnName(columns.expected.length)}${existing + 2}`, [values]), { valueInputOption: "RAW" })
  else await appendRows(id, namedAppendRange(tab, columns), canonicalRows(columns, [values]), { valueInputOption: "RAW" })
}

// ---------- Onglets-fenêtres ----------

function viewFromRow(row: string[]): IndexView | null {
  if (!row[0]?.trim() || !row[1]?.trim() || !row[2]?.trim() || row[8]?.trim()) return null
  return {
    id: row[0].trim(),
    index: row[1].trim(),
    name: row[2].trim(),
    source: row[3]?.trim() || "*",
    conditions: parseViewConditions(row[4] ?? "[]"),
    match: row[5]?.trim() === "une" ? "une" : "toutes",
    position: Number.parseInt(row[6] ?? "", 10) || 0,
  }
}

export async function listIndexViews(index: string) {
  const { rows } = await rowsOf(VIEWS_TAB, VIEW_HEADERS)
  return rows.flatMap((row) => { const view = viewFromRow(row); return view && view.index === index ? [view] : [] })
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, "fr"))
}

export async function saveIndexView(input: { id?: string; index: string; name: string; source: string; match: "toutes" | "une"; conditions: ViewCondition[] }) {
  const name = input.name.replace(/\s+/g, " ").trim()
  if (!name || name.length > 60) throw new Error("INDEX_VIEW_NAME_INVALID")
  if (!input.index.trim()) throw new Error("INDEX_VIEW_INVALID")
  const conditions = parseViewConditions(JSON.stringify(input.conditions))
  const { id, columns, rows } = await rowsOf(VIEWS_TAB, VIEW_HEADERS, true)
  if (!id) throw new Error("INDEX_SETTINGS_UNAVAILABLE")
  const now = new Date().toISOString()
  const existing = input.id ? rows.findIndex((row) => row[0]?.trim() === input.id && !row[8]?.trim()) : -1
  const position = existing >= 0 ? rows[existing][6] ?? "0" : String(rows.filter((row) => row[1]?.trim() === input.index && !row[8]?.trim()).length)
  const viewId = existing >= 0 ? input.id! : newIndexId("VUE")
  const values = [viewId, input.index.trim(), name, input.source.trim() || "*", JSON.stringify(conditions), input.match === "une" ? "une" : "toutes", position, now, ""]
  await writeRow(id, VIEWS_TAB, columns, existing, values)
  clearSpreadsheetReadCache(id)
  return viewId
}

export async function deleteIndexView(viewId: string) {
  const { id, columns, rows } = await rowsOf(VIEWS_TAB, VIEW_HEADERS)
  const index = rows.findIndex((row) => row[0]?.trim() === viewId && !row[8]?.trim())
  if (!id || index < 0) throw new Error("INDEX_VIEW_NOT_FOUND")
  await updateRanges(id, canonicalWrites(VIEWS_TAB, columns, `I${index + 2}:I${index + 2}`, [[new Date().toISOString()]]), { valueInputOption: "RAW" })
  clearSpreadsheetReadCache(id)
}

/**
 * Change la source des onglets-fenêtres d'un index (`ancienne → nouvelle`) : le
 * regroupement des index d'objets, et son annulation, y renvoient leurs tableaux.
 * Rien n'est créé s'il n'y a pas encore de classeur de réglages.
 */
export async function remapIndexViewSources(index: string, mapping: Map<string, string>) {
  const { id, columns, rows } = await rowsOf(VIEWS_TAB, VIEW_HEADERS)
  if (!id) return 0
  const writes = rows.flatMap((row, position) => row[1]?.trim() === index && mapping.has(row[3]?.trim() ?? "")
    ? [{ position, source: mapping.get(row[3].trim()) as string }]
    : [])
  if (writes.length) await updateRanges(id, writes.flatMap((write) => canonicalWrites(VIEWS_TAB, columns, `D${write.position + 2}:D${write.position + 2}`, [[write.source]])), { valueInputOption: "RAW" })
  if (writes.length) clearSpreadsheetReadCache(id)
  return writes.length
}

// ---------- Presets d'onglets ----------

function presetFromRow(row: string[]): ColumnPreset | null {
  if (!row[0]?.trim() || !row[1]?.trim() || row[5]?.trim()) return null
  return { id: row[0].trim(), name: row[1].trim(), description: row[2]?.trim() ?? "", columns: parsePresetColumns(row[3] ?? "[]"), updatedAt: row[4]?.trim() ?? "" }
}

export async function listColumnPresets() {
  const { rows } = await rowsOf(PRESETS_TAB, PRESET_HEADERS)
  return rows.flatMap((row) => { const preset = presetFromRow(row); return preset ? [preset] : [] }).sort((left, right) => left.name.localeCompare(right.name, "fr"))
}

export async function saveColumnPreset(input: { id?: string; name: string; description?: string; columns: PresetColumn[] }) {
  const name = input.name.replace(/\s+/g, " ").trim()
  if (!name || name.length > 60) throw new Error("INDEX_PRESET_NAME_INVALID")
  const columns = presetColumnsOf(input.columns)
  if (!columns.length) throw new Error("INDEX_PRESET_EMPTY")
  const { id, columns: tabColumns, rows } = await rowsOf(PRESETS_TAB, PRESET_HEADERS, true)
  if (!id) throw new Error("INDEX_SETTINGS_UNAVAILABLE")
  const existing = input.id ? rows.findIndex((row) => row[0]?.trim() === input.id && !row[5]?.trim()) : -1
  const presetId = existing >= 0 ? input.id! : newIndexId("PRE")
  const values = [presetId, name, (input.description ?? "").trim().slice(0, 200), JSON.stringify(columns), new Date().toISOString(), ""]
  await writeRow(id, PRESETS_TAB, tabColumns, existing, values)
  clearSpreadsheetReadCache(id)
  return presetId
}

export async function deleteColumnPreset(presetId: string) {
  const { id, columns, rows } = await rowsOf(PRESETS_TAB, PRESET_HEADERS)
  const index = rows.findIndex((row) => row[0]?.trim() === presetId && !row[5]?.trim())
  if (!id || index < 0) throw new Error("INDEX_PRESET_NOT_FOUND")
  await updateRanges(id, canonicalWrites(PRESETS_TAB, columns, `F${index + 2}:F${index + 2}`, [[new Date().toISOString()]]), { valueInputOption: "RAW" })
  clearSpreadsheetReadCache(id)
}
