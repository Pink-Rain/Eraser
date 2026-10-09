/**
 * L'onglet « Jauges » du classeur « Sorts de classe » : une ligne par jauge de classe.
 *
 * - L'onglet est créé seulement s'il manque (jamais recréé) ; une colonne qui manque est
 *   ajoutée à droite, une colonne ajoutée à la main est gardée telle quelle.
 * - Une jauge est retrouvée par son ID (colonne « ID ») juste avant chaque écriture : une
 *   ligne déplacée ou supprimée dans Sheets entre-temps n'est jamais écrasée par erreur.
 * - Seules les cases connues d'une jauge sont écrites. Seuils et Description sont des cases
 *   mises en forme (gras, couleurs, références « {index:ligne} » en liens).
 */
import { classWorkbookFiles } from "@/lib/class-content"
import {
  appendRows,
  clearSpreadsheetReadCache,
  columnName,
  ensureSheetColumnCount,
  googleSheetsJson,
  readFormattedSheet,
  readRangeFreshWithOffset,
  spreadsheetTabs,
  updateRanges,
  updateRowCells,
  type RowCellWrite,
} from "@/lib/google-sheets"
import { GAUGE_HEADERS, GAUGE_RICH_HEADERS, GAUGES_TAB, gaugeCells, gaugeFromCells, plainTextOf, type ClassGauge, type GaugeHeader } from "@/lib/class-specifics"

export type ClassGaugeTable = { gauges: ClassGauge[]; sheetUrl: string; exists: boolean }

const quoteTab = (tabName: string) => `'${tabName.replace(/'/g, "''")}'`
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")

let cache: { expiresAt: number; table: ClassGaugeTable } | null = null
/** Les écritures passent une à une : deux jauges créées coup sur coup ne prennent pas la même ligne. */
let queue: Promise<unknown> = Promise.resolve()
const headersReady = new Set<string>()

function serialized<T>(work: () => Promise<T>) {
  const run = queue.then(work)
  queue = run.catch(() => undefined)
  return run
}

async function spellsFile() {
  const { spells } = await classWorkbookFiles()
  if (!spells) throw new Error("CLASS_SPELLS_SHEET_NOT_FOUND")
  return spells
}

/** Crée l'onglet s'il manque, puis ajoute à droite les colonnes qui manquent. */
async function ensureGaugeTab(fileId: string) {
  const tabs = await spreadsheetTabs(fileId)
  if (!tabs.some((tab) => tab.title === GAUGES_TAB)) {
    await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: GAUGES_TAB, gridProperties: { rowCount: 50, columnCount: GAUGE_HEADERS.length, frozenRowCount: 1, frozenColumnCount: 3 } } } }] }),
    })
    await updateRanges(fileId, [{ range: `${quoteTab(GAUGES_TAB)}!A1:${columnName(GAUGE_HEADERS.length)}1`, values: [[...GAUGE_HEADERS]] }], { valueInputOption: "RAW" })
    headersReady.add(fileId)
    clearSpreadsheetReadCache(fileId)
    console.info("CLASS_GAUGES_TAB_CREATED")
    return
  }
  if (headersReady.has(fileId)) return
  const read = await readRangeFreshWithOffset(fileId, `${quoteTab(GAUGES_TAB)}!1:1`)
  const headers = (read.startRow === 1 ? read.rows[0] ?? [] : []).map((cell) => String(cell ?? "").trim())
  while (headers.length && !headers[headers.length - 1]) headers.pop()
  const present = new Set(headers.map(fold))
  const missing = GAUGE_HEADERS.filter((header) => !present.has(fold(header)))
  if (missing.length) {
    await ensureSheetColumnCount(fileId, GAUGES_TAB, headers.length + missing.length)
    await updateRanges(fileId, [{ range: `${quoteTab(GAUGES_TAB)}!${columnName(headers.length + 1)}1:${columnName(headers.length + missing.length)}1`, values: [missing] }], { valueInputOption: "RAW" })
    clearSpreadsheetReadCache(fileId)
    console.info("CLASS_GAUGES_HEADERS_ADDED", missing.length)
  }
  headersReady.add(fileId)
}

/** Tout l'onglet, lu frais : en-têtes (repérés par leur nom) et lignes avec leur numéro dans Sheets. */
async function readGaugeTab(fileId: string) {
  const read = await readRangeFreshWithOffset(fileId, `${quoteTab(GAUGES_TAB)}!A1:ZZ`)
  const rows = [...Array.from({ length: Math.max(0, read.startRow - 1) }, () => [] as string[]), ...read.rows].map((row) => row.map((cell) => String(cell ?? "")))
  const headers = (rows[0] ?? []).map((cell) => cell.trim())
  const column = new Map<GaugeHeader, number>()
  for (const header of GAUGE_HEADERS) {
    const index = headers.findIndex((candidate) => fold(candidate) === fold(header))
    if (index >= 0) column.set(header, index)
  }
  const lines = rows.slice(1).map((row, offset) => ({ rowNumber: offset + 2, row }))
  const cellOf = (row: string[]) => (header: GaugeHeader) => { const index = column.get(header); return index === undefined ? "" : row[index] ?? "" }
  return { headers, column, lines, cellOf }
}

function tableUrl(file: { id: string; webViewLink?: string | null }, sheetId?: number) {
  return sheetId === undefined ? file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit` : `https://docs.google.com/spreadsheets/d/${file.id}/edit#gid=${sheetId}`
}

