import { NextResponse } from "next/server"

import { characterSheetSummaries, listCharactersForUser } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Classe et rang des personnages de la personne connectée (cartes de l'accueil et du
 * profil). Un MJ ou un administrateur peut demander ceux d'un autre compte (`uid`).
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const requested = new URL(request.url).searchParams.get("uid")?.trim()
  const uid = requested && (account.accountRole === "admin" || account.accountRole === "mj") ? requested : account.uid
  try {
    const [characters, summaries] = await Promise.all([listCharactersForUser(uid), characterSheetSummaries()])
    const result = Object.fromEntries(characters.flatMap((character) => {
      const summary = summaries.get(character.id)
      return summary ? [[character.id, { classes: summary.classes, level: summary.level }]] : []
    }))
    return NextResponse.json({ summaries: result }, { headers: { "cache-control": "private, max-age=60" } })
  } catch (error) {
    console.error("CHARACTER_SUMMARIES_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ summaries: {} })
  }
}
