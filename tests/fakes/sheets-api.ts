/**
 * Un Google Sheets en mémoire, branché à la place de lib/google-oauth : le vrai code
 * de lib/google-sheets.ts lui envoie ses requêtes REST (lecture de plages, écritures,
 * ajouts de lignes, métadonnées) et les tests regardent ce qui a été écrit, case par
 * case. Drive et Apps Script répondent « introuvable ».
 */

type Tab = { sheetId: number; title: string; grid: string[][]; columnCount: number; rowCount: number }
type Spreadsheet = { tabs: Tab[] }

export const world = { files: new Map<string, Spreadsheet>(), requests: [] as string[], reverseFilteredReads: false }

export function reset() {
  world.files.clear()
  world.requests.length = 0
  world.reverseFilteredReads = false
}

export function addSpreadsheet(id: string, tabs: Array<{ title: string; grid: string[][] }>) {
  world.files.set(id, {
    tabs: tabs.map((tab, index) => ({ sheetId: index + 1, title: tab.title, grid: tab.grid.map((row) => row.map(String)), columnCount: Math.max(26, ...tab.grid.map((row) => row.length)), rowCount: 1000 })),
  })
}

export function grid(id: string, title: string) {
  const tab = world.files.get(id)?.tabs.find((candidate) => candidate.title === title)
  if (!tab) throw new Error(`FAKE_TAB_NOT_FOUND:${id}:${title}`)
  return tab.grid
}

function letterIndex(letters: string) {
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1
}

