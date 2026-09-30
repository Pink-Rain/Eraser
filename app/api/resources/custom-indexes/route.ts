import { NextResponse } from "next/server"

import { createCustomIndex, listCustomIndexes, type NewIndexTab } from "@/lib/custom-indexes"
import { authorizedAccount } from "@/lib/server-auth"
import { worldRelationTargets } from "@/lib/world-indexes"

/** Les index créés depuis « Nouvel index » ; `targets=1` : les index qu'une relation peut viser. */
export async function GET(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const withTargets = new URL(request.url).searchParams.get("targets") === "1"
  const [indexes, relationTargets] = await Promise.all([
    listCustomIndexes().catch(() => []),
    withTargets ? worldRelationTargets().catch(() => []) : Promise.resolve([]),
  ])
  return NextResponse.json({ indexes, relationTargets })
}

/** Crée un index : son classeur dans le Drive (relié s'il existe déjà), ses onglets et colonnes. */
export async function POST(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { title?: unknown; description?: unknown; tabs?: unknown }
    const tabs = Array.isArray(body.tabs) ? (body.tabs as NewIndexTab[]).filter((tab) => tab && typeof tab.name === "string" && tab.name.trim() && Array.isArray(tab.columns)).slice(0, 20) : []
    const { entry, linked } = await createCustomIndex({ title: String(body.title ?? ""), description: String(body.description ?? ""), tabs })
    return NextResponse.json({ ok: true, index: entry, linked })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("CUSTOM_INDEX_CREATE_FAILED", code)
    const message = code === "CUSTOM_INDEX_TITLE_INVALID" ? "Donne un titre à l’index (60 caractères au plus)."
      : code === "CUSTOM_INDEX_TABS_REQUIRED" ? "Ajoute au moins un onglet."
      : code === "CUSTOM_INDEX_EXISTS" ? "Un index porte déjà ce titre."
      : "L’index n’a pas pu être créé dans Google Drive."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
