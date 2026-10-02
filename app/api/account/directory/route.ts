import { NextResponse } from "next/server"

import { listDirectoryAccounts } from "@/lib/chat-accounts"
import { authorizedAccount } from "@/lib/server-auth"

/** Les autres comptes (nom, rôle si connu), pour l'accueil : chacun mène à un profil. */
export async function GET() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    return NextResponse.json({ accounts: await listDirectoryAccounts(account) }, { headers: { "cache-control": "private, no-store" } })
  } catch (error) {
    console.error("ACCOUNT_DIRECTORY_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "La liste des comptes n’a pas pu être chargée." }, { status: 503 })
  }
}
