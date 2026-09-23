import {
  appendRows,
  clearSpreadsheetReadCache,
  ensureJdrSheet,
  listCampaignMembers,
  listNpcs,
  listSavedShops,
  readRangeFreshWithOffset,
  repairJdrSheet,
  saveGeneratedShops,
  saveNpcs,
  sheetTabRange,
  updateRanges,
} from "@/lib/google-sheets"
import { getSharedMedia, putSharedMedia } from "@/lib/shared-media"

/**
 * Une session du Créateur de session : ses joueurs, ses PNJs et ses magasins.
 * Les PNJs et magasins restent dans leurs propres feuilles : une session ne
 * garde que leurs identifiants, un même PNJ peut donc revenir d'une session à l'autre.
 */
export type CampaignSessionRecord = {
  id: string
  campaignId: string
  name: string
  bannerUrl: string
  characterIds: string[]
  npcIds: string[]
  shopIds: string[]
  createdByUid: string
  createdAt: string
  updatedAt: string
}

export type SessionMembership = { characterIds?: string[]; npcIds?: string[]; shopIds?: string[] }

const COLUMNS = 10
const LAST_COLUMN = "J"

function idList(value: string | undefined) {
  try {
    const parsed = JSON.parse(value || "[]") as unknown
    return Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0))] : []
  } catch {
    return []
  }
}

function sessionFromRow(row: string[]): CampaignSessionRecord | null {
  if (!row[0] || !row[1]) return null
  return {
    id: row[0],
    campaignId: row[1],
    name: row[2] || "Session sans titre",
    bannerUrl: row[3] || "",
    characterIds: idList(row[4]),
    npcIds: idList(row[5]),
    shopIds: idList(row[6]),
    createdByUid: row[7] || "",
    createdAt: row[8] || "",
    updatedAt: row[9] || "",
  }
}

function sessionRow(session: CampaignSessionRecord) {
  return [
    session.id, session.campaignId, session.name, session.bannerUrl,
    JSON.stringify(session.characterIds), JSON.stringify(session.npcIds), JSON.stringify(session.shopIds),
    session.createdByUid, session.createdAt, session.updatedAt,
  ]
}

async function sessionsSheet() {
  const sheet = await ensureJdrSheet("sessions")
  if (!sheet) throw new Error("SESSIONS_SHEET_UNAVAILABLE")
  return sheet
}

async function readSessionRows() {
  const read = async () => {
    const sheet = await sessionsSheet()
    const { rows, startRow } = await readRangeFreshWithOffset(sheet.spreadsheetId, sheetTabRange(sheet.tabName, `A2:${LAST_COLUMN}`))
    return { sheet, rows, startRow }
  }
  try {
    return await read()
  } catch (error) {
    // Onglet « Sessions » supprimé ou classeur effacé à la main : on revérifie la
    // feuille (onglet recréé, ou classeur retrouvé par son nom dans Drive), puis on
    // relit une seule fois.
    console.error("SESSIONS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    await repairJdrSheet("sessions")
    return read()
  }
}

/** Ordre de création : la première session créée en premier. */
function byCreation(left: CampaignSessionRecord, right: CampaignSessionRecord) {
  return left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name, "fr")
}

export async function listCampaignSessions(campaignId: string) {
  const { rows } = await readSessionRows()
  return rows.map(sessionFromRow)
    .filter((session): session is CampaignSessionRecord => Boolean(session && session.campaignId === campaignId))
    .sort(byCreation)
}

export async function getCampaignSession(campaignId: string, sessionId: string) {
  return (await listCampaignSessions(campaignId)).find((session) => session.id === sessionId) ?? null
}

