/**
 * Un Google Sheets en mémoire, branché à la place de lib/google-oauth : le vrai code
 * de lib/google-sheets.ts lui envoie ses requêtes REST (lecture de plages, écritures,
 * ajouts de lignes, métadonnées) et les tests regardent ce qui a été écrit, case par
 * case. Drive répond pour les fichiers de `world.drive` (recherche, lecture, mise à la
 * corbeille) ; sans eux, comme Apps Script, il répond « introuvable ».
 */

type Tab = { sheetId: number; title: string; grid: string[][]; columnCount: number; rowCount: number }
type Spreadsheet = { tabs: Tab[] }
/** Un fichier du Drive, pour les recherches par nom, type et dossier (files.list), la lecture et la corbeille. */
type DriveEntry = { id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean }
type ReadFailure = { match: string; status: number; times: number }
type RequestHook = (url: string, init: RequestInit) => Promise<void> | void

export const world = {
  files: new Map<string, Spreadsheet>(), requests: [] as string[], reverseFilteredReads: false,
  /** Les valeurs typées reçues par updateCells (formule, nombre, texte…), ligne par ligne. */
  enteredCells: [] as unknown[][],
  /** Chaque requête, adresse complète (paramètres compris) et corps. */
  calls: [] as Array<{ method: string; url: string; body: unknown }>,
  /** Vide : le Drive répond « introuvable », comme avant. */
  drive: [] as DriveEntry[],
  /** Onglets dont la lecture des valeurs échoue (Google refuse). */
  failTabs: [] as string[],
  /** Si un test le donne : le résultat affiché d'une formule, rendu par les lectures de valeurs sauf en `FORMULA` (comme Google). */
  formulaResults: null as ((formula: string) => string) | null,
  /** Pannes passagères des lectures (voir `failReads`). */
  failures: [] as ReadFailure[],
  /** Appelé (et attendu) avant chaque requête, pour glisser une écriture d'ailleurs entre deux. */
  beforeRequest: null as RequestHook | null,
  /** Jetons oubliés après un refus 401 de Google. */
  forgottenTokens: 0,
}

export function reset() {
  world.files.clear()
  world.requests.length = 0
  world.reverseFilteredReads = false
  world.enteredCells.length = 0
  world.calls.length = 0
  world.drive.length = 0
  world.failTabs.length = 0
  world.formulaResults = null
  world.failures.length = 0
  world.beforeRequest = null
  world.forgottenTokens = 0
}

/** Un classeur ; avec `name`, il est aussi dans le Drive (retrouvé par son nom, mis à la corbeille). */
export function addSpreadsheet(id: string, tabs: Array<{ title: string; grid: string[][] }>, options: { name?: string } = {}) {
  world.files.set(id, {
    tabs: tabs.map((tab, index) => ({ sheetId: index + 1, title: tab.title, grid: tab.grid.map((row) => row.map(String)), columnCount: Math.max(26, ...tab.grid.map((row) => row.length)), rowCount: 1000 })),
  })
  if (options.name) world.drive.push({ id, name: options.name, mimeType: SPREADSHEET_MIME_TYPE })
}

/**
 * Une panne de Google : les lectures d'une plage qui contient `match` échouent, `times` fois
 * (sans fin par défaut). Renvoie de quoi la faire cesser.
 */
export function failReads(match: string, options: { status?: number; times?: number } = {}) {
  const failure = { match, status: options.status ?? 503, times: options.times ?? Infinity }
  world.failures.push(failure)
  return () => { const at = world.failures.indexOf(failure); if (at >= 0) world.failures.splice(at, 1) }
}

