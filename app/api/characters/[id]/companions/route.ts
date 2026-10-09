import { NextResponse } from "next/server"

import { authorizedCompanionCharacter, companionCandidates, companionNpc, npcForViewer } from "@/lib/companion-access"
import { COMPANION_TEXT_LIMIT, companionNumber } from "@/lib/companions"
import { saveNpc } from "@/lib/google-sheets"
import type { CampaignNpcRecord } from "@/lib/shop-schema"

/**
 * Les compagnons d'une fiche : la recherche (PNJ des campagnes du personnage, créatures de
 * l'Index des créatures), la fiche des PNJ compagnons et leurs modifications. Les créatures
 * compagnons sont enregistrées dans la fiche elle-même (onglet Compagnon) : rien ici.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await authorizedCompanionCharacter(id)
  if (!access) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const url = new URL(request.url)
  try {
    if (url.searchParams.get("candidates") === "1") return NextResponse.json(await companionCandidates(access))
    const ids = [...new Set((url.searchParams.get("npcs") || "").split(",").map((value) => value.trim()).filter(Boolean))].slice(0, 30)
    const npcs = await Promise.all(ids.map(async (npcId) => {
      const npc = await companionNpc(access, npcId)
      return npc ? npcForViewer(npc, access) : null
    }))
    return NextResponse.json({ npcs: npcs.filter(Boolean) })
  } catch (error) {
    console.error("COMPANIONS_LOAD_FAILED", id, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les compagnons n’ont pas pu être chargés." }, { status: 503 })
  }
}

/** Les cases d'un PNJ qu'un compagnon peut changer, par champ : jamais ses notes MJ, sa campagne ou son groupe. */
const numberFields = {
  currentHp: "Vie actuelle", totalHp: "Vie totale", speed: "Rapidité", strength: "Force", dexterity: "Dextérité",
  intelligence: "Intelligence", wisdom: "Sagesse", charisma: "Charisme",
} as const satisfies Partial<Record<keyof CampaignNpcRecord, string>>
const textFields = { playerNotes: "Notes joueurs", activeSpells: "Sorts actifs", passiveSpells: "Sorts passifs" } as const satisfies Partial<Record<keyof CampaignNpcRecord, string>>
// Le nom et le titre d'un PNJ appartiennent au MJ ; un joueur ne les change pas.
const gmTextFields = { name: "Nom du PNJ", title: "Titre", occupation: "Classe / métier" } as const satisfies Partial<Record<keyof CampaignNpcRecord, string>>

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await authorizedCompanionCharacter(id)
  if (!access) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; npcId?: unknown; changes?: unknown }
  if (body.action !== "save-npc" || typeof body.npcId !== "string" || !body.changes || typeof body.changes !== "object") return NextResponse.json({ error: "Modification illisible." }, { status: 400 })
  const npc = await companionNpc(access, body.npcId).catch(() => null)
  if (!npc) return NextResponse.json({ error: "Ce PNJ n’est pas (ou plus) un compagnon de ce personnage." }, { status: 403 })
  const changes = body.changes as Record<string, unknown>
  const next: CampaignNpcRecord = { ...npc }
  const only: string[] = []
  for (const [field, header] of Object.entries(numberFields)) {
    if (!(field in changes)) continue
    ;(next as Record<string, unknown>)[field] = companionNumber(changes[field])
    only.push(header)
  }
  const texts = access.account.role === "joueur" ? textFields : { ...textFields, ...gmTextFields }
  for (const [field, header] of Object.entries(texts)) {
    if (typeof changes[field] !== "string") continue
    const value = (changes[field] as string).slice(0, COMPANION_TEXT_LIMIT)
    if (field === "name" && !value.trim()) continue
    ;(next as Record<string, unknown>)[field] = value
    only.push(header)
  }
  if (!only.length) return NextResponse.json({ npc: npcForViewer(npc, access) })
  try {
    const saved = await saveNpc(npc.pageLinked, next, { only })
    return NextResponse.json({ npc: npcForViewer(saved ?? next, access) })
  } catch (error) {
    console.error("COMPANION_NPC_SAVE_FAILED", body.npcId, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Le PNJ n’a pas pu être enregistré dans Google Sheets." }, { status: 503 })
  }
}
