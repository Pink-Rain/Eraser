import { NextResponse } from "next/server"

import {
  deleteCharacterRelation,
  getCampaignDashboard,
  getCharacterById,
  getCharacterForMj,
  getCharacterForUser,
  getCharacterRelationById,
  getNpcById,
  listCampaignMembers,
  listCharacterRelations,
  listNpcs,
  saveCharacterRelation,
  saveNpc,
  type CharacterRecord,
} from "@/lib/google-sheets"
import type { CampaignNpcRecord } from "@/lib/shop-schema"
import { authorizedAccount } from "@/lib/server-auth"

type RelationCandidate = {
  id: string
  kind: "npc" | "character"
  name: string
  portrait: string
  people: string
  description: string
  campaignId: string
  campaignName: string
  canEdit: boolean
}

function shortText(value: unknown, maximum = 1200) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

function relationLevel(value: unknown) {
  const level = Math.trunc(Number(value))
  return Number.isFinite(level) ? Math.max(-3, Math.min(3, level)) : 0
}

async function authorizedCharacter(id: string) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return null
  const character = await (account.role === "admin" ? getCharacterById(id) : account.role === "mj" ? getCharacterForMj(account.uid, id) : getCharacterForUser(account.uid, id)).catch(() => null)
  if (!character) return null
  const campaigns = account.role !== "mj" ? character.campaigns : (await Promise.all(character.campaigns.map(async (campaign) => await getCampaignDashboard(account.uid, campaign.id).catch(() => null) ? campaign : null))).filter((campaign): campaign is CharacterRecord["campaigns"][number] => Boolean(campaign))
  return { account, character, campaigns }
}

async function relationCandidates(access: NonNullable<Awaited<ReturnType<typeof authorizedCharacter>>>, relatedNpcIds = new Set<string>()) {
  const groups = await Promise.all(access.campaigns.map(async (campaign) => {
    const [npcs, characters] = await Promise.all([listNpcs(campaign.id), listCampaignMembers(campaign.id)])
    const visibleNpcs = access.account.role === "joueur"
      ? npcs.filter((npc) => npc.inCampaign || npc.inPlayerGroup || npc.createdByUid === access.account.uid || relatedNpcIds.has(npc.id))
      : npcs
    const npcCandidates: RelationCandidate[] = visibleNpcs.map((npc) => ({
      id: npc.id, kind: "npc", name: npc.name, portrait: npc.portrait, people: "", description: npc.playerNotes,
      campaignId: campaign.id, campaignName: campaign.name,
      canEdit: access.account.role === "admin" || access.account.role === "mj" || npc.createdByUid === access.account.uid,
    }))
    const characterCandidates: RelationCandidate[] = characters.filter((character) => character.id !== access.character.id).map((character) => ({
      id: character.id, kind: "character", name: character.name, portrait: `/api/characters/portrait/${encodeURIComponent(character.id)}`,
      people: character.people || character.subtitle, description: "", campaignId: campaign.id, campaignName: campaign.name, canEdit: false,
    }))
    return [...npcCandidates, ...characterCandidates]
  }))
  return [...new Map(groups.flat().map((candidate) => [`${candidate.kind}:${candidate.id}`, candidate])).values()]
}

async function enrichedRelations(
  access: NonNullable<Awaited<ReturnType<typeof authorizedCharacter>>>,
  storedRelations?: Awaited<ReturnType<typeof listCharacterRelations>>,
  availableCandidates?: RelationCandidate[],
) {
  const relations = storedRelations || await listCharacterRelations(access.character.id)
  const relatedNpcIds = new Set(relations.filter((relation) => relation.targetKind === "npc").map((relation) => relation.targetId))
  const candidates = availableCandidates || await relationCandidates(access, relatedNpcIds)
  const candidateById = new Map(candidates.map((candidate) => [`${candidate.kind}:${candidate.id}`, candidate]))
  return relations.map((relation) => {
    const candidate = candidateById.get(`${relation.targetKind}:${relation.targetId}`)
    return {
      ...relation,
      name: candidate?.name || relation.name,
      portrait: candidate?.portrait || "",
      people: candidate?.people || "",
      description: candidate?.description || "",
      campaignName: candidate?.campaignName || access.campaigns.find((campaign) => campaign.id === relation.campaignId)?.name || "",
      canEditTarget: Boolean(candidate?.canEdit),
    }
  })
}

