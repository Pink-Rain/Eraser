import { appendRows, deleteGoogleSheetRow, ensureJdrSheet, readRange, resolveJdrSheet, sheetTabRange, updateRange } from "@/lib/google-sheets"

/**
 * Le glossaire des règles. La feuille « Vocabulaire » n'a que deux colonnes,
 * Titre et Contenu, pour rester lisible et modifiable à la main dans Drive :
 * une entrée est donc repérée par son numéro de ligne, et le titre attendu sert
 * de garde-fou quand la feuille a bougé entre la lecture et l'écriture.
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

export function sortVocabulary(entries: VocabularyEntry[]) {
  return [...entries].sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base", numeric: true }))
}

async function vocabularySheet() {
  const sheet = await ensureJdrSheet("vocabulary")
  if (!sheet) throw new Error("VOCABULARY_SHEET_UNAVAILABLE")
  return sheet
}

async function readEntries(spreadsheetId: string, tabName: string) {
  const rows = await readRange(spreadsheetId, sheetTabRange(tabName, "A2:B"))
  return rows
    .map((row, index): VocabularyEntry => ({ rowNumber: index + 2, title: (row[0] || "").trim(), content: row[1] || "" }))
    .filter((entry) => entry.title)
}

/** Lecture seule : relie la feuille si elle existe déjà dans Drive, sans jamais la créer. */
export async function listVocabulary() {
  const sheet = await resolveJdrSheet("vocabulary")
  if (!sheet) return []
  return sortVocabulary(await readEntries(sheet.spreadsheetId, sheet.tabName))
}

/** Retrouve la ligne d'une entrée, même si des lignes ont été ajoutées ou retirées dans Drive. */
async function locateEntry(rowNumber: number, expectedTitle: string) {
  const sheet = await vocabularySheet()
  const entries = await readEntries(sheet.spreadsheetId, sheet.tabName)
  const entry = entries.find((item) => item.rowNumber === rowNumber && item.title === expectedTitle)
    ?? entries.find((item) => item.title === expectedTitle)
  if (!entry) throw new Error("VOCABULARY_NOT_FOUND")
  return { sheet, entry }
}

export async function createVocabularyEntry(input: { title: string; content: string }): Promise<VocabularyEntry> {
  const values = normalizeInput(input)
  const sheet = await vocabularySheet()
  // RAW : un titre qui commence par « = » ou « + » reste du texte, pas une formule.
  const result = await appendRows(sheet.spreadsheetId, sheetTabRange(sheet.tabName, "A:B"), [[values.title, values.content]], { valueInputOption: "RAW" })
  const rowNumber = Number(result.updatedRange.match(/![A-Z]+(\d+)/)?.[1])
  if (!Number.isInteger(rowNumber)) throw new Error("VOCABULARY_APPEND_FAILED")
  return { rowNumber, ...values }
}

/** Liste fraîche après une écriture : une suppression décale les lignes suivantes. */
export async function listVocabularyAfterWrite() {
  const sheet = await vocabularySheet()
  return sortVocabulary(await readEntries(sheet.spreadsheetId, sheet.tabName))
}

export async function updateVocabularyEntry(rowNumber: number, expectedTitle: string, input: { title: string; content: string }): Promise<VocabularyEntry> {
  const values = normalizeInput(input)
  const { sheet, entry } = await locateEntry(rowNumber, expectedTitle)
  await updateRange(sheet.spreadsheetId, sheetTabRange(sheet.tabName, `A${entry.rowNumber}:B${entry.rowNumber}`), [[values.title, values.content]], { valueInputOption: "RAW" })
  return { rowNumber: entry.rowNumber, ...values }
}

export async function deleteVocabularyEntry(rowNumber: number, expectedTitle: string) {
  const { sheet, entry } = await locateEntry(rowNumber, expectedTitle)
  await deleteGoogleSheetRow(sheet.spreadsheetId, sheet.tabName, entry.rowNumber)
}
