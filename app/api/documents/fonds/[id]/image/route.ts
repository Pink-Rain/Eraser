import { NextResponse } from "next/server"

import { readDocumentBackgroundImage } from "@/lib/document-backgrounds"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * L'image d'un fond de la bibliothèque, pour l'éditeur des documents (MJ et administrateurs). Elle
 * reste lisible après son retrait de la bibliothèque : les documents qui s'en servent la gardent.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  const object = await readDocumentBackgroundImage(id).catch(() => null)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  // L'image d'un fond ne change jamais (un autre fond a un autre identifiant).
  return new Response(object.body as BodyInit, { headers: { "content-type": object.httpMetadata?.contentType || "image/webp", "cache-control": "private, max-age=86400, immutable" } })
}
