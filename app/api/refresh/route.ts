import { NextResponse } from "next/server"

import { forgetGoogleData } from "@/lib/data-refresh"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * « Actualiser » (bouton de la barre, F5) : le serveur local oublie ce qu'il a gardé de
 * Google Sheets, puis la fenêtre se recharge et le relit. Rien n'est écrit ni supprimé.
 */
export async function POST() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ ok: false }, { status: 401 })
  // Un joueur relit ce qui change pendant la partie ; l'administrateur et le MJ, tout (ce sont
  // eux qui modifient les règles et les index, parfois directement dans Google Sheets).
  await forgetGoogleData(account.role === "joueur" ? "play" : "all")
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
}
