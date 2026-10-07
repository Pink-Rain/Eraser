import {
  findDriveFolderByName,
  findGoogleSpreadsheetByName,
  listDriveFolderFiles,
  type DriveFile,
} from "@/lib/google-drive"
import {
  appendRows,
  clearSpreadsheetReadCache,
  ensureJdrSheet,
  ensureSheetColumnCount,
  googleSheetsJson,
  spreadsheetTabs,
  listClasses,
  readFormattedSheet,
  readNamedColumns,
  readRange,
  readRangeFreshWithOffset,
  resolveJdrSheet,
  sheetTabRange,
  updateFormattedCell,
  updateRange,
  updateRanges,
  updateRowCells,
  type ClassRecord,
  type RowCellWrite,
  type FormattedSheetCell,
} from "@/lib/google-sheets"
import { runtimeEnv } from "@/lib/google-service-account"
import { characterClassChoicesIndex, characterSheetHeaders, characterValueHeaders } from "@/lib/character-sheet-schema"
import { characterSheetAliases } from "@/lib/character-sheet-map"
import { normalizeClassLabel } from "@/lib/class-utils"
import { staleWhileRevalidate } from "@/lib/stale-cache"
import {
  classSpellActionKind,
  classSpellCategory,
  classSpellCategoryTones,
  findClassSpellSimilarities,
  MAX_CLASS_SPELLS_PER_RANK,
  remapSpellChoiceIds,
  splitClassSpellSkills,
  UNNAMED_CLASS_SPELL,
} from "@/lib/class-spell-utils"

export type ClassSpecialty = {
  index: number
  title: string
  titleHtml: string
  text: string
  textHtml: string
  titleColumn: number | null
  textColumn: number | null
}

export type EditableClassList = {
  values: string[]
  raw: string
  column: number | null
  entries: Array<{ value: string; html: string; column: number }>
}

export type ClassPresentation = {
  rowNumber: number
  classId: string
  className: string
  specialties: ClassSpecialty[]
  primaryCharacteristics: EditableClassList
  secondaryCharacteristics: EditableClassList
  /** Les en-têtes de l'onglet : une modification désigne sa colonne par son en-tête, pas par sa place. */
  headers: string[]
}

export type ClassSpellCategory = "bonus" | "passif" | "actif"

export type ClassSpell = {
  rowNumber: number
  id: string
  name: string
  effect: string
  effectHtml: string
  description: string
  descriptionHtml: string
  type: string
  category: ClassSpellCategory
  actionKind: string
  skills: string[]
  skillsRaw: string
  distance: string
  distanceHtml: string
  charges: number | null
  /** Texte brut de la cellule Charges (« 3 », « ✦ », vide) : pour les statistiques. */
  chargesLabel?: string
  classRanks: Record<string, number>
  tone: { background: string; foreground: string }
}

export type ClassSupplementTable = {
  title: string
  headers: string[]
  rows: Array<{ rowNumber: number; values: string[] }>
}

export type ClassContent = {
  characterClass: ClassRecord
  presentation: ClassPresentation | null
  spells: ClassSpell[]
  supplements: ClassSupplementTable[]
  /** Bonus gagnés à chaque rang, communs à toutes les classes. */
  rankBonuses: RankBonus[]
}

export type SpellSimilarity = {
  leftId: string
  rightId: string
  kind: "Doublon exact" | "Même description" | "Même nom" | "Très proche"
  score: number
}

type ClassWorkbookFile = DriveFile & { mimeType: "application/vnd.google-apps.spreadsheet" }

type SpellColumns = {
  id: number
  name: number
  effect: number
  description: number
  type: number
  skills: number
  distance: number
  charges: number
}

type SpellWorkbook = {
  file: ClassWorkbookFile
  sheetId: number
  headers: string[]
  rows: string[][]
  /** Mise en forme de chaque cellule. Absente quand seules les valeurs ont été lues. */
  cells?: FormattedSheetCell[][]
  columns: SpellColumns
  classes: ClassRecord[]
  classColumns: Array<{ classId: string; column: number }>
  tabName: string
}

const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet"
const PRESENTATION_TAB = "Présentation"
const SPELLS_TAB = "Sorts"
const CARDS_TAB = "Cartes"

let workbookFilesCache: { expiresAt: number; presentation: ClassWorkbookFile | null; spells: ClassWorkbookFile | null } | null = null

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLocaleLowerCase("fr")
}

function quoteTab(tabName: string) {
  return `'${tabName.replace(/'/g, "''")}'`
}

