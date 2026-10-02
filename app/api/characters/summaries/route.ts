import { NextResponse } from "next/server"

import { characterSheetSummaries, listCharactersForUser } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

/** Classe et rang des personnages de la personne connectée (cartes de l'accueil). */
export async function GET() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const [characters, summaries] = await Promise.all([listCharactersForUser(account.uid), characterSheetSummaries()])
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
