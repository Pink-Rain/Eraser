import {
  appendRows,
  canonicalRow,
  canonicalRows,
  canonicalWrites,
  clearSpreadsheetReadCache,
  columnName,
  ensureJdrSheet,
  ensureNamedColumns,
  listCampaignMembers,
  listNpcs,
  listSavedShops,
  namedAppendRange,
  namedRowWrites,
  readNamedSheet,
  repairJdrSheet,
  resolveJdrSheet,
  saveGeneratedShops,
  saveNpcs,
  sessionSheetHeaders,
  updateRanges,
} from "@/lib/google-sheets"
import { withAsyncLock } from "@/lib/async-lock"
import { hiddenAfterChange, sessionItemKeys } from "@/lib/session-reveal"
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
  /** Les lieux de la session, notés à la main (texte mis en forme). */
  places: string
  /** Ancienne page « Document » de l'alpha 193 : gardée dans la feuille, plus affichée. */
  document: string
  /**
   * Les événements envoyés dans la session (page Événements) : l'identifiant d'un
   * événement de campagne, ou « shop:ID » pour un marché ambulant (feuille Magasins).
   */
  eventIds: string[]
  /** Événements écrits en entier dans la session par l'alpha 193 : affichés et retirables. */
  legacyEvents: SessionEvent[]
  /**
   * Ce que le MJ n'a pas encore révélé aux joueurs (« npc:ID », « event:shop:ID »…, voir
   * lib/session-reveal.ts) : absent du journal pour eux. Une chose ajoutée y entre.
   */
  hidden: string[]
}

/**
 * Un événement préparé pour la session : une créature, un PNJ (de la campagne ou
 * générique), un marché ambulant, ou « autre » (icône, nom, étiquette colorée, texte).
 * Les créatures, PNJs et marchés restent dans leurs feuilles : l'événement les cite par
 * leur identifiant et garde leur nom pour s'afficher même s'ils sont introuvables.
 */
export type SessionEventKind = "creature" | "npc" | "generic-npc" | "market" | "other"
export type SessionEvent = {
  id: string
  kind: SessionEventKind
  refId: string
  name: string
  /** « Autre » : le nom d'une icône Lucide choisie dans la liste. */
  icon: string
  /** Créature, PNJ : le portrait, gardé pour ne pas relire l'index à l'affichage. */
  image: string
  tag: string
  tagColor: string
  description: string
}

const EVENT_KINDS = new Set<SessionEventKind>(["creature", "npc", "generic-npc", "market", "other"])
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : ""

/** Un événement propre : champs connus, longueurs bornées ; `null` s'il est inutilisable. */
export function cleanSessionEvent(value: unknown): SessionEvent | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const kind = raw.kind as SessionEventKind
  if (!EVENT_KINDS.has(kind)) return null
  const event: SessionEvent = {
    id: text(raw.id, 80) || crypto.randomUUID(),
    kind,
    refId: text(raw.refId, 200),
    name: text(raw.name, 160).trim(),
    icon: text(raw.icon, 80),
    image: /^(https:\/\/|\/api\/)/.test(text(raw.image, 600)) ? text(raw.image, 600) : "",
    tag: text(raw.tag, 60),
    tagColor: /^#[0-9a-f]{6}$/i.test(text(raw.tagColor, 7)) ? text(raw.tagColor, 7) : "",
    description: text(raw.description, 4000),
  }
  return event.name || event.refId ? event : null
}

/**
 * Les événements (JSON) : des identifiants, et les événements complets de l'alpha 193.
 * `strict` pour une écriture : une case illisible n'est pas une liste vide.
 */
function eventList(value: string | undefined, strict = false): { ids: string[]; legacy: SessionEvent[] } {
  try {
    const parsed = JSON.parse(value || "[]") as unknown
    if (!Array.isArray(parsed)) throw new Error("NOT_A_LIST")
    const ids = parsed.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 220)
    return { ids: [...new Set(ids)], legacy: parsed.flatMap((item) => typeof item === "object" ? cleanSessionEvent(item) ?? [] : []) }
  } catch {
    if (strict) throw new Error("SESSION_LISTS_UNREADABLE")
    return { ids: [], legacy: [] }
  }
}

