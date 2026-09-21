import {
  getCampaignDashboard, getCampaignForMj, getCampaignForPlayer, getCharacterSheet, getTabletopMap,
  listAllCampaignsForAdmin, listAvailableCampaignCharacters, listCampaignMembers, listCampaignNpcs,
  listCampaignsForMj, listCharactersForUser, listNpcBackpackSummaries, listNpcs, listSavedShops, listTabletopActivities,
  listTabletopCharacterEntitiesByIds, listTabletopMaps, listTabletopNpcEntitiesByIds, listTabletopTokens,
  saveNpc, updateCharacterSheet,
} from "@/lib/google-sheets"
import type { AuthorizedUser } from "@/lib/server-auth"
import type { TabletopEntityRecord, TabletopNpcDetail, TabletopShopDetail, TabletopSnapshot, TabletopSourcePage } from "@/lib/tabletop-schema"
import { identityUidsForUser } from "@/lib/identity-links"

export function canManageTabletop(account: AuthorizedUser) { return account.role === "admin" || account.role === "mj" }

export async function canAccessTabletopPage(account: AuthorizedUser, pageLinked: string) {
  if (pageLinked === "bac-a-sable") return canManageTabletop(account)
  if (account.role === "admin") return Boolean(await getCampaignDashboard(null, pageLinked))
  if (account.role === "mj") return Boolean(await getCampaignForMj(account.uid, pageLinked))
  return Boolean(await getCampaignForPlayer(account.uid, pageLinked))
}

export async function canManageTabletopPage(account: AuthorizedUser, pageLinked: string) {
  if (account.role === "admin") return pageLinked === "bac-a-sable" || Boolean(await getCampaignDashboard(null, pageLinked))
  if (account.role !== "mj") return false
  return pageLinked === "bac-a-sable" || Boolean(await getCampaignForMj(account.uid, pageLinked))
}

export async function listTabletopMapsForAccount(account: AuthorizedUser, pageLinked = "bac-a-sable") {
  if (!await canAccessTabletopPage(account, pageLinked)) return []
  const maps = await listTabletopMaps(pageLinked)
  if (pageLinked !== "bac-a-sable" || account.role === "admin") return maps
  const identities = await identityUidsForUser(account.uid)
  return maps.filter((map) => identities.includes(map.createdByUid))
}

export async function listTabletopSourcePages(account: AuthorizedUser): Promise<TabletopSourcePage[]> {
  if (!canManageTabletop(account)) return []
  const campaigns = account.role === "admin" ? await listAllCampaignsForAdmin() : await listCampaignsForMj(account.uid)
  return [{ id: "bac-a-sable", name: "Bac à sable" }, ...campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))]
}

export async function authorizeTabletopMap(account: AuthorizedUser, mapId: string, roomKey = "") {
  const map = await getTabletopMap(mapId)
  if (!map) return null
  if (await canAccessTabletopPage(account, map.pageLinked)) return map
  return roomKey && roomKey === map.roomKey ? map : null
}

async function accessibleCharacterIds(account: AuthorizedUser, pageLinked: string) {
  if (pageLinked !== "bac-a-sable") {
    const members = await listCampaignMembers(pageLinked)
    if (canManageTabletop(account)) return members.map((character) => character.id)
    const identities = await identityUidsForUser(account.uid)
    return members.filter((character) => identities.includes(character.ownerUid)).map((character) => character.id)
  }
  if (canManageTabletop(account)) return (await listAvailableCampaignCharacters()).map((character) => character.id)
  return (await listCharactersForUser(account.uid)).map((character) => character.id)
}

function npcEntity(npc: Awaited<ReturnType<typeof listNpcs>>[number]): TabletopEntityRecord {
  return { id: npc.id, kind: "npc", name: npc.name, subtitle: "PNJ", portrait: npc.portrait, currentHp: npc.currentHp, totalHp: npc.totalHp, speed: 0, ownerUid: npc.createdByUid }
}

function shopEntity(shop: Awaited<ReturnType<typeof listSavedShops>>[number], _pageLinked: string, linkedNpc?: Awaited<ReturnType<typeof listNpcs>>[number]): TabletopEntityRecord {
  return { id: shop.id, kind: "shop", name: shop.name, subtitle: linkedNpc ? `Vendeur · ${linkedNpc.name}` : `${shop.cityName || "Magasin"} · ${shop.size}`, portrait: linkedNpc?.portrait || "", currentHp: 0, totalHp: 0, speed: 0, ownerUid: "", shopKey: shop.key, shopSize: shop.size, shopCity: shop.cityName, linkedNpcId: linkedNpc?.id || "", linkedNpcName: linkedNpc?.name || "" }
}

