import { NextResponse } from "next/server"

import { sessionManager } from "@/lib/session-access"
import { readSessionBanner } from "@/lib/campaign-sessions"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params
  if (!await sessionManager(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const object = await readSessionBanner(id, sessionId)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } })
}
