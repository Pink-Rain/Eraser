import { NextResponse } from "next/server"

import { copyNpcsToPage, deleteNpcs, getCampaignDashboard, listAllNpcs, listNpcs, moveNpcsToPage, saveNpcs } from "@/lib/google-sheets"
import { isNpcLibraryPage } from "@/lib/npc-pages"
import type { CampaignNpcRecord } from "@/lib/shop-schema"
import { authorizedAccount } from "@/lib/server-auth"

async function canUsePage(pageLinked: string) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account || !pageLinked) return null
  // Le bac à sable et l'Index des PNJs ne dépendent d'aucune campagne.
  if (isNpcLibraryPage(pageLinked)) return account
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

function npcValue(value: unknown, pageLinked: string): CampaignNpcRecord | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<CampaignNpcRecord> & { description?: unknown; other?: unknown }
  const id = shortText(candidate.id, 200)
  const name = shortText(candidate.name, 200)
  if (!id || !name) return null
  return {
    id, pageLinked, name,
    title: shortText(candidate.title, 200), occupation: shortText(candidate.occupation, 200), people: shortText(candidate.people, 200),
    portrait: shortText(candidate.portrait, 1500),
    currentHp: numberValue(candidate.currentHp), totalHp: numberValue(candidate.totalHp), speed: numberValue(candidate.speed),
    constitution: numberValue(candidate.constitution),
    strength: numberValue(candidate.strength), dexterity: numberValue(candidate.dexterity), intelligence: numberValue(candidate.intelligence),
    wisdom: numberValue(candidate.wisdom), charisma: numberValue(candidate.charisma),
    playerNotes: shortText(candidate.playerNotes ?? candidate.description, 5000),
    gmNotes: shortText(candidate.gmNotes ?? candidate.other, 5000),
    lore: shortText(candidate.lore, 5000),
    inCampaign: Boolean(candidate.inCampaign), inPlayerGroup: Boolean(candidate.inPlayerGroup),
    important: Boolean(candidate.important), createdByUid: shortText(candidate.createdByUid, 200),
    createdAt: shortText(candidate.createdAt, 80), updatedAt: shortText(candidate.updatedAt, 80),
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
    const account = await canUsePage(pageLinked)
    if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
    if (body.action === "import") {
      const sourcePageLinked = body.sourcePageLinked || ""
      if (!await canUsePage(sourcePageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      if (sourcePageLinked === pageLinked || !Array.isArray(body.npcIds) || !body.npcIds.length || body.npcIds.length > 100 || !body.npcIds.every((id) => typeof id === "string")) throw new Error("INVALID_NPC_IMPORT")
      const npcs = body.transferMode === "move"
        ? await moveNpcsToPage(sourcePageLinked, pageLinked, body.npcIds)
        : await copyNpcsToPage(sourcePageLinked, pageLinked, body.npcIds)
      return NextResponse.json({ npcs })
    }
    if (body.action === "duplicate") {
      // La copie reste sur la même page (Index des PNJs) : portrait et sac à dos compris.
      if (!Array.isArray(body.npcIds) || !body.npcIds.length || body.npcIds.length > 100 || !body.npcIds.every((id) => typeof id === "string")) throw new Error("INVALID_NPC_DUPLICATE")
      return NextResponse.json({ npcs: await copyNpcsToPage(pageLinked, pageLinked, body.npcIds) })
    }
    if (!Array.isArray(body.npcs) || !body.npcs.length || body.npcs.length > 100) throw new Error("INVALID_NPCS")
    const npcs = body.npcs.map((npc) => npcValue(npc, pageLinked))
    if (npcs.some((npc) => !npc)) throw new Error("INVALID_NPCS")
    const records = (npcs as CampaignNpcRecord[]).map((npc) => ({ ...npc, createdByUid: npc.createdByUid || account.uid }))
    if (body.action === "delete") {
      await deleteNpcs(pageLinked, records.map((npc) => npc.id))
      return NextResponse.json({ ok: true })
    }
    if (body.action === "save-index") {
      // L'Index des PNJs ne connaît ni les notes MJ, ni la vie actuelle, ni le groupe :
      // ils sont repris de la feuille pour ne jamais être effacés depuis l'index.
      const existing = new Map((await listAllNpcs()).map((npc) => [npc.id, npc]))
      const merged = records.map((npc) => {
        const current = existing.get(npc.id)
        if (current && current.pageLinked !== pageLinked) throw new Error("NPC_PAGE_MISMATCH")
        if (!current && !isNpcLibraryPage(pageLinked)) throw new Error("NPC_NOT_FOUND")
        return current
          ? { ...npc, gmNotes: current.gmNotes, currentHp: current.currentHp, inCampaign: current.inCampaign, inPlayerGroup: current.inPlayerGroup, createdByUid: current.createdByUid || npc.createdByUid }
          : { ...npc, gmNotes: "", currentHp: npc.totalHp, inCampaign: false, inPlayerGroup: false }
      })
      return NextResponse.json({ npcs: await saveNpcs(pageLinked, merged) })
    }
    const options = body.action === "add-to-campaign"
      ? { inCampaign: true }
      : body.action === "remove-from-campaign"
        ? { inCampaign: false }
        : body.action === "save" || body.action === "add-to-group" || body.action === "remove-from-group"
          ? {}
          : null
    if (!options || (body.action !== "save" && isNpcLibraryPage(pageLinked))) throw new Error("INVALID_NPC_ACTION")
    const grouped = body.action === "add-to-group" ? records.map((npc) => ({ ...npc, inPlayerGroup: true }))
      : body.action === "remove-from-group" ? records.map((npc) => ({ ...npc, inPlayerGroup: false }))
        : records
    const saved = await saveNpcs(pageLinked, grouped, options)
    return NextResponse.json({ npcs: saved })
  } catch {
    return NextResponse.json({ error: "Les PNJ n’ont pas pu être enregistrés." }, { status: 400 })
  }
}
