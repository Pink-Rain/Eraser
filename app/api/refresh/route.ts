import { NextResponse } from "next/server"

import { forgetGoogleData } from "@/lib/data-refresh"
import { FRESH_COOKIE, FRESH_WINDOW_MS } from "@/lib/request-freshness"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * « Actualiser » (bouton de la barre, F5) : la page rechargée juste après relit dans Google
 * ce qu'elle affiche (lib/request-freshness.ts) ; le reste de la mémoire n'est pas touché.
 * L'administrateur et le MJ relisent aussi les règles (index, classes, sorts, réglages) :
 * ce sont eux qui les modifient, parfois directement dans Google Sheets. Rien n'est écrit
 * ni supprimé.
 */
export async function POST() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ ok: false }, { status: 401 })
  if (account.accountRole === "admin" || account.accountRole === "mj") await forgetGoogleData()
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
  response.cookies.set(FRESH_COOKIE, String(Date.now()), { httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.ceil(FRESH_WINDOW_MS / 1000) })
  return response
}
