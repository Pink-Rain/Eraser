import { NextResponse } from "next/server"

import { listRankBonuses } from "@/lib/class-content"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Bonus de rang, communs à toutes les classes. `create=1` (administrateur ou MJ)
 * ajoute l'onglet « Bonus de rang » au classeur des sorts s'il n'existe pas encore.
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const url = new URL(request.url)
  const canCreate = account.role === "admin" || account.role === "mj"
  try {
    const table = await listRankBonuses({ create: canCreate && url.searchParams.get("create") === "1", refresh: url.searchParams.get("refresh") === "1" })
    return NextResponse.json({ ...table, canEdit: canCreate })
  } catch (error) {
    console.error("RANK_BONUSES_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les bonus de rang n’ont pas pu être chargés depuis Google Sheets." }, { status: 503 })
  }
}
