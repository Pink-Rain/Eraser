import { NextResponse } from "next/server"

import { getCampaignDocument, giveDocumentToCharacter, giveDocumentToNpc } from "@/lib/campaign-documents"
import { listCampaignMembers, listNpcs } from "@/lib/google-sheets"
import { notifyItemReceived } from "@/lib/item-notifications"
import { sessionManager } from "@/lib/session-access"

/**
 * Le MJ donne le document à quelqu'un de la campagne : un personnage joueur (`characterId`) le
 * reçoit dans son inventaire, un PNJ (`npcId` : un marchand ou un autre) dans son Sac à dos.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  const manager = await sessionManager(id)
  if (!manager) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { characterId?: unknown; npcId?: unknown }
    const characterId = typeof body.characterId === "string" ? body.characterId : ""
    const npcId = typeof body.npcId === "string" && !characterId ? body.npcId : ""
    // Le destinataire est retrouvé parmi ceux de la campagne : un ID écrit à la main n'ouvre rien.
    const [document, members, npcs] = await Promise.all([
      getCampaignDocument(id, documentId),
      npcId ? Promise.resolve([]) : listCampaignMembers(id),
      npcId ? listNpcs(id) : Promise.resolve([]),
    ])
    if (!document) throw new Error("DOCUMENT_NOT_FOUND")
    if (!document.renderVersion) throw new Error("DOCUMENT_NOT_RENDERED")
    if (npcId) {
      const npc = npcs.find((candidate) => candidate.id === npcId)
      if (!npc) throw new Error("NPC_NOT_IN_CAMPAIGN")
      await giveDocumentToNpc(document, npc.id)
      await notifyItemReceived(manager.account, { name: document.title, quantity: 1, targetId: npc.id, targetMode: "npc" })
      return NextResponse.json({ ok: true, characterName: npc.name, landedOnGround: false })
    }
    const member = members.find((candidate) => candidate.id === characterId)
    if (!member) throw new Error("CHARACTER_NOT_IN_CAMPAIGN")
    const result = await giveDocumentToCharacter(document, member.id)
    const landedOnGround = Boolean(result.landedOnGround)
    await notifyItemReceived(manager.account, { name: document.title, quantity: 1, targetId: member.id, targetMode: "character", ...(landedOnGround ? { onGround: true } : {}) })
    return NextResponse.json({ ok: true, characterName: member.name, landedOnGround })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "DOCUMENT_NOT_FOUND" ? "Ce document n’existe plus."
      : code === "DOCUMENT_NOT_RENDERED" ? "Enregistre d’abord le document : son image n’existe pas encore."
        : code === "CHARACTER_NOT_IN_CAMPAIGN" ? "Ce personnage ne fait pas partie de la campagne."
          : code === "NPC_NOT_IN_CAMPAIGN" ? "Ce PNJ ne fait pas partie de la campagne."
            : code === "INVENTORY_FULL" ? "Le sac de ce destinataire est plein : fais-lui de la place, puis recommence."
              : code === "INVENTORY_NO_COMPATIBLE_CONTAINER" ? "Ce destinataire n’a pas de sac où ranger le document."
                : "Le document n’a pas pu être donné."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