function columnName(columnCount: number) {
  let value = columnCount
  let result = ""
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

function spreadsheetFromDriveFile(file: DriveFile): ClassWorkbookFile | null {
  if (file.mimeType === SPREADSHEET_MIME_TYPE) return file as ClassWorkbookFile
  if (file.mimeType === "application/vnd.google-apps.shortcut" && file.shortcutDetails?.targetMimeType === SPREADSHEET_MIME_TYPE) {
    return { ...file, id: file.shortcutDetails.targetId, mimeType: SPREADSHEET_MIME_TYPE }
  }
  return null
}

async function classWorkbookFiles(refresh = false) {
  if (!refresh && workbookFilesCache && workbookFilesCache.expiresAt > Date.now()) return workbookFilesCache
  const folder = await findDriveFolderByName("Classe")
  const files = folder ? (await listDriveFolderFiles(folder.id)).flatMap((file) => spreadsheetFromDriveFile(file) ?? []) : []
  const presentation = files.find((file) => {
    const label = normalize(file.name)
    return label.includes("presentation") && label.includes("classe")
  }) ?? await findGoogleSpreadsheetByName("Présentation des classes") as ClassWorkbookFile | null
    ?? await findGoogleSpreadsheetByName("Présentation de la classe") as ClassWorkbookFile | null
  const spells = files.find((file) => {
    const label = normalize(file.name)
    return (label.includes("sort") || label.includes("spell")) && label.includes("classe")
  }) ?? await findGoogleSpreadsheetByName("Sorts de classe") as ClassWorkbookFile | null
    ?? await findGoogleSpreadsheetByName("Sort de classe") as ClassWorkbookFile | null
  // Les classeurs ne changent presque jamais d'adresse : 15 minutes une fois trouvés (une
  // minute s'il en manque un, le temps qu'il soit créé ou relié).
  workbookFilesCache = { expiresAt: Date.now() + (presentation && spells ? 15 * 60_000 : 60_000), presentation, spells }
  return workbookFilesCache
}

function findColumn(headers: string[], aliases: string[], looseWords: string[] = []) {
  const expected = new Set(aliases.map(normalize))
  const exact = headers.findIndex((header) => expected.has(normalize(header)))
  if (exact >= 0) return exact
  return looseWords.length ? headers.findIndex((header) => looseWords.every((word) => normalize(header).includes(normalize(word)))) : -1
}

async function presentationTable(refresh = false) {
  const { presentation } = await classWorkbookFiles(refresh)
  if (!presentation) throw new Error("CLASS_PRESENTATION_SHEET_NOT_FOUND")
  const sheet = await readFormattedSheet(presentation.id, [PRESENTATION_TAB, "présentation", "Presentation"])
  const values = sheet.rows.map((row) => row.map((cell) => cell?.value || ""))
  return { file: presentation, sheetId: sheet.sheetId, tabName: sheet.tabName, headers: values[0] ?? [], rows: values.slice(1), cells: sheet.rows.slice(1) }
}

async function readFirstTab(spreadsheetId: string, candidates: string[], cells: string) {
  let lastError: unknown = null
  for (const tabName of candidates) {
    try {
      return { tabName, values: await readRange(spreadsheetId, `${quoteTab(tabName)}!${cells}`, "FORMULA") }
    } catch (error) { lastError = error }
  }
  throw lastError instanceof Error ? lastError : new Error("SHEET_TAB_NOT_FOUND")
}

function formattedCell(cells: FormattedSheetCell[], column: number | null) {
  if (column === null || column < 0) return { value: "", html: "", backgroundColor: "", foregroundColor: "" }
  return cells[column] ?? { value: "", html: "", backgroundColor: "", foregroundColor: "" }
}

function parsePresentationRow(headers: string[], row: string[], cells: FormattedSheetCell[], rowNumber: number, classes: ClassRecord[]): ClassPresentation | null {
  const idColumn = findColumn(headers, ["ID", "ID classe", "ID de la classe"], ["id", "classe"])
  const nameColumn = findColumn(headers, ["Classe", "Classes", "Nom", "Nom de la classe", "Liste des classes", "Listes des classes"], ["nom", "classe"])
  const rawId = idColumn >= 0 ? row[idColumn] || "" : ""
  const rawName = nameColumn >= 0 ? row[nameColumn] || "" : row[0] || ""
  const characterClass = classes.find((item) => item.id === rawId || normalizeClassLabel(item.name) === normalizeClassLabel(rawName))
  if (!characterClass) return null

  const specialtyColumns = new Map<number, { titleColumn: number | null; textColumn: number | null }>()
  headers.forEach((header, column) => {
    const label = normalize(header)
    if (!label.includes("specialite")) return
    const index = Number.parseInt(label.match(/\b(\d+)\b/)?.[1] || "1", 10)
    const current = specialtyColumns.get(index) ?? { titleColumn: null, textColumn: null }
    if (/\b(texte|description|contenu|explication)\b/.test(label)) current.textColumn = column
    else current.titleColumn = column
    specialtyColumns.set(index, current)
  })
  const specialties = [...specialtyColumns.entries()].sort(([left], [right]) => left - right).flatMap(([index, columns]) => {
    const title = columns.titleColumn === null ? "" : row[columns.titleColumn] || ""
    const text = columns.textColumn === null ? "" : row[columns.textColumn] || ""
    return title || text ? [{
      index,
      title,
      titleHtml: formattedCell(cells, columns.titleColumn).html,
      text,
      textHtml: formattedCell(cells, columns.textColumn).html,
      ...columns,
    }] : []
  })

  function listField(predicate: (label: string) => boolean): EditableClassList {
    const columns = headers.flatMap((header, column) => predicate(normalize(header)) ? [column] : [])
    const entries = columns.map((column) => {
      const cell = formattedCell(cells, column)
      return { value: cell.value, html: cell.html || cell.value, column }
    })
    return {
      values: entries.map((entry) => entry.value).filter(Boolean),
      raw: entries.map((entry) => entry.value).filter(Boolean).join("\n"),
      column: columns[0] ?? null,
      entries,
    }
  }

  return {
    rowNumber,
    classId: characterClass.id,
    className: characterClass.name,
    specialties,
    primaryCharacteristics: listField((label) => label.includes("caracteristique") && (label.includes("principale") || label.includes("importante")) && !label.includes("secondaire")),
    secondaryCharacteristics: listField((label) => label.includes("caracteristique") && label.includes("secondaire")),
    headers,
  }
}

/** Les colonnes qu'une présentation laisse modifier : titres et textes des spécialités, caractéristiques. */
function editablePresentationColumns(presentation: ClassPresentation) {
  return new Set<number>([
    ...presentation.specialties.flatMap((item) => [item.titleColumn, item.textColumn]),
    ...presentation.primaryCharacteristics.entries.map((item) => item.column),
    ...presentation.secondaryCharacteristics.entries.map((item) => item.column),
  ].filter((column): column is number => column !== null))
}

/**
 * Les pages de classe relisaient à chaque clic les deux classeurs entiers avec leur
 * mise en forme : plusieurs secondes d'écran vide. Les lectures sont gardées en
 * mémoire (servies aussitôt, relues en arrière-plan après une minute) et oubliées
 * dès qu'Eraser modifie un sort ou une présentation.
 */
const presentationCache = staleWhileRevalidate<Awaited<ReturnType<typeof loadClassPresentations>>>({ freshMs: 60_000, maxStaleMs: 30 * 60_000 })
const spellListCache = staleWhileRevalidate<Awaited<ReturnType<typeof loadClassSpells>>>({ freshMs: 60_000, maxStaleMs: 30 * 60_000 })

/** `keepSpellTabs` : après une écriture réussie, l'onglet des sorts n'a pas changé de place. */
export function invalidateClassContentCaches(options: { keepSpellTabs?: boolean } = {}) {
  presentationCache.invalidate()
  spellListCache.invalidate()
  rankBonusCache = null
  if (!options.keepSpellTabs) spellTabs.clear()
}

export async function listClassPresentations(refresh = false) {
  return presentationCache.get("presentations", () => loadClassPresentations(refresh), { refresh })
}

async function loadClassPresentations(refresh = false) {
  const [table, classes] = await Promise.all([presentationTable(refresh), listClasses()])
  return {
    file: table.file,
    tabName: table.tabName,
    sheetId: table.sheetId,
    presentations: table.rows.flatMap((row, index) => parsePresentationRow(table.headers, row, table.cells[index] ?? [], index + 2, classes) ?? []),
  }
}

const SPELL_TAB_CANDIDATES = [SPELLS_TAB, "sorts", "Sort", "sort"]

/**
 * Deux index de sorts partagent tout ce code : « Sorts des classes » (le classeur
 * « Sorts de classe », avec une colonne par classe) et « Sorts des créatures », un
 * onglet du classeur « Index des créatures », sans classes ni rangs.
 */
export type SpellIndexKind = "classes" | "creatures"
export const CREATURE_SPELLS_TAB = "Sorts des créatures"
const CREATURE_SPELL_HEADERS = ["ID", "Nom", "Effet", "Description", "Type", "Compétences", "Distance", "Charges"]
let creatureSpellFileCache: { expiresAt: number; file: ClassWorkbookFile } | null = null

/**
 * Le classeur des créatures, relié (jamais recréé s'il existe) ; son onglet de sorts
 * est ajouté la première fois, avec ses en-têtes, sans toucher aux autres onglets.
 */
async function creatureSpellFile(refresh = false): Promise<ClassWorkbookFile> {
  if (!refresh && creatureSpellFileCache && creatureSpellFileCache.expiresAt > Date.now()) return creatureSpellFileCache.file
  const sheet = await ensureJdrSheet("creatures")
  if (!sheet) throw new Error("CREATURE_SPELLS_SHEET_NOT_FOUND")
  const tabs = await spreadsheetTabs(sheet.spreadsheetId)
  if (!tabs.some((tab) => tab.title === CREATURE_SPELLS_TAB)) {
    await googleSheetsJson(`spreadsheets/${sheet.spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CREATURE_SPELLS_TAB, gridProperties: { rowCount: 500, columnCount: CREATURE_SPELL_HEADERS.length, frozenRowCount: 1, frozenColumnCount: 2 } } } }] }),
    })
    await updateRange(sheet.spreadsheetId, `${quoteTab(CREATURE_SPELLS_TAB)}!A1:${columnName(CREATURE_SPELL_HEADERS.length)}1`, [CREATURE_SPELL_HEADERS])
    clearSpreadsheetReadCache(sheet.spreadsheetId)
  }
  const file: ClassWorkbookFile = { id: sheet.spreadsheetId, name: sheet.name, mimeType: SPREADSHEET_MIME_TYPE, webViewLink: sheet.webViewLink }
  creatureSpellFileCache = { expiresAt: Date.now() + 10 * 60_000, file }
  return file
}

async function spellSource(kind: SpellIndexKind, refresh = false) {
  if (kind === "creatures") return { file: await creatureSpellFile(refresh), candidates: [CREATURE_SPELLS_TAB], classes: [] as ClassRecord[] }
  const [{ spells: file }, classes] = await Promise.all([classWorkbookFiles(refresh), listClasses()])
  if (!file) throw new Error("CLASS_SPELLS_SHEET_NOT_FOUND")
  return { file, candidates: SPELL_TAB_CANDIDATES, classes }
}

/** Le classeur et l'onglet des sorts (des classes ou des créatures), pour le moteur des index. */
export async function spellSheetLocation(kind: SpellIndexKind) {
  const { file, candidates } = await spellSource(kind)
  const tabs = await spreadsheetTabs(file.id)
  const found = candidates.map((candidate) => tabs.find((item) => item.title === candidate)).find(Boolean)
  if (!found) throw new Error("SHEET_TAB_NOT_FOUND")
  return { spreadsheetId: file.id, tabName: found.title, webViewLink: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit` }
}

/**
 * Onglet des sorts déjà reconnu, par classeur : un enregistrement n'a pas à le rechercher.
 * Gardé dix minutes ; un onglet renommé ou recréé (lecture refusée) est recherché de nouveau.
 */
const spellTabs = new Map<string, { sheetId: number; tabName: string; expiresAt: number }>()
const SPELL_TAB_MS = 10 * 60_000

function rememberSpellTab(fileId: string, sheetId: number, tabName: string) {
  spellTabs.set(fileId, { sheetId, tabName, expiresAt: Date.now() + SPELL_TAB_MS })
}

async function spellTabOf(file: ClassWorkbookFile, candidates: string[], refresh = false) {
  const known = spellTabs.get(file.id)
  if (!refresh && known && known.expiresAt > Date.now()) return known
  const tabs = await spreadsheetTabs(file.id)
  const found = candidates.map((candidate) => tabs.find((item) => item.title === candidate)).find(Boolean)
  if (!found || found.sheetId === undefined) throw new Error("SHEET_TAB_NOT_FOUND")
  rememberSpellTab(file.id, found.sheetId, found.title)
  return spellTabs.get(file.id)!
}

/**
 * Les écritures de sorts d'Eraser passent une à une : une ligne ajoutée ou supprimée ne
 * s'intercale plus entre la relecture d'une autre écriture et cette écriture.
 */
let spellWriteQueue: Promise<unknown> = Promise.resolve()

function spellWrites<T>(task: () => Promise<T>): Promise<T> {
  const run = spellWriteQueue.then(task, task)
  spellWriteQueue = run.catch(() => undefined)
  return run.catch((error: unknown) => {
    // Une écriture refusée par Google : l'onglet a pu être renommé ou recréé.
    if (/^SHEETS_API_ERROR:400/.test(error instanceof Error ? error.message : "")) spellTabs.clear()
    throw error
  })
}

function spellColumnsOf(headers: string[], classes: ClassRecord[]) {
  const columns: SpellColumns = {
    id: findColumn(headers, ["ID", "ID sort", "ID du sort"], ["id"]),
    name: findColumn(headers, ["Nom", "Nom du sort", "Sort"], ["nom", "sort"]),
    effect: findColumn(headers, ["Effet", "Effets", "Effet du sort"], ["effet"]),
    description: findColumn(headers, ["Description", "Description du sort"], ["description"]),
    type: findColumn(headers, ["Type", "Type de sort", "Type d’action", "Type d'action"], ["type"]),
    skills: findColumn(headers, ["Compétence", "Compétences", "Compétence utilisée", "Compétences utilisées"], ["competence"]),
    distance: findColumn(headers, ["Distance", "Portée", "Portee"], ["distance"]),
    charges: findColumn(headers, ["Charge", "Charges", "Nombre de charges"], ["charge"]),
  }
  if (columns.id < 0 || columns.name < 0 || columns.type < 0) throw new Error("CLASS_SPELLS_HEADERS_INVALID")
  const classColumns = classes.flatMap((characterClass) => {
    const column = headers.findIndex((header) => header === characterClass.id || normalizeClassLabel(header) === normalizeClassLabel(characterClass.name))
    return column >= 0 ? [{ classId: characterClass.id, column }] : []
  })
  return { columns, classColumns }
}

async function spellWorkbook(refresh = false, kind: SpellIndexKind = "classes"): Promise<SpellWorkbook> {
  const { file, candidates, classes } = await spellSource(kind, refresh)
  const sheet = await readFormattedSheet(file.id, candidates)
  rememberSpellTab(file.id, sheet.sheetId, sheet.tabName)
  const values = sheet.rows.map((row) => row.map((cell) => cell?.value || ""))
  const headers = values[0] ?? []
  return { file, sheetId: sheet.sheetId, headers, rows: values.slice(1), cells: sheet.rows.slice(1), classes, ...spellColumnsOf(headers, classes), tabName: sheet.tabName }
}

/**
 * La feuille des sorts telle qu'elle est maintenant dans Google, valeurs seules : lue en
 * POST, elle n'est servie ni par le cache d'Eraser ni par la déduplication des GET d'une
 * page. Tout ce qui décide où et quoi écrire part d'elle. `hintedRow` : la ligne que
 * l'interface indique, dont la mise en forme est relue aussi (couleur du type).
 */
async function freshSpellWorkbook(kind: SpellIndexKind = "classes", hintedRow: number | null = null): Promise<SpellWorkbook> {
  const { file, candidates, classes } = await spellSource(kind)
  const formattedRow = hintedRow !== null && Number.isInteger(hintedRow) && hintedRow >= 2 ? hintedRow : null
  for (const retry of [false, true]) {
    const tab = await spellTabOf(file, candidates, retry)
    try {
      const [read, formatted] = await Promise.all([
        readRangeFreshWithOffset(file.id, quoteTab(tab.tabName)),
        formattedRow === null ? null : formattedSpellRow(file.id, tab.tabName, formattedRow),
      ])
      // Google peut rendre la plage à partir de sa première ligne remplie.
      const values = [...Array.from({ length: Math.max(0, read.startRow - 1) }, () => [] as string[]), ...read.rows]
      const headers = values[0] ?? []
      const cells: FormattedSheetCell[][] = []
      if (formattedRow !== null) cells[formattedRow - 2] = formatted ?? []
      return { file, sheetId: tab.sheetId, headers, rows: values.slice(1), cells, classes, ...spellColumnsOf(headers, classes), tabName: tab.tabName }
    } catch (error) {
      if (retry || !/^SHEETS_API_ERROR:400/.test(error instanceof Error ? error.message : "")) throw error
      spellTabs.delete(file.id)
    }
  }
  throw new Error("SHEET_TAB_NOT_FOUND")
}

/** La mise en forme d'une ligne (couleur du type, textes mis en forme) ; vide si elle n'a pu être lue. */
async function formattedSpellRow(fileId: string, tabName: string, rowNumber: number) {
  const sheet = await readFormattedSheet(fileId, [tabName], { range: `${rowNumber}:${rowNumber}` }).catch(() => null)
  return sheet?.rows[rowNumber - 1] ?? []
}

function cell(row: string[], column: number) {
  return column >= 0 ? String(row[column] ?? "") : ""
}

/**
 * L'ID réel d'un sort. Une case vide n'en est pas un, ni une désignation « LIGNE-n » :
 * celle-ci désignait le sort par sa place, et elle a parfois été écrite dans la case.
 */
function realSpellId(value: string) {
  const id = value.trim()
  return /^LIGNE-/i.test(id) ? "" : id
}

/** Un rang de classe (0 à 20), ou null. */
function rankOf(value: unknown) {
  const rank = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  return Number.isInteger(rank) && rank >= 0 && rank <= 20 ? rank : null
}

function parseSpell(workbook: SpellWorkbook, row: string[], cells: FormattedSheetCell[], rowNumber: number): ClassSpell | null {
  const id = realSpellId(cell(row, workbook.columns.id))
  const name = cell(row, workbook.columns.name).trim()
  const type = cell(row, workbook.columns.type).trim()
  const chargesValue = Number.parseInt(cell(row, workbook.columns.charges), 10)
  const classRanks = Object.fromEntries(workbook.classColumns.flatMap(({ classId, column }) => {
    const value = rankOf(cell(row, column))
    return value === null ? [] : [[classId, value]]
  }))
  // Un sort sans titre (ni ID) reste un sort dès qu'il a un texte ou une classe.
  if (!id && !name && !cell(row, workbook.columns.effect).trim() && !cell(row, workbook.columns.description).trim() && !Object.keys(classRanks).length) return null
  return {
    rowNumber,
    id: id || `LIGNE-${rowNumber}`,
    name: name || UNNAMED_CLASS_SPELL,
    effect: cell(row, workbook.columns.effect),
    effectHtml: formattedCell(cells, workbook.columns.effect).html,
    description: cell(row, workbook.columns.description),
    descriptionHtml: formattedCell(cells, workbook.columns.description).html,
    type,
    category: classSpellCategory(type),
    actionKind: classSpellActionKind(type),
    skillsRaw: cell(row, workbook.columns.skills),
    skills: splitClassSpellSkills(cell(row, workbook.columns.skills)),
    distance: cell(row, workbook.columns.distance),
    distanceHtml: formattedCell(cells, workbook.columns.distance).html,
    charges: Number.isInteger(chargesValue) && chargesValue >= 0 ? Math.min(5, chargesValue) : null,
    chargesLabel: cell(row, workbook.columns.charges).trim(),
    classRanks,
    tone: {
      background: formattedCell(cells, workbook.columns.type).backgroundColor,
      foreground: formattedCell(cells, workbook.columns.type).foregroundColor,
    },
  }
}

export async function listClassSpells(refresh = false, kind: SpellIndexKind = "classes") {
  return spellListCache.get(kind, () => loadClassSpells(refresh, kind), { refresh })
}

async function loadClassSpells(refresh = false, kind: SpellIndexKind = "classes") {
  const workbook = await spellWorkbook(refresh, kind)
  // Aucune page ne reçoit la désignation par position d'un sort sans ID : une fiche la
  // retiendrait, et elle glisse dès qu'une ligne est ajoutée ou supprimée au-dessus.
  // Seulement dans une vraie colonne « ID » : trouvée par approximation (« Druide » contient
  // « id »), elle recevrait des ID par-dessus ses rangs.
  if (exactSpellIdColumn(workbook) && workbook.rows.some((row) => needsSpellId(workbook, row))) await giveSpellIds(workbook, kind)
  return {
    file: workbook.file,
    headers: workbook.headers,
    classes: workbook.classes,
    spells: workbook.rows.flatMap((row, index) => parseSpell(workbook, row, workbook.cells?.[index] ?? [], index + 2) ?? []),
  }
}

/** Une ligne qui est un sort (titre, texte ou classe) sans ID réel. */
function needsSpellId(workbook: SpellWorkbook, row: string[]) {
  if (realSpellId(cell(row, workbook.columns.id))) return false
  return Boolean(cell(row, workbook.columns.name).trim() || cell(row, workbook.columns.effect).trim() || cell(row, workbook.columns.description).trim()
    || workbook.classColumns.some(({ column }) => rankOf(cell(row, column)) !== null))
}

/** Le contenu d'une ligne, sa case ID exceptée. */
function spellContentKey(workbook: SpellWorkbook, row: string[]) {
  const values = row.map((value, index) => index === workbook.columns.id ? "" : String(value ?? "").trim())
  while (values.length && !values[values.length - 1]) values.pop()
  return values.join("\u0001")
}

/**
 * L'ID donné à un sort qui n'en a pas : tiré de son contenu et de son rang parmi les
 * sorts sans ID identiques. Deux installations qui le lui donnent en même temps écrivent
 * le même : aucune ne montre un ID que l'autre aurait aussitôt remplacé.
 */
function contentSpellId(content: string, occurrence: number, taken: Set<string>) {
  for (let salt = 0; ; salt += 1) {
    let hash = 2166136261
    for (const character of `${content}\u0002${occurrence}\u0002${salt}`) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619)
    const id = `SOR-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`
    if (!taken.has(id)) return id
  }
}

/** Les sorts sans ID, chacun désigné par son contenu et son rang parmi les identiques. */
function spellsWithoutId(workbook: SpellWorkbook) {
  const seen = new Map<string, number>()
  return workbook.rows.flatMap((row, index) => {
    if (!needsSpellId(workbook, row)) return []
    const content = spellContentKey(workbook, row)
    const occurrence = seen.get(content) ?? 0
    seen.set(content, occurrence + 1)
    return [{ index, content, occurrence, key: `${content}\u0003${occurrence}` }]
  })
}

/**
 * Donne un vrai ID aux sorts qui n'en ont pas (case vide ou « LIGNE-n »). La feuille est
 * relue juste avant ; seules ces cases ID sont écrites, puis relues : l'ID retenu est
 * celui qui y reste. Renvoie l'ID que porte désormais chaque sort (par contenu et rang).
 */
/** La colonne ID trouvée par son nom exact (« ID », « ID sort »…), pas par approximation. */
function exactSpellIdColumn(workbook: SpellWorkbook) {
  const header = normalize(workbook.headers[workbook.columns.id] ?? "")
  return workbook.columns.id >= 0 && ["ID", "ID sort", "ID du sort"].map(normalize).includes(header)
}

async function assignMissingSpellIds(kind: SpellIndexKind) {
  const workbook = await freshSpellWorkbook(kind)
  if (!exactSpellIdColumn(workbook)) return new Map<string, string>()
  const taken = new Set(workbook.rows.map((row) => realSpellId(cell(row, workbook.columns.id))).filter(Boolean))
  const missing = spellsWithoutId(workbook).map((item) => {
    const id = contentSpellId(item.content, item.occurrence, taken)
    taken.add(id)
    return { ...item, id }
  })
  const assigned = new Map<string, string>()
  if (!missing.length) return assigned
  const letter = columnName(workbook.columns.id + 1)
  await updateRanges(workbook.file.id, missing.map((item) => ({ range: `${quoteTab(workbook.tabName)}!${letter}${item.index + 2}`, values: [[item.id]] })), { valueInputOption: "RAW" })
  const check = await readRangeFreshWithOffset(workbook.file.id, `${quoteTab(workbook.tabName)}!${letter}:${letter}`)
  for (const item of missing) {
    const kept = realSpellId(String(check.rows[item.index + 2 - check.startRow]?.[0] ?? ""))
    if (kept) assigned.set(item.key, kept)
  }
  return assigned
}

const spellIdRetryAt = new Map<string, number>()

/**
 * Les sorts sans ID de cette lecture reçoivent le leur avant d'être montrés. Un échec
 * (écriture refusée…) n'est retenté qu'après cinq minutes ; ces sorts gardent alors leur
 * désignation par position, que le catalogue des fiches écarte.
 */
async function giveSpellIds(workbook: SpellWorkbook, kind: SpellIndexKind) {
  if ((spellIdRetryAt.get(workbook.file.id) ?? 0) > Date.now()) return
  try {
    const assigned = await spellWrites(() => assignMissingSpellIds(kind))
    for (const item of spellsWithoutId(workbook)) {
      const id = assigned.get(item.key)
      if (!id) continue
      const row = [...workbook.rows[item.index]]
      while (row.length <= workbook.columns.id) row.push("")
      row[workbook.columns.id] = id
      workbook.rows[item.index] = row
    }
  } catch (error) {
    spellIdRetryAt.set(workbook.file.id, Date.now() + 5 * 60_000)
    console.error("CLASS_SPELL_ID_ASSIGN_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  }
}

/**
 * Donne un vrai ID à chaque sort qui n'en a pas, comme à l'affichage. Pour le moteur des
 * index : deux chemins qui en donnent chacun un au hasard se remplaçaient l'un l'autre.
 */
export function ensureSpellIds(kind: SpellIndexKind = "classes") {
  return spellWrites(() => assignMissingSpellIds(kind))
}

async function cartomancerCards(characterClass: ClassRecord, file: ClassWorkbookFile) {
  if (!normalizeClassLabel(characterClass.name).includes("cartomancien")) return []
  const values = (await readFirstTab(file.id, [CARDS_TAB, "cartes", "Carte", "carte"], "A1:AZ1000").catch(() => null))?.values ?? []
  const headers = values[0] ?? []
  const usedWidth = Math.max(headers.length, ...values.map((row) => row.length), 0)
  if (!usedWidth) return []
  const normalizedHeaders = Array.from({ length: usedWidth }, (_, index) => headers[index]?.trim() || `Colonne ${index + 1}`)
  const rows = values.slice(1).flatMap((row, index) => row.some((value) => String(value).trim())
    ? [{ rowNumber: index + 2, values: normalizedHeaders.map((_, column) => String(row[column] ?? "")) }]
    : [])
  return rows.length ? [{ title: CARDS_TAB, headers: normalizedHeaders, rows }] : []
}

/** La page d'une classe dans Règles (lecture seule) : les feuilles gardées en mémoire suffisent. */
export async function getClassContent(classId: string): Promise<ClassContent | null> {
  const classes = await listClasses()
  const characterClass = classes.find((item) => item.id === classId)
  if (!characterClass) return null
  const [presentationsResult, spellsResult, bonusResult] = await Promise.allSettled([listClassPresentations(), listClassSpells(), listRankBonuses()])
  const presentations = presentationsResult.status === "fulfilled" ? presentationsResult.value : null
  const spellData = spellsResult.status === "fulfilled" ? spellsResult.value : null
  const presentation = presentations?.presentations.find((item) => item.classId === classId) ?? null
  const spells = spellData?.spells.filter((spell) => classId in spell.classRanks).sort((left, right) => left.classRanks[classId] - right.classRanks[classId] || left.name.localeCompare(right.name, "fr")) ?? []
  const supplements = spellData ? await cartomancerCards(characterClass, spellData.file) : []
  return {
    characterClass,
    presentation,
    spells,
    supplements,
    rankBonuses: bonusResult.status === "fulfilled" ? bonusResult.value.bonuses : [],
  }
}

/**
 * Modifie une case de la présentation d'une classe. La colonne est désignée par son
 * en-tête (et son rang parmi les en-têtes identiques), la ligne par la classe : toutes
 * deux sont retrouvées sur la feuille relue à l'instant. Une colonne insérée ou déplacée
 * entre-temps ne fait plus écrire le texte dans un autre champ.
 */
export async function updateClassPresentationCell(input: { classId: string; header: string; occurrence?: number; value: string }) {
  const { presentation: file } = await classWorkbookFiles()
  if (!file) throw new Error("CLASS_PRESENTATION_SHEET_NOT_FOUND")
  const tabs = await spreadsheetTabs(file.id)
  const tab = [PRESENTATION_TAB, "présentation", "Presentation"].map((name) => tabs.find((item) => item.title === name)).find(Boolean)
  if (!tab || tab.sheetId === undefined) throw new Error("SHEET_TAB_NOT_FOUND")
  const read = await readRangeFreshWithOffset(file.id, quoteTab(tab.title))
  const values = [...Array.from({ length: Math.max(0, read.startRow - 1) }, () => [] as string[]), ...read.rows]
  const headers = (values[0] ?? []).map((header) => String(header ?? ""))
  const classes = await listClasses()
  const found = values.slice(1).flatMap((row, index) => {
    const cells = Array.from(row, (value) => ({ value: String(value ?? ""), html: String(value ?? ""), backgroundColor: "", foregroundColor: "" }))
    const presentation = parsePresentationRow(headers, row, cells, index + 2, classes)
    return presentation?.classId === input.classId ? [presentation] : []
  })
  if (found.length > 1) throw new Error("CLASS_PRESENTATION_DUPLICATE")
  if (!found.length) throw new Error("CLASS_PRESENTATION_NOT_FOUND")
  const wanted = input.header.trim()
  const column = headers.flatMap((header, index) => header.trim() === wanted ? [index] : [])[input.occurrence ?? 0]
  if (column === undefined || !editablePresentationColumns(found[0]).has(column)) throw new Error("CLASS_PRESENTATION_FIELD_NOT_EDITABLE")
  await updateFormattedCell({ spreadsheetId: file.id, sheetId: tab.sheetId, rowNumber: found[0].rowNumber, column, html: input.value })
}

export type ClassSpellDraft = Pick<ClassSpell, "id" | "name" | "effect" | "description" | "type" | "skillsRaw" | "distance"> & {
  effectHtml?: string
  descriptionHtml?: string
  distanceHtml?: string
  charges: number | null
  /**
   * Texte de la case Charges quand il n'y a pas de nombre : « ✦ » (charges illimitées)
   * ou vide. Absent : une case « ✦ » existante est gardée telle quelle.
   */
  chargesLabel?: string
  classRanks: Record<string, number | null>
}

/** Un sort tel que l'interface le désigne : sa ligne (indicative) et son ID. */
export type SpellTarget = { rowNumber: number; id: string }

function classRankCount(workbook: SpellWorkbook, classId: string, rank: number, excluded: Set<number>) {
  const target = workbook.classColumns.find((item) => item.classId === classId)
  if (!target) return 0
  return workbook.rows.reduce((total, row, index) => excluded.has(index) ? total : total + (rankOf(cell(row, target.column)) === rank ? 1 : 0), 0)
}

/** Couleur de la colonne Type pour cette catégorie, reprise d'un sort existant de la même catégorie. */
async function toneForType(workbook: SpellWorkbook, type: string) {
  const category = classSpellCategory(type)
  const indexes = workbook.rows.flatMap((row, index) => classSpellCategory(cell(row, workbook.columns.type)) === category ? [index] : [])
  const known = indexes.map((index) => formattedCell(workbook.cells?.[index] ?? [], workbook.columns.type)).find((formatted) => formatted.backgroundColor)
  if (known) return { background: known.backgroundColor, foreground: known.foregroundColor || "#ffffff" }
  // Lecture partielle : seule la colonne Type est relue avec sa mise en forme.
  const typeColumn = columnName(workbook.columns.type + 1)
  const sheet = indexes.length ? await readFormattedSheet(workbook.file.id, [workbook.tabName], { range: `${typeColumn}:${typeColumn}` }).catch(() => null) : null
  for (const index of indexes) {
    const formatted = formattedCell(sheet?.rows[index + 1] ?? [], workbook.columns.type)
    if (formatted.backgroundColor) return { background: formatted.backgroundColor, foreground: formatted.foregroundColor || "#ffffff" }
  }
  return classSpellCategoryTones[category]
}

/**
 * La case Charges : un nombre de 0 à 5, ou « ✦ » (charges illimitées). Un sort
 * enregistré sans nombre et sans choix explicite garde son « ✦ » au lieu de le perdre.
 */
function chargesCell(charges: number | null, current: string, label?: string) {
  if (charges !== null) return String(Math.max(0, Math.min(5, Math.trunc(charges))))
  if (label !== undefined) return label.trim() === "✦" ? "✦" : ""
  return current.trim() && !Number.isFinite(Number.parseInt(current, 10)) ? current : ""
}

function newSpellId(workbook: SpellWorkbook, taken: Set<string> = new Set()) {
  const known = new Set([...taken, ...workbook.rows.map((row) => realSpellId(cell(row, workbook.columns.id)))])
  let id = ""
  do id = `SOR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; while (known.has(id))
  return id
}

/**
 * La ligne d'un sort sur la feuille relue : celle qui porte son ID, où qu'elle soit
 * maintenant (une ligne a pu être ajoutée ou supprimée au-dessus, ici, dans Sheets ou sur
 * une autre installation). Un ID absent, ou porté par deux lignes : rien n'est écrit. Une
 * désignation « LIGNE-n » (sort sans ID) ne vaut que si la ligne n n'a toujours pas d'ID.
 */
function locateSpell(workbook: SpellWorkbook, expectedId: string | undefined) {
  const wanted = (expectedId ?? "").trim()
  if (!wanted) throw new Error("CLASS_SPELL_ID_REQUIRED")
  const positional = /^LIGNE-(\d+)$/i.exec(wanted)
  if (positional) {
    const index = Number(positional[1]) - 2
    if (!workbook.rows[index] || !needsSpellId(workbook, workbook.rows[index])) throw new Error("CLASS_SPELL_MOVED")
    return index
  }
  const found = workbook.rows.flatMap((row, index) => realSpellId(cell(row, workbook.columns.id)) === wanted ? [index] : [])
  if (found.length > 1) throw new Error("CLASS_SPELL_ID_DUPLICATE")
  if (!found.length) throw new Error("CLASS_SPELL_MOVED")
  return found[0]
}

/** Les colonnes ne s'ajoutent qu'une à la fois : deux liens rapides ne créent pas deux colonnes. */
let classColumnsQueue: Promise<unknown> = Promise.resolve()

/**
 * Une classe de la feuille « Classes » n'a pas forcément de colonne dans la feuille des
 * sorts (Druide, Rôdeur·euse…). Sans colonne, un lien vers elle n'était écrit nulle
 * part et le sort ne rejoignait jamais la classe. La colonne manquante est ajoutée à
 * droite, avec le nom de la classe en en-tête et la mise en forme de la colonne de
 * classe voisine. Aucune cellule existante n'est modifiée.
 */
async function ensureClassColumns(workbook: SpellWorkbook, classIds: string[]): Promise<SpellWorkbook> {
  const wanted = [...new Set(classIds)].filter((classId) => !workbook.classColumns.some((item) => item.classId === classId) && workbook.classes.some((item) => item.id === classId))
  if (!wanted.length) return workbook
  const run = classColumnsQueue.then(async () => {
    // Relu sous le verrou (lecture POST) : un appel précédent a pu ajouter la colonne entre-temps.
    const read = await readRangeFreshWithOffset(workbook.file.id, quoteTab(workbook.tabName))
    const values = [...Array.from({ length: Math.max(0, read.startRow - 1) }, () => [] as string[]), ...read.rows]
    const headers = values[0] ?? []
    const known = spellColumnsOf(headers, workbook.classes).classColumns
    const missing = workbook.classes.filter((item) => wanted.includes(item.id) && !known.some((column) => column.classId === item.id))
    if (!missing.length) return { headers, rows: values.slice(1) }
    // Première colonne libre : après l'en-tête et après toute donnée des lignes.
    const start = values.reduce((width, row) => Math.max(width, row.reduce((last, value, index) => String(value ?? "").trim() ? index + 1 : last, 0)), 0)
    const metadata = await googleSheetsJson<{ sheets?: Array<{ properties?: { sheetId?: number; gridProperties?: { columnCount?: number; rowCount?: number } } }> }>(
      `spreadsheets/${workbook.file.id}?fields=sheets.properties(sheetId,gridProperties(columnCount,rowCount))`,
    )
    const grid = metadata.sheets?.find((sheet) => sheet.properties?.sheetId === workbook.sheetId)?.properties?.gridProperties
    const columnCount = grid?.columnCount ?? start
    const template = known.at(-1)?.column
    const requests: unknown[] = []
    if (start + missing.length > columnCount) requests.push({ appendDimension: { sheetId: workbook.sheetId, dimension: "COLUMNS", length: start + missing.length - columnCount } })
    if (template !== undefined) requests.push({
      copyPaste: {
        source: { sheetId: workbook.sheetId, startRowIndex: 0, endRowIndex: grid?.rowCount ?? values.length, startColumnIndex: template, endColumnIndex: template + 1 },
        destination: { sheetId: workbook.sheetId, startRowIndex: 0, endRowIndex: grid?.rowCount ?? values.length, startColumnIndex: start, endColumnIndex: start + missing.length },
        pasteType: "PASTE_FORMAT",
      },
    })
    if (requests.length) await googleSheetsJson(`spreadsheets/${workbook.file.id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) })
    await updateRange(workbook.file.id, `${quoteTab(workbook.tabName)}!${columnName(start + 1)}1:${columnName(start + missing.length)}1`, [missing.map((item) => item.name)], { valueInputOption: "RAW" })
    const nextHeaders = [...Array.from({ length: start }, (_, index) => String(headers[index] ?? "")), ...missing.map((item) => item.name)]
    return { headers: nextHeaders, rows: values.slice(1) }
  })
  classColumnsQueue = run.catch(() => undefined)
  const { headers } = await run
  // Les lignes lues avant gardent leurs valeurs : les nouvelles colonnes sont vides.
  return { ...workbook, headers: headers.length >= workbook.headers.length ? headers : workbook.headers, ...spellColumnsOf(headers.length >= workbook.headers.length ? headers : workbook.headers, workbook.classes) }
}

