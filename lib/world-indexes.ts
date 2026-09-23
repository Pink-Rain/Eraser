import {
  clearSpreadsheetReadCache,
  columnName,
  configureStructuredSheet,
  deleteGoogleSheetRow,
  ensureJdrSheet,
  ensureSheetColumnCount,
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
  linkEndCovers,
  linkEndTabs,
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
  const readyKey = `${sheet.spreadsheetId}:${key}:${definition.tabs.map((tab) => `${tab.name}=${tab.headers.join("|")}`).join(";")}`
  if (!readyWorkbooks.has(readyKey)) {
    const existing = await spreadsheetTabs(sheet.spreadsheetId)
    for (const tab of definition.tabs) await ensureTab(sheet.spreadsheetId, key, tab, existing)
    readyWorkbooks.add(readyKey)
  }
  return sheet
}

/**
 * Un onglet et ses colonnes. Les colonnes sont retrouvées par leur nom : celles qui
 * manquent sont ajoutées à droite des existantes, sans toucher à ce qui est déjà
 * rempli ni à l'ordre choisi dans Sheets.
 */
async function ensureTab(spreadsheetId: string, key: WorldIndexKey, tab: WorldIndexTabDefinition, existing: Array<{ sheetId?: number; title: string }>) {
  const structure = { key, name: worldIndexDefinitions[key].sheetName, tabName: tab.name, frozenColumns: 1, headers: tab.headers, columnWidths: tab.widths }
  if (!existing.some((candidate) => candidate.title === tab.name)) {
    const reply = await googleSheetsJson<{ replies?: Array<{ addSheet?: { properties?: { sheetId?: number } } }> }>(`spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab.name, gridProperties: { rowCount: 1000, columnCount: tab.headers.length, frozenRowCount: 1, frozenColumnCount: 1 } } } }] }),
    })
    const sheetId = reply.replies?.[0]?.addSheet?.properties?.sheetId
    if (sheetId === undefined) throw new Error("WORLD_INDEX_TAB_CREATION_FAILED")
    await configureStructuredSheet(spreadsheetId, structure, sheetId)
    return
  }
  clearSpreadsheetReadCache(spreadsheetId)
  const [firstRow = []] = await readRange(spreadsheetId, sheetTabRange(tab.name, "A1:AZ1"))
  let used = firstRow.length
  while (used > 0 && !firstRow[used - 1]?.trim()) used -= 1
  const present = new Set(firstRow.slice(0, used).map(foldName))
  const missing = tab.headers.filter((header) => !present.has(foldName(header)))
  if (!missing.length) return
  await ensureSheetColumnCount(spreadsheetId, tab.name, used + missing.length)
  const from = columnName(used + 1)
  const to = columnName(used + missing.length)
  await updateRange(spreadsheetId, sheetTabRange(tab.name, `${from}1:${to}1`), [missing], { valueInputOption: "RAW" })
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

/**
 * Les écritures liées passent une par une. Deux cellules enregistrées coup sur coup
 * cherchaient sinon la même entité en même temps, ne la trouvaient ni l'une ni
 * l'autre, et la créaient deux fois. Le serveur tourne dans un seul processus
 * (l'application Windows) : une file en mémoire suffit.
 */
let linkQueue: Promise<unknown> = Promise.resolve()

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = linkQueue.then(task, task)
  linkQueue = run.catch(() => undefined)
  return run
}

/**
 * Valeurs brutes d'un onglet, relues depuis Google à chaque fois : une entité ajoutée
 * à la main dans Sheets doit être vue tout de suite, sinon elle serait recréée.
 */
async function plainTable(key: WorldIndexKey, tabName: string) {
  const sheet = await workbook(key)
  const tab = tabDefinition(key, tabName)
  clearSpreadsheetReadCache(sheet.spreadsheetId)
  const rows = await readRange(sheet.spreadsheetId, sheetTabRange(tabName, "A1:AZ"))
  const headers = headersOf(rows[0] ?? [], tab, Math.max(0, ...rows.map((row) => row.length)))
  return { spreadsheetId: sheet.spreadsheetId, headers, rows }
}

type PlainTable = Awaited<ReturnType<typeof plainTable>>

function rowName(table: PlainTable, rowIndex: number) {
  const nameColumn = columnOf(table.headers, "Nom")
  return nameColumn >= 0 ? (table.rows[rowIndex]?.[nameColumn] || "").replace(/\s+/g, " ").trim() : ""
}

function findRowByName(table: PlainTable, name: string) {
  const nameColumn = columnOf(table.headers, "Nom")
  if (nameColumn < 0) return -1
  return table.rows.findIndex((row, index) => index > 0 && foldName(row[nameColumn] || "") === foldName(name))
}

async function writeCell(table: PlainTable, tabName: string, rowIndex: number, column: number, value: string) {
  const cell = `${columnName(column + 1)}${rowIndex + 1}`
  await updateRange(table.spreadsheetId, sheetTabRange(tabName, `${cell}:${cell}`), [[value]], { valueInputOption: "RAW" })
  ;(table.rows[rowIndex] ||= [])[column] = value
}

/**
 * Écrit une ligne complète juste sous la dernière ligne remplie, en colonne A. L'ajout
 * « append » de Google devine lui-même où commence le tableau et pouvait décaler les
 * valeurs d'une ou plusieurs colonnes : on choisit la ligne nous-mêmes.
 */
async function writeNewRow(table: PlainTable, tabName: string, values: string[]) {
  let rowIndex = table.rows.length
  while (rowIndex > 1 && !(table.rows[rowIndex - 1] ?? []).some((value) => value.trim())) rowIndex -= 1
  const range = sheetTabRange(tabName, `A${rowIndex + 1}:${columnName(values.length)}${rowIndex + 1}`)
  try {
    await updateRange(table.spreadsheetId, range, [values], { valueInputOption: "RAW" })
  } catch {
    // La grille est pleine : on lui ajoute des lignes puis on réessaie.
    const tabs = await spreadsheetTabs(table.spreadsheetId)
    const sheetId = tabs.find((tab) => tab.title === tabName)?.sheetId
    if (sheetId === undefined) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
    await googleSheetsJson(`spreadsheets/${table.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ appendDimension: { sheetId, dimension: "ROWS", length: 500 } }] }) })
    await updateRange(table.spreadsheetId, range, [values], { valueInputOption: "RAW" })
  }
  table.rows[rowIndex] = [...values]
  return rowIndex + 1
}

