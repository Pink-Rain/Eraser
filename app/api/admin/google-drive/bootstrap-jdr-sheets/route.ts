import { NextResponse } from "next/server"

import { ensureJdrSheets, listLegacyIdentityCandidates } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function POST() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  try {
    const sheets = await ensureJdrSheets()
    const candidates = await listLegacyIdentityCandidates(admin.uid)
    return NextResponse.json({ ok: true, sheets, candidates })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code.includes("GOOGLE_DRIVE_NOT_AUTHORIZED")
      ? "Reconnecte d’abord le compte Google dédié."
      : "Les feuilles principales n’ont pas pu être créées pour le moment."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
