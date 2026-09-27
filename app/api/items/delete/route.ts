import { NextResponse } from "next/server"

import { getCampaignForMj, getCharacterForUser, softDeleteItem } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Met un personnage ou une campagne à la corbeille. Son propriétaire le peut ; un
 * administrateur le peut pour tout élément (depuis les index). La suppression
 * définitive reste dans Administration → Corbeille.
 */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json()) as { kind?: "character" | "campaign"; id?: string }
  if ((body.kind !== "character" && body.kind !== "campaign") || !body.id) return NextResponse.json({ error: "Élément introuvable." }, { status: 400 })
  const owned = account.role === "admin" || (body.kind === "character"
    ? await getCharacterForUser(account.uid, body.id)
    : await getCampaignForMj(account.uid, body.id))
  if (!owned) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    await softDeleteItem(body.kind, body.id)
  } catch (error) {
    console.error("ITEM_TRASH_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "La mise à la corbeille n’a pas pu être partagée avec les autres installations. Réessaie." }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
