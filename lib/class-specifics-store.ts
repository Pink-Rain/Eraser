/**
 * Les onglets des spécificités de classe dans le classeur « Sorts de classe » : « Jauges »
 * (une ligne par jauge) et « Formes » (une ligne par forme, groupées par « Groupe ID »).
 *
 * - Un onglet est créé seulement s'il manque (jamais recréé) ; une colonne qui manque est
 *   ajoutée à droite, une colonne ajoutée à la main est gardée telle quelle.
 * - Une ligne est retrouvée par son ID (colonne « ID ») juste avant chaque écriture : une
 *   ligne déplacée ou supprimée dans Sheets entre-temps n'est jamais écrasée par erreur.
 * - Seules les cases connues sont écrites. Les cases de texte (seuils, descriptions) sont
 *   mises en forme : gras, couleurs, références « {index:ligne} » en liens.
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
import { GAUGE_HEADERS, GAUGE_RICH_HEADERS, GAUGES_TAB, gaugeCells, gaugeFromCells, plainTextOf, type ClassGauge } from "@/lib/class-specifics"
import { FORM_HEADERS, FORM_RICH_HEADERS, FORMS_TAB, formGroupRows, formGroupsFromRows, type ClassFormGroup } from "@/lib/class-forms"
import { CARD_HEADERS, CARD_RICH_HEADERS, CARDS_TAB, cardCells, cardFromCells, cardKey, DECK_HEADERS, DECK_RICH_HEADERS, DECKS_TAB, deckCells, deckFromCells, type ClassDeck, type DeckCard } from "@/lib/class-decks"

export type ClassSpecificsTable = { gauges: ClassGauge[]; formGroups: ClassFormGroup[]; decks: ClassDeck[]; cards: DeckCard[]; sheetUrl: string; formsSheetUrl: string; decksSheetUrl: string; cardsSheetUrl: string; exists: boolean }
/** Nom d'origine, gardé pour les appels existants. */
export type ClassGaugeTable = ClassSpecificsTable

/** `key` : ce qui identifie une ligne (son ID ; pour une carte, sa classe et son numéro). */
type TabSpec = { name: string; headers: readonly string[]; rich: readonly string[]; frozenColumns: number; label: string; key: (cell: (header: string) => string) => string }
const byId = (cell: (header: string) => string) => cell("ID").trim()
const gaugeTab: TabSpec = { name: GAUGES_TAB, headers: GAUGE_HEADERS, rich: GAUGE_RICH_HEADERS, frozenColumns: 3, label: "GAUGES", key: byId }
const formTab: TabSpec = { name: FORMS_TAB, headers: FORM_HEADERS, rich: FORM_RICH_HEADERS, frozenColumns: 5, label: "FORMS", key: byId }
const deckTab: TabSpec = { name: DECKS_TAB, headers: DECK_HEADERS, rich: DECK_RICH_HEADERS, frozenColumns: 3, label: "DECKS", key: byId }
const cardTab: TabSpec = { name: CARDS_TAB, headers: CARD_HEADERS, rich: CARD_RICH_HEADERS, frozenColumns: 2, label: "CARDS", key: (cell) => cell("Carte").trim() ? cardKey(cell("Classe"), cell("Carte")) : "" }

const quoteTab = (tabName: string) => `'${tabName.replace(/'/g, "''")}'`
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")

let cache: { expiresAt: number; table: ClassSpecificsTable } | null = null
/** Les écritures passent une à une : deux lignes créées coup sur coup ne prennent pas la même place. */
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
async function ensureTab(fileId: string, spec: TabSpec) {
  const tabs = await spreadsheetTabs(fileId)
  const key = `${fileId}:${spec.name}`
  if (!tabs.some((tab) => tab.title === spec.name)) {
    await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: spec.name, gridProperties: { rowCount: 50, columnCount: spec.headers.length, frozenRowCount: 1, frozenColumnCount: spec.frozenColumns } } } }] }),
    })
    await updateRanges(fileId, [{ range: `${quoteTab(spec.name)}!A1:${columnName(spec.headers.length)}1`, values: [[...spec.headers]] }], { valueInputOption: "RAW" })
    headersReady.add(key)
    clearSpreadsheetReadCache(fileId)
    console.info(`CLASS_${spec.label}_TAB_CREATED`)
    return
  }
  if (headersReady.has(key)) return
  const read = await readRangeFreshWithOffset(fileId, `${quoteTab(spec.name)}!1:1`)
  const headers = (read.startRow === 1 ? read.rows[0] ?? [] : []).map((cell) => String(cell ?? "").trim())
  while (headers.length && !headers[headers.length - 1]) headers.pop()
  const present = new Set(headers.map(fold))
  const missing = spec.headers.filter((header) => !present.has(fold(header)))
  if (missing.length) {
    await ensureSheetColumnCount(fileId, spec.name, headers.length + missing.length)
    await updateRanges(fileId, [{ range: `${quoteTab(spec.name)}!${columnName(headers.length + 1)}1:${columnName(headers.length + missing.length)}1`, values: [missing] }], { valueInputOption: "RAW" })
    clearSpreadsheetReadCache(fileId)
    console.info(`CLASS_${spec.label}_HEADERS_ADDED`, missing.length)
  }
  headersReady.add(key)
}

