import { NextResponse } from "next/server"

import { parseStatesCatalog, type StatesCatalog } from "@/lib/character-states"
import { resolveJdrSheet } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { getWorldIndex, getWorldIndexQuick } from "@/lib/world-indexes"

/**
 * L'Index des états, en lecture, pour la fiche de personnage (joueurs compris) : les
 * états, leurs descriptions par niveau, leurs règles et leurs effets. Lire ne crée jamais
 * le classeur : seul un classeur « Index des états » déjà présent dans Drive est relié.
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    if (!(await resolveJdrSheet("states"))) return NextResponse.json({ catalog: { states: [], effects: [] } satisfies StatesCatalog })
    // « fresh » : l'index vient d'être modifié ; la copie d'avant ne doit pas servir.
    const fresh = new URL(request.url).searchParams.get("fresh") === "1"
    const data = await (fresh ? getWorldIndex("states") : getWorldIndexQuick("states"))
    return NextResponse.json({ catalog: parseStatesCatalog(data.tables, data.columns) }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("STATES_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "L’Index des états n’a pas pu être lu dans Google Sheets." }, { status: 503 })
  }
}
