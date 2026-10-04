import {
  appendRows,
  canonicalRow,
  canonicalRows,
  canonicalWrites,
  clearSpreadsheetReadCache,
  ensureJdrSheet,
  ensureNamedColumns,
  listCampaignMembers,
  listNpcs,
  listSavedShops,
  namedAppendRange,
  namedRowWrites,
  readNamedSheet,
  repairJdrSheet,
  saveGeneratedShops,
  saveNpcs,
  sessionSheetHeaders,
  updateRanges,
} from "@/lib/google-sheets"
import { withAsyncLock } from "@/lib/async-lock"
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

/** Les sessions décrites dans l'ordre prévu par Eraser : dix colonnes, de A à J. */
const COLUMNS = sessionSheetHeaders.length
const LAST_COLUMN = "J"

/**
 * Une liste d'identifiants (JSON). `strict` pour une écriture : une case remplie mais
 * illisible n'est pas une liste vide, sinon l'enregistrement suivant l'écrasait par « [] ».
 */
function idList(value: string | undefined, strict = false) {
  try {
    const parsed = JSON.parse(value || "[]") as unknown
    if (!Array.isArray(parsed)) throw new Error("NOT_A_LIST")
    return [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0))]
  } catch {
    if (strict) throw new Error("SESSION_LISTS_UNREADABLE")
    return []
  }
}

function sessionFromRow(row: string[], strict = false): CampaignSessionRecord | null {
  if (!row[0] || !row[1]) return null
  return {
    id: row[0],
    campaignId: row[1],
    name: row[2] || "Session sans titre",
    bannerUrl: row[3] || "",
    characterIds: idList(row[4], strict),
    npcIds: idList(row[5], strict),
    shopIds: idList(row[6], strict),
    createdByUid: row[7] || "",
    createdAt: row[8] || "",
    updatedAt: row[9] || "",
  }
}

