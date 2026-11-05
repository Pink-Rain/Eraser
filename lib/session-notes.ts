import {
  appendRows,
  canonicalRow,
  canonicalRows,
  canonicalWrites,
  clearSpreadsheetReadCache,
  columnName,
  ensureJdrSheet,
  ensureNamedColumns,
  namedAppendRange,
  namedRowWrites,
  readNamedSheet,
  resolveJdrSheet,
  sessionNoteSheetHeaders,
  updateRanges,
} from "@/lib/google-sheets"
import { withAsyncLock } from "@/lib/async-lock"
import { cleanSessionNote, compareSessionNotes, type SessionNote, type SessionNoteViewer, canEditSessionNote, canReadSessionNote } from "@/lib/session-note-rules"

export * from "@/lib/session-note-rules"

/**
 * Les notes du journal de session, dans la feuille « Notes de session ». Une note publique
 * va dans le journal de la campagne (tout le monde la lit) ; une note privée est celle d'un
 * personnage, prise dans sa fiche, et n'est jamais renvoyée qu'à son auteur.
 */
const COLUMNS = sessionNoteSheetHeaders.length
const LAST_COLUMN = columnName(COLUMNS)

function noteFromRow(row: string[]): SessionNote | null {
  if (!row[0] || !row[1] || !row[2]) return null
  let links: unknown = []
  let quest: unknown = null
  try { links = JSON.parse(row[9] || "[]") } catch { links = [] }
  try { quest = row[10] ? JSON.parse(row[10]) : null } catch { quest = null }
  return cleanSessionNote({
    id: row[0], campaignId: row[1], sessionId: row[2], private: row[3] === "Privée", characterId: row[4], type: row[5],
    title: row[6], text: row[7], moment: row[8], links, quest, authorName: row[11], authorUid: row[12], createdAt: row[13], updatedAt: row[14], order: row[15],
  })
}

function noteRow(note: SessionNote) {
  return [note.id, note.campaignId, note.sessionId, note.private ? "Privée" : "Publique", note.characterId, note.type, note.title, note.text, note.moment,
    JSON.stringify(note.links), note.quest ? JSON.stringify(note.quest) : "", note.authorName, note.authorUid, note.createdAt, note.updatedAt, note.order ? String(note.order) : ""]
}

function noteCells(note: SessionNote): Record<string, string> {
  const row = noteRow(note)
  return Object.fromEntries(sessionNoteSheetHeaders.map((header, index) => [header, row[index] ?? ""]))
}

/**
 * Les notes qu'un compte peut lire dans une campagne : les publiques et ses propres notes
 * privées. Lecture partagée entre installations ; la feuille n'est jamais créée ici.
 */
export async function listSessionNotes(campaignId: string, viewer: SessionNoteViewer) {
  const sheet = await resolveJdrSheet("session_notes")
  if (!sheet) return [] as SessionNote[]
  const named = await readNamedSheet(sheet.spreadsheetId, sheet.tabName, sessionNoteSheetHeaders)
  return named.rows.map((row) => noteFromRow(canonicalRow(named.columns, row)))
    .filter((note): note is SessionNote => Boolean(note && note.campaignId === campaignId && canReadSessionNote(note, viewer)))
    .sort(compareSessionNotes)
}

async function readNoteRows() {
  const sheet = await ensureJdrSheet("session_notes")
  if (!sheet) throw new Error("NOTES_SHEET_UNAVAILABLE")
  const named = await readNamedSheet(sheet.spreadsheetId, sheet.tabName, sessionNoteSheetHeaders, { fresh: true })
  const columns = await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, named.columns)
  return { sheet, columns, rows: named.rows.map((row) => canonicalRow(columns, row)), raw: named.rows, startRow: 2 }
}

/**
 * Crée ou modifie une note, relue juste avant d'écrire, sous verrou. Une note existante ne
 * change ni d'auteur, ni de campagne, ni de visibilité ; seul son auteur la modifie (le MJ et
 * l'admin aussi pour une note publique). `sessionIds` : les sessions de la campagne.
 */
