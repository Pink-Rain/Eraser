import {
  findDriveFolderByName,
  findGoogleSpreadsheetByName,
  listDriveFolderFiles,
  type DriveFile,
} from "@/lib/google-drive"
import {
  appendRows,
  deleteGoogleSheetRow,
  listClasses,
  readFormattedSheet,
  readRange,
  updateFormattedCell,
  updateCellColors,
  updateRange,
  type ClassRecord,
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
  cells: FormattedSheetCell[][]
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

async function spellWorkbook(refresh = false): Promise<SpellWorkbook> {
  const [{ spells: file }, classes] = await Promise.all([classWorkbookFiles(refresh), listClasses()])
  if (!file) throw new Error("CLASS_SPELLS_SHEET_NOT_FOUND")
  const sheet = await readFormattedSheet(file.id, [SPELLS_TAB, "sorts", "Sort", "sort"])
  const values = sheet.rows.map((row) => row.map((cell) => cell?.value || ""))
  const headers = values[0] ?? []
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
  return { file, sheetId: sheet.sheetId, headers, rows: values.slice(1), cells: sheet.rows.slice(1), columns, classes, classColumns, tabName: sheet.tabName }
}

function cell(row: string[], column: number) {
  return column >= 0 ? String(row[column] ?? "") : ""
}

function parseSpell(workbook: SpellWorkbook, row: string[], cells: FormattedSheetCell[], rowNumber: number): ClassSpell | null {
  const id = cell(row, workbook.columns.id).trim()
  const name = cell(row, workbook.columns.name).trim()
  if (!id && !name) return null
  const type = cell(row, workbook.columns.type).trim()
  const chargesValue = Number.parseInt(cell(row, workbook.columns.charges), 10)
  const classRanks = Object.fromEntries(workbook.classColumns.flatMap(({ classId, column }) => {
    const value = Number.parseInt(cell(row, column), 10)
    return Number.isInteger(value) && value >= 0 && value <= 20 ? [[classId, value]] : []
  }))
  return {
    rowNumber,
    id: id || `LIGNE-${rowNumber}`,
    name: name || "Sort sans nom",
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

export async function listClassSpells(refresh = false) {
  const workbook = await spellWorkbook(refresh)
  return {
    file: workbook.file,
    headers: workbook.headers,
    classes: workbook.classes,
    spells: workbook.rows.flatMap((row, index) => parseSpell(workbook, row, workbook.cells[index] ?? [], index + 2) ?? []),
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

function classRankCount(workbook: SpellWorkbook, classId: string, rank: number, excludedIndex: number) {
  const target = workbook.classColumns.find((item) => item.classId === classId)
  if (!target) return 0
  return workbook.rows.reduce((total, row, index) => index === excludedIndex ? total : total + (Number.parseInt(cell(row, target.column), 10) === rank ? 1 : 0), 0)
}

function assertAvailableClassRanks(workbook: SpellWorkbook, draft: ClassSpellDraft, existingIndex: number) {
  for (const { classId, column } of workbook.classColumns) {
    const rank = draft.classRanks[classId]
    if (rank === null || rank === undefined) continue
    if (!Number.isInteger(rank) || rank < 0 || rank > 20) throw new Error("CLASS_RANK_INVALID")
    const existingRank = existingIndex >= 0 ? Number.parseInt(cell(workbook.rows[existingIndex], column), 10) : Number.NaN
    if (existingRank === rank) continue
    if (classRankCount(workbook, classId, rank, existingIndex) >= MAX_CLASS_SPELLS_PER_RANK) throw new Error(`CLASS_RANK_FULL:${classId}:${rank}`)
  }
}

function toneForType(workbook: SpellWorkbook, type: string) {
  const category = classSpellCategory(type)
  for (let index = 0; index < workbook.rows.length; index += 1) {
    if (classSpellCategory(cell(workbook.rows[index], workbook.columns.type)) !== category) continue
    const formatted = formattedCell(workbook.cells[index] ?? [], workbook.columns.type)
    if (formatted.backgroundColor) return { background: formatted.backgroundColor, foreground: formatted.foregroundColor || "#ffffff" }
  }
  return classSpellCategoryTones[category]
}

export async function saveClassSpell(rowNumber: number | null, draft: ClassSpellDraft) {
  const workbook = await spellWorkbook(true)
  const existingIndex = rowNumber === null ? -1 : rowNumber - 2
  if (rowNumber !== null && (existingIndex < 0 || !workbook.rows[existingIndex])) throw new Error("CLASS_SPELL_NOT_FOUND")
  const values = rowNumber === null ? workbook.headers.map(() => "") : workbook.headers.map((_, index) => workbook.rows[existingIndex][index] || "")
  const id = draft.id.trim() || `SOR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  if (!draft.name.trim()) throw new Error("CLASS_SPELL_NAME_REQUIRED")
  const duplicateId = workbook.rows.findIndex((row, index) => index !== existingIndex && cell(row, workbook.columns.id).trim() === id)
  if (duplicateId >= 0) throw new Error("CLASS_SPELL_ID_EXISTS")
  assertAvailableClassRanks(workbook, draft, existingIndex)
  values[workbook.columns.id] = id
  values[workbook.columns.name] = draft.name.trim()
  if (workbook.columns.effect >= 0) values[workbook.columns.effect] = draft.effect
  if (workbook.columns.description >= 0) values[workbook.columns.description] = draft.description
  values[workbook.columns.type] = draft.type
  if (workbook.columns.skills >= 0) values[workbook.columns.skills] = draft.skillsRaw
  if (workbook.columns.distance >= 0) values[workbook.columns.distance] = draft.distance
  if (workbook.columns.charges >= 0) values[workbook.columns.charges] = draft.charges === null ? "" : String(Math.max(0, Math.min(5, Math.trunc(draft.charges))))
  workbook.classColumns.forEach(({ classId, column }) => {
    const rank = draft.classRanks[classId]
    values[column] = rank === null || rank === undefined || !Number.isInteger(rank) || rank < 0 || rank > 20 ? "" : String(rank)
  })
  const targetRow = rowNumber ?? workbook.rows.length + 2
  if (rowNumber === null) await appendRows(workbook.file.id, `${quoteTab(workbook.tabName)}!A:${columnName(workbook.headers.length)}`, [values])
  else await updateRange(workbook.file.id, `${quoteTab(workbook.tabName)}!A${rowNumber}:${columnName(workbook.headers.length)}${rowNumber}`, [values])
  if (workbook.columns.effect >= 0 && draft.effectHtml !== undefined) await updateFormattedCell({ spreadsheetId: workbook.file.id, sheetId: workbook.sheetId, rowNumber: targetRow, column: workbook.columns.effect, html: draft.effectHtml })
  if (workbook.columns.description >= 0 && draft.descriptionHtml !== undefined) await updateFormattedCell({ spreadsheetId: workbook.file.id, sheetId: workbook.sheetId, rowNumber: targetRow, column: workbook.columns.description, html: draft.descriptionHtml })
  const tone = toneForType(workbook, draft.type)
  await updateCellColors({ spreadsheetId: workbook.file.id, sheetId: workbook.sheetId, rowNumber: targetRow, column: workbook.columns.type, background: tone.background, foreground: tone.foreground })
  return { id, rowNumber: targetRow, tone }
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

export async function deleteClassSpell(rowNumber: number) {
  const workbook = await spellWorkbook(true)
  if (!workbook.rows[rowNumber - 2]) throw new Error("CLASS_SPELL_NOT_FOUND")
  await deleteGoogleSheetRow(workbook.file.id, workbook.tabName, rowNumber)
}

export function findSpellSimilarities(spells: ClassSpell[]) {
  return findClassSpellSimilarities(spells)
}

export async function listClassResources(refresh = false) {
  const data = await listClassSpells(refresh)
  return { ...data, similarities: findSpellSimilarities(data.spells) }
}
