import { NextResponse } from "next/server"

import { seedDefaultClasses } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function POST() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  try {
    const result = await seedDefaultClasses()
    return NextResponse.json({ ok: true, count: result.count, sheet: result.sheet })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code.includes("GOOGLE_DRIVE_NOT_AUTHORIZED")
      ? "Reconnecte d’abord le compte Google dédié."
      : code.includes("CLASSES_SHEET_NOT_CONFIGURED")
        ? "Crée d’abord les feuilles principales d’Eraser."
        : "L’index des classes n’a pas pu être rempli pour le moment."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