/** La ligne `name` parmi les onglets couverts par `end` ; -1 si elle n'existe nulle part. */
async function locateLinked(end: WorldIndexLinkEnd, name: string) {
  const tabs = linkEndTabs(end)
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
  const nameColumn = columnOf(table.headers, "Nom")
  const linkColumn = columnOf(table.headers, end.column)
  if (nameColumn < 0 || linkColumn < 0) return false
  if (rowIndex > 0) {
    const current = splitNames(table.rows[rowIndex][linkColumn] || "")
    if (current.some((name) => foldName(name) === foldName(value))) return false
    await writeCell(table, tab, rowIndex, linkColumn, [...current, value].join(", "))
    return true
  }
  await writeNewRow(table, tab, table.headers.map((_, index) => index === nameColumn ? targetName : index === linkColumn ? value : ""))
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
  return worldIndexLinks.flatMap((pair) => ([[pair[0], pair[1]], [pair[1], pair[0]]] as const).filter(([end]) => linkEndCovers(end, key, tabName)))
}

function isSelfLink(key: WorldIndexKey, tabName: string, other: WorldIndexLinkEnd, target: string, name: string) {
  // Un peuple n'est pas son propre ancêtre.
  return linkEndCovers(other, key, tabName) && foldName(target) === foldName(name)
}

/** Propage les colonnes liées d'une ligne vers les index d'en face. */
async function syncRowLinks(key: WorldIndexKey, tabName: string, rowNumber: number, changed: Set<WorldIndexKey>) {
  const table = await plainTable(key, tabName)
  const name = rowName(table, rowNumber - 1)
  if (!name) return
  for (const [end, other] of linkEndsOf(key, tabName)) {
    const column = columnOf(table.headers, end.column)
    if (column < 0) continue
    for (const target of splitNames(table.rows[rowNumber - 1]?.[column] || "")) {
      if (isSelfLink(key, tabName, other, target, name)) continue
      if (await addLink(other, target, name)) changed.add(other.index)
    }
  }
}

async function tableFor(key: WorldIndexKey, tabName: string) {
  const sheet = await workbook(key)
  return { sheet, table: await readTable(sheet.spreadsheetId, key, tabName) }
}

/**
 * Une cellule, avec sa mise en forme. Si elle est liée, l'autre côté suit : noms
 * ajoutés inscrits (et créés au besoin), noms effacés retirés, entité renommée
 * renommée partout où elle est citée. Renvoie les index modifiés par les liens.
 */
