import {
  appendRows,
  clearSpreadsheetReadCache,
  columnName,
  configureStructuredSheet,
  deleteGoogleSheetRow,
  ensureJdrSheet,
  googleSheetsJson,
  readFormattedSheet,
  readRange,
  sheetTabRange,
  spreadsheetTabs,
  updateFormattedCell,
  updateRange,
} from "@/lib/google-sheets"
import { htmlToRichText } from "@/lib/google-sheet-rich-text"
import {
  foldName,
  isNameColumn,
  splitNames,
  worldIndexDefinitions,
  worldIndexLinks,
  type WorldIndexKey,
  type WorldIndexLinkEnd,
  type WorldIndexTabDefinition,
} from "@/lib/world-index-definitions"

export type WorldIndexRow = { rowNumber: number; values: string[]; html: string[] }

export type WorldIndexTable = { tabName: string; sheetId: number; headers: string[]; rows: WorldIndexRow[] }

export type WorldIndexData = { key: WorldIndexKey; webViewLink: string; tables: WorldIndexTable[] }

export function isWorldIndexKey(value: unknown): value is WorldIndexKey {
  return typeof value === "string" && Object.hasOwn(worldIndexDefinitions, value)
}

const readyWorkbooks = new Set<string>()

/**
 * Le classeur d'un index, relié ou créé au besoin (jamais en double : ensureJdrSheet
 * cherche d'abord une feuille du même nom dans Drive), avec tous ses onglets.
 */
async function workbook(key: WorldIndexKey) {
  const sheet = await ensureJdrSheet(key)
  if (!sheet) throw new Error("WORLD_INDEX_SHEET_UNAVAILABLE")
  const definition = worldIndexDefinitions[key]
  const readyKey = `${sheet.spreadsheetId}:${key}`
  if (definition.tabs.length > 1 && !readyWorkbooks.has(readyKey)) {
    const existing = await spreadsheetTabs(sheet.spreadsheetId)
    for (const tab of definition.tabs.slice(1)) await ensureExtraTab(sheet.spreadsheetId, key, tab, existing)
    readyWorkbooks.add(readyKey)
  }
  return sheet
}

