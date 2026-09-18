import { NextResponse } from "next/server"

import { readCharacterPortrait } from "@/lib/character-portraits"
import { readNpcPortrait } from "@/lib/npc-portraits"
import { authorizedAccount } from "@/lib/server-auth"
import { authorizeTabletopMap } from "@/lib/tabletop-access"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { kind, id } = await params
  if (kind !== "npc" && kind !== "character") return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  const url = new URL(request.url)
  const mapId = url.searchParams.get("mapId") || ""
  const roomKey = url.searchParams.get("roomKey") || ""
  const map = await authorizeTabletopMap(account, mapId, roomKey)
  if (!map) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const object = kind === "npc" ? await readNpcPortrait(id) : await readCharacterPortrait(id)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "image/jpeg",
      "cache-control": "private, max-age=3600",
    },
  })
}
