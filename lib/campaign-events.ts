import {
  appendRows,
  campaignEventSheetHeaders,
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
  updateRanges,
} from "@/lib/google-sheets"
import { withAsyncLock } from "@/lib/async-lock"
import { cleanSessionEvent, type SessionEvent } from "@/lib/campaign-sessions"

/**
 * Un événement préparé dans la page Événements d'une campagne : une créature, un PNJ
 * générique ou un événement libre, avec son nom, son image, son étiquette et son texte.
 * Il se range dans la feuille « Événements de campagne » et s'envoie dans les sessions
 * (qui gardent son identifiant). Les marchés ambulants sont des magasins (feuille Magasins).
 */
export type CampaignEvent = SessionEvent & { campaignId: string; createdByUid: string; createdAt: string; updatedAt: string }

const COLUMNS = campaignEventSheetHeaders.length
const LAST_COLUMN = columnName(COLUMNS)

async function eventsSheet() {
  const sheet = await ensureJdrSheet("campaign_events")
  if (!sheet) throw new Error("EVENTS_SHEET_UNAVAILABLE")
  return sheet
}

async function readEventRows() {
  const sheet = await eventsSheet()
  const named = await readNamedSheet(sheet.spreadsheetId, sheet.tabName, campaignEventSheetHeaders, { fresh: true })
  const columns = await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, named.columns)
  return { sheet, columns, rows: named.rows.map((row) => canonicalRow(columns, row)), raw: named.rows, startRow: 2 }
}

function eventFromRow(row: string[]): CampaignEvent | null {
  if (!row[0] || !row[1]) return null
  const event = cleanSessionEvent({ id: row[0], kind: row[2], refId: row[3], name: row[4], icon: row[5], image: row[6], tag: row[7], tagColor: row[8], description: row[9] })
  if (!event) return null
  return { ...event, campaignId: row[1], createdByUid: row[10] || "", createdAt: row[11] || "", updatedAt: row[12] || "" }
}

function eventRow(event: CampaignEvent) {
  return [event.id, event.campaignId, event.kind, event.refId, event.name, event.icon, event.image, event.tag, event.tagColor, event.description, event.createdByUid, event.createdAt, event.updatedAt]
}

function eventCells(event: CampaignEvent): Record<string, string> {
  return Object.fromEntries(campaignEventSheetHeaders.map((header, index) => [header, eventRow(event)[index] ?? ""]))
}

export async function listCampaignEvents(campaignId: string) {
  const { rows } = await readEventRows()
  return rows.map(eventFromRow)
    .filter((event): event is CampaignEvent => Boolean(event && event.campaignId === campaignId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

/**
 * Crée ou modifie un événement : relu juste avant d'écrire, sous verrou. Une modification
 * garde son créateur et sa date de création ; un événement d'une autre campagne est refusé.
 */
export async function saveCampaignEvent(campaignId: string, value: unknown, createdByUid: string) {
  const clean = cleanSessionEvent(value)
  if (!clean) throw new Error("INVALID_EVENT")
  return withAsyncLock("campaign-events", async () => {
    const { sheet, columns, rows, raw, startRow } = await readEventRows()
    const index = rows.findIndex((row) => row[0] === clean.id)
    const current = index >= 0 ? eventFromRow(rows[index]) : null
    if (index >= 0 && current?.campaignId !== campaignId) throw new Error("EVENT_NOT_FOUND")
    const now = new Date().toISOString()
    const event: CampaignEvent = { ...clean, campaignId, createdByUid: current?.createdByUid || createdByUid, createdAt: current?.createdAt || now, updatedAt: now }
    if (index >= 0) {
      await updateRanges(sheet.spreadsheetId, namedRowWrites(sheet.tabName, columns, startRow + index, eventCells(event)), { valueInputOption: "RAW" })
    } else {
      // Une ligne blanchie par une suppression est réutilisée avant d'ajouter à la fin.
      const free = raw.findIndex((row) => !row.some((cell) => cell?.trim()))
      if (free >= 0) {
        const rowNumber = startRow + free
        await updateRanges(sheet.spreadsheetId, canonicalWrites(sheet.tabName, columns, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`, [eventRow(event)]), { valueInputOption: "RAW" })
      } else {
        await appendRows(sheet.spreadsheetId, namedAppendRange(sheet.tabName, columns), canonicalRows(columns, [eventRow(event)]), { valueInputOption: "RAW" })
      }
    }
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    return event
  })
}

/** Supprime un événement (sa ligne est blanchie). Les sessions qui le citaient ne l'affichent plus. */
export async function deleteCampaignEvent(campaignId: string, eventId: string) {
  return withAsyncLock("campaign-events", async () => {
    const { sheet, columns, rows, startRow } = await readEventRows()
    const index = rows.findIndex((row) => row[0] === eventId && row[1] === campaignId)
    if (index < 0) throw new Error("EVENT_NOT_FOUND")
    const rowNumber = startRow + index
    await updateRanges(sheet.spreadsheetId, canonicalWrites(sheet.tabName, columns, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`, [Array(COLUMNS).fill("")]), { valueInputOption: "RAW" })
    clearSpreadsheetReadCache(sheet.spreadsheetId)
  })
}