/** Tout l'onglet, lu frais : en-têtes (repérés par leur nom) et lignes avec leur numéro dans Sheets. */
async function readTabFresh(fileId: string, spec: TabSpec) {
  const read = await readRangeFreshWithOffset(fileId, `${quoteTab(spec.name)}!A1:ZZ`)
  const rows = [...Array.from({ length: Math.max(0, read.startRow - 1) }, () => [] as string[]), ...read.rows].map((row) => row.map((cell) => String(cell ?? "")))
  const headers = (rows[0] ?? []).map((cell) => cell.trim())
  const column = new Map<string, number>()
  for (const header of spec.headers) {
    const index = headers.findIndex((candidate) => fold(candidate) === fold(header))
    if (index >= 0) column.set(header, index)
  }
  const lines = rows.slice(1).map((row, offset) => ({ rowNumber: offset + 2, row }))
  const cellOf = (row: string[]) => (header: string) => { const index = column.get(header); return index === undefined ? "" : row[index] ?? "" }
  return { headers, column, lines, cellOf }
}

/** L'onglet lu avec sa mise en forme (les cases de texte en HTML) ; null s'il n'existe pas. */
async function readTabFormatted(fileId: string, spec: TabSpec, exists: boolean) {
  if (!exists) return null
  const sheet = await readFormattedSheet(fileId, [spec.name])
  const headers = (sheet.rows[0] ?? []).map((cell) => String(cell?.value ?? "").trim())
  const at = (header: string) => headers.findIndex((candidate) => fold(candidate) === fold(header))
  return sheet.rows.slice(1).map((row) => ({
    cell: (header: string) => { const index = at(header); return index < 0 ? "" : String(row?.[index]?.value ?? "") },
    rich: (header: string) => { const index = at(header); return index < 0 ? "" : String(row?.[index]?.html || "") },
  }))
}

function tableUrl(file: { id: string; webViewLink?: string | null }, sheetId?: number) {
  return sheetId === undefined ? file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit` : `https://docs.google.com/spreadsheets/d/${file.id}/edit#gid=${sheetId}`
}

/**
 * Toutes les spécificités (jauges, formes). `create` (administrateur ou MJ) : l'onglet
 * « Jauges » est créé s'il manque ; « Formes » l'est à la première forme enregistrée.
 */
export async function listClassSpecifics(options: { create?: boolean; refresh?: boolean } = {}): Promise<ClassSpecificsTable> {
  if (!options.refresh && cache && cache.expiresAt > Date.now() && (cache.table.exists || !options.create)) return cache.table
  const file = await spellsFile()
  if (options.create) await serialized(() => ensureTab(file.id, gaugeTab))
  const tabs = await spreadsheetTabs(file.id)
  const gaugeSheet = tabs.find((item) => item.title === GAUGES_TAB)
  const formSheet = tabs.find((item) => item.title === FORMS_TAB)
  const deckSheet = tabs.find((item) => item.title === DECKS_TAB)
  const cardSheet = tabs.find((item) => item.title === CARDS_TAB)
  const [gaugeRows, formRows, deckRows, cardRows] = await Promise.all([
    readTabFormatted(file.id, gaugeTab, Boolean(gaugeSheet)),
    readTabFormatted(file.id, formTab, Boolean(formSheet)),
    readTabFormatted(file.id, deckTab, Boolean(deckSheet)),
    readTabFormatted(file.id, cardTab, Boolean(cardSheet)),
  ])
  const table: ClassSpecificsTable = {
    gauges: (gaugeRows ?? []).flatMap((row) => gaugeFromCells(row.cell as never, row.rich as never) ?? []),
    formGroups: formGroupsFromRows((formRows ?? []) as never),
    decks: (deckRows ?? []).flatMap((row) => deckFromCells(row.cell as never, row.rich as never) ?? []),
    cards: (cardRows ?? []).flatMap((row) => cardFromCells(row.cell as never, row.rich as never) ?? []),
    sheetUrl: tableUrl(file, gaugeSheet?.sheetId),
    formsSheetUrl: tableUrl(file, formSheet?.sheetId),
    decksSheetUrl: tableUrl(file, deckSheet?.sheetId),
    cardsSheetUrl: tableUrl(file, cardSheet?.sheetId),
    exists: Boolean(gaugeSheet),
  }
  cache = { expiresAt: Date.now() + 60_000, table }
  return table
}

