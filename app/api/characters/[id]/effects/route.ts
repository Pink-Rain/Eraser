import { NextResponse } from "next/server"

import { getCharacterById, getCharacterForMj, getCharacterForUser } from "@/lib/google-sheets"
import { hiddenEffectsAvailable, readCharacterEffects, setUnlockedEffect } from "@/lib/hidden-effects-store"
import { authorizedAccount } from "@/lib/server-auth"

/** Les mêmes droits que l'inventaire du personnage : son joueur, son MJ, les admins. */
async function authorizedCharacter(id: string) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return null
  const character = await (account.role === "admin" ? getCharacterById(id) : account.role === "mj" ? getCharacterForMj(account.uid, id) : getCharacterForUser(account.uid, id)).catch(() => null)
  return character ? { account, character } : null
}

/**
 * Les effets cachés d'un personnage (lib/hidden-effects.ts) : `hiddenTypes`, les types d'items
 * dont l'effet est caché (réglés dans Administration › Effets cachés), et `unlocked`, les noms
 * repliés (sans accents ni casse) des items dont il a débloqué l'effet.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!await authorizedCharacter(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!hiddenEffectsAvailable()) return NextResponse.json({ hiddenTypes: [], unlocked: [], available: false })
  try {
    return NextResponse.json({ ...await readCharacterEffects(id), available: true })
  } catch {
    return NextResponse.json({ error: "Les effets débloqués n’ont pas pu être lus." }, { status: 503 })
  }
}

/** `{ item, unlocked }` : débloque (ou reverrouille) l'effet de l'item nommé pour ce personnage. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!await authorizedCharacter(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!hiddenEffectsAvailable()) return NextResponse.json({ error: "Le serveur partagé est injoignable : l’effet ne peut pas être débloqué." }, { status: 503 })
  const body = (await request.json().catch(() => null)) as { item?: unknown; unlocked?: unknown } | null
  if (typeof body?.item !== "string" || !body.item.trim() || body.item.length > 160 || typeof body.unlocked !== "boolean") {
    return NextResponse.json({ error: "Cette demande est illisible : donne le nom de l’item et `unlocked`." }, { status: 400 })
  }
  try {
    return NextResponse.json({ unlocked: await setUnlockedEffect(id, body.item, body.unlocked) })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "ITEM_EFFECTS_FULL") return NextResponse.json({ error: "Ce personnage a déjà débloqué trop d’effets." }, { status: 400 })
    if (code === "ITEM_EFFECTS_INVALID") return NextResponse.json({ error: "Ce nom d’item est illisible." }, { status: 400 })
    return NextResponse.json({ error: "L’effet n’a pas pu être enregistré." }, { status: 503 })
  }
}
