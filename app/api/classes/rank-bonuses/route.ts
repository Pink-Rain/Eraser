import { NextResponse } from "next/server"

import { addRankBonusRow, listRankBonuses, saveRankBonusCells } from "@/lib/class-content"
import { googleFailureMessage } from "@/lib/google-failures"
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

/**
 * Écrit des bonus (administrateur ou MJ) : { changes: [{ rank, column, value }] }, en une
 * seule écriture (ou { rank, column, value } pour un seul). Une colonne absente est ajoutée.
 * { action: "add-rank" } ajoute le rang suivant sous le dernier.
 */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: unknown; rank?: unknown; column?: unknown; value?: unknown; changes?: unknown }
    if (body.action === "add-rank") return NextResponse.json({ ...(await addRankBonusRow()), canEdit: true })
    const list = Array.isArray(body.changes) ? body.changes : [body]
    if (!list.length || list.length > 500) throw new Error("RANK_BONUS_INVALID")
    const changes = list.map((item) => {
      const change = (item ?? {}) as { rank?: unknown; column?: unknown; value?: unknown }
      if (typeof change.rank !== "number" || typeof change.column !== "string" || typeof change.value !== "string") throw new Error("RANK_BONUS_INVALID")
      return { rank: change.rank, column: change.column, value: change.value }
    })
    const table = await saveRankBonusCells(changes)
    return NextResponse.json({ ...table, canEdit: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("RANK_BONUS_SAVE_FAILED", code)
    const message = code === "RANK_BONUS_INVALID_COLUMN" ? "Le nom de la colonne est vide ou trop long."
      : code === "RANK_BONUS_ROW_NOT_FOUND" ? "La ligne de ce rang est introuvable dans l’onglet « Bonus de rang »."
        : code === "RANK_BONUS_INVALID_RANK" ? "Ce rang n’est pas valable."
        : googleFailureMessage(code) || "Le bonus n’a pas pu être enregistré dans Google Sheets."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
