import { NextResponse } from "next/server"

import { deleteCampaignDocument, updateCampaignDocumentPlace } from "@/lib/campaign-documents"
import { listCampaignSessions } from "@/lib/campaign-sessions"
import { sessionManager } from "@/lib/session-access"

/**
 * Range le document sans le redessiner : dans une session de la campagne (`sessionId`, vide pour
 * l'en sortir), dans un dossier de l'éditeur (`folder`, vide pour aucun), en modèle (`template`).
 * Seuls les champs envoyés changent.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  if (!await sessionManager(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { sessionId?: unknown; folder?: unknown; template?: unknown }
    const change: { sessionId?: string; folder?: string; template?: boolean } = {}
    if ("sessionId" in body) change.sessionId = typeof body.sessionId === "string" ? body.sessionId : ""
    if (typeof body.folder === "string") change.folder = body.folder
    if (typeof body.template === "boolean") change.template = body.template
    // Les anciens appels n'envoyaient que la session (éventuellement absente pour « aucune »).
    if (!Object.keys(change).length) change.sessionId = ""
    if (change.sessionId && !(await listCampaignSessions(id)).some((session) => session.id === change.sessionId)) throw new Error("SESSION_NOT_FOUND")
    return NextResponse.json({ document: await updateCampaignDocumentPlace(id, documentId, change) })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: code === "SESSION_NOT_FOUND" ? "Cette session n’existe plus." : code === "DOCUMENT_NOT_FOUND" ? "Ce document n’existe plus." : "Le document n’a pas pu être rangé." }, { status: 400 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  if (!await sessionManager(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    await deleteCampaignDocument(id, documentId)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Le document n’a pas pu être supprimé." }, { status: 400 })
  }
}