function letterOf(index: number) {
  let current = index + 1
  let result = ""
  while (current > 0) {
    const remainder = (current - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    current = Math.floor((current - 1) / 26)
  }
  return result
}

type Area = { tab: Tab; top: number; left: number; bottom: number; right: number; quoted: string }

function parseRange(file: Spreadsheet, raw: string): Area {
  const range = decodeURIComponent(raw)
  const bang = range.lastIndexOf("!")
  const tabPart = bang >= 0 ? range.slice(0, bang) : range
  const cells = bang >= 0 ? range.slice(bang + 1) : ""
  const title = tabPart.startsWith("'") ? tabPart.slice(1, -1).replace(/''/g, "'") : tabPart
  const tab = file.tabs.find((candidate) => candidate.title === title)
  if (!tab) throw Object.assign(new Error(`Unable to parse range: ${range}`), { status: 400 })
  const quoted = `'${title.replace(/'/g, "''")}'`
  if (!cells) return { tab, top: 0, left: 0, bottom: Infinity, right: Infinity, quoted }
  const [start, end = start] = cells.split(":")
  const point = (value: string, isEnd: boolean) => {
    const match = /^([A-Z]*)(\d*)$/.exec(value)
    if (!match) throw new Error(`BAD_CELL:${value}`)
    return {
      column: match[1] ? letterIndex(match[1]) : (isEnd ? Infinity : 0),
      row: match[2] ? Number(match[2]) - 1 : (isEnd ? Infinity : 0),
    }
  }
  const from = point(start, false)
  const to = point(end, true)
  return { tab, top: from.row, left: from.column, bottom: to.row, right: to.column, quoted }
}

function readArea(area: Area) {
  const { tab } = area
  const bottom = Math.min(area.bottom, tab.grid.length - 1)
  const values: string[][] = []
  for (let row = area.top; row <= bottom; row += 1) {
    const source = tab.grid[row] ?? []
    const right = Math.min(area.right, source.length - 1)
    const line: string[] = []
    for (let column = area.left; column <= right; column += 1) line.push(source[column] ?? "")
    while (line.length && line[line.length - 1] === "") line.pop()
    values.push(line)
  }
  while (values.length && !values[values.length - 1].length) values.pop()
  return values
}

function writeArea(area: Area, values: unknown[][]) {
  values.forEach((line, offset) => {
    const row = area.top + offset
    while (area.tab.grid.length <= row) area.tab.grid.push([])
    const target = area.tab.grid[row]
    line.forEach((value, column) => {
      const index = area.left + column
      if (index >= area.tab.columnCount) throw Object.assign(new Error(`Range exceeds grid limits: ${letterOf(index)}`), { status: 400 })
      while (target.length <= index) target.push("")
      target[index] = value === null || value === undefined ? "" : String(value)
    })
  })
  const width = Math.max(0, ...values.map((line) => line.length))
  return `${area.quoted}!${letterOf(area.left)}${area.top + 1}:${letterOf(area.left + Math.max(0, width - 1))}${area.top + values.length}`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function areaName(area: Area) {
  return `${area.quoted}!A1:${letterOf(area.tab.columnCount - 1)}${area.tab.rowCount}`
}

function handleSheets(path: string, init: RequestInit) {
  const url = new URL(`https://sheets.googleapis.com/v4/${path}`)
  const parts = url.pathname.replace(/^\/v4\/spreadsheets\//, "").split("/")
  const [idPart, ...rest] = parts
  const [id, idAction] = idPart.split(":")
  const file = world.files.get(id)
  if (!file) return json({ error: { message: "Requested entity was not found." } }, 404)
  const method = (init.method ?? "GET").toUpperCase()
  const body = init.body ? JSON.parse(String(init.body)) : {}
  world.requests.push(`${method} ${decodeURIComponent(url.pathname.replace(/^\/v4\/spreadsheets\/[^/]+/, ""))}${idAction ? `:${idAction}` : ""}`)

  if (!rest.length && idAction === "batchUpdate") {
    const replies: unknown[] = []
    for (const request of body.requests ?? []) {
      if (request.appendDimension) {
        const tab = file.tabs.find((candidate) => candidate.sheetId === request.appendDimension.sheetId)!
        if (request.appendDimension.dimension === "COLUMNS") tab.columnCount += request.appendDimension.length
        else tab.rowCount += request.appendDimension.length
      } else if (request.insertDimension?.range?.dimension === "ROWS") {
        const { sheetId, startIndex, endIndex } = request.insertDimension.range
        const tab = file.tabs.find((candidate) => candidate.sheetId === sheetId)!
        tab.grid.splice(startIndex, 0, ...Array.from({ length: endIndex - startIndex }, () => [] as string[]))
      } else if (request.deleteDimension?.range?.dimension === "ROWS") {
        const { sheetId, startIndex, endIndex } = request.deleteDimension.range
        const tab = file.tabs.find((candidate) => candidate.sheetId === sheetId)!
        tab.grid.splice(startIndex, endIndex - startIndex)
      } else if (request.deleteDimension?.range?.dimension === "COLUMNS") {
        const { sheetId, startIndex, endIndex } = request.deleteDimension.range
        const tab = file.tabs.find((candidate) => candidate.sheetId === sheetId)!
        for (const row of tab.grid) row.splice(startIndex, endIndex - startIndex)
        tab.columnCount -= endIndex - startIndex
      } else if (request.copyPaste) {
        const { source, destination } = request.copyPaste
        const tab = file.tabs.find((candidate) => candidate.sheetId === source.sheetId)!
        const from = source.startColumnIndex ?? 0
        for (let offset = 0; offset < source.endRowIndex - source.startRowIndex; offset += 1) {
          const line = tab.grid[source.startRowIndex + offset] ?? []
          const to = source.endColumnIndex ?? line.length
          while (tab.grid.length <= destination.startRowIndex + offset) tab.grid.push([])
          const target = tab.grid[destination.startRowIndex + offset]
          for (let column = from; column < to; column += 1) {
            while (target.length <= column) target.push("")
            target[column] = line[column] ?? ""
          }
        }
      } else if (request.addSheet) {
        const sheetId = Math.max(0, ...file.tabs.map((tab) => tab.sheetId)) + 1
        file.tabs.push({ sheetId, title: request.addSheet.properties.title, grid: [], columnCount: request.addSheet.properties.gridProperties?.columnCount ?? 26, rowCount: 1000 })
        replies.push({ addSheet: { properties: { sheetId } } })
        continue
      } else if (request.updateSheetProperties?.properties?.gridProperties?.columnCount) {
        const tab = file.tabs.find((candidate) => candidate.sheetId === request.updateSheetProperties.properties.sheetId)!
        tab.columnCount = Math.max(tab.columnCount, request.updateSheetProperties.properties.gridProperties.columnCount)
      } else if (request.updateCells) {
        const { sheetId, startRowIndex, startColumnIndex } = request.updateCells.range
        const tab = file.tabs.find((candidate) => candidate.sheetId === sheetId)!
        const values = (request.updateCells.rows as Array<{ values: Array<{ userEnteredValue?: { stringValue?: string } }> }>).map((row) => row.values.map((cell) => cell.userEnteredValue?.stringValue ?? ""))
        writeArea({ tab, top: startRowIndex, left: startColumnIndex, bottom: Infinity, right: Infinity, quoted: `'${tab.title}'` }, values)
      }
      replies.push({})
    }
    return json({ replies })
  }
  if (!rest.length && url.searchParams.get("includeGridData") === "true") {
    // Les cellules mises en forme (le tableau des index) : une zone par plage demandée.
    const blocks = new Map<Tab, Array<{ startRow: number; startColumn: number; rowData: Array<{ values: Array<{ formattedValue: string }> }> }>>()
    for (const range of url.searchParams.getAll("ranges")) {
      const area = parseRange(file, range)
      const values = readArea(area)
      const list = blocks.get(area.tab) ?? []
      list.push({ startRow: area.top, startColumn: area.left, rowData: values.map((line) => ({ values: line.map((value) => ({ formattedValue: value })) })) })
      blocks.set(area.tab, list)
    }
    return json({ sheets: [...blocks].map(([tab, data]) => ({ properties: { sheetId: tab.sheetId, title: tab.title }, data })) })
  }
  if (!rest.length) {
    return json({ sheets: file.tabs.map((tab) => ({ properties: { sheetId: tab.sheetId, title: tab.title, gridProperties: { rowCount: tab.rowCount, columnCount: tab.columnCount } } })) })
  }
  const [kind, ...tail] = rest
  if (kind !== "values" && !kind.startsWith("values:")) return json({ error: { message: `FAKE_UNSUPPORTED:${path}` } }, 400)
  const action = kind.includes(":") ? kind.split(":")[1] : ""
  if (action === "batchGet") {
    return json({ valueRanges: url.searchParams.getAll("ranges").map((range) => { const area = parseRange(file, range); return { range: areaName(area), values: readArea(area) } }) })
  }
  if (action === "batchGetByDataFilter") {
    // Comme Google : chaque réponse rappelle le filtre qui l'a trouvée, et l'ordre des
    // réponses n'est pas garanti (`reverseFilteredReads` les rend à l'envers).
    const valueRanges = (body.dataFilters as Array<{ a1Range: string }>).map((filter) => { const area = parseRange(file, filter.a1Range); return { valueRange: { range: `${area.quoted}!${letterOf(area.left === Infinity ? 0 : area.left)}${area.top + 1}:${letterOf(Math.min(area.right, area.tab.columnCount - 1))}${Math.min(area.bottom + 1, area.tab.rowCount)}`, values: readArea(area) }, dataFilters: [filter] } })
    return json({ valueRanges: world.reverseFilteredReads ? valueRanges.reverse() : valueRanges })
  }
  if (action === "batchUpdate") {
    const responses = (body.data as Array<{ range: string; values: unknown[][] }>).map((item) => ({ updatedRange: writeArea(parseRange(file, item.range), item.values) }))
    return json({ responses })
  }
  const rangeText = tail.join("/")
  const [rawRange, rangeAction] = rangeText.split(":append")
  const area = parseRange(file, rawRange)
  if (rangeText.includes(":append")) {
    void rangeAction
    let last = -1
    area.tab.grid.forEach((row, index) => { if (row.slice(area.left, area.right === Infinity ? undefined : area.right + 1).some((cell) => cell !== "")) last = index })
    const updatedRange = writeArea({ ...area, top: last + 1 }, body.values)
    return json({ updates: { updatedRange, updatedRows: body.values.length } })
  }
  if (method === "PUT") {
    const updatedRange = writeArea(area, body.values)
    return json({ updatedRange, updatedData: { range: updatedRange, values: readArea({ ...area, bottom: area.top + body.values.length - 1 }) } })
  }
  return json({ range: areaName(area), values: readArea(area) })
}

export async function googleOAuthAuthorizedFetch(url: string, init: RequestInit = {}) {
  if (url.startsWith("https://sheets.googleapis.com/v4/")) return handleSheets(url.slice("https://sheets.googleapis.com/v4/".length), init)
  return json({ error: { message: "FAKE_NOT_FOUND" } }, 404)
}

export async function warmGoogleOAuthAccessToken() {
  return undefined
}

export async function getGoogleOAuthSettings() {
  return null
}
