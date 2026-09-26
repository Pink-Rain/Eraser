import {
  findDriveFolderByName,
  findGoogleSpreadsheetByName,
  listDriveFolderFiles,
  type DriveFile,
} from "@/lib/google-drive"
import {
  appendRows,
  clearSpreadsheetReadCache,
  deleteGoogleSheetRow,
  ensureJdrSheet,
  googleSheetsJson,
  spreadsheetTabs,
  listClasses,
  readFormattedSheet,
  readRange,
  updateFormattedCell,
  updateRange,
  updateRowCells,
  type ClassRecord,
  type RowCellWrite,
  type FormattedSheetCell,
} from "@/lib/google-sheets"
import { normalizeClassLabel } from "@/lib/class-utils"
import {
  classSpellActionKind,
  classSpellCategory,
  classSpellCategoryTones,
  findClassSpellSimilarities,
  MAX_CLASS_SPELLS_PER_RANK,
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
  charges: number | null
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
  allSpells: ClassSpell[]
  supplements: ClassSupplementTable[]
  presentationSheetUrl: string
  spellsSheetUrl: string
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
  workbookFilesCache = { expiresAt: Date.now() + 60_000, presentation, spells }
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
  }
}

export async function listClassPresentations(refresh = false) {
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

/** Onglet des sorts déjà reconnu, par classeur : un enregistrement n'a pas à le rechercher. */
const spellTabs = new Map<string, { sheetId: number; tabName: string }>()

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
  spellTabs.set(file.id, { sheetId: sheet.sheetId, tabName: sheet.tabName })
  const values = sheet.rows.map((row) => row.map((cell) => cell?.value || ""))
  const headers = values[0] ?? []
  return { file, sheetId: sheet.sheetId, headers, rows: values.slice(1), cells: sheet.rows.slice(1), classes, ...spellColumnsOf(headers, classes), tabName: sheet.tabName }
}

/**
 * Ce qu'un enregistrement doit relire : les valeurs de la feuille, sans leur mise en
 * forme (pour les ID et les rangs pleins), et la seule ligne modifiée avec la sienne.
 * Le classeur et son onglet ne sont pas recherchés à nouveau dans Drive.
 */
async function spellWorkbookForSave(rowNumber: number | null, kind: SpellIndexKind = "classes") {
  const { file, candidates, classes } = await spellSource(kind)
  let tab = spellTabs.get(file.id)
  if (!tab) {
    const tabs = await spreadsheetTabs(file.id)
    const found = candidates.map((candidate) => tabs.find((item) => item.title === candidate)).find(Boolean)
    if (!found || found.sheetId === undefined) throw new Error("SHEET_TAB_NOT_FOUND")
    tab = { sheetId: found.sheetId, tabName: found.title }
    spellTabs.set(file.id, tab)
  }
  // Toujours relu : quelqu'un a pu modifier la feuille directement dans Sheets.
  clearSpreadsheetReadCache(file.id)
  const [values, row] = await Promise.all([
    readRange(file.id, quoteTab(tab.tabName)),
    rowNumber === null ? null : readFormattedSheet(file.id, [tab.tabName], { range: `${rowNumber}:${rowNumber}` }),
  ])
  const headers = values[0] ?? []
  const rows = values.slice(1)
  const cells: FormattedSheetCell[][] = []
  if (rowNumber !== null && row) cells[rowNumber - 2] = row.rows[rowNumber - 1] ?? []
  const workbook: SpellWorkbook = { file, sheetId: tab.sheetId, headers, rows, cells, classes, ...spellColumnsOf(headers, classes), tabName: tab.tabName }
  return workbook
}

function cell(row: string[], column: number) {
  return column >= 0 ? String(row[column] ?? "") : ""
}