export async function saveSessionNote(campaignId: string, value: unknown, viewer: SessionNoteViewer & { name: string }, sessionIds: string[]) {
  const clean = cleanSessionNote({ ...(value && typeof value === "object" ? value : {}), campaignId, authorUid: viewer.uid, authorName: viewer.name })
  if (!clean || !clean.text.trim() && !clean.title.trim()) throw new Error("INVALID_NOTE")
  if (!sessionIds.includes(clean.sessionId)) throw new Error("SESSION_NOT_FOUND")
  return withAsyncLock("session-notes", async () => {
    const { sheet, columns, rows, raw, startRow } = await readNoteRows()
    const index = rows.findIndex((row) => row[0] === clean.id)
    const current = index >= 0 ? noteFromRow(rows[index]) : null
    if (index >= 0 && (!current || current.campaignId !== campaignId || !canEditSessionNote(current, viewer))) throw new Error("NOTE_FORBIDDEN")
    // Une nouvelle note privée appartient à un personnage ; une note existante garde sa visibilité.
    if (!current && clean.private && !clean.characterId) throw new Error("INVALID_NOTE")
    const now = new Date().toISOString()
    // La place dans la frise ne change qu'en glissant l'événement (reorderSessionEvents) ; une
    // note nouvelle, ou passée dans une autre session, arrive au bout de la frise.
    const order = current && current.sessionId === clean.sessionId && clean.type === "evenement" ? current.order : 0
    const note: SessionNote = current
      ? { ...clean, private: current.private, characterId: current.characterId, authorUid: current.authorUid, authorName: current.authorName, createdAt: current.createdAt, updatedAt: now, order }
      : { ...clean, createdAt: now, updatedAt: now, order }
    // Une quête cochée garde la session où elle l'a été ; décochée, elle l'oublie.
    if (note.quest) note.quest = note.quest.done ? { ...note.quest, doneIn: note.quest.doneIn || note.sessionId } : { ...note.quest, doneIn: "" }
    if (index >= 0) {
      await updateRanges(sheet.spreadsheetId, namedRowWrites(sheet.tabName, columns, startRow + index, noteCells(note)), { valueInputOption: "RAW" })
    } else {
      const free = raw.findIndex((row) => !row.some((cell) => cell?.trim()))
      if (free >= 0) {
        const rowNumber = startRow + free
        await updateRanges(sheet.spreadsheetId, canonicalWrites(sheet.tabName, columns, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`, [noteRow(note)]), { valueInputOption: "RAW" })
      } else {
        await appendRows(sheet.spreadsheetId, namedAppendRange(sheet.tabName, columns), canonicalRows(columns, [noteRow(note)]), { valueInputOption: "RAW" })
      }
    }
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    return note
  })
}

/**
 * Range la frise d'une session : `ids`, les événements dans leur nouvel ordre, prennent les
 * places 1, 2, 3… Seule la case « Ordre » (et « Modifié le ») de leurs lignes est écrite, en
 * une fois. Chaque événement doit être de cette session et modifiable par ce compte.
 */
export async function reorderSessionEvents(campaignId: string, sessionId: string, ids: unknown, viewer: SessionNoteViewer) {
  const list = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && Boolean(id)) : []
  if (!list.length || list.length > 500 || new Set(list).size !== list.length) throw new Error("INVALID_ORDER")
  return withAsyncLock("session-notes", async () => {
    const { sheet, columns, rows, startRow } = await readNoteRows()
    const found = list.map((id) => {
      const index = rows.findIndex((row) => row[0] === id && row[1] === campaignId)
      const note = index >= 0 ? noteFromRow(rows[index]) : null
      if (!note || note.sessionId !== sessionId || note.type !== "evenement") throw new Error("NOTE_NOT_FOUND")
      if (!canEditSessionNote(note, viewer)) throw new Error("NOTE_FORBIDDEN")
      return { index, note }
    })
    const now = new Date().toISOString()
    const moved = found.flatMap(({ index, note }, position) => note.order === position + 1 ? [] : [{ index, note: { ...note, order: position + 1, updatedAt: now } }])
    if (moved.length) {
      await updateRanges(sheet.spreadsheetId, moved.flatMap(({ index, note }) => namedRowWrites(sheet.tabName, columns, startRow + index, { Ordre: String(note.order), "Modifié le": note.updatedAt })), { valueInputOption: "RAW" })
      clearSpreadsheetReadCache(sheet.spreadsheetId)
    }
    return moved.map(({ note }) => note)
  })
}

/** Supprime une note (sa ligne est blanchie) : mêmes droits que pour la modifier. */
export async function deleteSessionNote(campaignId: string, noteId: string, viewer: SessionNoteViewer) {
  return withAsyncLock("session-notes", async () => {
    const { sheet, columns, rows, startRow } = await readNoteRows()
    const index = rows.findIndex((row) => row[0] === noteId && row[1] === campaignId)
    const current = index >= 0 ? noteFromRow(rows[index]) : null
    if (!current) throw new Error("NOTE_NOT_FOUND")
    if (!canEditSessionNote(current, viewer)) throw new Error("NOTE_FORBIDDEN")
    const rowNumber = startRow + index
    await updateRanges(sheet.spreadsheetId, canonicalWrites(sheet.tabName, columns, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`, [Array(COLUMNS).fill("")]), { valueInputOption: "RAW" })
    clearSpreadsheetReadCache(sheet.spreadsheetId)
  })
}
