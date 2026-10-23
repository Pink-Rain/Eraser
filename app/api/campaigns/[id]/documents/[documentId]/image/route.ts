import { NextResponse } from "next/server"

import { readDocumentImage } from "@/lib/campaign-documents"
import { campaignReader, sessionManager } from "@/lib/session-access"

/**
 * L'image d'un document. Le rendu (par défaut) est lu par ceux qui lisent la campagne : un
 * joueur qui a reçu le document l'ouvre depuis son inventaire. Le fond envoyé depuis
 * l'ordinateur (`?part=fond`) ne sert qu'à l'éditeur du MJ.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  const url = new URL(request.url)
  const part = url.searchParams.get("part") === "fond" ? "fond" : "rendu"
  const allowed = part === "fond" ? await sessionManager(id) : await campaignReader(id)
  if (!allowed) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const object = await readDocumentImage(id, documentId, part)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  // Une adresse versionnée (« ?v= ») ne change jamais de contenu ; sans version, le dernier rendu.
  const cache = url.searchParams.get("v") ? "private, max-age=86400, immutable" : "private, max-age=30"
  return new Response(object.body as BodyInit, { headers: { "content-type": object.httpMetadata?.contentType || "image/webp", "cache-control": cache } })
}