export function updateWorldIndexCell(key: WorldIndexKey, tabName: string, rowNumber: number, column: number, html: string) {
  return serialized(async () => {
    const { sheet, table } = await tableFor(key, tabName)
    if (!table.rows.some((row) => row.rowNumber === rowNumber) || !Number.isInteger(column) || column < 0 || column >= table.headers.length) throw new Error("WORLD_INDEX_ROW_NOT_FOUND")
    const header = table.headers[column]
    const ends = linkEndsOf(key, tabName)
    const linkedEnd = ends.find(([end]) => foldName(end.column) === foldName(header))
    const touchesLinks = Boolean(linkedEnd) || (isNameColumn(header) && ends.length > 0)
    const before = touchesLinks ? await plainTable(key, tabName) : null
    await updateFormattedCell({ spreadsheetId: sheet.spreadsheetId, sheetId: table.sheetId, rowNumber, column, html })
    const changed = new Set<WorldIndexKey>()
    if (!before) return []
    const oldName = rowName(before, rowNumber - 1)
    const newValue = htmlToRichText(html).text.replace(/\s+/g, " ").trim()

    if (linkedEnd && oldName) {
      // Noms effacés de la cellule : l'autre côté les oublie aussi.
      const [end, other] = linkedEnd
      const kept = new Set(splitNames(newValue).map(foldName))
      for (const removed of splitNames(before.rows[rowNumber - 1]?.[columnOf(before.headers, end.column)] || "")) {
        if (!kept.has(foldName(removed)) && await removeLink(other, removed, oldName)) changed.add(other.index)
      }
    }
    if (isNameColumn(header) && oldName && newValue && foldName(oldName) !== foldName(newValue)) {
      // Entité renommée : chaque ligne qui la citait reçoit le nouveau nom.
      for (const [end, other] of ends) {
        for (const target of splitNames(before.rows[rowNumber - 1]?.[columnOf(before.headers, end.column)] || "")) {
          if (await removeLink(other, target, oldName, newValue)) changed.add(other.index)
        }
      }
    }
    await syncRowLinks(key, tabName, rowNumber, changed)
    return [...changed]
  })
}

/** Le formulaire d'ajout : les valeurs arrivent en HTML, les cellules gardent leur mise en forme. */
export function addWorldIndexRow(key: WorldIndexKey, tabName: string, provided: string[]) {
  return serialized(async () => {
    const { sheet, table } = await tableFor(key, tabName)
    const html = table.headers.map((_, index) => String(provided[index] ?? "").slice(0, 50_000))
    const plain = html.map((value) => htmlToRichText(value).text)
    const nameColumn = columnOf(table.headers, "Nom")
    if (nameColumn >= 0 && !plain[nameColumn].trim()) throw new Error("WORLD_INDEX_NAME_REQUIRED")
    const current = await plainTable(key, tabName)
    // Une entité du même nom existe déjà (créée par un lien, par exemple) : on la
    // complète au lieu d'en créer une seconde.
    const existing = nameColumn >= 0 ? findRowByName(current, plain[nameColumn]) : -1
    let rowNumber: number
    if (existing > 0) {
      rowNumber = existing + 1
      for (const [column, value] of plain.entries()) {
        if (column === nameColumn || !value.trim()) continue
        const previous = current.rows[existing][column] || ""
        const merged = linkEndsOf(key, tabName).some(([end]) => foldName(end.column) === foldName(table.headers[column]))
          ? splitNames(`${previous}, ${value}`).join(", ")
          : value
        await writeCell(current, tabName, existing, column, merged)
      }
    } else {
      rowNumber = await writeNewRow(current, tabName, plain)
    }
    for (const [column, value] of html.entries()) {
      if (/<[a-z]/i.test(value)) await updateFormattedCell({ spreadsheetId: sheet.spreadsheetId, sheetId: table.sheetId, rowNumber, column, html: value })
    }
    const changed = new Set<WorldIndexKey>()
    await syncRowLinks(key, tabName, rowNumber, changed)
    return [...changed]
  })
}

/** La copie apparaît juste sous l'originale, mise en forme comprise. */
export function duplicateWorldIndexRows(key: WorldIndexKey, tabName: string, rowNumbers: number[]) {
  return serialized(async () => {
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
  })
}

/**
 * Du bas vers le haut : retirer une ligne décale toutes les suivantes. Avant, l'entité
 * supprimée est retirée des colonnes liées qui la citaient.
 */
