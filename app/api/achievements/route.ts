import { NextResponse } from "next/server"

import { achievementsOf } from "@/lib/achievements"
import type { AchievementBoard } from "@/lib/achievements-shared"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Les succès de l'index et ceux obtenus par la personne connectée (accueil, profil).
 * L'attribution sera automatique : ses règles restent à définir avec l'index.
 */
export async function GET() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const board: AchievementBoard = await achievementsOf({ uid: account.uid, displayName: account.displayName })
    return NextResponse.json(board)
  } catch (error) {
    console.error("ACHIEVEMENTS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les succès n’ont pas pu être chargés depuis Google Sheets." }, { status: 503 })
  }
}
