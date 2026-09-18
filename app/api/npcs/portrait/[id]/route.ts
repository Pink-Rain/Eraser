import { NextResponse } from "next/server"

import { getCampaignDashboard, getCampaignForPlayer, getNpcById, listCharacterRelations, listCharactersForUser } from "@/lib/google-sheets"
import { readNpcPortrait } from "@/lib/npc-portraits"
import { authorizedAccount } from "@/lib/server-auth"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const npc = await getNpcById(id).catch(() => null)
  if (!npc) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  let allowed = account.role === "admin"
  if (account.role === "mj") allowed = npc.pageLinked === "bac-a-sable" || Boolean(await getCampaignDashboard(account.uid, npc.pageLinked).catch(() => null))
  if (account.role === "joueur" && await getCampaignForPlayer(account.uid, npc.pageLinked).catch(() => null)) {
    allowed = npc.inPlayerGroup || npc.createdByUid === account.uid
    if (!allowed) {
      const characters = await listCharactersForUser(account.uid)
      const relations = await Promise.all(characters.map((character) => listCharacterRelations(character.id)))
      allowed = relations.flat().some((relation) => relation.targetKind === "npc" && relation.targetId === id)
    }
  }
  if (!allowed) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const object = await readNpcPortrait(id)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } })
}
