/**
 * Qui peut toucher aux compagnons d'une fiche, côté serveur. Le joueur de la fiche, le MJ
 * d'une de ses campagnes et l'administrateur gèrent ses compagnons ; un PNJ n'est modifiable
 * par le joueur que s'il est vraiment son compagnon, d'une de ses campagnes, et visible de lui
 * (comme partout ailleurs : dans la session, dans le groupe, créé par lui ou lié à sa fiche).
 */
import {
  getCampaignDashboard,
  getCharacterById,
  getCharacterCompanions,
  getCharacterForMj,
  getCharacterForUser,
  getNpcById,
  listCharacterRelations,
  listNpcs,
} from "@/lib/google-sheets"
import { companionInventoryOwnerId, creatureCandidateFromRow, type Companion, type CreatureCandidate, type NpcCandidate } from "@/lib/companions"
import { isNpcLibraryPage } from "@/lib/npc-pages"
import { authorizedAccount } from "@/lib/server-auth"
import type { CampaignNpcRecord } from "@/lib/shop-schema"
import { getWorldIndexQuick } from "@/lib/world-indexes"

export async function authorizedCompanionCharacter(id: string) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return null
  const character = await (account.role === "admin" ? getCharacterById(id) : account.role === "mj" ? getCharacterForMj(account.uid, id) : getCharacterForUser(account.uid, id)).catch(() => null)
  if (!character) return null
  // Un MJ ne voit que les PNJ des campagnes qu'il mène.
  const campaigns = account.role !== "mj"
    ? character.campaigns
    : (await Promise.all(character.campaigns.map(async (campaign) => await getCampaignDashboard(account.uid, campaign.id).catch(() => null) ? campaign : null))).filter((campaign): campaign is NonNullable<typeof campaign> => Boolean(campaign))
  return { account, character, campaigns }
}

export type CompanionAccess = NonNullable<Awaited<ReturnType<typeof authorizedCompanionCharacter>>>

/** Un compagnon de la fiche ; relu dans la feuille s'il vient d'être ajouté. */
export async function findCompanion(characterId: string, matches: (companion: Companion) => boolean) {
  return (await getCharacterCompanions(characterId)).find(matches)
    ?? (await getCharacterCompanions(characterId, true)).find(matches)
    ?? null
}

/** Les PNJ qu'un joueur voit dans une campagne : ceux d'un MJ ou d'un administrateur, tous. */
async function visibleNpcFilter(access: CompanionAccess) {
  if (access.account.role !== "joueur") return () => true
  const related = new Set((await listCharacterRelations(access.character.id).catch(() => [])).filter((relation) => relation.targetKind === "npc").map((relation) => relation.targetId))
  return (npc: CampaignNpcRecord) => npc.inCampaign || npc.inPlayerGroup || npc.createdByUid === access.account.uid || related.has(npc.id)
}

/** Les notes MJ restent au MJ. */
export function npcForViewer(npc: CampaignNpcRecord, access: CompanionAccess): CampaignNpcRecord {
  return access.account.role === "joueur" ? { ...npc, gmNotes: "" } : npc
}

/** Le PNJ d'un compagnon, s'il peut être lu et modifié depuis cette fiche. */
export async function companionNpc(access: CompanionAccess, npcId: string) {
  const companion = await findCompanion(access.character.id, (candidate) => candidate.kind === "npc" && candidate.npcId === npcId)
  if (!companion) return null
  const npc = await getNpcById(npcId).catch(() => null)
  if (!npc || isNpcLibraryPage(npc.pageLinked) || !access.campaigns.some((campaign) => campaign.id === npc.pageLinked)) return null
  const visible = await visibleNpcFilter(access)
  return visible(npc) ? npc : null
}

/** Ce que la recherche de l'onglet propose : les PNJ de ses campagnes, les créatures de l'index. */
export async function companionCandidates(access: CompanionAccess): Promise<{ npcs: NpcCandidate[]; creatures: CreatureCandidate[] }> {
  const visible = await visibleNpcFilter(access)
  const [npcGroups, creatures] = await Promise.all([
    Promise.all(access.campaigns.map(async (campaign) => (await listNpcs(campaign.id).catch(() => [] as CampaignNpcRecord[])).filter(visible).map((npc): NpcCandidate => ({
      id: npc.id, name: npc.name, title: npc.title, occupation: npc.occupation, portrait: npc.portrait, campaignId: campaign.id, campaignName: campaign.name,
    })))),
    creatureCandidates(),
  ])
  return { npcs: [...new Map(npcGroups.flat().map((npc) => [npc.id, npc])).values()], creatures }
}

async function creatureCandidates() {
  try {
    const data = await getWorldIndexQuick("creatures")
    return data.tables.flatMap((table) => table.rows.flatMap((row) => creatureCandidateFromRow(table.headers, row.values, row.html) ?? []))
  } catch (error) {
    console.error("COMPANION_CREATURES_UNAVAILABLE", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return []
  }
}

/** Le propriétaire et le mode du sac à dos d'un compagnon : celui du PNJ, ou celui de la créature. */
export async function companionBackpack(access: CompanionAccess, companionId: string) {
  const companion = await findCompanion(access.character.id, (candidate) => candidate.id === companionId)
  if (!companion) return null
  if (companion.kind === "creature") return { companion, ownerId: companionInventoryOwnerId(access.character.id, companion.id), campaignId: access.campaigns[0]?.id ?? "" }
  const npc = await companionNpc(access, companion.npcId)
  return npc ? { companion, ownerId: npc.id, campaignId: npc.pageLinked } : null
}
