import { NextResponse } from "next/server"

import { readCharacterPortrait } from "@/lib/character-portraits"
import { getCharacterById, getCharacterForMj, listCampaignsForPlayer } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const character = await getCharacterById(id).catch(() => null)
  let allowed = Boolean(character && account.role === "admin")
  if (character && account.role === "mj") allowed = Boolean(await getCharacterForMj(account.uid, id).catch(() => null))
  if (character && account.role === "joueur") {
    const visibleCampaignIds = new Set((await listCampaignsForPlayer(account.uid)).map((campaign) => campaign.id))
    allowed = character.ownerUid === account.uid || character.campaigns.some((campaign) => visibleCampaignIds.has(campaign.id))
  }
  if (!allowed) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const object = await readCharacterPortrait(id)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } })
}
