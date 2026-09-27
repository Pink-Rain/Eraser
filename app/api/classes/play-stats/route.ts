import { NextResponse } from "next/server"

import { listAllCampaignsForAdmin, listCharacterPlayRows } from "@/lib/google-sheets"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"

/** Données des fiches pour les statistiques « joueurs » de Sorts des classes. */
export async function GET() {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const [characters, campaigns] = await Promise.all([
      listCharacterPlayRows(),
      listAllCampaignsForAdmin(await currentAuthToken()).then((items) => items.map((item) => ({ id: item.id, name: item.name, accentColor: item.accentColor }))),
    ])
    return NextResponse.json({ characters, campaigns })
  } catch (error) {
    console.error("PLAY_STATS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les fiches de personnage n’ont pas pu être lues dans Google Sheets." }, { status: 503 })
  }
}