/** `create` (administrateur ou MJ) : l'onglet est créé s'il manque. Sans onglet, aucune jauge. */
export async function listClassGauges(options: { create?: boolean; refresh?: boolean } = {}): Promise<ClassGaugeTable> {
  if (!options.refresh && cache && cache.expiresAt > Date.now() && (cache.table.exists || !options.create)) return cache.table
  const file = await spellsFile()
  if (options.create) await serialized(() => ensureGaugeTab(file.id))
  const tab = (await spreadsheetTabs(file.id)).find((item) => item.title === GAUGES_TAB)
  if (!tab) {
    const table = { gauges: [], sheetUrl: tableUrl(file), exists: false }
    cache = { expiresAt: Date.now() + 60_000, table }
    return table
  }
  // Lecture mise en forme : Seuils et Description gardent gras, couleurs et références.
  const sheet = await readFormattedSheet(file.id, [GAUGES_TAB])
  const headers = (sheet.rows[0] ?? []).map((cell) => String(cell?.value ?? "").trim())
  const at = (header: GaugeHeader) => headers.findIndex((candidate) => fold(candidate) === fold(header))
  const gauges = sheet.rows.slice(1).flatMap((row) => gaugeFromCells(
    (header) => { const index = at(header); return index < 0 ? "" : String(row?.[index]?.value ?? "") },
    (header) => { const index = at(header); return index < 0 ? "" : String(row?.[index]?.html || "") },
  ) ?? [])
  const table = { gauges, sheetUrl: tableUrl(file, tab.sheetId), exists: true }
  cache = { expiresAt: Date.now() + 60_000, table }
  return table
}

const isRich = (header: GaugeHeader) => (GAUGE_RICH_HEADERS as readonly string[]).includes(header)

/**
 * Le tableau après une écriture, recalculé à partir de ce qui vient d'être écrit : une
 * relecture tout de suite après pourrait encore rendre l'ancienne version.
 */
function remember(table: ClassGaugeTable, change: (gauges: ClassGauge[]) => ClassGauge[]) {
  const next = { ...table, exists: true, gauges: change(table.gauges) }
  cache = { expiresAt: Date.now() + 60_000, table: next }
  return next
}

/** Crée ou met à jour une jauge (retrouvée par son ID). */
export async function saveClassGauge(gauge: ClassGauge) {
  const file = await spellsFile()
  const before = cache?.table.exists ? cache.table : await listClassGauges({ create: true })
  await serialized(async () => {
    await ensureGaugeTab(file.id)
    const tab = (await spreadsheetTabs(file.id)).find((item) => item.title === GAUGES_TAB)
    if (tab?.sheetId === undefined) throw new Error("SHEET_TAB_NOT_FOUND")
    const findRows = async () => {
      const { headers, column, lines, cellOf } = await readGaugeTab(file.id)
      return { headers, column, matches: lines.filter(({ row }) => cellOf(row)("ID").trim() === gauge.id) }
    }
    let { headers, column, matches } = await findRows()
    if (matches.length > 1) throw new Error("CLASS_GAUGE_DUPLICATE")
    const cells = gaugeCells(gauge)
    if (!matches.length) {
      // Une nouvelle ligne : son texte d'abord, puis ses cases mises en forme, à leur place relue.
      const row = Array.from({ length: Math.max(headers.length, ...[...column.values()].map((index) => index + 1)) }, () => "")
      for (const header of GAUGE_HEADERS) { const index = column.get(header); if (index !== undefined) row[index] = isRich(header) ? plainTextOf(cells[header]) : cells[header] }
      await appendRows(file.id, `${quoteTab(GAUGES_TAB)}!A:A`, [row], { valueInputOption: "RAW" })
      ;({ headers, column, matches } = await findRows())
      if (matches.length !== 1) throw new Error("CLASS_GAUGE_NOT_FOUND")
    }
    const writes: RowCellWrite[] = GAUGE_HEADERS.flatMap((header) => {
      const index = column.get(header)
      if (index === undefined) return []
      return [isRich(header) ? { column: index, html: cells[header] } : { column: index, value: cells[header] }]
    })
    await updateRowCells({ spreadsheetId: file.id, sheetId: tab.sheetId, rowNumber: matches[0].rowNumber, cells: writes })
    clearSpreadsheetReadCache(file.id)
  })
  return remember(before, (gauges) => gauges.some((item) => item.id === gauge.id) ? gauges.map((item) => item.id === gauge.id ? gauge : item) : [...gauges, gauge])
}

/** Supprime la ligne d'une jauge, retrouvée par son ID juste avant. */
export async function deleteClassGauge(id: string) {
  const file = await spellsFile()
  const before = cache?.table.exists ? cache.table : await listClassGauges()
  await serialized(async () => {
    const tab = (await spreadsheetTabs(file.id)).find((item) => item.title === GAUGES_TAB)
    if (!tab || tab.sheetId === undefined) throw new Error("CLASS_GAUGE_NOT_FOUND")
    const { lines, cellOf } = await readGaugeTab(file.id)
    const matches = lines.filter(({ row }) => cellOf(row)("ID").trim() === id)
    if (matches.length !== 1) throw new Error(matches.length ? "CLASS_GAUGE_DUPLICATE" : "CLASS_GAUGE_NOT_FOUND")
    await googleSheetsJson(`spreadsheets/${file.id}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: matches[0].rowNumber - 1, endIndex: matches[0].rowNumber } } }] }),
    })
    clearSpreadsheetReadCache(file.id)
  })
  return remember(before, (gauges) => gauges.filter((item) => item.id !== id))
}