type SpellField = "name" | "type" | "skillsRaw" | "charges" | "effect" | "description" | "distance"
const spellFieldColumns: Record<SpellField, keyof SpellColumns> = { name: "name", type: "type", skillsRaw: "skills", charges: "charges", effect: "effect", description: "description", distance: "distance" }
const spellFieldLabels: Record<SpellField, string> = { name: "Nom", type: "Type", skillsRaw: "Compétences", charges: "Charges", effect: "Effet", description: "Description", distance: "Distance" }
const richHtmlKeys = { effect: "effectHtml", description: "descriptionHtml", distance: "distanceHtml" } as const
const richSpellFields = Object.entries(richHtmlKeys) as Array<[keyof typeof richHtmlKeys, (typeof richHtmlKeys)[keyof typeof richHtmlKeys]]>

/** Un texte mis en forme vide alors que le texte ne l'est pas : on garde le texte seul. */
function richHtml(text: string, html: string | undefined) {
  return html !== undefined && (html.trim() || !text.trim()) ? html : undefined
}

/** Un rang hors de 0 à 20 n'est jamais pris pour « aucun rang ». */
function assertRankValues(draft: ClassSpellDraft) {
  for (const rank of Object.values(draft.classRanks)) if (rank !== null && rank !== undefined && rankOf(rank) !== rank) throw new Error("CLASS_RANK_INVALID")
}

