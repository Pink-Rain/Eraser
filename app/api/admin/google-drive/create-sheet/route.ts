import { NextResponse } from "next/server"

import { createGoogleSpreadsheet } from "@/lib/google-drive"
import { authorizedAccount } from "@/lib/server-auth"

export async function POST(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  try {
    const body = (await request.json()) as { name?: string }
    const file = await createGoogleSpreadsheet(body.name || "")
    return NextResponse.json({ ok: true, file })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVALID_SHEET_NAME"
      ? "Choisis un nom de feuille compris entre 1 et 120 caractères."
      : code.includes("GOOGLE_DRIVE_NOT_AUTHORIZED")
        ? "Connecte d’abord le compte Google dédié."
        : "La feuille Google Sheets n’a pas pu être créée."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