async function ensureExtraTab(spreadsheetId: string, key: WorldIndexKey, tab: WorldIndexTabDefinition, existing: Array<{ sheetId?: number; title: string }>) {
  const structure = { key, name: worldIndexDefinitions[key].sheetName, tabName: tab.name, frozenColumns: 1, headers: tab.headers, columnWidths: tab.widths }
  const found = existing.find((candidate) => candidate.title === tab.name)
  if (!found) {
    const reply = await googleSheetsJson<{ replies?: Array<{ addSheet?: { properties?: { sheetId?: number } } }> }>(`spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab.name, gridProperties: { rowCount: 1000, columnCount: tab.headers.length, frozenRowCount: 1, frozenColumnCount: 1 } } } }] }),
    })
    const sheetId = reply.replies?.[0]?.addSheet?.properties?.sheetId
    if (sheetId === undefined) throw new Error("WORLD_INDEX_TAB_CREATION_FAILED")
    await configureStructuredSheet(spreadsheetId, structure, sheetId)
    return
  }
  // Onglet présent mais vide (créé à la main) : on pose seulement les en-têtes.
  const [firstRow = []] = await readRange(spreadsheetId, sheetTabRange(tab.name, `A1:${columnName(tab.headers.length)}1`))
  if (!firstRow.some((value) => value.trim())) await updateRange(spreadsheetId, sheetTabRange(tab.name, `A1:${columnName(tab.headers.length)}1`), [tab.headers], { valueInputOption: "RAW" })
}

function tabDefinition(key: WorldIndexKey, tabName: string) {
  const tab = worldIndexDefinitions[key].tabs.find((candidate) => candidate.name === tabName)
  if (!tab) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
  return tab
}

function headersOf(firstRow: string[], tab: WorldIndexTabDefinition, width: number) {
  return Array.from({ length: Math.max(width, tab.headers.length) }, (_, index) => firstRow[index]?.trim() || tab.headers[index] || `Colonne ${index + 1}`)
}

/** Lecture avec la mise en forme : c'est ce qu'affiche et modifie le tableau. */
async function readTable(spreadsheetId: string, key: WorldIndexKey, tabName: string): Promise<WorldIndexTable> {
  const tab = tabDefinition(key, tabName)
  const sheet = await readFormattedSheet(spreadsheetId, [tab.name])
  const width = Math.max(0, ...sheet.rows.map((row) => row?.length ?? 0))
  const headers = headersOf((sheet.rows[0] ?? []).map((cell) => cell?.value ?? ""), tab, width)
  const rows = sheet.rows.slice(1).flatMap((row, index) => row?.some((cell) => cell?.value.trim())
    ? [{
        rowNumber: index + 2,
        values: headers.map((_, column) => row[column]?.value ?? ""),
        html: headers.map((_, column) => row[column]?.html ?? ""),
      }]
    : [])
  return { tabName: sheet.tabName, sheetId: sheet.sheetId, headers, rows }
}

export async function getWorldIndex(key: WorldIndexKey): Promise<WorldIndexData> {
  const sheet = await workbook(key)
  const tables = await Promise.all(worldIndexDefinitions[key].tabs.map((tab) => readTable(sheet.spreadsheetId, key, tab.name)))
  return { key, webViewLink: sheet.webViewLink, tables }
}

function columnOf(headers: string[], name: string) {
  return headers.findIndex((header) => foldName(header) === foldName(name))
}

/** Valeurs brutes d'un onglet : suffisantes pour les liens, et mises en cache par readRange. */
async function plainTable(key: WorldIndexKey, tabName: string) {
  const sheet = await workbook(key)
  const tab = tabDefinition(key, tabName)
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange(tabName, "A1:AZ"))
  const headers = headersOf(rows[0] ?? [], tab, Math.max(0, ...rows.map((row) => row.length)))
  return { spreadsheetId: sheet.spreadsheetId, headers, rows }
}

/**
 * Inscrit `value` dans la colonne `end` de la ligne nommée `targetName`, ou crée
 * cette ligne si elle n'existe pas. Ne retire jamais rien : effacer un lien d'un côté
 * laisse l'autre intact, pour ne perdre aucune saisie.
 */
async function addLink(end: WorldIndexLinkEnd, targetName: string, value: string) {
  const { spreadsheetId, headers, rows } = await plainTable(end.index, end.tab)
  const nameColumn = columnOf(headers, "Nom")
  const linkColumn = columnOf(headers, end.column)
  if (nameColumn < 0 || linkColumn < 0) return false
  const rowIndex = rows.findIndex((row, index) => index > 0 && foldName(row[nameColumn] || "") === foldName(targetName))
  if (rowIndex > 0) {
    const current = splitNames(rows[rowIndex][linkColumn] || "")
    if (current.some((name) => foldName(name) === foldName(value))) return false
    const cell = `${columnName(linkColumn + 1)}${rowIndex + 1}`
    await updateRange(spreadsheetId, sheetTabRange(end.tab, `${cell}:${cell}`), [[[...current, value].join(", ")]], { valueInputOption: "RAW" })
    return true
  }
  const values = headers.map((_, index) => index === nameColumn ? targetName : index === linkColumn ? value : "")
  await appendRows(spreadsheetId, sheetTabRange(end.tab, `A:${columnName(headers.length)}`), [values], { valueInputOption: "RAW" })
  return true
}

/** Propage les colonnes liées d'une ligne vers les index d'en face. Renvoie les index modifiés. */
async function syncRowLinks(key: WorldIndexKey, tabName: string, rowNumber: number) {
  const { headers, rows } = await plainTable(key, tabName)
  const row = rows[rowNumber - 1]
  const nameColumn = columnOf(headers, "Nom")
  const name = row && nameColumn >= 0 ? (row[nameColumn] || "").replace(/\s+/g, " ").trim() : ""
  const changed = new Set<WorldIndexKey>()
  if (!name) return changed
  for (const pair of worldIndexLinks) {
    for (const [end, other] of [[pair[0], pair[1]], [pair[1], pair[0]]] as const) {
      if (end.index !== key || end.tab !== tabName) continue
      const column = columnOf(headers, end.column)
      if (column < 0) continue
      for (const target of splitNames(row[column] || "")) {
        // Un peuple n'est pas son propre ancêtre.
        if (other.index === key && other.tab === tabName && foldName(target) === foldName(name)) continue
        if (await addLink(other, target, name)) changed.add(other.index)
      }
    }
  }
  return changed
}

async function tableFor(key: WorldIndexKey, tabName: string) {
  const sheet = await workbook(key)
  return { sheet, table: await readTable(sheet.spreadsheetId, key, tabName) }
}

function triggersLinks(key: WorldIndexKey, tabName: string, header: string) {
  return isNameColumn(header) || worldIndexLinks.some((pair) => pair.some((end) => end.index === key && end.tab === tabName && foldName(end.column) === foldName(header)))
}

/** Une cellule, avec sa mise en forme. Renvoie les index que les liens ont modifiés. */
export async function updateWorldIndexCell(key: WorldIndexKey, tabName: string, rowNumber: number, column: number, html: string) {
  const { sheet, table } = await tableFor(key, tabName)
  if (!table.rows.some((row) => row.rowNumber === rowNumber) || !Number.isInteger(column) || column < 0 || column >= table.headers.length) throw new Error("WORLD_INDEX_ROW_NOT_FOUND")
  await updateFormattedCell({ spreadsheetId: sheet.spreadsheetId, sheetId: table.sheetId, rowNumber, column, html })
  return triggersLinks(key, tabName, table.headers[column]) ? [...await syncRowLinks(key, tabName, rowNumber)] : []
}

/** Le formulaire d'ajout : les valeurs arrivent en HTML, les cellules gardent leur mise en forme. */
export async function addWorldIndexRow(key: WorldIndexKey, tabName: string, provided: string[]) {
  const { sheet, table } = await tableFor(key, tabName)
  const html = table.headers.map((_, index) => String(provided[index] ?? "").slice(0, 50_000))
  const plain = html.map((value) => htmlToRichText(value).text)
  const nameColumn = columnOf(table.headers, "Nom")
  if (nameColumn >= 0 && !plain[nameColumn].trim()) throw new Error("WORLD_INDEX_NAME_REQUIRED")
  const result = await appendRows(sheet.spreadsheetId, sheetTabRange(tabName, `A:${columnName(table.headers.length)}`), [plain], { valueInputOption: "RAW" })
  const rowNumber = Number(result.updatedRange.match(/![A-Z]+(\d+)/)?.[1])
  if (!Number.isInteger(rowNumber)) throw new Error("WORLD_INDEX_APPEND_FAILED")
  for (const [column, value] of html.entries()) {
    if (/<[a-z]/i.test(value)) await updateFormattedCell({ spreadsheetId: sheet.spreadsheetId, sheetId: table.sheetId, rowNumber, column, html: value })
  }
  return [...await syncRowLinks(key, tabName, rowNumber)]
}

/** La copie apparaît juste sous l'originale, mise en forme comprise. */
export async function duplicateWorldIndexRows(key: WorldIndexKey, tabName: string, rowNumbers: number[]) {
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
  }
  clearSpreadsheetReadCache(sheet.spreadsheetId)
}

/** Du bas vers le haut : retirer une ligne décale toutes les suivantes. */
export async function deleteWorldIndexRows(key: WorldIndexKey, tabName: string, rowNumbers: number[]) {
  const { sheet, table } = await tableFor(key, tabName)
  for (const rowNumber of [...rowNumbers].sort((left, right) => right - left)) {
    if (!table.rows.some((row) => row.rowNumber === rowNumber)) continue
    await deleteGoogleSheetRow(sheet.spreadsheetId, tabName, rowNumber, table.sheetId)
  }
}
