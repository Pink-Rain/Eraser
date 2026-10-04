// Un Drive et un Sheets en mémoire pour tester le regroupement des index d'objets
// sans toucher à un vrai classeur. Seul ce dont le regroupement a besoin est imité.
type Tab = { sheetId: number; title: string; hidden: boolean; grid: string[][]; columnCount: number }
type Sheet = { id: string; name: string; parent: string; kind: "sheet" | "folder" | "shortcut"; target?: string; tabs: Tab[] }

export const world = { files: new Map<string, Sheet>(), nextId: 1, nextSheet: 1000, views: [] as Array<{ index: string; source: string }>, failCopyOf: "", corruptCopyOf: "", failMove: null as ((fileId: string, toFolderId: string) => boolean) | null, failViews: false }

export function reset() {
  world.files.clear(); world.nextId = 1; world.nextSheet = 1000; world.views = []; world.failCopyOf = ""; world.corruptCopyOf = ""; world.failMove = null; world.failViews = false
}

export function addSpreadsheet(id: string, name: string, parent: string, tabs: Array<{ sheetId: number; title: string; grid: string[][] }>) {
  world.files.set(id, { id, name, parent, kind: "sheet", tabs: tabs.map((tab) => ({ ...tab, hidden: false, columnCount: Math.max(5, ...tab.grid.map((row) => row.length)) })) })
}
export function addFolder(id: string, name: string, parent = "root") {
  world.files.set(id, { id, name, parent, kind: "folder", tabs: [] })
}

function sheet(id: string) {
  const found = world.files.get(id)
  if (!found || found.kind !== "sheet") throw new Error(`NO_SHEET:${id}`)
  return found
}

// ---------- google-drive ----------
export async function findDriveFolderByName(name: string) {
  const folder = [...world.files.values()].find((file) => file.kind === "folder" && file.name === name)
  return folder ? { id: folder.id, name: folder.name, mimeType: "application/vnd.google-apps.folder" } : null
}
export async function findGoogleSpreadsheetByName(name: string) {
  const found = [...world.files.values()].find((file) => file.kind === "sheet" && file.name === name)
  return found ? { id: found.id, name: found.name } : null
}
export async function createGoogleSpreadsheet(name: string, folderId?: string) {
  const id = `nouveau${world.nextId++}`
  world.files.set(id, { id, name, parent: folderId ?? "root", kind: "sheet", tabs: [{ sheetId: 0, title: "Feuille 1", hidden: false, grid: [], columnCount: 26 }] })
  return { id, name, mimeType: "application/vnd.google-apps.spreadsheet", webViewLink: `https://sheets/${id}` }
}
export async function ensureDriveSubfolder(parentId: string, name: string) {
  const found = [...world.files.values()].find((file) => file.kind === "folder" && file.parent === parentId && file.name === name)
  if (found) return found.id
  const id = `dossier${world.nextId++}`
  addFolder(id, name, parentId)
  return id
}
export async function listDriveFolderFiles(folderId: string) {
  return [...world.files.values()].filter((file) => file.parent === folderId).map((file) => file.kind === "shortcut"
    ? { id: file.id, name: file.name, mimeType: "application/vnd.google-apps.shortcut", shortcutDetails: { targetId: file.target as string, targetMimeType: "application/vnd.google-apps.spreadsheet" } }
    : { id: file.id, name: file.name, mimeType: file.kind === "folder" ? "application/vnd.google-apps.folder" : "application/vnd.google-apps.spreadsheet", webViewLink: `https://sheets/${file.id}` })
}
export async function moveDriveFile(fileId: string, toFolderId: string, fromFolderId: string) {
  if (world.failMove?.(fileId, toFolderId)) throw new Error(`MOVE_FAILED:${fileId}`)
  const file = world.files.get(fileId)
  if (!file || file.parent !== fromFolderId) throw new Error(`MOVE_FROM_WRONG_FOLDER:${fileId}`)
  file.parent = toFolderId
  return { id: fileId }
}
export async function renameDriveFile(fileId: string, name: string) {
  const file = world.files.get(fileId)
  if (!file) throw new Error("NO_FILE")
  file.name = name
  return { id: fileId, name }
}

