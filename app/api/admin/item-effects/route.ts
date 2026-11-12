import { NextResponse } from "next/server"

import { hiddenEffectsAvailable, readHiddenEffectTypes, saveHiddenEffectTypes } from "@/lib/hidden-effects-store"
import { authorizedAccount } from "@/lib/server-auth"

const refused = () => NextResponse.json({ error: "Accès refusé." }, { status: 403 })

/** Administration › Effets cachés : les types d'items dont l'effet est caché. */
export async function GET() {
  if (!await authorizedAccount(["admin"])) return refused()
  return NextResponse.json({ types: await readHiddenEffectTypes().catch(() => []), available: hiddenEffectsAvailable() })
}

/** `{ types: string[] }` : les remplace (une liste vide ne cache plus rien). */
export async function POST(request: Request) {
  if (!await authorizedAccount(["admin"])) return refused()
  const body = (await request.json().catch(() => null)) as { types?: unknown } | null
  if (!Array.isArray(body?.types)) return NextResponse.json({ error: "Cette liste est illisible." }, { status: 400 })
  try {
    return NextResponse.json({ types: await saveHiddenEffectTypes(body.types), available: true })
  } catch (error) {
    const unavailable = error instanceof Error && error.message === "ITEM_EFFECTS_UNAVAILABLE"
    return NextResponse.json({ error: unavailable ? "Les effets cachés se gardent sur le serveur partagé d’Eraser, qui n’est pas configuré ici." : "La liste n’a pas pu être enregistrée." }, { status: 503 })
  }
}