async function writeSession(session: CampaignSessionRecord) {
  const { sheet, rows, startRow } = await readSessionRows()
  const index = rows.findIndex((row) => row[0] === session.id && row[1] === session.campaignId)
  if (index < 0) throw new Error("SESSION_NOT_FOUND")
  const rowNumber = startRow + index
  await updateRanges(sheet.spreadsheetId, [{ range: sheetTabRange(sheet.tabName, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`), values: [sessionRow(session)] }], { valueInputOption: "RAW" })
  clearSpreadsheetReadCache(sheet.spreadsheetId)
  return session
}

/**
 * Une nouvelle session reçoit tous les personnages joueurs de la campagne. La toute
 * première reprend aussi ce que l'ancien Créateur de session contenait (PNJs et
 * magasins marqués « dans la campagne ») : rien de ce qui était préparé ne disparaît.
 */
export async function createCampaignSession(campaignId: string, name: string, createdByUid: string) {
  const [existing, members] = await Promise.all([listCampaignSessions(campaignId), listCampaignMembers(campaignId)])
  const [legacyNpcs, legacyShops] = existing.length
    ? [[], []]
    : await Promise.all([listNpcs(campaignId, true).catch(() => []), listSavedShops(campaignId, true).catch(() => [])])
  const now = new Date().toISOString()
  const session: CampaignSessionRecord = {
    id: crypto.randomUUID(),
    campaignId,
    name,
    bannerUrl: "",
    characterIds: members.map((member) => member.id),
    npcIds: legacyNpcs.map((npc) => npc.id),
    shopIds: legacyShops.map((shop) => shop.id),
    createdByUid,
    createdAt: now,
    updatedAt: now,
  }
  const sheet = await sessionsSheet()
  // Les lignes blanchies par une suppression sont réutilisées avant d'ajouter à la fin.
  const { rows, startRow } = await readSessionRows()
  const free = rows.findIndex((row) => !row.slice(0, COLUMNS).some((cell) => cell?.trim()))
  if (free >= 0) {
    const rowNumber = startRow + free
    await updateRanges(sheet.spreadsheetId, [{ range: sheetTabRange(sheet.tabName, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`), values: [sessionRow(session)] }], { valueInputOption: "RAW" })
  } else {
    await appendRows(sheet.spreadsheetId, sheetTabRange(sheet.tabName, `A:${LAST_COLUMN}`), [sessionRow(session)], { valueInputOption: "RAW" })
  }
  clearSpreadsheetReadCache(sheet.spreadsheetId)
  return session
}

export async function renameCampaignSession(campaignId: string, sessionId: string, name: string) {
  const session = await getCampaignSession(campaignId, sessionId)
  if (!session) throw new Error("SESSION_NOT_FOUND")
  return writeSession({ ...session, name, updatedAt: new Date().toISOString() })
}

function merged(current: string[], add: string[] = [], remove: string[] = []) {
  const removed = new Set(remove)
  return [...new Set([...current, ...add])].filter((id) => !removed.has(id))
}

/**
 * Ajoute ou retire des joueurs, PNJs et magasins. Le drapeau « Ajouté au créateur de
 * session » des PNJs et magasins suit : il vaut « Oui » tant qu'ils figurent dans au
 * moins une session (le pont Roll20 « Tout synchroniser » et la visibilité côté
 * joueurs s'appuient encore dessus).
 */
export async function updateSessionMembership(campaignId: string, sessionId: string, add: SessionMembership, remove: SessionMembership) {
  const sessions = await listCampaignSessions(campaignId)
  const session = sessions.find((candidate) => candidate.id === sessionId)
  if (!session) throw new Error("SESSION_NOT_FOUND")
  const next: CampaignSessionRecord = {
    ...session,
    characterIds: merged(session.characterIds, add.characterIds, remove.characterIds),
    npcIds: merged(session.npcIds, add.npcIds, remove.npcIds),
    shopIds: merged(session.shopIds, add.shopIds, remove.shopIds),
    updatedAt: new Date().toISOString(),
  }
  await writeSession(next)
  const others = sessions.filter((candidate) => candidate.id !== sessionId)
  await syncCampaignFlags(campaignId, next, others, add, remove)
  return next
}