/** Les champs que la personne a changés : le brouillon comparé au sort tel qu'elle l'a vu. */
function changedSpellFields(draft: ClassSpellDraft, original: ClassSpellDraft) {
  const fields: SpellField[] = []
  if (spellName(draft) !== spellName(original)) fields.push("name")
  if (draft.type !== original.type) fields.push("type")
  if (draft.skillsRaw !== original.skillsRaw) fields.push("skillsRaw")
  if (draft.charges !== original.charges || (draft.charges === null && draft.chargesLabel !== undefined && draft.chargesLabel.trim() !== (original.chargesLabel ?? "").trim())) fields.push("charges")
  // Un brouillon sans texte mis en forme (une fusion, une saisie simple) ne compare que le texte.
  for (const [field, html] of richSpellFields) if (draft[field] !== original[field] || (draft[html] !== undefined && draft[html] !== (original[html] ?? ""))) fields.push(field)
  return fields
}

/** Le nom à écrire : « Sort sans nom » n'est que l'affichage d'une case vide. */
function spellName(draft: Pick<ClassSpellDraft, "name">) {
  const name = draft.name.trim()
  return name === UNNAMED_CLASS_SPELL ? "" : name
}

/** Les rangs changés : chaque classe citée par l'un ou l'autre, avec son rang d'avant. */
function changedClassRanks(draft: ClassSpellDraft, original: ClassSpellDraft) {
  return [...new Set([...Object.keys(draft.classRanks), ...Object.keys(original.classRanks)])].flatMap((classId) => {
    const rank = rankOf(draft.classRanks[classId])
    const before = rankOf(original.classRanks[classId])
    return rank === before ? [] : [{ classId, rank, before }]
  })
}