/** Nom d'origine, gardé pour les appels existants. */
export const listClassGauges = listClassSpecifics

/**
 * Le tableau après une écriture, recalculé à partir de ce qui vient d'être écrit : une
 * relecture tout de suite après pourrait encore rendre l'ancienne version.
 */
function remember(table: ClassSpecificsTable, change: (table: ClassSpecificsTable) => ClassSpecificsTable) {
  const next = change(table)
  cache = { expiresAt: Date.now() + 60_000, table: next }
  return next
}

/**
 * Écrit des lignes, retrouvées par leur ID (créées à la fin de l'onglet sinon), et
 * supprime celles dont l'ID est dans `remove`. À appeler dans la file des écritures.
 */
async function writeRows(fileId: string, spec: TabSpec, rows: Array<Record<string, string>>, remove: string[] = []) {
  await ensureTab(fileId, spec)
  const tab = (await spreadsheetTabs(fileId)).find((item) => item.title === spec.name)
  if (tab?.sheetId === undefined) throw new Error("SHEET_TAB_NOT_FOUND")
  const sheetId = tab.sheetId
  const isRich = (header: string) => spec.rich.includes(header)
  // Les lignes retirées d'abord, de la plus basse à la plus haute : les autres ne bougent pas avant d'être relues.
  const keyOfLine = (cell: (header: string) => string) => spec.key(cell)
  const keyOfRow = (cells: Record<string, string>) => spec.key((header) => cells[header] ?? "")
  if (remove.length) {
    const { lines, cellOf } = await readTabFresh(fileId, spec)
    const doomed = lines.filter(({ row }) => remove.includes(keyOfLine(cellOf(row)))).map((line) => line.rowNumber).sort((a, b) => b - a)
    if (doomed.length) {
      await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: doomed.map((rowNumber) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } })) }) })
      clearSpreadsheetReadCache(fileId)
    }
  }
  if (!rows.length) return
  let { headers, column, lines, cellOf } = await readTabFresh(fileId, spec)
  const idsIn = () => new Map(lines.map(({ row, rowNumber }) => [keyOfLine(cellOf(row)), rowNumber]))
  for (const row of rows) if (lines.filter((line) => keyOfLine(cellOf(line.row)) === keyOfRow(row)).length > 1) throw new Error("CLASS_SPECIFIC_DUPLICATE")
  const missing = rows.filter((row) => !idsIn().has(keyOfRow(row)))
  if (missing.length) {
    // Les nouvelles lignes : leur texte d'abord, puis leurs cases mises en forme, à leur place relue.
    const width = Math.max(headers.length, ...[...column.values()].map((index) => index + 1))
    await appendRows(fileId, `${quoteTab(spec.name)}!A:A`, missing.map((cells) => {
      const line = Array.from({ length: width }, () => "")
      for (const header of spec.headers) { const index = column.get(header); if (index !== undefined) line[index] = isRich(header) ? plainTextOf(cells[header] ?? "") : cells[header] ?? "" }
      return line
    }), { valueInputOption: "RAW" })
    ;({ headers, column, lines, cellOf } = await readTabFresh(fileId, spec))
  }
  const rowOf = idsIn()
  for (const cells of rows) {
    const rowNumber = rowOf.get(keyOfRow(cells))
    if (!rowNumber) throw new Error("CLASS_SPECIFIC_NOT_FOUND")
    const writes: RowCellWrite[] = spec.headers.flatMap((header) => {
      const index = column.get(header)
      if (index === undefined) return []
      return [isRich(header) ? { column: index, html: cells[header] ?? "" } : { column: index, value: cells[header] ?? "" }]
    })
    await updateRowCells({ spreadsheetId: fileId, sheetId, rowNumber, cells: writes })
  }
  clearSpreadsheetReadCache(fileId)
}

/** Crée ou met à jour une jauge (retrouvée par son ID). */
export async function saveClassGauge(gauge: ClassGauge) {
  const file = await spellsFile()
  const before = cache?.table.exists ? cache.table : await listClassSpecifics({ create: true })
  await serialized(() => writeRows(file.id, gaugeTab, [gaugeCells(gauge)]))
  return remember(before, (table) => ({ ...table, exists: true, gauges: table.gauges.some((item) => item.id === gauge.id) ? table.gauges.map((item) => item.id === gauge.id ? gauge : item) : [...table.gauges, gauge] }))
}

