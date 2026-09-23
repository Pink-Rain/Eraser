import { NextResponse } from "next/server"

import { getSharedMedia } from "@/lib/shared-media"
import { authorizedAccount } from "@/lib/server-auth"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorizedAccount(["admin", "mj", "joueur"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  if (!/^[\w-]{8,64}$/.test(id)) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  const object = await getSharedMedia(`creatures/${id}/portrait`)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  return new Response(object.body as BodyInit, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } })
}
