import { NextResponse } from "next/server"

import { documentFileName, documentPdf, getCampaignDocument } from "@/lib/campaign-documents"
import { campaignReader } from "@/lib/session-access"

/** Le PDF d'un document (une page, son image) : ouvert dans le navigateur, ou téléchargé (`?download=1`). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  if (!await campaignReader(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const document = await getCampaignDocument(id, documentId)
    const title = document?.title || "Document"
    const pdf = await documentPdf(id, documentId, title)
    if (!pdf) return NextResponse.json({ error: "Ce document n’a pas encore de rendu : enregistre-le d’abord." }, { status: 404 })
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline"
    const name = documentFileName(title, "pdf")
    return new Response(pdf as BodyInit, { headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(`${title.slice(0, 80)}.pdf`)}`,
      "cache-control": "private, max-age=60",
    } })
  } catch {
    return NextResponse.json({ error: "Le PDF n’a pas pu être préparé." }, { status: 400 })
  }
}