async function syncCampaignFlags(campaignId: string, session: CampaignSessionRecord, others: CampaignSessionRecord[], add: SessionMembership, remove: SessionMembership) {
  const touchedNpcIds = new Set([...(add.npcIds || []), ...(remove.npcIds || [])])
  const touchedShopIds = new Set([...(add.shopIds || []), ...(remove.shopIds || [])])
  const npcInASession = new Set([...session.npcIds, ...others.flatMap((other) => other.npcIds)])
  const shopInASession = new Set([...session.shopIds, ...others.flatMap((other) => other.shopIds)])
  if (touchedNpcIds.size) {
    const npcs = (await listNpcs(campaignId)).filter((npc) => touchedNpcIds.has(npc.id))
    const toAdd = npcs.filter((npc) => npcInASession.has(npc.id) && !npc.inCampaign)
    const toRemove = npcs.filter((npc) => !npcInASession.has(npc.id) && npc.inCampaign)
    if (toAdd.length) await saveNpcs(campaignId, toAdd, { inCampaign: true })
    if (toRemove.length) await saveNpcs(campaignId, toRemove, { inCampaign: false })
  }
  if (touchedShopIds.size) {
    const shops = (await listSavedShops(campaignId)).filter((shop) => touchedShopIds.has(shop.id))
    const toAdd = shops.filter((shop) => shopInASession.has(shop.id) && !shop.inCampaign)
    const toRemove = shops.filter((shop) => !shopInASession.has(shop.id) && shop.inCampaign)
    if (toAdd.length) await saveGeneratedShops(campaignId, toAdd, { inCampaign: true })
    if (toRemove.length) await saveGeneratedShops(campaignId, toRemove, { inCampaign: false })
  }
}

/** Supprime la session seule : ses PNJs et magasins restent dans la campagne. */
export async function deleteCampaignSession(campaignId: string, sessionId: string) {
  const sessions = await listCampaignSessions(campaignId)
  const session = sessions.find((candidate) => candidate.id === sessionId)
  if (!session) throw new Error("SESSION_NOT_FOUND")
  const { sheet, rows, startRow } = await readSessionRows()
  const index = rows.findIndex((row) => row[0] === sessionId && row[1] === campaignId)
  if (index < 0) throw new Error("SESSION_NOT_FOUND")
  const rowNumber = startRow + index
  await updateRanges(sheet.spreadsheetId, [{ range: sheetTabRange(sheet.tabName, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`), values: [Array(COLUMNS).fill("")] }], { valueInputOption: "RAW" })
  clearSpreadsheetReadCache(sheet.spreadsheetId)
  const emptied = { ...session, npcIds: [], shopIds: [], characterIds: [] }
  await syncCampaignFlags(campaignId, emptied, sessions.filter((candidate) => candidate.id !== sessionId), {}, { npcIds: session.npcIds, shopIds: session.shopIds })
}

function bannerKey(campaignId: string, sessionId: string) {
  return `campaigns/${campaignId}/sessions/${sessionId}/banner`
}

export function sessionBannerUrl(campaignId: string, sessionId: string, version = Date.now()) {
  return `/api/campaigns/${encodeURIComponent(campaignId)}/sessions/${encodeURIComponent(sessionId)}/banner?v=${version}`
}

export async function saveSessionBanner(campaignId: string, sessionId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("INVALID_BANNER")
  const session = await getCampaignSession(campaignId, sessionId)
  if (!session) throw new Error("SESSION_NOT_FOUND")
  await putSharedMedia(bannerKey(campaignId, sessionId), await file.arrayBuffer(), file.type)
  return writeSession({ ...session, bannerUrl: sessionBannerUrl(campaignId, sessionId), updatedAt: new Date().toISOString() })
}

export async function readSessionBanner(campaignId: string, sessionId: string) {
  return getSharedMedia(bannerKey(campaignId, sessionId))
}