function blankNpc(pageLinked: string, name: string, createdByUid: string): CampaignNpcRecord {
  return {
    id: crypto.randomUUID(), pageLinked, name, title: "", occupation: "", people: "", important: false, portrait: "", currentHp: 0, totalHp: 0, speed: 0,
    constitution: 0, strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0,
    playerNotes: "", gmNotes: "", lore: "", inCampaign: false, inPlayerGroup: false, createdByUid, createdAt: "", updatedAt: "",
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await authorizedCharacter(id)
  if (!access) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const includeCandidates = new URL(request.url).searchParams.get("candidates") === "1"
    const relations = await listCharacterRelations(access.character.id)
    const relatedNpcIds = new Set(relations.filter((relation) => relation.targetKind === "npc").map((relation) => relation.targetId))
    const candidates = await relationCandidates(access, relatedNpcIds)
    return NextResponse.json({ relations: await enrichedRelations(access, relations, candidates), candidates: includeCandidates ? candidates : undefined, campaigns: access.campaigns })
  } catch {
    return NextResponse.json({ error: "Les relations n’ont pas pu être chargées." }, { status: 400 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await authorizedCharacter(id)
  if (!access) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const existingRelations = await listCharacterRelations(id)
    if (body.action === "create-npc") {
      const name = shortText(body.name, 200)
      const campaignId = shortText(body.campaignId, 200)
      if (!name || !access.campaigns.some((campaign) => campaign.id === campaignId)) throw new Error("INVALID_RELATION")
      const npc = await saveNpc(campaignId, blankNpc(campaignId, name, access.account.uid))
      await saveCharacterRelation({ id: crypto.randomUUID(), characterId: id, targetKind: "npc", targetId: npc.id, name: npc.name, level: relationLevel(body.level), personalNotes: "", createdByUid: access.account.uid, campaignId })
    } else if (body.action === "create") {
      const targetKind = body.targetKind === "character" ? "character" : body.targetKind === "npc" ? "npc" : null
      const targetId = shortText(body.targetId, 200)
      const candidate = (await relationCandidates(access)).find((item) => item.kind === targetKind && item.id === targetId)
      if (!candidate || existingRelations.some((relation) => relation.targetKind === candidate.kind && relation.targetId === candidate.id)) throw new Error("INVALID_RELATION")
      await saveCharacterRelation({ id: crypto.randomUUID(), characterId: id, targetKind: candidate.kind, targetId: candidate.id, name: candidate.name, level: relationLevel(body.level), personalNotes: "", createdByUid: access.account.uid, campaignId: candidate.campaignId })
    } else if (body.action === "update") {
      const relationId = shortText(body.relationId, 200)
      const relation = await getCharacterRelationById(id, relationId)
      if (!relation) throw new Error("INVALID_RELATION")
      await saveCharacterRelation({ ...relation, level: relationLevel(body.level), personalNotes: shortText(body.personalNotes, 5000) })
    } else if (body.action === "update-target") {
      const relationId = shortText(body.relationId, 200)
      const relation = await getCharacterRelationById(id, relationId)
      const npc = relation?.targetKind === "npc" ? await getNpcById(relation.targetId) : null
      if (!relation || !npc || !access.campaigns.some((campaign) => campaign.id === npc.pageLinked)) throw new Error("INVALID_RELATION")
      const mayEdit = access.account.role === "admin" || access.account.role === "mj" || npc.createdByUid === access.account.uid
      if (!mayEdit) throw new Error("FORBIDDEN_RELATION_TARGET")
      const name = shortText(body.name, 200)
      if (!name) throw new Error("INVALID_RELATION")
      await saveNpc(npc.pageLinked, { ...npc, name, playerNotes: shortText(body.description, 3000), portrait: shortText(body.portrait, 1500) })
      await saveCharacterRelation({ ...relation, name })
    } else if (body.action === "delete") {
      const relationId = shortText(body.relationId, 200)
      if (!await getCharacterRelationById(id, relationId)) throw new Error("INVALID_RELATION")
      await deleteCharacterRelation(id, relationId)
    } else throw new Error("INVALID_RELATION_ACTION")
    return NextResponse.json({ relations: await enrichedRelations(access) })
  } catch {
    return NextResponse.json({ error: "La relation n’a pas pu être enregistrée." }, { status: 400 })
  }
}