/** Deux textes de cellule égaux aux blancs près : Sheets et l'éditeur ne rendent pas les retours à la ligne pareil. */
function sameCellText(left: string, right: string) {
  const clean = (value: string) => value.replace(/\r/g, "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim()
  return clean(left) === clean(right)
}

/** La case Charges a-t-elle encore ce que l'interface y a vu : son nombre (0 à 5), sinon son texte ? */
function sameCharges(value: string, original: ClassSpellDraft) {
  const parsed = Number.parseInt(value, 10)
  const charges = Number.isInteger(parsed) && parsed >= 0 ? Math.min(5, parsed) : null
  if (charges !== null || original.charges !== null) return charges === original.charges
  return original.chargesLabel === undefined || value.trim() === original.chargesLabel.trim()
}

/** La feuille a-t-elle encore, pour ce champ, la valeur que la personne avait sous les yeux ? */
function fieldUnchanged(workbook: SpellWorkbook, row: string[], field: SpellField, original: ClassSpellDraft) {
  const value = cell(row, workbook.columns[spellFieldColumns[field]])
  if (field === "charges") return sameCharges(value, original)
  if (field === "name") return sameCellText(value, spellName(original))
  return sameCellText(value, original[field])
}

type SpellSaveResult = { id: string; rowNumber: number; tone: { background: string; foreground: string }; spell: ClassSpell | null }

/** Le sort tel qu'il est maintenant dans la feuille (relu), pour que l'interface reparte de là. */
async function savedSpell(workbook: SpellWorkbook, rowNumber: number, id: string) {
  const cells = await formattedSpellRow(workbook.file.id, workbook.tabName, rowNumber)
  const spell = parseSpell(workbook, Array.from(cells, (item) => item?.value || ""), cells, rowNumber)
  return spell?.id === id ? spell : null
}

/**
 * Modifie un sort existant (`index` : sa ligne sur la feuille relue). Seuls les champs que
 * la personne a changés sont écrits, et chacun doit encore avoir dans la feuille la valeur
 * qu'elle avait sous les yeux (`original`) : sinon quelqu'un l'a modifié entre-temps et rien
 * n'est écrit. Un champ qu'elle n'a pas touché, une colonne de classe que le brouillon ne
 * cite pas, ne sont jamais réécrits. `ignored` : lignes qu'une fusion va supprimer.
 */
async function updateSpellRow(base: SpellWorkbook, index: number, draft: ClassSpellDraft, original: ClassSpellDraft, options: { kind: SpellIndexKind; ignored?: Set<number> }): Promise<SpellSaveResult> {
  assertRankValues(draft)
  const ignored = options.ignored ?? new Set<number>()
  const rowNumber = index + 2
  const current = base.rows[index]
  const fields = changedSpellFields(draft, original)
  const ranks = changedClassRanks(draft, original)
  // Un champ sans colonne n'est jamais ignoré en silence : rien n'est écrit, l'erreur s'affiche.
  const missing = fields.find((field) => base.columns[spellFieldColumns[field]] < 0)
  if (missing) throw new Error(`CLASS_SPELL_COLUMN_MISSING:${spellFieldLabels[missing]}`)
  const rankAt = (classId: string) => {
    const target = base.classColumns.find((item) => item.classId === classId)
    return target ? rankOf(cell(current, target.column)) : null
  }
  if (fields.some((field) => !fieldUnchanged(base, current, field, original)) || ranks.some((item) => rankAt(item.classId) !== item.before)) throw new Error("CLASS_SPELL_CHANGED")
  const currentId = realSpellId(cell(current, base.columns.id))
  const requestedId = realSpellId(draft.id)
  // L'ID d'un sort existant ne change pas : les fiches de personnage le citent.
  if (currentId && requestedId && requestedId !== currentId) throw new Error("CLASS_SPELL_ID_LOCKED")
  // Un sort sans ID en reçoit un ; jamais une désignation « LIGNE-n ».
  const id = currentId || requestedId || newSpellId(base)
  if (id !== currentId && base.rows.some((row, at) => at !== index && !ignored.has(at) && realSpellId(cell(row, base.columns.id)) === id)) throw new Error("CLASS_SPELL_ID_EXISTS")
  for (const { classId, rank } of ranks) {
    if (rank !== null && classRankCount(base, classId, rank, new Set([index, ...ignored])) >= MAX_CLASS_SPELLS_PER_RANK) throw new Error(`CLASS_RANK_FULL:${classId}:${rank}`)
  }
  const workbook = await ensureClassColumns(base, ranks.flatMap((item) => item.rank === null ? [] : [item.classId]))
  // Garde-fou : un rang demandé pour une classe sans colonne n'est jamais ignoré en
  // silence (c'est ce qui faisait croire qu'un lien était enregistré alors qu'il ne
  // l'était pas). Rien n'est écrit et l'erreur remonte à l'écran.
  const unwritable = ranks.filter((item) => item.rank !== null && !workbook.classColumns.some((column) => column.classId === item.classId))
  if (options.kind === "classes" && unwritable.length) throw new Error(`CLASS_COLUMN_NOT_FOUND:${unwritable.map((item) => item.classId).join(",")}`)
  const cells = workbook.cells?.[index] ?? await formattedSpellRow(workbook.file.id, workbook.tabName, rowNumber)
  const typeCell = formattedCell(cells, workbook.columns.type)
  const currentTone = typeCell.backgroundColor ? { background: typeCell.backgroundColor, foreground: typeCell.foregroundColor || "#ffffff" } : null
  const currentCategory = classSpellCategory(cell(current, workbook.columns.type))
  // La couleur du type ne change qu'avec sa catégorie.
  const keepTone = !fields.includes("type") || (currentTone !== null && currentCategory === classSpellCategory(draft.type))
  const tone = keepTone ? currentTone ?? classSpellCategoryTones[currentCategory] : await toneForType(workbook, draft.type)

  const writes: RowCellWrite[] = []
  if (id !== currentId) writes.push({ column: workbook.columns.id, value: id })
  for (const field of fields) {
    const column = workbook.columns[spellFieldColumns[field]]
    if (field === "name") writes.push({ column, value: spellName(draft) })
    else if (field === "type") writes.push(keepTone ? { column, value: draft.type } : { column, value: draft.type, colors: tone })
    else if (field === "skillsRaw") writes.push({ column, value: draft.skillsRaw })
    else if (field === "charges") writes.push({ column, value: chargesCell(draft.charges, cell(current, column), draft.chargesLabel) })
    else {
      const html = richHtml(draft[field], draft[richHtmlKeys[field]])
      writes.push(html !== undefined ? { column, html } : { column, value: draft[field] })
    }
  }
  for (const { classId, rank } of ranks) {
    const target = workbook.classColumns.find((item) => item.classId === classId)
    if (target) writes.push({ column: target.column, value: rank === null ? "" : String(rank) })
  }
  if (!writes.length) return { id, rowNumber, tone, spell: parseSpell(workbook, current, cells, rowNumber) }
  await updateRowCells({ spreadsheetId: workbook.file.id, sheetId: workbook.sheetId, rowNumber, cells: writes })
  return { id, rowNumber, tone, spell: await savedSpell(workbook, rowNumber, id) }
}

/**
 * Ajoute un sort. Les valeurs partent telles quelles (RAW) : un texte saisi reste du texte
 * (« = », « + » ou « - » au début, « 1/2 », « 0 »), rangs et charges restent des nombres.
 * Une valeur dont la colonne manque fait refuser l'ajout plutôt que de la perdre.
 */
async function addSpellRow(base: SpellWorkbook, draft: ClassSpellDraft, kind: SpellIndexKind): Promise<SpellSaveResult> {
  assertRankValues(draft)
  const name = spellName(draft)
  // Un sort peut ne pas avoir de titre, mais une ligne neuve doit contenir quelque chose.
  if (!name && !draft.effect.trim() && !draft.description.trim()) throw new Error("CLASS_SPELL_EMPTY")
  const charges = chargesCell(draft.charges, "", draft.chargesLabel)
  const filled: Array<[SpellField, string]> = [["effect", draft.effect], ["description", draft.description], ["skillsRaw", draft.skillsRaw], ["distance", draft.distance], ["charges", charges]]
  const missing = filled.find(([field, value]) => value.trim() && base.columns[spellFieldColumns[field]] < 0)?.[0]
  if (missing) throw new Error(`CLASS_SPELL_COLUMN_MISSING:${spellFieldLabels[missing]}`)
  const id = realSpellId(draft.id) || newSpellId(base)
  if (base.rows.some((row) => realSpellId(cell(row, base.columns.id)) === id)) throw new Error("CLASS_SPELL_ID_EXISTS")
  const ranks = Object.entries(draft.classRanks).flatMap(([classId, value]) => {
    const rank = rankOf(value)
    return rank === null ? [] : [{ classId, rank }]
  })
  for (const { classId, rank } of ranks) if (classRankCount(base, classId, rank, new Set()) >= MAX_CLASS_SPELLS_PER_RANK) throw new Error(`CLASS_RANK_FULL:${classId}:${rank}`)
  const workbook = await ensureClassColumns(base, ranks.map((item) => item.classId))
  const unwritable = ranks.filter((item) => !workbook.classColumns.some((column) => column.classId === item.classId))
  if (kind === "classes" && unwritable.length) throw new Error(`CLASS_COLUMN_NOT_FOUND:${unwritable.map((item) => item.classId).join(",")}`)
  const values: Array<string | number> = workbook.headers.map(() => "")
  const put = (column: number, value: string | number) => { if (column >= 0) values[column] = value }
  put(workbook.columns.id, id)
  put(workbook.columns.name, name)
  put(workbook.columns.type, draft.type)
  put(workbook.columns.skills, draft.skillsRaw)
  put(workbook.columns.charges, /^\d+$/.test(charges) ? Number(charges) : charges)
  for (const [field] of richSpellFields) put(workbook.columns[field], draft[field])
  for (const { classId, rank } of ranks) put(workbook.classColumns.find((item) => item.classId === classId)?.column ?? -1, rank)
  const appended = await appendRows(workbook.file.id, `${quoteTab(workbook.tabName)}!A:${columnName(workbook.headers.length)}`, [values], { valueInputOption: "RAW" })
  // La ligne du nouveau sort, retrouvée par appendRows ; à défaut par son ID dans la feuille
  // relue (jamais devinée : la mise en forme irait sur le sort d'un autre).
  const rowNumber = Number.parseInt(appended.updatedRange.match(/![A-Z]+(\d+)/)?.[1] || "", 10) || locateSpell(await freshSpellWorkbook(kind), id) + 2
  const tone = await toneForType(workbook, draft.type)
  const formatting: RowCellWrite[] = [
    ...richSpellFields.flatMap(([field, htmlKey]) => {
      const column = workbook.columns[field]
      const html = richHtml(draft[field], draft[htmlKey])
      return column >= 0 && html ? [{ column, html }] : []
    }),
    { column: workbook.columns.type, colors: tone },
  ]
  await updateRowCells({ spreadsheetId: workbook.file.id, sheetId: workbook.sheetId, rowNumber, cells: formatting })
  return { id, rowNumber, tone, spell: await savedSpell(workbook, rowNumber, id) }
}

/**
 * Enregistre un sort : `rowNumber` null l'ajoute. Pour un sort existant, `expectedId` (son
 * ID tel que l'interface le voit) et `original` (le sort tel qu'elle l'a vu) sont requis :
 * la ligne est retrouvée par son ID, et seuls les champs changés depuis `original` sont
 * écrits, s'ils n'ont pas changé entre-temps dans la feuille. Le sort enregistré, relu,
 * est rendu (`spell`) : l'interface repart de ce que la feuille contient vraiment.
 */
export function saveClassSpell(rowNumber: number | null, draft: ClassSpellDraft, options: { expectedId?: string; original?: ClassSpellDraft; kind?: SpellIndexKind } = {}) {
  const kind = options.kind ?? "classes"
  return spellWrites(async () => {
    if (rowNumber === null) return addSpellRow(await freshSpellWorkbook(kind), draft, kind)
    if (!options.expectedId?.trim()) throw new Error("CLASS_SPELL_ID_REQUIRED")
    if (!options.original) throw new Error("CLASS_SPELL_ORIGINAL_REQUIRED")
    const workbook = await freshSpellWorkbook(kind, rowNumber)
    return updateSpellRow(workbook, locateSpell(workbook, options.expectedId), draft, options.original, { kind })
  })
}

/**
 * Lie un sort à une classe à ce rang (`rank` null : le délie). Le sort est retrouvé par son
 * ID sur la feuille relue ; `originalRank`, le rang que l'interface lui voyait pour cette
 * classe, doit y être encore, sinon rien n'est écrit.
 */
export function linkClassSpell(expectedId: string, classId: string, rank: number | null, originalRank?: number | null) {
  return spellWrites(async () => {
    if (!expectedId?.trim()) throw new Error("CLASS_SPELL_ID_REQUIRED")
    if (rank !== null && rankOf(rank) !== rank) throw new Error("CLASS_RANK_INVALID")
    let workbook = await freshSpellWorkbook("classes")
    const index = locateSpell(workbook, expectedId)
    let target = workbook.classColumns.find((item) => item.classId === classId)
    const before = target ? rankOf(cell(workbook.rows[index], target.column)) : null
    if (originalRank !== undefined && before !== rankOf(originalRank)) throw new Error("CLASS_SPELL_CHANGED")
    // Déjà à ce rang, ou délier une classe qui n'a pas de colonne : il n'y a rien à écrire.
    if (before === rank) return { rowNumber: index + 2 }
    if (rank !== null && classRankCount(workbook, classId, rank, new Set([index])) >= MAX_CLASS_SPELLS_PER_RANK) throw new Error(`CLASS_RANK_FULL:${classId}:${rank}`)
    if (!target) {
      workbook = await ensureClassColumns(workbook, [classId])
      target = workbook.classColumns.find((item) => item.classId === classId)
      if (!target) throw new Error("CLASS_COLUMN_NOT_FOUND")
    }
    await updateRange(workbook.file.id, `${quoteTab(workbook.tabName)}!${columnName(target.column + 1)}${index + 2}`, [[rank === null ? "" : rank]], { valueInputOption: "RAW" })
    return { rowNumber: index + 2 }
  })
}

/**
 * Supprime des lignes de sorts. La colonne ID est relue juste avant : chaque ligne doit
 * encore porter l'ID lu (ou, sans ID, n'en avoir toujours pas), et cet ID une seule fois ;
 * sinon rien n'est supprimé. Toutes partent en un seul appel, de la plus basse à la plus haute.
 */
async function deleteSpellRows(workbook: SpellWorkbook, indexes: number[]) {
  const targets = [...new Set(indexes)].map((index) => ({ rowNumber: index + 2, id: realSpellId(cell(workbook.rows[index] ?? [], workbook.columns.id)) }))
  if (!targets.length) return
  const letter = columnName(workbook.columns.id + 1)
  const read = await readRangeFreshWithOffset(workbook.file.id, `${quoteTab(workbook.tabName)}!${letter}:${letter}`)
  const idAt = (rowNumber: number) => realSpellId(String(read.rows[rowNumber - read.startRow]?.[0] ?? ""))
  const ids = read.rows.map((row) => realSpellId(String(row[0] ?? "")))
  if (read.startRow !== 1 || findColumn([String(read.rows[0]?.[0] ?? "")], ["ID", "ID sort", "ID du sort"], ["id"]) !== 0) throw new Error("CLASS_SPELL_MOVED")
  for (const target of targets) {
    if (idAt(target.rowNumber) !== target.id || (target.id && ids.filter((id) => id === target.id).length > 1)) throw new Error("CLASS_SPELL_MOVED")
  }
  const requests = targets.sort((left, right) => right.rowNumber - left.rowNumber).map((target) => ({
    deleteDimension: { range: { sheetId: workbook.sheetId, dimension: "ROWS", startIndex: target.rowNumber - 1, endIndex: target.rowNumber } },
  }))
  await googleSheetsJson(`spreadsheets/${workbook.file.id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) })
  clearSpreadsheetReadCache(workbook.file.id)
}

/**
 * Supprime un sort, retrouvé par son ID sur la feuille relue : jamais par sa seule place,
 * qui a pu changer (fusion, ligne insérée dans Sheets, ajout ailleurs). Rend sa ligne.
 */
export function deleteClassSpell(expectedId: string, kind: SpellIndexKind = "classes") {
  return spellWrites(async () => {
    if (!expectedId?.trim()) throw new Error("CLASS_SPELL_ID_REQUIRED")
    const workbook = await freshSpellWorkbook(kind)
    const index = locateSpell(workbook, expectedId)
    await deleteSpellRows(workbook, [index])
    return { rowNumber: index + 2 }
  })
}

export function findSpellSimilarities(spells: ClassSpell[]) {
  return findClassSpellSimilarities(spells)
}

/**
 * Paires de sorts marquées « ce ne sont pas des doublons ». Elles vivent dans un onglet
 * du classeur des sorts, pour être partagées et visibles dans Sheets comme le reste.
 */
const IGNORED_PAIRS_TAB = "Doublons ignorés"

function pairKey(left: string, right: string) {
  return [left, right].sort().join("|")
}

async function ignoredSpellPairs(fileId: string) {
  const tabs = await spreadsheetTabs(fileId)
  if (!tabs.some((tab) => tab.title === IGNORED_PAIRS_TAB)) return new Set<string>()
  const { rows } = await readRangeFreshWithOffset(fileId, `${quoteTab(IGNORED_PAIRS_TAB)}!A2:B`)
  return new Set(rows.filter((row) => row[0] && row[1]).map((row) => pairKey(String(row[0]).trim(), String(row[1]).trim())))
}

/**
 * Un sort sans ID est désigné par sa ligne (« LIGNE-315 ») : cette désignation glisse
 * dès qu'une ligne au-dessus est supprimée (une fusion, par exemple). Avant de retenir
 * « pas un doublon », ces sorts reçoivent un vrai ID, écrit dans leur case ID (vide, ou
 * qui ne contient qu'une désignation « LIGNE-n »). Renvoie la correspondance ancienne
 * désignation → ID.
 */
async function assignSpellIds(workbook: SpellWorkbook, ids: string[]) {
  const assigned: Record<string, string> = {}
  const taken = new Set<string>()
  const writes: Array<{ range: string; values: string[][] }> = []
  for (const id of new Set(ids)) {
    if (!/^LIGNE-\d+$/i.test(id)) continue
    // La ligne a déjà un ID, ou n'existe plus : la désignation n'est plus fiable.
    const index = locateSpell(workbook, id)
    const fresh = newSpellId(workbook, taken)
    taken.add(fresh)
    assigned[id] = fresh
    writes.push({ range: `${quoteTab(workbook.tabName)}!${columnName(workbook.columns.id + 1)}${index + 2}`, values: [[fresh]] })
  }
  if (writes.length) {
    await googleSheetsJson(`spreadsheets/${workbook.file.id}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: writes }) })
    clearSpreadsheetReadCache(workbook.file.id)
  }
  return assigned
}