// ---------- google-sheets ----------
export function columnName(columnCount: number) {
  let name = ""; let value = columnCount
  while (value > 0) { const rest = (value - 1) % 26; name = String.fromCharCode(65 + rest) + name; value = Math.floor((value - 1) / 26) }
  return name
}
export function sheetTabRange(tabName: string, cells: string) {
  return `'${tabName.replace(/'/g, "''")}'!${cells}`
}
function columnIndex(letters: string) {
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1
}
function parse(range: string) {
  const match = range.match(/^'(.*)'!([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/)
  if (!match) throw new Error(`BAD_RANGE:${range}`)
  return { tab: match[1].replace(/''/g, "'"), c1: columnIndex(match[2]), r1: Number(match[3] || 1) - 1, c2: match[4] ? columnIndex(match[4]) : columnIndex(match[2]), r2: match[5] ? Number(match[5]) - 1 : match[4] ? Infinity : Number(match[3] || 1) - 1 }
}
function tabOf(spreadsheetId: string, title: string) {
  const tab = sheet(spreadsheetId).tabs.find((candidate) => candidate.title === title)
  if (!tab) throw new Error(`NO_TAB:${title}`)
  return tab
}
export async function spreadsheetTabs(spreadsheetId: string) {
  return sheet(spreadsheetId).tabs.map((tab) => ({ sheetId: tab.sheetId, title: tab.title }))
}
export async function readRange(spreadsheetId: string, range: string) {
  const { tab, c1, r1, c2, r2 } = parse(range)
  const grid = tabOf(spreadsheetId, tab).grid
  const rows: string[][] = []
  for (let row = r1; row <= Math.min(r2, grid.length - 1); row += 1) rows.push((grid[row] ?? []).slice(c1, c2 + 1))
  while (rows.length && !rows[rows.length - 1].some((value) => value)) rows.pop()
  return rows
}
function write(spreadsheetId: string, range: string, values: string[][]) {
  const { tab, c1, r1 } = parse(range)
  const target = tabOf(spreadsheetId, tab)
  values.forEach((row, rowOffset) => row.forEach((value, columnOffset) => {
    const column = c1 + columnOffset
    if (column >= target.columnCount) throw new Error(`EXCEEDS_GRID:${range}`)
    const line = target.grid[r1 + rowOffset] ||= []
    line[column] = value
  }))
}
export async function updateRange(spreadsheetId: string, range: string, values: string[][]) { write(spreadsheetId, range, values) }
export async function updateRanges(spreadsheetId: string, data: Array<{ range: string; values: string[][] }>) { for (const item of data) write(spreadsheetId, item.range, item.values) }
export function clearSpreadsheetReadCache() {}
export function clearObjectIndexTableCache() {}

export async function googleSheetsJson(path: string, init?: { body?: string }) {
  const body = init?.body ? JSON.parse(init.body) : {}
  const copy = path.match(/^spreadsheets\/([^/]+)\/sheets\/(\d+):copyTo$/)
  if (copy) {
    if (world.failCopyOf === `${copy[1]}:${copy[2]}`) throw new Error("COPY_FAILED")
    const source = sheet(copy[1]).tabs.find((tab) => tab.sheetId === Number(copy[2]))
    if (!source) throw new Error("NO_SOURCE_TAB")
    const destination = sheet(body.destinationSpreadsheetId)
    const created = { sheetId: world.nextSheet++, title: `Copie de ${source.title}`, hidden: false, grid: source.grid.map((row) => [...row]), columnCount: source.columnCount }
    // Une formule qui pointait vers un autre onglet casse à la copie (« #REF! »).
    if (world.corruptCopyOf === `${copy[1]}:${copy[2]}`) created.grid[1][1] = "#REF!"
    destination.tabs.push(created)
    return { sheetId: created.sheetId, title: created.title, gridProperties: { columnCount: created.columnCount } }
  }
  const batch = path.match(/^spreadsheets\/([^/]+):batchUpdate$/)
  if (batch) {
    const target = sheet(batch[1])
    for (const request of body.requests) {
      if (request.updateSheetProperties) {
        const tab = target.tabs.find((candidate) => candidate.sheetId === request.updateSheetProperties.properties.sheetId)
        if (!tab) throw new Error("NO_TAB")
        if (target.tabs.some((other) => other !== tab && other.title === request.updateSheetProperties.properties.title)) throw new Error("DUPLICATE_TITLE")
        tab.title = request.updateSheetProperties.properties.title
      } else if (request.deleteSheet) {
        target.tabs = target.tabs.filter((tab) => tab.sheetId !== request.deleteSheet.sheetId)
        if (!target.tabs.length) throw new Error("LAST_SHEET")
      } else if (request.appendDimension) {
        const tab = target.tabs.find((candidate) => candidate.sheetId === request.appendDimension.sheetId)
        if (tab) tab.columnCount += request.appendDimension.length
      } else if (request.addSheet) {
        const properties = request.addSheet.properties
        target.tabs.push({ sheetId: world.nextSheet++, title: properties.title, hidden: Boolean(properties.hidden), grid: [], columnCount: properties.gridProperties?.columnCount ?? 26 })
      } else throw new Error(`UNKNOWN_REQUEST:${Object.keys(request)[0]}`)
    }
    return { replies: [] }
  }
  throw new Error(`UNKNOWN_PATH:${path}`)
}

type Table = { fileId: string; fileName: string; webViewLink: string; sheetId: number; tabName: string; headers: string[]; rows: Array<{ rowNumber: number; values: string[]; html: string[] }> }

export async function readObjectIndexSpreadsheet(file: { id: string; name: string }): Promise<Table[]> {
  return sheet(file.id).tabs.filter((tab) => !tab.title.startsWith("Eraser ·")).map((tab) => {
    const width = Math.max(1, ...tab.grid.map((row) => row.length))
    const headers = Array.from({ length: width }, (_, index) => tab.grid[0]?.[index]?.trim() || `Colonne ${index + 1}`)
    return {
      fileId: file.id, fileName: file.name, webViewLink: "", sheetId: tab.sheetId, tabName: tab.title, headers,
      rows: tab.grid.slice(1).flatMap((row, index) => row.some((value) => value?.trim()) ? [{ rowNumber: index + 2, values: headers.map((_, column) => row[column] ?? ""), html: headers.map((_, column) => row[column] ?? "") }] : []),
    }
  })
}
export async function objectIndexTablesForRegroup() {
  const entries = await listDriveFolderFiles("objets")
  const tables = await Promise.all(entries.filter((entry) => entry.mimeType !== "application/vnd.google-apps.folder").map((entry) => readObjectIndexSpreadsheet({ id: "shortcutDetails" in entry && entry.shortcutDetails ? entry.shortcutDetails.targetId : entry.id, name: entry.name })))
  return tables.flat()
}
export function objectIndexRowName(table: Table, row: { values: string[] }) {
  const column = table.headers.findIndex((header) => /^nom$/i.test(header))
  return column >= 0 ? row.values[column] ?? "" : ""
}

// ---------- index-schema ----------
export async function readRawSchemaRows(spreadsheetId: string) {
  const tab = sheet(spreadsheetId).tabs.find((candidate) => candidate.title === "Eraser · colonnes")
  return tab ? tab.grid.slice(1).filter((row) => row[0]?.trim()) : []
}
export async function appendRawSchemaRows(spreadsheetId: string, rows: string[][]) {
  if (!rows.length) return
  const target = sheet(spreadsheetId)
  let tab = target.tabs.find((candidate) => candidate.title === "Eraser · colonnes")
  if (!tab) { tab = { sheetId: world.nextSheet++, title: "Eraser · colonnes", hidden: true, grid: [["Onglet", "Colonne", "Nom d’origine", "Type et réglages (JSON)", "État", "Supprimé le"]], columnCount: 6 }; target.tabs.push(tab) }
  tab.grid.push(...rows.map((row) => [...row]))
}

// ---------- index-settings ----------
export async function remapIndexViewSources(index: string, mapping: Map<string, string>) {
  if (world.failViews) throw new Error("VIEWS_FAILED")
  let count = 0
  for (const view of world.views) if (view.index === index && mapping.has(view.source)) { view.source = mapping.get(view.source) as string; count += 1 }
  return count
}
