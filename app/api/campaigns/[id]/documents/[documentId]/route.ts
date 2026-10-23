import { NextResponse } from "next/server"

import { deleteCampaignDocument, setCampaignDocumentSession } from "@/lib/campaign-documents"
import { listCampaignSessions } from "@/lib/campaign-sessions"
import { sessionManager } from "@/lib/session-access"

/** Range le document dans une session de la campagne (`sessionId`), ou l'en sort (vide). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  if (!await sessionManager(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { sessionId?: unknown }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : ""
    if (sessionId && !(await listCampaignSessions(id)).some((session) => session.id === sessionId)) throw new Error("SESSION_NOT_FOUND")
    return NextResponse.json({ document: await setCampaignDocumentSession(id, documentId, sessionId) })
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
