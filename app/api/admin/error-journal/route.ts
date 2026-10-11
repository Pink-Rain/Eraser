import { NextResponse } from "next/server"

import { clearErrorJournal, installErrorJournal, readErrorJournal } from "@/lib/error-journal"
import { authorizedAccount } from "@/lib/server-auth"

// Au cas où le démarrage ne l'aurait pas branché : les erreurs suivantes sont gardées.
installErrorJournal()

/** Le journal des erreurs du serveur local (administrateurs). */
export async function GET() {
  if (!await authorizedAccount(["admin"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json({ entries: readErrorJournal() })
}

export async function DELETE() {
  if (!await authorizedAccount(["admin"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  clearErrorJournal()
  return NextResponse.json({ entries: [] })
}
