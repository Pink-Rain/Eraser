import { NextResponse } from "next/server"

import { getCharacterCatalog, getCharacterCatalogDescriptions } from "@/lib/character-catalog-server"
import { authorizedAccount } from "@/lib/server-auth"

/** Les caractéristiques et compétences de la fiche : cibles des objets, statistiques des sorts. */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  // Les descriptions (« ? » de la fiche) : longues, demandées à part et une fois.
  if (new URL(request.url).searchParams.get("descriptions")) return NextResponse.json({ descriptions: await getCharacterCatalogDescriptions() })
  return NextResponse.json({ catalog: await getCharacterCatalog() })
}