export function ignoreSpellPairs(requested: Array<[string, string]>, kind: SpellIndexKind = "classes") {
  return spellWrites(async () => {
    const workbook = await freshSpellWorkbook(kind)
    const { file } = workbook
    const assigned = await assignSpellIds(workbook, requested.flat())
    const pairs = requested.map(([left, right]): [string, string] => [assigned[left] ?? left, assigned[right] ?? right])
    const tabs = await spreadsheetTabs(file.id)
    if (!tabs.some((tab) => tab.title === IGNORED_PAIRS_TAB)) {
      await googleSheetsJson(`spreadsheets/${file.id}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: IGNORED_PAIRS_TAB, gridProperties: { rowCount: 500, columnCount: 3, frozenRowCount: 1 } } } }] }),
      })
      await updateRange(file.id, `${quoteTab(IGNORED_PAIRS_TAB)}!A1:C1`, [["Sort 1", "Sort 2", "Ignoré le"]])
    } else if (Object.keys(assigned).length) {
      // Les paires déjà ignorées sous l'ancienne désignation suivent le sort.
      const read = await readRangeFreshWithOffset(file.id, `${quoteTab(IGNORED_PAIRS_TAB)}!A2:B`)
      const renamed = read.rows.flatMap((row, offset) => row.slice(0, 2).flatMap((value, column) => {
        const next = assigned[String(value ?? "").trim()]
        return next ? [{ range: `${quoteTab(IGNORED_PAIRS_TAB)}!${column === 0 ? "A" : "B"}${read.startRow + offset}`, values: [[next]] }] : []
      }))
      if (renamed.length) await googleSheetsJson(`spreadsheets/${file.id}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: renamed }) })
      clearSpreadsheetReadCache(file.id)
    }
    const known = await ignoredSpellPairs(file.id)
    const now = new Date().toISOString()
    const fresh = pairs.filter(([left, right]) => left && right && left !== right && !known.has(pairKey(left, right)))
    if (fresh.length) await appendRows(file.id, `${quoteTab(IGNORED_PAIRS_TAB)}!A:C`, fresh.map(([left, right]) => [left, right, now]), { valueInputOption: "RAW" })
    clearSpreadsheetReadCache(file.id)
    return { assigned }
  })
}

