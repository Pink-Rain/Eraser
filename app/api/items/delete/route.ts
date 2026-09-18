import { NextResponse } from "next/server"

import { getCampaignForMj, getCharacterForUser, softDeleteItem } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json()) as { kind?: "character" | "campaign"; id?: string }
  if (!body.kind || !body.id) return NextResponse.json({ error: "Élément introuvable." }, { status: 400 })
  const owned = body.kind === "character"
    ? await getCharacterForUser(account.uid, body.id)
    : await getCampaignForMj(account.uid, body.id)
  if (!owned) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  await softDeleteItem(body.kind, body.id)
  return NextResponse.json({ ok: true })
}
