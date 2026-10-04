import { newIndexId } from "@/lib/index-columns"
import { appendRows, deleteSheetRowWhere, ensureJdrSheet, ensureNamedColumns, namedAppendRange, namedRowWrites, readNamedSheet, resolveJdrSheet, updateRanges } from "@/lib/google-sheets"

/**
 * Le glossaire des règles. La feuille « Vocabulaire » a trois colonnes : Nom (l'ancien
 * « Titre », toujours lu sous ce nom), Contenu et ID — c'est aussi l'Index du vocabulaire,
 * sur le moteur des index. Une entrée est repérée par son numéro de ligne, et le nom
 * attendu sert de garde-fou quand la feuille a bougé entre la lecture et l'écriture. Les
 * colonnes sont retrouvées par leur nom : les déplacer dans Drive ne change rien.
 */
export type VocabularyEntry = {
  rowNumber: number
  title: string
  content: string
}

const MAX_TITLE_LENGTH = 160
const MAX_CONTENT_LENGTH = 45_000

function normalizeInput(input: { title: string; content: string }) {
  const title = input.title.replace(/\s+/g, " ").trim()
  const content = input.content.trim()
  if (!title || title.length > MAX_TITLE_LENGTH) throw new Error("INVALID_VOCABULARY_TITLE")
  if (content.length > MAX_CONTENT_LENGTH) throw new Error("VOCABULARY_CONTENT_TOO_LONG")
  return { title, content }
}

function sortVocabulary(entries: VocabularyEntry[]) {
  return [...entries].sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base", numeric: true }))
}

async function vocabularySheet() {
  const sheet = await ensureJdrSheet("vocabulary")
  if (!sheet) throw new Error("VOCABULARY_SHEET_UNAVAILABLE")
  return sheet
}

// « ID » n'est pas exigé : il est ajouté par l'Index du vocabulaire (jamais créé vide d'ici).
const VOCABULARY_HEADERS = ["Nom", "Contenu"]
/** « Titre » : le nom de la colonne Nom avant le moteur des index. */
const VOCABULARY_ALIASES = { Nom: ["Titre"] }

/** `fresh` pour une écriture : la feuille telle qu'elle est maintenant, jamais une copie gardée en mémoire. */
function readVocabularySheet(spreadsheetId: string, tabName: string, options: { fresh?: boolean } = {}) {
  return readNamedSheet(spreadsheetId, tabName, VOCABULARY_HEADERS, { ...options, aliases: VOCABULARY_ALIASES })
}

async function readEntries(spreadsheetId: string, tabName: string, options: { fresh?: boolean } = {}) {
  const { columns, rows } = await readVocabularySheet(spreadsheetId, tabName, options)
  return rows
    .map((row, index): VocabularyEntry => ({ rowNumber: index + 2, title: columns.get(row, "Nom").trim(), content: columns.get(row, "Contenu") }))
    .filter((entry) => entry.title)
}

/** Lecture seule : relie la feuille si elle existe déjà dans Drive, sans jamais la créer. */
export async function listVocabulary() {
  const sheet = await resolveJdrSheet("vocabulary")
  if (!sheet) return []
  return sortVocabulary(await readEntries(sheet.spreadsheetId, sheet.tabName))
}

/**
 * Retrouve la ligne d'une entrée dans la feuille relue, même si des lignes ont été ajoutées
 * ou retirées ailleurs. Ailleurs qu'à la ligne attendue, le titre doit être unique : deux
 * entrées du même titre ne sont jamais confondues.
 */
async function locateEntry(rowNumber: number, expectedTitle: string) {
  const sheet = await vocabularySheet()
  const entries = await readEntries(sheet.spreadsheetId, sheet.tabName, { fresh: true })
  const homonyms = entries.filter((item) => item.title === expectedTitle)
  const entry = homonyms.find((item) => item.rowNumber === rowNumber) ?? (homonyms.length === 1 ? homonyms[0] : null)
  if (!entry) throw new Error("VOCABULARY_NOT_FOUND")
  return { sheet, entry }
}

export async function createVocabularyEntry(input: { title: string; content: string }): Promise<VocabularyEntry> {
  const values = normalizeInput(input)
  const sheet = await vocabularySheet()
  const { columns: read } = await readVocabularySheet(sheet.spreadsheetId, sheet.tabName)
  const columns = await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, read)
  // RAW : un titre qui commence par « = » ou « + » reste du texte, pas une formule.
  // Chaque mot reçoit son identifiant, comme une ligne ajoutée depuis l'index (si la colonne ID existe déjà).
  const id = columns.at("ID") >= 0 ? { ID: newIndexId("VOC") } : {}
  const result = await appendRows(sheet.spreadsheetId, namedAppendRange(sheet.tabName, columns), [columns.row({ Nom: values.title, Contenu: values.content, ...id })], { valueInputOption: "RAW" })
  const rowNumber = Number(result.updatedRange.match(/![A-Z]+(\d+)/)?.[1])
  if (!Number.isInteger(rowNumber)) throw new Error("VOCABULARY_APPEND_FAILED")
  return { rowNumber, ...values }
}

/** Liste fraîche après une écriture : une suppression décale les lignes suivantes. */
export async function listVocabularyAfterWrite() {
  const sheet = await vocabularySheet()
  return sortVocabulary(await readEntries(sheet.spreadsheetId, sheet.tabName, { fresh: true }))
}

export async function updateVocabularyEntry(rowNumber: number, expectedTitle: string, input: { title: string; content: string }): Promise<VocabularyEntry> {
  const values = normalizeInput(input)
  const { sheet, entry } = await locateEntry(rowNumber, expectedTitle)
  const { columns } = await readVocabularySheet(sheet.spreadsheetId, sheet.tabName, { fresh: true })
  await updateRanges(sheet.spreadsheetId, namedRowWrites(sheet.tabName, columns, entry.rowNumber, { Nom: values.title, Contenu: values.content }), { valueInputOption: "RAW" })
  return { rowNumber: entry.rowNumber, ...values }
}

export async function deleteVocabularyEntry(rowNumber: number, expectedTitle: string) {
  const { sheet, entry } = await locateEntry(rowNumber, expectedTitle)
  // Le nom est revérifié dans la feuille juste avant (sous son en-tête actuel, Nom ou Titre) : sinon rien n'est supprimé.
  const { columns } = await readVocabularySheet(sheet.spreadsheetId, sheet.tabName, { fresh: true })
  const header = columns.headers[columns.at("Nom")] || "Nom"
  await deleteSheetRowWhere(sheet.spreadsheetId, sheet.tabName, entry.rowNumber, header, entry.title)
}