/**
 * Données de l'index des sorts, où l'on modifie : toujours relues dans la feuille,
 * jamais servies depuis la mémoire. Une copie ancienne ferait réécrire des valeurs
 * dépassées par-dessus le travail d'une autre personne. Si « Doublons ignorés » ne se lit
 * pas, aucun doublon n'est proposé (on ferait fusionner des sorts déclarés distincts) et
 * l'erreur est rendue (`similaritiesError`).
 */
export async function listClassResources(refresh = false, kind: SpellIndexKind = "classes") {
  const data = await spellListCache.get(kind, () => loadClassSpells(refresh, kind), { refresh: true })
  try {
    const ignored = await ignoredSpellPairs(data.file.id)
    return { ...data, similarities: findSpellSimilarities(data.spells).filter((match) => !ignored.has(pairKey(match.leftId, match.rightId))), similaritiesError: "" }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "UNKNOWN_ERROR"
    console.error("IGNORED_SPELL_PAIRS_READ_FAILED", detail)
    return { ...data, similarities: [] as SpellSimilarity[], similaritiesError: `L’onglet « ${IGNORED_PAIRS_TAB} » n’a pas pu être lu : les doublons ne sont pas proposés. Actualise pour réessayer. (${detail})` }
  }
}

/** La feuille des personnages reliée (jamais créée ici). */
async function charactersSheet() {
  const runtime = runtimeEnv()
  if (runtime.GOOGLE_CHARACTERS_SHEET_ID) return { spreadsheetId: runtime.GOOGLE_CHARACTERS_SHEET_ID, tabName: runtime.GOOGLE_CHARACTERS_TAB || "Personnages" }
  const stored = await resolveJdrSheet("characters")
  return stored ? { spreadsheetId: stored.spreadsheetId, tabName: stored.tabName } : null
}

/**
 * Les fiches de personnage citent le sort gardé à la place des sorts qu'une fusion
 * supprime (choix de rang, charges, ajouts, ordre, versions personnelles, retraits).
 * Seule la case « Sorts de classe choisis JSON » d'une fiche concernée est réécrite,
 * d'après la feuille relue à l'instant (la ligne d'une fiche est celle qui porte son ID) ;
 * le reste du JSON est gardé tel quel. Rend le nombre de fiches mises à jour.
 */
async function remapCharacterSpellIds(mapping: Map<string, string>) {
  if (!mapping.size) return 0
  const source = await charactersSheet()
  if (!source) return 0
  const header = characterValueHeaders[characterClassChoicesIndex]
  const { columns, rows } = await readNamedColumns(source.spreadsheetId, source.tabName, characterSheetHeaders, ["ID", header], { aliases: characterSheetAliases, fresh: true })
  const column = columns.at(header)
  if (column < 0 || columns.at("ID") < 0) return 0
  const data = rows.flatMap((row, index) => {
    const before = columns.get(row, header)
    if (!columns.get(row, "ID").trim() || ![...mapping.keys()].some((id) => before.includes(id))) return []
    const after = remapSpellChoiceIds(before, mapping)
    return after === before ? [] : [{ range: sheetTabRange(source.tabName, `${columnName(column + 1)}${index + 2}`), values: [[after]] }]
  })
  if (data.length) await updateRanges(source.spreadsheetId, data, { valueInputOption: "RAW" })
  return data.length
}

/**
 * « Doublons ignorés » cite le sort gardé à la place des sorts supprimés. Une paire devenue
 * « le sort gardé avec lui-même » ne dit plus rien : elle est vidée.
 */