export function deleteWorldIndexRows(key: WorldIndexKey, tabName: string, rowNumbers: number[]) {
  return serialized(async () => {
    const { sheet, table } = await tableFor(key, tabName)
    const before = await plainTable(key, tabName)
    const targets = [...new Set(rowNumbers)].filter((rowNumber) => table.rows.some((row) => row.rowNumber === rowNumber)).sort((left, right) => right - left)
    const deletedNames = new Set(targets.map((rowNumber) => foldName(rowName(before, rowNumber - 1))))
    for (const rowNumber of targets) {
      const name = rowName(before, rowNumber - 1)
      if (!name) continue
      for (const [end, other] of linkEndsOf(key, tabName)) {
        for (const target of splitNames(before.rows[rowNumber - 1]?.[columnOf(before.headers, end.column)] || "")) {
          // Une ligne supprimée en même temps n'a pas besoin d'être nettoyée.
          if (linkEndCovers(other, key, tabName) && deletedNames.has(foldName(target))) continue
          await removeLink(other, target, name)
        }
      }
    }
    // Les lignes ont pu bouger pendant le nettoyage : on les retrouve par leur nom.
    const fresh = await plainTable(key, tabName)
    const freshNumbers = targets.map((rowNumber) => {
      const name = rowName(before, rowNumber - 1)
      const index = name ? findRowByName(fresh, name) : rowNumber - 1
      return index > 0 ? index + 1 : rowNumber
    }).sort((left, right) => right - left)
    for (const rowNumber of freshNumbers) await deleteGoogleSheetRow(sheet.spreadsheetId, tabName, rowNumber, table.sheetId)
  })
}

/**
 * Plusieurs colonnes d'une même ligne, nommées par leur en-tête : c'est la fiche d'une
 * créature, dont la plupart des champs ne sont pas affichés dans le tableau. Seules les
 * valeurs modifiées sont écrites, pour ne pas effacer la mise en forme des autres.
 */
export function updateWorldIndexFields(key: WorldIndexKey, tabName: string, rowNumber: number, fields: Record<string, string>) {
  return serialized(async () => {
    const table = await plainTable(key, tabName)
    const rowIndex = rowNumber - 1
    if (rowIndex < 1 || !table.rows[rowIndex]?.some((value) => value.trim())) throw new Error("WORLD_INDEX_ROW_NOT_FOUND")
    const nameColumn = columnOf(table.headers, "Nom")
    const data: Array<{ range: string; values: string[][] }> = []
    const formatted: Array<{ column: number; html: string }> = []
    for (const [header, raw] of Object.entries(fields)) {
      const column = columnOf(table.headers, header)
      if (column < 0) continue
      const value = String(raw ?? "").slice(0, 50_000)
      if (column === nameColumn && !value.trim()) throw new Error("WORLD_INDEX_NAME_REQUIRED")
      if ((table.rows[rowIndex][column] ?? "") === value) continue
      // Texte enrichi : écrit avec sa mise en forme plutôt qu'avec ses balises.
      if (/<[a-z]/i.test(value)) { formatted.push({ column, html: value }); continue }
      const cell = `${columnName(column + 1)}${rowNumber}`
      data.push({ range: sheetTabRange(tabName, `${cell}:${cell}`), values: [[value]] })
    }
    if (data.length) {
      await googleSheetsJson(`spreadsheets/${table.spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "RAW", data }),
      })
      clearSpreadsheetReadCache(table.spreadsheetId)
    }
    if (formatted.length) {
      const tabs = await spreadsheetTabs(table.spreadsheetId)
      const sheetId = tabs.find((tab) => tab.title === tabName)?.sheetId
      if (sheetId === undefined) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
      for (const cell of formatted) await updateFormattedCell({ spreadsheetId: table.spreadsheetId, sheetId, rowNumber, column: cell.column, html: cell.html })
    }
    return data.length + formatted.length
  })
}

/**
 * Déplace des lignes vers un autre onglet du même index (un lieu créé par un lien
 * arrive dans le premier onglet, on le range ensuite). Les colonnes sont recopiées
 * par leur nom, la ligne d'origine est ensuite retirée. Les liens suivent d'eux-mêmes :
 * ils désignent une entité par son nom, quel que soit son onglet.
 */
export function moveWorldIndexRows(key: WorldIndexKey, fromTab: string, toTab: string, rowNumbers: number[]) {
  return serialized(async () => {
    if (fromTab === toTab) return
    tabDefinition(key, toTab)
    const source = await plainTable(key, fromTab)
    const target = await plainTable(key, toTab)
    const moved: number[] = []
    for (const rowNumber of [...new Set(rowNumbers)].sort((left, right) => left - right)) {
      const row = source.rows[rowNumber - 1]
      if (rowNumber < 2 || !row?.some((value) => value.trim())) continue
      const values = target.headers.map((header) => {
        const column = columnOf(source.headers, header)
        return column >= 0 ? row[column] ?? "" : ""
      })
      await writeNewRow(target, toTab, values)
      moved.push(rowNumber)
    }
    const { sheet, table } = await tableFor(key, fromTab)
    for (const rowNumber of moved.sort((left, right) => right - left)) await deleteGoogleSheetRow(sheet.spreadsheetId, fromTab, rowNumber, table.sheetId)
  })
}
