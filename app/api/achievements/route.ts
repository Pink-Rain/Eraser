import { NextResponse } from "next/server"

import { achievementsOf } from "@/lib/achievements"
import type { AchievementBoard } from "@/lib/achievements-shared"
import { listDirectoryAccounts } from "@/lib/chat-accounts"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Les succès de l'index et ceux obtenus par la personne connectée (accueil, profil),
 * ou par un autre compte (`?uid=`, son profil) : les succès se montrent à tous.
 * L'attribution sera automatique : ses règles restent à définir avec l'index.
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const uid = new URL(request.url).searchParams.get("uid")?.trim() ?? ""
  try {
    let target = { uid: account.uid, displayName: account.displayName }
    if (uid && uid !== account.uid) {
      const other = (await listDirectoryAccounts(account)).find((entry) => entry.uid === uid)
      if (!other) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 })
      target = { uid: other.uid, displayName: other.name }
    }
    const board: AchievementBoard = await achievementsOf(target)
    return NextResponse.json(board)
  } catch (error) {
    console.error("ACHIEVEMENTS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les succès n’ont pas pu être chargés depuis Google Sheets." }, { status: 503 })
  }
}