async function remapIgnoredPairs(fileId: string, mapping: Map<string, string>) {
  if (!mapping.size || !(await spreadsheetTabs(fileId)).some((tab) => tab.title === IGNORED_PAIRS_TAB)) return
  const read = await readRangeFreshWithOffset(fileId, `${quoteTab(IGNORED_PAIRS_TAB)}!A2:B`)
  const data = read.rows.flatMap((row, offset) => {
    const rowNumber = read.startRow + offset
    const [left, right] = [String(row[0] ?? "").trim(), String(row[1] ?? "").trim()]
    const [nextLeft, nextRight] = [mapping.get(left) ?? left, mapping.get(right) ?? right]
    if (nextLeft === left && nextRight === right) return []
    return nextLeft === nextRight
      ? [{ range: `${quoteTab(IGNORED_PAIRS_TAB)}!A${rowNumber}:C${rowNumber}`, values: [["", "", ""]] }]
      : [{ range: `${quoteTab(IGNORED_PAIRS_TAB)}!A${rowNumber}:B${rowNumber}`, values: [[nextLeft, nextRight]] }]
  })
  if (data.length) await updateRanges(fileId, data, { valueInputOption: "RAW" })
}

/**
 * Fusionne des sorts en un seul. Le sort gardé reçoit les champs choisis (classes et rangs
 * réunis compris) : seuls ceux qui changent sont écrits, s'ils ont encore dans la feuille
 * la valeur d'origine (`original` : le sort gardé tel que l'interface l'a vu). Les fiches de
 * personnage et « Doublons ignorés » citent ensuite le sort gardé à la place des autres ;
 * enfin ces lignes sont supprimées en un seul appel, leurs ID relus juste avant. Chaque
 * sort est retrouvé par son ID : si la feuille a bougé entre-temps, rien n'est supprimé.
 */
export function mergeClassSpells(keep: SpellTarget, removed: SpellTarget[], draft: ClassSpellDraft, original: ClassSpellDraft, kind: SpellIndexKind = "classes") {
  return spellWrites(async () => {
    const workbook = await freshSpellWorkbook(kind, keep.rowNumber)
    const keptIndex = locateSpell(workbook, keep.id)
    const removedIndexes = [...new Set(removed.map((target) => locateSpell(workbook, target.id)))].filter((index) => index !== keptIndex)
    const removedNames = removedIndexes.map((index) => cell(workbook.rows[index], workbook.columns.name).trim()).filter(Boolean)
    const removedIds = removedIndexes.map((index) => realSpellId(cell(workbook.rows[index], workbook.columns.id))).filter(Boolean)
    const result = await updateSpellRow(workbook, keptIndex, draft, original, { kind, ignored: new Set(removedIndexes) })
    // Plus aucune fiche ne cite un sort supprimé ; si elles n'ont pu être mises à jour, rien n'est supprimé.
    const mapping = new Map(removedIds.map((id) => [id, result.id]))
    const characters = kind === "classes" ? await remapCharacterSpellIds(mapping).catch((error: unknown) => {
      console.error("CLASS_SPELL_REFERENCES_REMAP_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
      throw new Error("CLASS_SPELL_REFERENCES_FAILED")
    }) : 0
    await remapIgnoredPairs(workbook.file.id, mapping).catch((error: unknown) => console.error("IGNORED_SPELL_PAIRS_REMAP_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"))
    await deleteSpellRows(workbook, removedIndexes)
    return { ...result, removedNames, keptName: spellName(draft), characters }
  })
}

/**
 * Bonus gagnés à chaque rang, les mêmes pour toutes les classes (ex. « +5 points de
 * vie max »). Ils vivent dans l'onglet « Bonus de rang » du classeur des sorts : une
 * ligne par rang (1 à 20), puis autant de colonnes que de bonus, remplies dans Drive.
 */
export const RANK_BONUS_TAB = "Bonus de rang"
export type RankBonus = { rank: number; entries: Array<{ label: string; value: string }> }
export type RankBonusTable = { bonuses: RankBonus[]; headers: string[]; sheetUrl: string; exists: boolean }

let rankBonusCache: { expiresAt: number; table: RankBonusTable } | null = null
let rankBonusCreation: Promise<void> | null = null

/** Crée l'onglet s'il manque : en-têtes et 20 lignes « Rang 1 » à « Rang 20 ». Jamais s'il existe. */
async function createRankBonusTab(fileId: string) {
  const tabs = await spreadsheetTabs(fileId)
  if (tabs.some((tab) => tab.title === RANK_BONUS_TAB)) return
  await googleSheetsJson(`spreadsheets/${fileId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: RANK_BONUS_TAB, gridProperties: { rowCount: 21, columnCount: 6, frozenRowCount: 1, frozenColumnCount: 1 } } } }] }),
  })
  await updateRange(fileId, `${quoteTab(RANK_BONUS_TAB)}!A1:B21`, [["Rang", "Bonus"], ...Array.from({ length: 20 }, (_, index) => [`Rang ${index + 1}`, ""])], { valueInputOption: "RAW" })
  clearSpreadsheetReadCache(fileId)
}

export async function listRankBonuses(options: { create?: boolean; refresh?: boolean } = {}): Promise<RankBonusTable> {
  if (!options.refresh && rankBonusCache && (rankBonusCache.table.exists || !options.create)) {
    if (rankBonusCache.expiresAt > Date.now()) return rankBonusCache.table
    // Déjà lus une fois : servis tout de suite, relus en arrière-plan.
    const stale = rankBonusCache.table
    rankBonusCache = { ...rankBonusCache, expiresAt: Date.now() + 60_000 }
    listRankBonuses({ refresh: true }).catch((error) => console.error("RANK_BONUSES_REFRESH_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"))
    return stale
  }
  const { spells: file } = await classWorkbookFiles()
  if (!file) throw new Error("CLASS_SPELLS_SHEET_NOT_FOUND")
  let tab = (await spreadsheetTabs(file.id)).find((item) => item.title === RANK_BONUS_TAB)
  if (!tab && options.create) {
    rankBonusCreation ??= createRankBonusTab(file.id).finally(() => { rankBonusCreation = null })
    await rankBonusCreation
    tab = (await spreadsheetTabs(file.id)).find((item) => item.title === RANK_BONUS_TAB)
  }
  const base = file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`
  if (!tab) {
    const table = { bonuses: [], headers: [], sheetUrl: base, exists: false }
    rankBonusCache = { expiresAt: Date.now() + 60_000, table }
    return table
  }
  // Une relecture lit la plage fraîche, sans vider le cache de tout le classeur des sorts
  // (il était relu en entier à chaque rafraîchissement des bonus, toutes les minutes).
  // Toutes les colonnes : un bonus ajouté au-delà de Z s'affiche aussi.
  const range = `${quoteTab(RANK_BONUS_TAB)}!1:60`
  const rows = options.refresh ? (await readRangeFreshWithOffset(file.id, range)).rows : await readRange(file.id, range)
  const headers = (rows[0] ?? []).map((header) => String(header ?? "").trim())
  const bonuses = rows.slice(1).flatMap((row): RankBonus[] => {
    const rank = Number.parseInt(String(row[0] ?? "").match(/\d+/)?.[0] ?? "", 10)
    if (!Number.isInteger(rank) || rank < 1 || rank > 20) return []
    const entries = headers.slice(1).flatMap((label, index) => {
      const value = String(row[index + 1] ?? "").trim()
      return value ? [{ label, value }] : []
    })
    return [{ rank, entries }]
  })
  const table = { bonuses, headers, sheetUrl: tab.sheetId === undefined ? base : `https://docs.google.com/spreadsheets/d/${file.id}/edit#gid=${tab.sheetId}`, exists: true }
  rankBonusCache = { expiresAt: Date.now() + 60_000, table }
  return table
}

/** Les bonus s'écrivent un à un : deux colonnes ajoutées coup sur coup ne prennent pas la même place. */
let rankBonusQueue: Promise<unknown> = Promise.resolve()

/**
 * Écrit un bonus de rang : la case du rang (lignes « Rang 1 » à « Rang 20 ») dans la
 * colonne de ce nom. Une colonne absente est ajoutée à droite des autres.
 */
export async function saveRankBonus(rank: number, header: string, value: string) {
  if (!Number.isInteger(rank) || rank < 1 || rank > 20) throw new Error("RANK_BONUS_INVALID_RANK")
  const label = header.replace(/\s+/g, " ").trim()
  if (!label || label.length > 80) throw new Error("RANK_BONUS_INVALID_COLUMN")
  const { spells: file } = await classWorkbookFiles()
  if (!file) throw new Error("CLASS_SPELLS_SHEET_NOT_FOUND")
  const run = rankBonusQueue.then(async () => {
    // Relues juste avant (lectures POST) : toute la ligne 1, au-delà de Z aussi, et la colonne des rangs.
    const [headerRead, rankRead] = await Promise.all([
      readRangeFreshWithOffset(file.id, `${quoteTab(RANK_BONUS_TAB)}!1:1`),
      readRangeFreshWithOffset(file.id, `${quoteTab(RANK_BONUS_TAB)}!A:A`),
    ])
    const headers = (headerRead.startRow === 1 ? headerRead.rows[0] ?? [] : []).map((cell) => String(cell ?? "").trim())
    const rankOffset = rankRead.rows.findIndex((row, offset) => rankRead.startRow + offset > 1 && Number.parseInt(String(row[0] ?? "").match(/\d+/)?.[0] ?? "", 10) === rank)
    if (rankOffset < 0) throw new Error("RANK_BONUS_ROW_NOT_FOUND")
    let column = headers.findIndex((candidate, index) => index > 0 && candidate.toLocaleLowerCase("fr") === label.toLocaleLowerCase("fr"))
    const added = column < 0
    if (added) {
      column = Math.max(1, headers.length)
      await ensureSheetColumnCount(file.id, RANK_BONUS_TAB, column + 1)
      await updateRange(file.id, `${quoteTab(RANK_BONUS_TAB)}!${columnName(column + 1)}1`, [[label]], { valueInputOption: "RAW" })
    }
    if (value !== "" || !added) {
      await updateRange(file.id, `${quoteTab(RANK_BONUS_TAB)}!${columnName(column + 1)}${rankRead.startRow + rankOffset}`, [[value.slice(0, 2000)]], { valueInputOption: "RAW" })
    }
  })
  rankBonusQueue = run.catch(() => undefined)
  await run
  rankBonusCache = null
  return listRankBonuses({ refresh: true })
}