function failedRead(ranges: string[]) {
  const failure = world.failures.find((candidate) => candidate.times > 0 && ranges.some((range) => decodeURIComponent(range).includes(candidate.match)))
  if (!failure) return null
  failure.times -= 1
  return json({ error: { message: "FAKE_BACKEND_ERROR" } }, failure.status)
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

function readArea(area: Area, render?: string | null) {
  const { tab } = area
  const bottom = Math.min(area.bottom, tab.grid.length - 1)
  const values: string[][] = []
  const shown = (cell: string) => world.formulaResults && render !== "FORMULA" && cell.startsWith("=") ? world.formulaResults(cell) : cell
  for (let row = area.top; row <= bottom; row += 1) {
    const source = tab.grid[row] ?? []
    const right = Math.min(area.right, source.length - 1)
    const line: string[] = []
    for (let column = area.left; column <= right; column += 1) line.push(shown(source[column] ?? ""))
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
  world.calls.push({ method, url: decodeURIComponent(url.href), body })

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
      } else if (request.moveDimension?.source?.dimension === "COLUMNS") {
        // Comme Google : la destination est comptée avant que les colonnes déplacées soient retirées.
        const { sheetId, startIndex, endIndex } = request.moveDimension.source
        const to = request.moveDimension.destinationIndex
        const tab = file.tabs.find((candidate) => candidate.sheetId === sheetId)!
        for (const row of tab.grid) {
          while (row.length < Math.max(endIndex, to)) row.push("")
          const moved = row.splice(startIndex, endIndex - startIndex)
          row.splice(to > startIndex ? to - moved.length : to, 0, ...moved)
        }
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
      } else if (request.updateSheetProperties?.fields === "title") {
        const tab = file.tabs.find((candidate) => candidate.sheetId === request.updateSheetProperties.properties.sheetId)!
        tab.title = request.updateSheetProperties.properties.title
      } else if (request.updateSheetProperties?.properties?.gridProperties?.columnCount) {
        const tab = file.tabs.find((candidate) => candidate.sheetId === request.updateSheetProperties.properties.sheetId)!
        tab.columnCount = Math.max(tab.columnCount, request.updateSheetProperties.properties.gridProperties.columnCount)
      } else if (request.appendCells) {
        // Comme Google : après la dernière ligne qui porte une donnée, toutes colonnes confondues,
        // à partir de la colonne A.
        const tab = file.tabs.find((candidate) => candidate.sheetId === request.appendCells.sheetId)!
        let last = -1
        tab.grid.forEach((row, index) => { if (row.some((cell) => cell !== "")) last = index })
        type Entered = { stringValue?: string; numberValue?: number; boolValue?: boolean; formulaValue?: string }
        const shown = (value?: Entered) => value?.stringValue ?? value?.formulaValue ?? (value?.numberValue !== undefined ? String(value.numberValue) : value?.boolValue !== undefined ? (value.boolValue ? "TRUE" : "FALSE") : "")
        const rows = request.appendCells.rows as Array<{ values: Array<{ userEnteredValue?: Entered }> }>
        world.enteredCells.push(...rows.map((row) => row.values.map((cell) => cell.userEnteredValue)))
        tab.rowCount = Math.max(tab.rowCount, last + 1 + rows.length)
        writeArea({ tab, top: last + 1, left: 0, bottom: Infinity, right: Infinity, quoted: `'${tab.title}'` }, rows.map((row) => row.values.map((cell) => shown(cell.userEnteredValue))))
      } else if (request.updateCells) {
        const { sheetId, startRowIndex, startColumnIndex } = request.updateCells.range
        const tab = file.tabs.find((candidate) => candidate.sheetId === sheetId)!
        // Comme Google : seuls les champs nommés dans `fields` changent (une couleur seule ne vide pas la case).
        const fields = String(request.updateCells.fields ?? "userEnteredValue").split(",").map((field) => field.trim())
        if (fields.some((field) => field === "*" || field.startsWith("userEnteredValue"))) {
          // Comme une lecture FORMATTED_VALUE en anglais : 12 → « 12 », vrai → « TRUE » ; une formule reste écrite.
          type Entered = { stringValue?: string; numberValue?: number; boolValue?: boolean; formulaValue?: string }
          const shown = (value?: Entered) => value?.stringValue ?? value?.formulaValue ?? (value?.numberValue !== undefined ? String(value.numberValue) : value?.boolValue !== undefined ? (value.boolValue ? "TRUE" : "FALSE") : "")
          const rows = request.updateCells.rows as Array<{ values: Array<{ userEnteredValue?: Entered }> }>
          world.enteredCells.push(...rows.map((row) => row.values.map((cell) => cell.userEnteredValue)))
          writeArea({ tab, top: startRowIndex, left: startColumnIndex, bottom: Infinity, right: Infinity, quoted: `'${tab.title}'` }, rows.map((row) => row.values.map((cell) => shown(cell.userEnteredValue))))
        }
      }
      replies.push({})
    }
    return json({ replies })
  }
  // Une lecture (GET, ou lecture par filtres en POST) d'une plage en panne échoue.
  if (method === "GET" || rest[0] === "values:batchGetByDataFilter") {
    const failure = failedRead([...url.searchParams.getAll("ranges"), ...((body.dataFilters ?? []) as Array<{ a1Range: string }>).map((filter) => filter.a1Range), ...(rest[0] === "values" ? [rest.slice(1).join("/")] : [])])
    if (failure) return failure
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
    return json({ valueRanges: url.searchParams.getAll("ranges").map((range) => { const area = parseRange(file, range); return { range: areaName(area), values: readArea(area, url.searchParams.get("valueRenderOption")) } }) })
  }
  if (action === "batchGetByDataFilter") {
    if ((body.dataFilters as Array<{ a1Range: string }>).some((filter) => world.failTabs.includes(parseRange(file, filter.a1Range).tab.title))) return json({ error: { message: "The caller does not have permission" } }, 403)
    // Comme Google : chaque réponse rappelle le filtre qui l'a trouvée, et l'ordre des
    // réponses n'est pas garanti (`reverseFilteredReads` les rend à l'envers).
    const valueRanges = (body.dataFilters as Array<{ a1Range: string }>).map((filter) => { const area = parseRange(file, filter.a1Range); return { valueRange: { range: `${area.quoted}!${letterOf(area.left === Infinity ? 0 : area.left)}${area.top + 1}:${letterOf(Math.min(area.right, area.tab.columnCount - 1))}${Math.min(area.bottom + 1, area.tab.rowCount)}`, values: readArea(area, body.valueRenderOption) }, dataFilters: [filter] } })
    return json({ valueRanges: world.reverseFilteredReads ? valueRanges.reverse() : valueRanges })
  }
  // Comme Google en USER_ENTERED : l'apostrophe de tête force le texte et n'est pas gardée.
  const entered = (raw: boolean, values: unknown[][]) => raw ? values : values.map((line) => line.map((value) => typeof value === "string" && value.startsWith("'") ? value.slice(1) : value))
  if (action === "batchUpdate") {
    const raw = body.valueInputOption === "RAW"
    const responses = (body.data as Array<{ range: string; values: unknown[][] }>).map((item) => ({ updatedRange: writeArea(parseRange(file, item.range), entered(raw, item.values)) }))
    return json({ responses })
  }
  const rangeText = tail.join("/")
  const [rawRange, rangeAction] = rangeText.split(":append")
  const area = parseRange(file, rawRange)
  if (rangeText.includes(":append")) {
    void rangeAction
    let last = -1
    area.tab.grid.forEach((row, index) => { if (row.slice(area.left, area.right === Infinity ? undefined : area.right + 1).some((cell) => cell !== "")) last = index })
    // Comme Google : le « tableau » commence à la première case remplie de sa dernière ligne.
    // Une dernière ligne commencée en J fait écrire l'ajout en J (pions et magasins réels).
    const lastRow = last >= 0 ? area.tab.grid[last] : []
    const firstFilled = lastRow.findIndex((cell, column) => column >= area.left && cell !== "")
    const updatedRange = writeArea({ ...area, top: last + 1, left: firstFilled >= 0 ? firstFilled : area.left }, body.values)
    return json({ updates: { updatedRange, updatedRows: body.values.length } })
  }
  if (method === "PUT") {
    const updatedRange = writeArea(area, entered(url.searchParams.get("valueInputOption") === "RAW", body.values))
    return json({ updatedRange, updatedData: { range: updatedRange, values: readArea({ ...area, bottom: area.top + body.values.length - 1 }) } })
  }
  if (world.failTabs.includes(area.tab.title)) return json({ error: { message: "The caller does not have permission" } }, 403)
  return json({ range: areaName(area), values: readArea(area, url.searchParams.get("valueRenderOption")) })
}

