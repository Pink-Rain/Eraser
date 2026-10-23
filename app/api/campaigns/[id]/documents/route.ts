import { NextResponse } from "next/server"

import { listCampaignDocuments, saveCampaignDocument } from "@/lib/campaign-documents"
import { sessionManager } from "@/lib/session-access"

/** Les documents de la campagne (page Document, Créateur de session) : MJ et administrateurs. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!await sessionManager(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    return NextResponse.json({ documents: await listCampaignDocuments(id) })
  } catch {
    return NextResponse.json({ error: "Les documents n’ont pas pu être lus." }, { status: 400 })
  }
}

const fileOf = (form: FormData, name: string) => {
  const value = form.get(name)
  return value instanceof File && value.size > 0 ? value : null
}

/**
 * Enregistre un document : le champ « document » (JSON : id, titre, session, fond, zones),
 * le rendu (« render », WebP), l'impression (« print », JPEG sur fond blanc, pour le PDF)
 * et, s'il vient de l'ordinateur, le fond (« background »).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const manager = await sessionManager(id)
  if (!manager) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const form = await request.formData()
    const input = JSON.parse(String(form.get("document") || "{}")) as Record<string, unknown>
    const document = await saveCampaignDocument(id, input, { render: fileOf(form, "render"), print: fileOf(form, "print"), background: fileOf(form, "background") }, manager.account.uid)
    return NextResponse.json({ document })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "DOCUMENT_TOO_LONG" ? "Le document est trop long pour être enregistré : raccourcis un texte ou retire une zone."
      : code === "INVALID_DOCUMENT_FILE" ? "Une image du document est trop lourde (15 Mo au plus) ou d’un format inconnu."
        : code === "DOCUMENT_BACKGROUND_MISSING" ? "Choisis d’abord l’image de fond à envoyer depuis ton ordinateur."
          : code === "DOCUMENT_NOT_FOUND" ? "Ce document n’appartient pas à cette campagne."
            : "Le document n’a pas pu être enregistré (Google est peut-être saturé). Réessaie dans un instant."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
