import { NextResponse } from "next/server"

import { documentRenderPart, getCampaignDocument, isDocumentPageBackground, isDocumentPiece, readDocumentImage, type DocumentPart } from "@/lib/campaign-documents"
import { authorizedAccount } from "@/lib/server-auth"
import { campaignReader, sessionManager } from "@/lib/session-access"

/**
 * L'image d'un document. Le rendu (par défaut ; `?page=<n>` : celui de la n-ième page) est lu par
 * ceux qui lisent la campagne : un joueur qui a reçu le document l'ouvre depuis son inventaire.
 * Les fonds envoyés depuis l'ordinateur (`?part=fond`, `?part=fond-<id de la page>`) et les pièces
 * (`?part=piece-<nom>` : images posées, calques de dessin) ne servent qu'à l'éditeur : au MJ de
 * la campagne, et à l'auteur d'un modèle, qui s'en sert depuis ses autres campagnes.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  const url = new URL(request.url)
  const asked = url.searchParams.get("part") ?? ""
  const page = Math.floor(Number(url.searchParams.get("page") || "1"))
  const rendered = !(asked === "fond" || isDocumentPageBackground(asked) || isDocumentPiece(asked))
  const part: DocumentPart = rendered ? documentRenderPart(Number.isFinite(page) && page > 1 && page <= 999 ? page : 1) : asked as DocumentPart
  const allowed = rendered ? await campaignReader(id) : await sessionManager(id) || await templateAuthor(id, documentId)
  if (!allowed) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const object = await readDocumentImage(id, documentId, part)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  // Une adresse versionnée (« ?v= ») ne change jamais de contenu ; sans version, le dernier rendu.
  const cache = url.searchParams.get("v") ? "private, max-age=86400, immutable" : "private, max-age=30"
  return new Response(object.body as BodyInit, { headers: { "content-type": object.httpMetadata?.contentType || "image/webp", "cache-control": cache } })
}

/** L'auteur d'un modèle (MJ ou administrateur) lit ses images depuis n'importe quelle campagne. */
async function templateAuthor(campaignId: string, documentId: string) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return null
  const document = await getCampaignDocument(campaignId, documentId).catch(() => null)
  return document?.template && document.createdByUid === account.uid ? account : null
}
