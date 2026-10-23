import { NextResponse } from "next/server"

import { calendarsFromTables } from "@/lib/calendars"
import { authorizedAccount } from "@/lib/server-auth"
import { getWorldIndex } from "@/lib/world-indexes"

/**
 * Les calendriers de l'Index des calendriers (mois, saisons, jours), pour choisir une date
 * dans la fiche (naissance) ou le créateur de session. Ouvert aux joueurs : rien d'autre de
 * l'index n'est envoyé. L'index gardé en mémoire suffit, Google n'est pas relu pour autant.
 */
export async function GET() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const data = await getWorldIndex("calendars")
    return NextResponse.json({ calendars: calendarsFromTables(data.tables) })
  } catch (error) {
    console.error("CALENDARS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les calendriers n’ont pas pu être lus." }, { status: 502 })
  }
}