export async function getTabletopSpeakerName(account: AuthorizedUser, pageLinked: string, characterId: string) {
  if (await canManageTabletopPage(account, pageLinked)) return "MJ"
  if (!characterId) return "Joueur"
  const characters = pageLinked === "bac-a-sable" ? await listCharactersForUser(account.uid) : await listCampaignMembers(pageLinked)
  const identities = await identityUidsForUser(account.uid)
  const character = characters.find((candidate) => candidate.id === characterId && identities.includes(candidate.ownerUid))
  return character?.name || "Joueur"
}

export async function getTabletopShopDetail(account: AuthorizedUser, mapId: string, shopId: string, roomKey = ""): Promise<TabletopShopDetail | null> {
  const map = await authorizeTabletopMap(account, mapId, roomKey)
  if (!map) return null
  const token = (await listTabletopTokens(map.id)).find((candidate) => candidate.entityKind === "shop" && candidate.entityId === shopId)
  if (!token) return null
  const [shops, npcs] = await Promise.all([listSavedShops(map.pageLinked), listNpcs(map.pageLinked)])
  const shop = shops.find((candidate) => candidate.id === shopId)
  if (!shop) return null
  const npc = npcs.find((candidate) => candidate.id === shop.npcId)
  return { id: shop.id, key: shop.key, name: shop.name, size: shop.size, cityName: shop.cityName, linkedNpcName: npc?.name || "", portrait: npc?.portrait || "", items: shop.items }
}

export async function getTabletopNpcDetail(account: AuthorizedUser, mapId: string, npcId: string, roomKey = ""): Promise<TabletopNpcDetail | null> {
  const map = await authorizeTabletopMap(account, mapId, roomKey)
  if (!map) return null
  const token = (await listTabletopTokens(map.id)).find((candidate) => candidate.entityKind === "npc" && candidate.entityId === npcId)
  if (!token) return null
  const [npcs, inventories] = await Promise.all([listNpcs(map.pageLinked), listNpcBackpackSummaries([npcId])])
  const npc = npcs.find((candidate) => candidate.id === npcId)
  if (!npc) return null
  const canViewPrivate = await canManageTabletopPage(account, map.pageLinked)
  const stats = [
    ["Constitution", "CON", npc.constitution], ["Force", "FOR", npc.strength], ["Dextérité", "DEX", npc.dexterity],
    ["Intelligence", "INT", npc.intelligence], ["Sagesse", "SAG", npc.wisdom], ["Charisme", "CHA", npc.charisma],
  ].map(([label, short, value]) => ({ label: String(label), short: String(short), value: Number(value) || 0 }))
  return {
    id: npc.id,
    name: npc.name,
    portrait: npc.portrait,
    currentHp: npc.currentHp,
    totalHp: npc.totalHp,
    playerNotes: npc.playerNotes,
    gmNotes: canViewPrivate ? npc.gmNotes : "",
    stats,
    inventory: inventories[npc.id] || [],
    canViewPrivate,
  }
}

export async function listTabletopLibraryForAccount(account: AuthorizedUser, pageLinked = "bac-a-sable") {
  if (pageLinked !== "bac-a-sable" && !await canAccessTabletopPage(account, pageLinked)) return []
  const characterIds = await accessibleCharacterIds(account, pageLinked)
  const [characters, npcs, shops] = await Promise.all([
    listTabletopCharacterEntitiesByIds(characterIds),
    canManageTabletop(account) ? listCampaignNpcs(pageLinked) : Promise.resolve([]),
    canManageTabletop(account) ? listSavedShops(pageLinked) : Promise.resolve([]),
  ])
  const npcById = new Map(npcs.map((npc) => [npc.id, npc]))
  const entities: TabletopEntityRecord[] = [...characters, ...npcs.map(npcEntity), ...shops.map((shop) => shopEntity(shop, pageLinked, npcById.get(shop.npcId)))]
  const canManage = await canManageTabletopPage(account, pageLinked)
  const identities = await identityUidsForUser(account.uid)
  return entities.map((entity) => ({ ...entity, controllable: canManage || (entity.kind === "character" && identities.includes(entity.ownerUid)) }))
}

function canSeeActivity(account: AuthorizedUser, identities: string[], activity: Awaited<ReturnType<typeof listTabletopActivities>>[number], ownedCharacterIds: Set<string>, isManager: boolean) {
  if (activity.audience === "public" || identities.includes(activity.authorUid)) return true
  if (activity.audience === "gm") return isManager
  return ownedCharacterIds.has(activity.recipientId)
}