function parseSpell(workbook: SpellWorkbook, row: string[], cells: FormattedSheetCell[], rowNumber: number): ClassSpell | null {
  const id = cell(row, workbook.columns.id).trim()
  const name = cell(row, workbook.columns.name).trim()
  const type = cell(row, workbook.columns.type).trim()
  const chargesValue = Number.parseInt(cell(row, workbook.columns.charges), 10)
  const classRanks = Object.fromEntries(workbook.classColumns.flatMap(({ classId, column }) => {
    const value = Number.parseInt(cell(row, column), 10)
    return Number.isInteger(value) && value >= 0 && value <= 20 ? [[classId, value]] : []
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
    charges: Number.isInteger(chargesValue) && chargesValue >= 0 ? Math.min(5, chargesValue) : null,
    classRanks,
    tone: {
      background: formattedCell(cells, workbook.columns.type).backgroundColor,
      foreground: formattedCell(cells, workbook.columns.type).foregroundColor,
    },
  }
}

export async function listClassSpells(refresh = false, kind: SpellIndexKind = "classes") {
  const workbook = await spellWorkbook(refresh, kind)
  return {
    file: workbook.file,
    headers: workbook.headers,
    classes: workbook.classes,
    spells: workbook.rows.flatMap((row, index) => parseSpell(workbook, row, workbook.cells?.[index] ?? [], index + 2) ?? []),
  }
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

export async function getClassContent(classId: string): Promise<ClassContent | null> {
  const classes = await listClasses()
  const characterClass = classes.find((item) => item.id === classId)
  if (!characterClass) return null
  const [presentationsResult, spellsResult] = await Promise.allSettled([listClassPresentations(), listClassSpells()])
  const presentations = presentationsResult.status === "fulfilled" ? presentationsResult.value : null
  const spellData = spellsResult.status === "fulfilled" ? spellsResult.value : null
  const presentation = presentations?.presentations.find((item) => item.classId === classId) ?? null
  const spells = spellData?.spells.filter((spell) => classId in spell.classRanks).sort((left, right) => left.classRanks[classId] - right.classRanks[classId] || left.name.localeCompare(right.name, "fr")) ?? []
  const supplements = spellData ? await cartomancerCards(characterClass, spellData.file) : []
  return {
    characterClass,
    presentation,
    spells,
    allSpells: spellData?.spells ?? [],
    supplements,
    presentationSheetUrl: presentations?.file.webViewLink || (presentations ? `https://docs.google.com/spreadsheets/d/${presentations.file.id}/edit` : ""),
    spellsSheetUrl: spellData?.file.webViewLink || (spellData ? `https://docs.google.com/spreadsheets/d/${spellData.file.id}/edit` : ""),
  }
}

export async function updateClassPresentationCell(input: { classId: string; rowNumber: number; column: number; value: string }) {
  const { file, sheetId, presentations } = await listClassPresentations(true)
  const presentation = presentations.find((item) => item.classId === input.classId && item.rowNumber === input.rowNumber)
  if (!presentation) throw new Error("CLASS_PRESENTATION_NOT_FOUND")
  const editableColumns = new Set<number>([
    ...presentation.specialties.flatMap((item) => [item.titleColumn, item.textColumn]),
    ...presentation.primaryCharacteristics.entries.map((item) => item.column),
    ...presentation.secondaryCharacteristics.entries.map((item) => item.column),
  ].filter((column): column is number => column !== null))
  if (!editableColumns.has(input.column)) throw new Error("CLASS_PRESENTATION_FIELD_NOT_EDITABLE")
  await updateFormattedCell({ spreadsheetId: file.id, sheetId, rowNumber: input.rowNumber, column: input.column, html: input.value })
}

export type ClassSpellDraft = Pick<ClassSpell, "id" | "name" | "effect" | "description" | "type" | "skillsRaw" | "distance"> & {
  effectHtml?: string
  descriptionHtml?: string
  charges: number | null
  classRanks: Record<string, number | null>
}

function classRankCount(workbook: SpellWorkbook, classId: string, rank: number, excluded: number | Set<number>) {
  const target = workbook.classColumns.find((item) => item.classId === classId)
  if (!target) return 0
  const skip = typeof excluded === "number" ? new Set([excluded]) : excluded
  return workbook.rows.reduce((total, row, index) => skip.has(index) ? total : total + (Number.parseInt(cell(row, target.column), 10) === rank ? 1 : 0), 0)
}

/**
 * Les rangs visés ont-ils encore de la place ? `ignored` : lignes qui ne comptent pas
 * (celles qu'une fusion va supprimer).
 */
function assertAvailableClassRanks(workbook: SpellWorkbook, draft: ClassSpellDraft, existingIndex: number, ignored: Set<number> = new Set()) {
  for (const { classId, column } of workbook.classColumns) {
    const rank = draft.classRanks[classId]
    if (rank === null || rank === undefined) continue
    if (!Number.isInteger(rank) || rank < 0 || rank > 20) throw new Error("CLASS_RANK_INVALID")
    const existingRank = existingIndex >= 0 ? Number.parseInt(cell(workbook.rows[existingIndex], column), 10) : Number.NaN
    if (existingRank === rank) continue
    if (classRankCount(workbook, classId, rank, new Set([existingIndex, ...ignored])) >= MAX_CLASS_SPELLS_PER_RANK) throw new Error(`CLASS_RANK_FULL:${classId}:${rank}`)
  }
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
 * Les charges sans nombre (« ✦ ») ne sont pas modifiables dans Eraser : un sort
 * enregistré sans charges les garde telles quelles au lieu de les effacer.
 */
function chargesCell(charges: number | null, current: string) {
  if (charges !== null) return String(Math.max(0, Math.min(5, Math.trunc(charges))))
  return current.trim() && !Number.isFinite(Number.parseInt(current, 10)) ? current : ""
}

function spellId(workbook: SpellWorkbook, index: number) {
  return cell(workbook.rows[index] ?? [], workbook.columns.id).trim() || `LIGNE-${index + 2}`
}

/**
 * Enregistre un sort. Seules les cellules qui changent sont écrites, toutes en un seul
 * appel à Google : une cellule que Sheets met en forme autrement, ou une formule dans
 * une colonne non modifiée, reste intacte.
 * `expectedId` : l'ID que l'interface croit voir sur cette ligne. Si la feuille a
 * bougé entre-temps (ligne supprimée ou insérée dans Sheets), rien n'est écrit.
 */
export async function saveClassSpell(rowNumber: number | null, draft: ClassSpellDraft, options: { workbook?: SpellWorkbook; ignoredRows?: Set<number>; ignoredIds?: Set<string>; expectedId?: string; kind?: SpellIndexKind } = {}) {
  const workbook = options.workbook ?? await spellWorkbookForSave(rowNumber, options.kind)
  const ignoredIndexes = new Set([...(options.ignoredRows ?? [])].map((row) => row - 2))
  const existingIndex = rowNumber === null ? -1 : rowNumber - 2
  if (rowNumber !== null && (existingIndex < 0 || !workbook.rows[existingIndex])) throw new Error("CLASS_SPELL_NOT_FOUND")
  if (rowNumber !== null && options.expectedId && spellId(workbook, existingIndex) !== options.expectedId) throw new Error("CLASS_SPELL_MOVED")
  const name = draft.name.trim()
  // Un sort peut ne pas avoir de titre, mais une ligne neuve doit contenir quelque chose.
  if (rowNumber === null && !name && !draft.effect.trim() && !draft.description.trim()) throw new Error("CLASS_SPELL_EMPTY")
  const id = draft.id.trim() || `SOR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  const current = rowNumber === null ? null : workbook.rows[existingIndex]
  const currentCells = rowNumber === null ? [] : workbook.cells?.[existingIndex] ?? []
  const idChanged = !current || cell(current, workbook.columns.id).trim() !== id
  if (idChanged) {
    const duplicateId = workbook.rows.findIndex((row, index) => index !== existingIndex && !ignoredIndexes.has(index) && cell(row, workbook.columns.id).trim() === id)
    if (duplicateId >= 0) throw new Error("CLASS_SPELL_ID_EXISTS")
  }
  assertAvailableClassRanks(workbook, draft, existingIndex, ignoredIndexes)

  const plain: Array<[number, string]> = [
    [workbook.columns.id, id],
    [workbook.columns.name, name],
    [workbook.columns.type, draft.type],
    [workbook.columns.skills, draft.skillsRaw],
    [workbook.columns.distance, draft.distance],
    [workbook.columns.charges, chargesCell(draft.charges, current ? cell(current, workbook.columns.charges) : "")],
    ...workbook.classColumns.map(({ classId, column }): [number, string] => {
      const rank = draft.classRanks[classId]
      return [column, rank === null || rank === undefined || !Number.isInteger(rank) || rank < 0 || rank > 20 ? "" : String(rank)]
    }),
  ]
  // Un texte mis en forme vide alors que le texte ne l'est pas : on garde le texte seul.
  const rich = (text: string, html: string | undefined) => html !== undefined && (html.trim() || !text.trim()) ? html : undefined
  const texts: Array<[number, string, string | undefined]> = [
    [workbook.columns.effect, draft.effect, rich(draft.effect, draft.effectHtml)],
    [workbook.columns.description, draft.description, rich(draft.description, draft.descriptionHtml)],
  ]

  const typeCell = formattedCell(currentCells, workbook.columns.type)
  const sameCategory = current !== null && classSpellCategory(cell(current, workbook.columns.type)) === classSpellCategory(draft.type)
  const keepTone = sameCategory && Boolean(typeCell.backgroundColor)
  const tone = keepTone ? { background: typeCell.backgroundColor, foreground: typeCell.foregroundColor || "#ffffff" } : await toneForType(workbook, draft.type)

  if (rowNumber === null) {
    const values = workbook.headers.map(() => "")
    for (const [column, value] of plain) if (column >= 0) values[column] = value
    for (const [column, text] of texts) if (column >= 0) values[column] = text
    const appended = await appendRows(workbook.file.id, `${quoteTab(workbook.tabName)}!A:${columnName(workbook.headers.length)}`, [values])
    const targetRow = Number.parseInt(appended.updatedRange.match(/![A-Z]+(\d+)/)?.[1] || "", 10) || workbook.rows.length + 2
    const formatting: RowCellWrite[] = [
      ...texts.flatMap(([column, , html]) => column >= 0 && html ? [{ column, html }] : []),
      { column: workbook.columns.type, colors: tone },
    ]
    await updateRowCells({ spreadsheetId: workbook.file.id, sheetId: workbook.sheetId, rowNumber: targetRow, cells: formatting })
    return { id, rowNumber: targetRow, tone }
  }

  const writes: RowCellWrite[] = []
  for (const [column, value] of plain) {
    if (column < 0 || cell(current!, column) === value) continue
    writes.push(column === workbook.columns.type && !keepTone ? { column, value, colors: tone } : { column, value })
  }
  for (const [column, text, html] of texts) {
    if (column < 0) continue
    const before = formattedCell(currentCells, column)
    if (html !== undefined) { if (html !== before.html || text !== cell(current!, column)) writes.push({ column, html }) }
    else if (text !== cell(current!, column)) writes.push({ column, value: text })
  }
  if (!keepTone && !writes.some((write) => write.column === workbook.columns.type)) writes.push({ column: workbook.columns.type, colors: tone })
  await updateRowCells({ spreadsheetId: workbook.file.id, sheetId: workbook.sheetId, rowNumber, cells: writes })
  return { id, rowNumber, tone }
}

export async function linkClassSpell(rowNumber: number, classId: string, rank: number | null) {
  const workbook = await spellWorkbook(true)
  const existingIndex = rowNumber - 2
  if (!workbook.rows[existingIndex]) throw new Error("CLASS_SPELL_NOT_FOUND")
  const target = workbook.classColumns.find((item) => item.classId === classId)
  if (!target) throw new Error("CLASS_COLUMN_NOT_FOUND")
  if (rank !== null && (!Number.isInteger(rank) || rank < 0 || rank > 20)) throw new Error("CLASS_RANK_INVALID")
  const existingRank = Number.parseInt(cell(workbook.rows[existingIndex], target.column), 10)
  if (rank !== null && existingRank !== rank && classRankCount(workbook, classId, rank, existingIndex) >= MAX_CLASS_SPELLS_PER_RANK) throw new Error(`CLASS_RANK_FULL:${classId}:${rank}`)
  const value = rank === null ? "" : String(rank)
  await updateRange(workbook.file.id, `${quoteTab(workbook.tabName)}!${columnName(target.column + 1)}${rowNumber}`, [[value]])
}

export async function deleteClassSpell(rowNumber: number, kind: SpellIndexKind = "classes") {
  const workbook = await spellWorkbook(true, kind)
  if (!workbook.rows[rowNumber - 2]) throw new Error("CLASS_SPELL_NOT_FOUND")
  await deleteGoogleSheetRow(workbook.file.id, workbook.tabName, rowNumber)
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
  const rows = await readRange(fileId, `${quoteTab(IGNORED_PAIRS_TAB)}!A2:B`)
  return new Set(rows.filter((row) => row[0] && row[1]).map((row) => pairKey(row[0].trim(), row[1].trim())))
}

export async function ignoreSpellPairs(pairs: Array<[string, string]>, kind: SpellIndexKind = "classes") {
  const { file } = await spellWorkbook(true, kind)
  const tabs = await spreadsheetTabs(file.id)
  if (!tabs.some((tab) => tab.title === IGNORED_PAIRS_TAB)) {
    await googleSheetsJson(`spreadsheets/${file.id}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: IGNORED_PAIRS_TAB, gridProperties: { rowCount: 500, columnCount: 3, frozenRowCount: 1 } } } }] }),
    })
    await updateRange(file.id, `${quoteTab(IGNORED_PAIRS_TAB)}!A1:C1`, [["Sort 1", "Sort 2", "Ignoré le"]])
  }
  const known = await ignoredSpellPairs(file.id)
  const now = new Date().toISOString()
  const fresh = pairs.filter(([left, right]) => left && right && left !== right && !known.has(pairKey(left, right)))
  if (fresh.length) await appendRows(file.id, `${quoteTab(IGNORED_PAIRS_TAB)}!A:C`, fresh.map(([left, right]) => [left, right, now]), { valueInputOption: "RAW" })
  clearSpreadsheetReadCache(file.id)
}

