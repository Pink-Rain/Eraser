import { NextResponse } from "next/server"

import { canBuildPages } from "@/lib/custom-pages"
import { menuStudioData, pageStudioData, pagesIndexData } from "@/lib/page-atelier-data"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Les données de l'atelier des pages (extension Eraser Page) : `?ecran=index`, `?ecran=page&id=…`
 * ou `?ecran=menu`. Réservé aux administrateurs, comme l'étaient ses anciennes pages.
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin"])
  if (!account || !canBuildPages(account.role)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const url = new URL(request.url)
  const screen = url.searchParams.get("ecran")
  try {
    if (screen === "index") return NextResponse.json(await pagesIndexData(account))
    if (screen === "menu") return NextResponse.json(await menuStudioData(account))
    if (screen === "page") {
      const data = await pageStudioData(account, url.searchParams.get("id") ?? "")
      return data ? NextResponse.json(data) : NextResponse.json({ error: "Page introuvable, à la corbeille ou non modifiable." }, { status: 404 })
    }
    return NextResponse.json({ error: "Écran inconnu." }, { status: 400 })
  } catch (error) {
    console.error("PAGE_ATELIER_DATA_FAILED", screen, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "L'atelier n'a pas pu charger ses données." }, { status: 500 })
  }
}