/** Les cases d'une session sous leur en-tête : seules celles qui changent sont écrites. */
function sessionCells(change: Partial<CampaignSessionRecord>) {
  const cells: Record<string, string> = {}
  // Écrites en RAW : un titre qui commence par « - » ou « = » reste du texte tel quel.
  if (change.name !== undefined) cells["Titre"] = change.name
  if (change.bannerUrl !== undefined) cells["Bannière"] = change.bannerUrl
  if (change.characterIds !== undefined) cells["Personnages (JSON)"] = JSON.stringify(change.characterIds)
  if (change.npcIds !== undefined) cells["PNJs (JSON)"] = JSON.stringify(change.npcIds)
  if (change.shopIds !== undefined) cells["Magasins (JSON)"] = JSON.stringify(change.shopIds)
  if (change.updatedAt !== undefined) cells["Modifiée le"] = change.updatedAt
  return cells
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

/**
 * Les sessions, colonnes retrouvées par leur nom : chaque ligne est remise dans l'ordre
 * prévu (`sessionSheetHeaders`), les écritures visent la vraie place de chaque colonne.
 */
async function readSessionRows() {
  const read = async () => {
    const sheet = await sessionsSheet()
    const named = await readNamedSheet(sheet.spreadsheetId, sheet.tabName, sessionSheetHeaders, { fresh: true })
    const columns = await ensureNamedColumns(sheet.spreadsheetId, sheet.tabName, named.columns)
    return { sheet, columns, rows: named.rows.map((row) => canonicalRow(columns, row)), raw: named.rows, startRow: 2 }
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
  return rows.map((row) => sessionFromRow(row))
    .filter((session): session is CampaignSessionRecord => Boolean(session && session.campaignId === campaignId))
    .sort(byCreation)
}

async function getCampaignSession(campaignId: string, sessionId: string) {
  return (await listCampaignSessions(campaignId)).find((session) => session.id === sessionId) ?? null
}

/**
 * Change une session sur sa ligne relue : `change` reçoit la session telle qu'elle est dans la
 * feuille maintenant, et seules les cases qu'il rend sont écrites. Réécrire toute la ligne
 * depuis une lecture plus ancienne perdait un ajout fait entre-temps (deux ajouts
 * simultanés : un seul restait).
 */
async function updateSession(campaignId: string, sessionId: string, change: (current: CampaignSessionRecord) => Partial<CampaignSessionRecord>, options: { lists?: boolean } = {}) {
  // Dans ce processus, une modification de session à la fois : deux ajouts simultanés
  // partaient de la même lecture et le second effaçait le premier.
  return withAsyncLock("sessions", async () => {
    const { sheet, columns, rows, startRow } = await readSessionRows()
    const index = rows.findIndex((row) => row[0] === sessionId && row[1] === campaignId)
    // Des listes illisibles n'empêchent que ce qui les réécrit (pas un titre ni une bannière).
    const current = index >= 0 ? sessionFromRow(rows[index], options.lists) : null
    if (!current) throw new Error("SESSION_NOT_FOUND")
    const patch = { ...change(current), updatedAt: new Date().toISOString() }
    await updateRanges(sheet.spreadsheetId, namedRowWrites(sheet.tabName, columns, startRow + index, sessionCells(patch)), { valueInputOption: "RAW" })
    clearSpreadsheetReadCache(sheet.spreadsheetId)
    return { ...current, ...patch }
  })
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
  // Deux créations simultanées ne prennent pas la même ligne libre.
  await withAsyncLock("sessions", async () => {
    // Les lignes blanchies par une suppression sont réutilisées avant d'ajouter à la fin.
    const { columns, raw, startRow } = await readSessionRows()
    // Seule une ligne entièrement vide est libre (rien d'écrit plus à droite non plus).
    const free = raw.findIndex((row) => !row.some((cell) => cell?.trim()))
    if (free >= 0) {
      const rowNumber = startRow + free
      await updateRanges(sheet.spreadsheetId, canonicalWrites(sheet.tabName, columns, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`, [sessionRow(session)]), { valueInputOption: "RAW" })
    } else {
      await appendRows(sheet.spreadsheetId, namedAppendRange(sheet.tabName, columns), canonicalRows(columns, [sessionRow(session)]), { valueInputOption: "RAW" })
    }
    clearSpreadsheetReadCache(sheet.spreadsheetId)
  })
  return session
}

export async function renameCampaignSession(campaignId: string, sessionId: string, name: string) {
  return updateSession(campaignId, sessionId, () => ({ name }))
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
  // Ajouts et retraits appliqués aux listes relues juste avant d'écrire.
  // Seules les listes touchées sont réécrites.
  const touched = (key: keyof SessionMembership) => Boolean(add[key]?.length || remove[key]?.length)
  const next = await updateSession(campaignId, sessionId, (session) => ({
    ...(touched("characterIds") ? { characterIds: merged(session.characterIds, add.characterIds, remove.characterIds) } : {}),
    ...(touched("npcIds") ? { npcIds: merged(session.npcIds, add.npcIds, remove.npcIds) } : {}),
    ...(touched("shopIds") ? { shopIds: merged(session.shopIds, add.shopIds, remove.shopIds) } : {}),
  }), { lists: true })
  const others = (await listCampaignSessions(campaignId)).filter((candidate) => candidate.id !== sessionId)
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
    if (toAdd.length) await saveNpcs(campaignId, toAdd, { inCampaign: true, only: ["Ajouté au créateur de session"] })
    if (toRemove.length) await saveNpcs(campaignId, toRemove, { inCampaign: false, only: ["Ajouté au créateur de session"] })
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
  const { sheet, columns, rows, startRow } = await readSessionRows()
  const index = rows.findIndex((row) => row[0] === sessionId && row[1] === campaignId)
  if (index < 0) throw new Error("SESSION_NOT_FOUND")
  const rowNumber = startRow + index
  await updateRanges(sheet.spreadsheetId, canonicalWrites(sheet.tabName, columns, `A${rowNumber}:${LAST_COLUMN}${rowNumber}`, [Array(COLUMNS).fill("")]), { valueInputOption: "RAW" })
  clearSpreadsheetReadCache(sheet.spreadsheetId)
  const emptied = { ...session, npcIds: [], shopIds: [], characterIds: [] }
  await syncCampaignFlags(campaignId, emptied, sessions.filter((candidate) => candidate.id !== sessionId), {}, { npcIds: session.npcIds, shopIds: session.shopIds })
}

function bannerKey(campaignId: string, sessionId: string) {
  return `campaigns/${campaignId}/sessions/${sessionId}/banner`
}

function sessionBannerUrl(campaignId: string, sessionId: string, version = Date.now()) {
  return `/api/campaigns/${encodeURIComponent(campaignId)}/sessions/${encodeURIComponent(sessionId)}/banner?v=${version}`
}

export async function saveSessionBanner(campaignId: string, sessionId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("INVALID_BANNER")
  const session = await getCampaignSession(campaignId, sessionId)
  if (!session) throw new Error("SESSION_NOT_FOUND")
  await putSharedMedia(bannerKey(campaignId, sessionId), await file.arrayBuffer(), file.type)
  return updateSession(campaignId, sessionId, () => ({ bannerUrl: sessionBannerUrl(campaignId, sessionId) }))
}

export async function readSessionBanner(campaignId: string, sessionId: string) {
  return getSharedMedia(bannerKey(campaignId, sessionId))
}