export async function listClassResources(refresh = false, kind: SpellIndexKind = "classes") {
  const data = await listClassSpells(refresh, kind)
  const ignored = await ignoredSpellPairs(data.file.id).catch(() => new Set<string>())
  return { ...data, similarities: findSpellSimilarities(data.spells).filter((match) => !ignored.has(pairKey(match.leftId, match.rightId))) }
}

/**
 * Fusionne des sorts en un seul. Le sort gardé reçoit le brouillon choisi champ par
 * champ (classes et rangs réunis compris), puis les autres lignes sont supprimées.
 * Chaque ligne est vérifiée par son ID : si la feuille a bougé entre-temps, rien
 * n'est écrit.
 */
export async function mergeClassSpells(keep: { rowNumber: number; id: string }, removed: Array<{ rowNumber: number; id: string }>, draft: ClassSpellDraft, kind: SpellIndexKind = "classes") {
  const workbook = await spellWorkbook(true, kind)
  const check = (target: { rowNumber: number; id: string }) => {
    const row = workbook.rows[target.rowNumber - 2]
    const id = row ? cell(row, workbook.columns.id).trim() || `LIGNE-${target.rowNumber}` : ""
    if (id !== target.id) throw new Error("CLASS_SPELL_MOVED")
  }
  check(keep)
  removed.forEach(check)
  const removedRows = removed.map((item) => item.rowNumber).filter((row) => row !== keep.rowNumber)
  const removedNames = removedRows.map((row) => cell(workbook.rows[row - 2], workbook.columns.name).trim()).filter(Boolean)
  const result = await saveClassSpell(keep.rowNumber, draft, { workbook, ignoredRows: new Set(removedRows) })
  for (const row of [...removedRows].sort((left, right) => right - left)) await deleteGoogleSheetRow(workbook.file.id, workbook.tabName, row, workbook.sheetId)
  clearSpreadsheetReadCache(workbook.file.id)
  return { ...result, removedNames, keptName: draft.name.trim() }
}
