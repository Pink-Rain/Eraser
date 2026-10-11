import { NextResponse } from "next/server"

import { readPortraitFramings } from "@/lib/portrait-framing"
import { authorizedAccount } from "@/lib/server-auth"

/** Les cadrages des avatars (choisis dans l'éditeur de token), pour les vues qui les recadrent. */
export async function GET() {
  if (!await authorizedAccount(["admin", "mj", "joueur"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const framings = await readPortraitFramings().catch((error) => {
    console.error("PORTRAIT_FRAMING_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return {}
  })
  return NextResponse.json({ framings }, { headers: { "cache-control": "private, no-store" } })
}
