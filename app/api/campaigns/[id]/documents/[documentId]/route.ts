import { NextResponse } from "next/server"

import { deleteCampaignDocument, getCampaignDocument, updateCampaignDocumentPlace } from "@/lib/campaign-documents"
import { listCampaignSessions } from "@/lib/campaign-sessions"
import { documentPageCount } from "@/lib/document-model"
import { campaignReader, sessionManager } from "@/lib/session-access"

/**
 * Ce qu'il faut pour lire un document (inventaire d'un joueur ou d'un PNJ) : son titre, son nombre
 * de pages et la version de son rendu. Lu par ceux qui lisent la campagne, comme ses images ; rien
 * de son contenu.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  if (!await campaignReader(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const document = await getCampaignDocument(id, documentId)
    if (!document) return NextResponse.json({ error: "Ce document n’existe plus." }, { status: 404 })
    return NextResponse.json({ id: document.id, title: document.title, pages: documentPageCount(document), renderVersion: document.renderVersion })
  } catch {
    return NextResponse.json({ error: "Le document n’a pas pu être lu." }, { status: 400 })
  }
}

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