/** Supprime la ligne d'une jauge, retrouvée par son ID juste avant. */
export async function deleteClassGauge(id: string) {
  const file = await spellsFile()
  const before = cache?.table.exists ? cache.table : await listClassSpecifics()
  await serialized(async () => {
    const { lines, cellOf } = await readTabFresh(file.id, gaugeTab)
    const matches = lines.filter(({ row }) => cellOf(row)("ID").trim() === id)
    if (matches.length > 1) throw new Error("CLASS_SPECIFIC_DUPLICATE")
    // Déjà absente de la feuille (retirée dans Sheets) : il ne reste qu'à l'oublier ici.
    if (matches.length) await writeRows(file.id, gaugeTab, [], [id])
  })
  return remember(before, (table) => ({ ...table, gauges: table.gauges.filter((item) => item.id !== id) }))
}

/** Crée ou met à jour un groupe de formes : ses lignes, et celles des formes retirées. */
export async function saveClassFormGroup(group: ClassFormGroup) {
  const file = await spellsFile()
  const before = cache ? cache.table : await listClassSpecifics()
  const previous = before.formGroups.find((item) => item.id === group.id)
  const removed = (previous?.forms ?? []).map((form) => form.id).filter((id) => !group.forms.some((form) => form.id === id))
  await serialized(() => writeRows(file.id, formTab, formGroupRows(group), removed))
  return remember(before, (table) => ({ ...table, formGroups: table.formGroups.some((item) => item.id === group.id) ? table.formGroups.map((item) => item.id === group.id ? group : item) : [...table.formGroups, group] }))
}

/** Supprime toutes les formes d'un groupe. */
export async function deleteClassFormGroup(groupId: string) {
  const file = await spellsFile()
  const before = cache ? cache.table : await listClassSpecifics()
  await serialized(async () => {
    const { lines, cellOf } = await readTabFresh(file.id, formTab)
    const ids = lines.filter(({ row }) => cellOf(row)("Groupe ID").trim() === groupId).map(({ row }) => cellOf(row)("ID").trim()).filter(Boolean)
    if (ids.length) await writeRows(file.id, formTab, [], ids)
  })
  return remember(before, (table) => ({ ...table, formGroups: table.formGroups.filter((item) => item.id !== groupId) }))
}

/**
 * Crée ou met à jour un deck et ses cartes : la ligne du deck (onglet « Decks ») et les
 * lignes de ses cartes (onglet « Cartes », retrouvées par classe et numéro). `removedCards` :
 * les numéros des cartes retirées par le MJ, supprimées de l'onglet.
 */
export async function saveClassDeck(deck: ClassDeck, cards: DeckCard[], removedCards: string[]) {
  const file = await spellsFile()
  const before = cache ? cache.table : await listClassSpecifics()
  const removed = removedCards.filter((number) => !cards.some((card) => card.number === number)).map((number) => cardKey(deck.className, number))
  await serialized(async () => {
    await writeRows(file.id, deckTab, [deckCells(deck)])
    await writeRows(file.id, cardTab, cards.map(cardCells), removed)
  })
  const sameClass = (card: DeckCard) => cardKey(card.className, "") === cardKey(deck.className, "")
  return remember(before, (table) => ({
    ...table,
    decks: table.decks.some((item) => item.id === deck.id) ? table.decks.map((item) => item.id === deck.id ? deck : item) : [...table.decks, deck],
    cards: [...table.cards.filter((card) => !sameClass(card) || (!cards.some((item) => item.number === card.number) && !removedCards.includes(card.number))), ...cards],
  }))
}

/** Supprime le réglage d'un deck ; ses cartes restent dans l'onglet « Cartes ». */
export async function deleteClassDeck(deckId: string) {
  const file = await spellsFile()
  const before = cache ? cache.table : await listClassSpecifics()
  await serialized(async () => {
    const { lines, cellOf } = await readTabFresh(file.id, deckTab)
    const matches = lines.filter(({ row }) => cellOf(row)("ID").trim() === deckId).length
    if (matches > 1) throw new Error("CLASS_SPECIFIC_DUPLICATE")
    if (matches) await writeRows(file.id, deckTab, [], [deckId])
  })
  return remember(before, (table) => ({ ...table, decks: table.decks.filter((item) => item.id !== deckId) }))
}