function eventsJson(session: Pick<CampaignSessionRecord, "eventIds" | "legacyEvents">) {
  return JSON.stringify([...session.legacyEvents, ...session.eventIds])
}

export type SessionMembership = { characterIds?: string[]; npcIds?: string[]; shopIds?: string[] }

/** Les sessions décrites dans l'ordre prévu par Eraser (les colonnes ajoutées plus tard à la fin). */
const COLUMNS = sessionSheetHeaders.length
const LAST_COLUMN = columnName(COLUMNS)

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

function sessionFromRow(row: string[], strict = false, strictEvents = false): CampaignSessionRecord | null {
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
    places: row[10] || "",
    document: row[11] || "",
    ...(() => { const events = eventList(row[12], strictEvents); return { eventIds: events.ids, legacyEvents: events.legacy } })(),
    // Une case illisible ne révèle rien en douce : tout ce que la session contient reste caché.
    hidden: hiddenList(row[13], row),
  }
}

/** Les choses cachées d'une session ; une case illisible cache tout ce que la session contient. */
function hiddenList(value: string | undefined, row: string[]) {
  if (!value?.trim()) return []
  try {
    return idList(value, true)
  } catch {
    const lists = { characterIds: idList(row[4]), npcIds: idList(row[5]), shopIds: idList(row[6]), ...(() => { const events = eventList(row[12], false); return { eventIds: events.ids, legacyEvents: events.legacy } })() }
    return sessionItemKeys(lists)
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
  if (change.places !== undefined) cells["Lieux de la session"] = change.places
  if (change.document !== undefined) cells["Document"] = change.document
  if (change.eventIds !== undefined && change.legacyEvents !== undefined) cells["Événements (JSON)"] = eventsJson({ eventIds: change.eventIds, legacyEvents: change.legacyEvents })
  if (change.hidden !== undefined) cells["Cachés (JSON)"] = JSON.stringify(change.hidden)
  return cells
}

function sessionRow(session: CampaignSessionRecord) {
  return [
    session.id, session.campaignId, session.name, session.bannerUrl,
    JSON.stringify(session.characterIds), JSON.stringify(session.npcIds), JSON.stringify(session.shopIds),
    session.createdByUid, session.createdAt, session.updatedAt,
    session.places, session.document, eventsJson(session), JSON.stringify(session.hidden),
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

/**
 * Les sessions d'une campagne pour les afficher (journal) : la lecture partagée entre
 * installations, sans rien vérifier ni écrire dans la feuille. Cinq joueurs qui ouvrent le
 * journal ensemble ne coûtent qu'une lecture à Google.
 */
export async function listCampaignSessionsForDisplay(campaignId: string) {
  const sheet = await resolveJdrSheet("sessions")
  if (!sheet) return []
  const named = await readNamedSheet(sheet.spreadsheetId, sheet.tabName, sessionSheetHeaders)
  return named.rows.map((row) => sessionFromRow(canonicalRow(named.columns, row)))
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
async function updateSession(campaignId: string, sessionId: string, change: (current: CampaignSessionRecord) => Partial<CampaignSessionRecord>, options: { lists?: boolean; events?: boolean } = {}) {
  // Dans ce processus, une modification de session à la fois : deux ajouts simultanés
  // partaient de la même lecture et le second effaçait le premier.
  return withAsyncLock("sessions", async () => {
    const { sheet, columns, rows, startRow } = await readSessionRows()
    const index = rows.findIndex((row) => row[0] === sessionId && row[1] === campaignId)
    // Des listes illisibles n'empêchent que ce qui les réécrit (pas un titre ni une bannière).
    const current = index >= 0 ? sessionFromRow(rows[index], options.lists, options.events) : null
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
    places: "",
    document: "",
    eventIds: [],
    legacyEvents: [],
    hidden: [],
  }
  // Tout ce qu'une nouvelle session reçoit est caché aux joueurs jusqu'à ce que le MJ le révèle.
  session.hidden = sessionItemKeys(session)
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

/**
 * Révèle ou recache des choses de la session (leurs clés, lib/session-reveal.ts), ou toutes
 * (« Tout révéler », « Tout cacher ») : appliqué à la session relue juste avant d'écrire.
 */
export async function updateSessionVisibility(campaignId: string, sessionId: string, change: { reveal?: string[]; hide?: string[]; all?: "reveal" | "hide" }) {
  return updateSession(campaignId, sessionId, (session) => {
    const known = new Set(sessionItemKeys(session))
    if (change.all === "reveal") return { hidden: [] }
    if (change.all === "hide") return { hidden: [...known] }
    const revealed = new Set(change.reveal ?? [])
    const hidden = [...new Set([...session.hidden.filter((key) => !revealed.has(key)), ...(change.hide ?? []).filter((key) => known.has(key))])]
    return { hidden }
  })
}

export async function renameCampaignSession(campaignId: string, sessionId: string, name: string) {
  return updateSession(campaignId, sessionId, () => ({ name }))
}

/** Les lieux notés et la page « Document » : écrits tels quels (texte mis en forme). */
export async function updateSessionTexts(campaignId: string, sessionId: string, texts: { places?: string; document?: string }) {
  return updateSession(campaignId, sessionId, () => ({
    ...(texts.places !== undefined ? { places: texts.places.slice(0, 45_000) } : {}),
    ...(texts.document !== undefined ? { document: texts.document.slice(0, 45_000) } : {}),
  }))
}

/**
 * Ajoute ou retire des événements (leurs identifiants), appliqués à la liste relue juste
 * avant d'écrire : un ajout fait ailleurs entre-temps n'est pas perdu. Retirer vaut aussi
 * pour un événement complet de l'alpha 193.
 */
export async function updateSessionEvents(campaignId: string, sessionId: string, change: { add?: string[]; remove?: string[] }) {
  const next = await updateSession(campaignId, sessionId, (session) => {
    const removed = new Set(change.remove ?? [])
    const eventIds = [...new Set([...session.eventIds, ...(change.add ?? [])])].filter((id) => !removed.has(id)).slice(0, 300)
    const legacyEvents = session.legacyEvents.filter((event) => !removed.has(event.id))
    const before = [...session.eventIds, ...session.legacyEvents.map((event) => event.id)]
    const after = [...eventIds, ...legacyEvents.map((event) => event.id)]
    return { eventIds, legacyEvents, hidden: hiddenAfterChange(session.hidden, "event", before, after) }
  }, { events: true })
  // Un marché ambulant retiré : les alphas 194-195 l'avaient marqué « dans la campagne ». S'il n'est
  // dans les magasins d'aucune session, la marque s'enlève (le pont Roll20 ne l'exporte plus).
  const marketIds = (change.remove ?? []).filter((id) => id.startsWith("shop:")).map((id) => id.slice(5))
  if (marketIds.length) {
    const others = (await listCampaignSessions(campaignId)).filter((candidate) => candidate.id !== sessionId)
    await syncCampaignFlags(campaignId, next, others, {}, { shopIds: marketIds })
  }
  return next
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
  const next = await updateSession(campaignId, sessionId, (session) => {
    const lists = {
      ...(touched("characterIds") ? { characterIds: merged(session.characterIds, add.characterIds, remove.characterIds) } : {}),
      ...(touched("npcIds") ? { npcIds: merged(session.npcIds, add.npcIds, remove.npcIds) } : {}),
      ...(touched("shopIds") ? { shopIds: merged(session.shopIds, add.shopIds, remove.shopIds) } : {}),
    }
    // Une chose ajoutée arrive cachée aux joueurs ; une chose retirée quitte la liste des cachées.
    let hidden = session.hidden
    if (lists.characterIds) hidden = hiddenAfterChange(hidden, "character", session.characterIds, lists.characterIds)
    if (lists.npcIds) hidden = hiddenAfterChange(hidden, "npc", session.npcIds, lists.npcIds)
    if (lists.shopIds) hidden = hiddenAfterChange(hidden, "shop", session.shopIds, lists.shopIds)
    return { ...lists, hidden }
  }, { lists: true })
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
  const markets = session.eventIds.filter((id) => id.startsWith("shop:")).map((id) => id.slice(5))
  await syncCampaignFlags(campaignId, emptied, sessions.filter((candidate) => candidate.id !== sessionId), {}, { npcIds: session.npcIds, shopIds: [...session.shopIds, ...markets] })
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
