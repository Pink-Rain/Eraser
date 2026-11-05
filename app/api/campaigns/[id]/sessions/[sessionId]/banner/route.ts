import { NextResponse } from "next/server"

import { campaignReader } from "@/lib/session-access"
import { readSessionBanner } from "@/lib/campaign-sessions"

/**
 * La bannière d'une session : lue par tous ceux qui lisent le journal (ses joueurs, son MJ, les
 * administrateurs), comme la session elle-même. L'envoyer reste au MJ (route de la session).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params
  if (!await campaignReader(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const object = await readSessionBanner(id, sessionId)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } })
}
