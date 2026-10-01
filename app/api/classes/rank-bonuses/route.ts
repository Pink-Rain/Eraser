import { NextResponse } from "next/server"

import { listRankBonuses, saveRankBonus } from "@/lib/class-content"
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

/** Écrit un bonus (administrateur ou MJ) : { rank, column, value }. Une colonne absente est ajoutée. */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { rank?: unknown; column?: unknown; value?: unknown }
    if (typeof body.rank !== "number" || typeof body.column !== "string" || typeof body.value !== "string") throw new Error("RANK_BONUS_INVALID")
    const table = await saveRankBonus(body.rank, body.column, body.value)
    return NextResponse.json({ ...table, canEdit: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("RANK_BONUS_SAVE_FAILED", code)
    const message = code === "RANK_BONUS_INVALID_COLUMN" ? "Le nom de la colonne est vide ou trop long."
      : code === "RANK_BONUS_ROW_NOT_FOUND" ? "La ligne de ce rang est introuvable dans l’onglet « Bonus de rang »."
        : "Le bonus n’a pas pu être enregistré dans Google Sheets."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
