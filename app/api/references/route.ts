import { NextResponse } from "next/server"

import { MAX_REFERENCE_REQUESTS, type ReferenceRequest } from "@/lib/index-references"
import { referenceCatalog, resolveReferences } from "@/lib/index-references-server"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Les références « {État:Sérénité} » des textes d'index.
 * GET : ce que le menu « { » de l'éditeur propose (MJ et admins, qui écrivent les index).
 * POST : le nom, le détail ou la case de chaque référence affichée (joueurs compris).
 */
export async function GET(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const fresh = new URL(request.url).searchParams.get("fresh") === "1"
    return NextResponse.json({ catalog: await referenceCatalog({ fresh }) }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("INDEX_REFERENCE_CATALOG_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les index n’ont pas pu être lus." }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json().catch(() => ({}))) as { references?: unknown }
    const list = Array.isArray(body.references) ? body.references : []
    const references = list.slice(0, MAX_REFERENCE_REQUESTS).flatMap((item): ReferenceRequest[] => {
      if (!item || typeof item !== "object") return []
      const { index, id, column, name } = item as Record<string, unknown>
      if (typeof index !== "string" || typeof id !== "string" || !index.trim() || !id.trim()) return []
      return [{
        index: index.trim().slice(0, 120),
        id: id.trim().slice(0, 200),
        ...(typeof column === "string" && column.trim() ? { column: column.trim().slice(0, 120) } : {}),
        ...(typeof name === "string" && name.trim() ? { name: name.trim().slice(0, 200) } : {}),
      }]
    })
    // Un joueur ne retrouve une ligne que par l'identifiant écrit dans le texte qu'il lit.
    const results = await resolveReferences(references, { byName: account.role !== "joueur" })
    return NextResponse.json({ results }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("INDEX_REFERENCE_RESOLVE_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les références n’ont pas pu être lues." }, { status: 503 })
  }
}
