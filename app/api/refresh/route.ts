import { NextResponse } from "next/server"

import { forgetGoogleData } from "@/lib/data-refresh"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * « Actualiser » (bouton de la barre, F5) : le serveur local oublie ce qu'il a gardé de
 * Google Sheets, puis la fenêtre se recharge et relit tout. Rien n'est écrit ni supprimé.
 */
export async function POST() {
  if (!await authorizedAccount(["admin", "mj", "joueur"])) return NextResponse.json({ ok: false }, { status: 401 })
  await forgetGoogleData()
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
}
