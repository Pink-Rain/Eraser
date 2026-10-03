import { NextResponse } from "next/server"

import { resolveJdrSheet } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { parseWeaponModifiers, type WeaponModifierRef } from "@/lib/weapon-modifiers"
import { getWorldIndex, getWorldIndexQuick } from "@/lib/world-indexes"

/**
 * « Armes - Modificateurs » en lecture, pour afficher un attribut ou un matériau cité
 * dans un texte (joueurs compris). Lire ne crée jamais le classeur : seul un classeur
 * déjà présent dans Drive est relié.
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    if (!(await resolveJdrSheet("weapon-modifiers"))) return NextResponse.json({ modifiers: [] satisfies WeaponModifierRef[] })
    const fresh = new URL(request.url).searchParams.get("fresh") === "1"
    const data = await (fresh ? getWorldIndex("weapon-modifiers") : getWorldIndexQuick("weapon-modifiers"))
    return NextResponse.json({ modifiers: parseWeaponModifiers(data.tables) }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("WEAPON_MODIFIERS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "« Armes - Modificateurs » n’a pas pu être lu dans Google Sheets." }, { status: 503 })
  }
}