const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet"

/** Les fichiers du Drive qui répondent à une recherche : nom exact, types, dossier parent, hors corbeille. */
function handleDriveList(url: URL) {
  const query = url.searchParams.get("q") ?? ""
  const name = /name = '((?:[^'\\]|\\.)*)'/.exec(query)?.[1]?.replace(/\\(.)/g, "$1")
  const mimeTypes = [...query.matchAll(/mimeType = '([^']+)'/g)].map((match) => match[1])
  const parent = /'([^']+)' in parents/.exec(query)?.[1]
  const live = query.includes("trashed = false")
  const files = world.drive.filter((file) => (name === undefined || file.name === name) && (!mimeTypes.length || mimeTypes.includes(file.mimeType)) && (!parent || (file.parents ?? []).includes(parent)) && !(live && file.trashed))
  return json({ files: files.map((file) => ({ ...file, webViewLink: `https://docs.google.com/spreadsheets/d/${file.id}/edit` })) })
}

/** Un fichier du Drive par son ID : lu (nom, type, corbeille) ou mis à la corbeille. Rien ne se crée ni ne se télécharge. */
function handleDriveFile(url: URL, init: RequestInit) {
  const method = (init.method ?? "GET").toUpperCase()
  const id = decodeURIComponent(url.pathname.slice("/drive/v3/files/".length))
  const file = world.drive.find((candidate) => candidate.id === id)
  if (!file || url.searchParams.get("alt") === "media") return json({ error: { message: "File not found." } }, 404)
  world.requests.push(`DRIVE ${method} ${id}`)
  if (method === "PATCH" && JSON.parse(String(init.body ?? "{}")).trashed) file.trashed = true
  return json({ id: file.id, name: file.name, mimeType: file.mimeType, trashed: Boolean(file.trashed) })
}

export async function googleOAuthAuthorizedFetch(url: string, init: RequestInit = {}) {
  const hook = world.beforeRequest
  if (hook) await hook(url, init)
  if (url.startsWith("https://sheets.googleapis.com/v4/")) return handleSheets(url.slice("https://sheets.googleapis.com/v4/".length), init)
  if (world.drive.length && url.startsWith("https://www.googleapis.com/drive/v3/files?")) return handleDriveList(new URL(url))
  if (world.drive.length && url.startsWith("https://www.googleapis.com/drive/v3/files/")) return handleDriveFile(new URL(url), init)
  return json({ error: { message: "FAKE_NOT_FOUND" } }, 404)
}

export async function warmGoogleOAuthAccessToken() {
  return undefined
}

export function forgetGoogleAccessToken() {
  world.forgottenTokens += 1
}

export async function getGoogleOAuthSettings() {
  return null
}
