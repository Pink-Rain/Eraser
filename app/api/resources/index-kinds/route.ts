import { NextResponse } from "next/server"

import { indexColumnKinds, type IndexColumnKind } from "@/lib/index-columns"
import { indexesWithColumnKind } from "@/lib/index-kinds-server"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Les index qui ont une colonne d'un type (`?kind=rarity-places`) : les choix d'une colonne
 * « Liste d'index », tenus à jour tout seuls. Admins et MJ (ceux qui remplissent les index).
 */
export async function GET(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const kind = new URL(request.url).searchParams.get("kind") ?? ""
  if (!(kind in indexColumnKinds)) return NextResponse.json({ error: "Type de colonne inconnu." }, { status: 400 })
  try {
    const indexes = await indexesWithColumnKind(kind as IndexColumnKind)
    return NextResponse.json({ indexes: indexes.map((index) => ({ key: index.key, title: index.title, tabs: index.tabs.map((tab) => tab.tab) })) })
  } catch (error) {
    console.error("INDEX_KINDS_FAILED", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Les index n’ont pas pu être lus.", indexes: [] }, { status: 502 })
  }
}
