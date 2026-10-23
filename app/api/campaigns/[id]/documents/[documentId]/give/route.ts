import { NextResponse } from "next/server"

import { getCampaignDocument, giveDocumentToCharacter } from "@/lib/campaign-documents"
import { listCampaignMembers } from "@/lib/google-sheets"
import { notifyItemReceived } from "@/lib/item-notifications"
import { sessionManager } from "@/lib/session-access"

/** Le MJ donne le document à un personnage joueur de la campagne : il arrive dans son inventaire. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  const manager = await sessionManager(id)
  if (!manager) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { characterId?: unknown }
    const characterId = typeof body.characterId === "string" ? body.characterId : ""
    // Le destinataire est retrouvé parmi les personnages de la campagne : un ID écrit à la main n'ouvre rien.
    const [document, members] = await Promise.all([getCampaignDocument(id, documentId), listCampaignMembers(id)])
    if (!document) throw new Error("DOCUMENT_NOT_FOUND")
    if (!document.renderVersion) throw new Error("DOCUMENT_NOT_RENDERED")
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
          : code === "INVENTORY_NO_COMPATIBLE_CONTAINER" || code === "INVENTORY_FULL" ? "Ce personnage n’a pas de sac où ranger le document."
            : "Le document n’a pas pu être donné."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
