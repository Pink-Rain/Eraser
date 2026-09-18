import { NextResponse } from "next/server"

import { copyNpcsToPage, deleteNpcs, getCampaignDashboard, listNpcs, moveNpcsToPage, saveNpcs } from "@/lib/google-sheets"
import type { CampaignNpcRecord, NpcInventoryItem } from "@/lib/shop-schema"
import { authorizedAccount } from "@/lib/server-auth"

async function canUsePage(pageLinked: string) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account || !pageLinked) return null
  if (pageLinked === "bac-a-sable") return account
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, pageLinked).catch(() => null)
  return campaign ? account : null
}

function shortText(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(99999, Math.trunc(parsed))) : 0
}

function inventoryValue(value: unknown): NpcInventoryItem[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 100).flatMap<NpcInventoryItem>((item) => {
    if (!item || typeof item !== "object") return []
    const candidate = item as Partial<NpcInventoryItem>
    const name = shortText(candidate.name, 180)
    if (!name) return []
    return [{ id: shortText(candidate.id, 200) || crypto.randomUUID(), name, quantity: Math.max(1, numberValue(candidate.quantity)), notes: shortText(candidate.notes, 1000) }]
  })
}

function npcValue(value: unknown, pageLinked: string): CampaignNpcRecord | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<CampaignNpcRecord>
  const id = shortText(candidate.id, 200)
  const name = shortText(candidate.name, 200)
  if (!id || !name) return null
  return {
    id, pageLinked, name, classOrJob: shortText(candidate.classOrJob, 200),
    currentHp: numberValue(candidate.currentHp), totalHp: numberValue(candidate.totalHp), speed: numberValue(candidate.speed),
    strength: numberValue(candidate.strength), dexterity: numberValue(candidate.dexterity), intelligence: numberValue(candidate.intelligence),
    wisdom: numberValue(candidate.wisdom), charisma: numberValue(candidate.charisma), combatAbility: numberValue(candidate.combatAbility),
    shootingAbility: numberValue(candidate.shootingAbility), magicAbility: numberValue(candidate.magicAbility), mentalStrength: numberValue(candidate.mentalStrength),
    constitution: numberValue(candidate.constitution), people: shortText(candidate.people, 180), gender: shortText(candidate.gender, 120), age: shortText(candidate.age, 80),
    weight: shortText(candidate.weight, 80), height: shortText(candidate.height, 80), other: shortText(candidate.other, 3000),
    portrait: shortText(candidate.portrait, 1500), description: shortText(candidate.description, 3000), inventory: inventoryValue(candidate.inventory),
    inCampaign: Boolean(candidate.inCampaign), folder: shortText(candidate.folder, 160), inPlayerGroup: Boolean(candidate.inPlayerGroup),
    important: Boolean(candidate.important), createdByUid: shortText(candidate.createdByUid, 200), createdAt: shortText(candidate.createdAt, 80), updatedAt: shortText(candidate.updatedAt, 80),
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const pageLinked = url.searchParams.get("pageLinked") || ""
  if (!await canUsePage(pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const npcs = await listNpcs(pageLinked, url.searchParams.get("inCampaign") === "1")
    return NextResponse.json({ npcs })
  } catch {
    return NextResponse.json({ error: "Les PNJ n’ont pas pu être chargés." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; pageLinked?: string; sourcePageLinked?: string; transferMode?: string; npcIds?: unknown; npcs?: unknown }
    const pageLinked = body.pageLinked || ""
    if (!await canUsePage(pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
    if (body.action === "import") {
      const sourcePageLinked = body.sourcePageLinked || ""
      if (!await canUsePage(sourcePageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      if (sourcePageLinked === pageLinked || !Array.isArray(body.npcIds) || !body.npcIds.length || body.npcIds.length > 100 || !body.npcIds.every((id) => typeof id === "string")) throw new Error("INVALID_NPC_IMPORT")
      const npcs = body.transferMode === "move"
        ? await moveNpcsToPage(sourcePageLinked, pageLinked, body.npcIds)
        : await copyNpcsToPage(sourcePageLinked, pageLinked, body.npcIds)
      return NextResponse.json({ npcs })
    }
    if (!Array.isArray(body.npcs) || !body.npcs.length || body.npcs.length > 100) throw new Error("INVALID_NPCS")
    const npcs = body.npcs.map((npc) => npcValue(npc, pageLinked))
    if (npcs.some((npc) => !npc)) throw new Error("INVALID_NPCS")
    const records = npcs as CampaignNpcRecord[]
    if (body.action === "delete") {
      await deleteNpcs(pageLinked, records.map((npc) => npc.id))
      return NextResponse.json({ ok: true })
    }
    const options = body.action === "add-to-campaign"
      ? { inCampaign: true }
      : body.action === "remove-from-campaign"
        ? { inCampaign: false }
        : body.action === "save"
          ? {}
          : null
    if (!options || (body.action !== "save" && pageLinked === "bac-a-sable")) throw new Error("INVALID_NPC_ACTION")
    const saved = await saveNpcs(pageLinked, records, options)
    return NextResponse.json({ npcs: saved })
  } catch {
    return NextResponse.json({ error: "Les PNJ n’ont pas pu être enregistrés." }, { status: 400 })
  }
}