export async function getTabletopSnapshotForAccount(account: AuthorizedUser, mapId: string, roomKey = ""): Promise<TabletopSnapshot | null> {
  const map = await authorizeTabletopMap(account, mapId, roomKey)
  if (!map) return null
  const [tokens, allActivities, library, isManager, identities] = await Promise.all([
    listTabletopTokens(map.id), listTabletopActivities(map.id), listTabletopLibraryForAccount(account, map.pageLinked), canManageTabletopPage(account, map.pageLinked), identityUidsForUser(account.uid),
  ])
  const known = new Set(library.map((entity) => `${entity.kind}:${entity.id}`))
  const missingCharacterIds = tokens.filter((token) => token.entityKind === "character" && !known.has(`character:${token.entityId}`)).map((token) => token.entityId)
  const missingNpcIds = tokens.filter((token) => token.entityKind === "npc" && !known.has(`npc:${token.entityId}`)).map((token) => token.entityId)
  const missingShopIds = new Set(tokens.filter((token) => token.entityKind === "shop" && !known.has(`shop:${token.entityId}`)).map((token) => token.entityId))
  const [characters, npcs, shops, pageNpcs] = await Promise.all([listTabletopCharacterEntitiesByIds(missingCharacterIds), listTabletopNpcEntitiesByIds(missingNpcIds, map.pageLinked), missingShopIds.size ? listSavedShops(map.pageLinked) : Promise.resolve([]), missingShopIds.size ? listNpcs(map.pageLinked) : Promise.resolve([])])
  const pageNpcById = new Map(pageNpcs.map((npc) => [npc.id, npc]))
  const shopEntities = shops.filter((shop) => missingShopIds.has(shop.id)).map((shop) => shopEntity(shop, map.pageLinked, pageNpcById.get(shop.npcId)))
  const markers: TabletopEntityRecord[] = tokens.filter((token) => token.entityKind === "marker").map((token) => ({ id: token.entityId, kind: "marker", name: token.label || "Point d’intérêt", subtitle: "Repère de carte", portrait: "", currentHp: 0, totalHp: 0, speed: 0, ownerUid: map.createdByUid, controllable: isManager }))
  const entities = [...library, ...characters, ...npcs, ...shopEntities, ...markers].map((entity) => ({ ...entity, controllable: isManager || (entity.kind === "character" && identities.includes(entity.ownerUid)) }))
  const ownedCharacterIds = new Set(entities.filter((entity) => entity.kind === "character" && identities.includes(entity.ownerUid)).map((entity) => entity.id))
  const activities = allActivities.filter((activity) => canSeeActivity(account, identities, activity, ownedCharacterIds, isManager))
  return { map, tokens, activities, entities }
}

function hpValue(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(99999, Math.trunc(parsed))) : fallback
}

export function chatRoomId(pageLinked: string) {
  return `chat:${pageLinked}`
}

export async function listChatCampaignsForAccount(account: AuthorizedUser) {
  if (canManageTabletop(account)) return listTabletopSourcePages(account)
  const characters = await listCharactersForUser(account.uid)
  const seen = new Map<string, string>()
  for (const character of characters) for (const campaign of character.campaigns) seen.set(campaign.id, campaign.name)
  return [...seen.entries()].map(([id, name]) => ({ id, name }))
}

export async function getChatBootstrapForAccount(account: AuthorizedUser, pageLinked: string) {
  if (!await canAccessTabletopPage(account, pageLinked)) return null
  const roomId = chatRoomId(pageLinked)
  const [allActivities, members, isManager, identities] = await Promise.all([
    listTabletopActivities(roomId),
    pageLinked === "bac-a-sable" ? Promise.resolve([]) : listCampaignMembers(pageLinked),
    canManageTabletopPage(account, pageLinked),
    identityUidsForUser(account.uid),
  ])
  const ownedCharacterIds = new Set(members.filter((member) => identities.includes(member.ownerUid)).map((member) => member.id))
  const activities = allActivities.filter((activity) => canSeeActivity(account, identities, activity, ownedCharacterIds, isManager))
  return { roomId, activities, members: members.map((member) => ({ id: member.id, name: member.name, ownerUid: member.ownerUid })), canManage: isManager }
}

export async function updateTabletopEntityHp(account: AuthorizedUser, pageLinked: string, kind: "npc" | "character", id: string, patch: { currentHp?: unknown; totalHp?: unknown }) {
  if (kind === "npc") {
    if (!await canManageTabletopPage(account, pageLinked)) return null
    const npc = (await listNpcs(pageLinked)).find((record) => record.id === id)
    if (!npc) return null
    const saved = await saveNpc(pageLinked, { ...npc, currentHp: hpValue(patch.currentHp, npc.currentHp), totalHp: hpValue(patch.totalHp, npc.totalHp) })
    return saved ? { ...npcEntity(saved), controllable: true } : null
  }
  const allowedIds = await accessibleCharacterIds(account, pageLinked)
  if (!allowedIds.includes(id)) return null
  const character = await getCharacterSheet(account.role === "joueur" ? account.uid : null, id)
  if (!character) return null
  const values = [...character.values]
  values[9] = String(hpValue(patch.currentHp, Number(values[9]) || 0))
  values[10] = String(hpValue(patch.totalHp, Number(values[10]) || 0))
  await updateCharacterSheet(account.role === "joueur" ? account.uid : null, id, values)
  const [entity] = await listTabletopCharacterEntitiesByIds([id])
  return entity ? { ...entity, controllable: true } : null
}
