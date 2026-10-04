import { NextResponse } from "next/server"

import { listClassSpells } from "@/lib/class-content"
import { authorizedAccount } from "@/lib/server-auth"

export async function GET() {
  if (!await authorizedAccount(["admin", "mj", "joueur"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const data = await listClassSpells()
    // Une fiche retient l'ID des sorts choisis : un sort encore sans ID (désigné par sa
    // place, « LIGNE-n », qui glisse) n'est pas proposé tant qu'il n'en a pas reçu un.
    return NextResponse.json({ classes: data.classes, spells: data.spells.filter((spell) => !spell.id.startsWith("LIGNE-")) })
  } catch (error) {
    console.error("CHARACTER_CLASS_CATALOG_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les classes et leurs sorts sont momentanément indisponibles." }, { status: 503 })
  }
}
