import { NextResponse } from "next/server"

import { getCharacterCatalog } from "@/lib/character-catalog-server"
import { authorizedAccount } from "@/lib/server-auth"

/** Les caractéristiques et compétences de la fiche : cibles des objets, statistiques des sorts. */
export async function GET() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json({ catalog: await getCharacterCatalog() })
}
