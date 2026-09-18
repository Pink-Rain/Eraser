import { NextResponse } from "next/server"

import { updateClassAccentColors } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function POST(request: Request) {
  if (!await authorizedAccount(["admin"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { colors?: Array<{ id?: unknown; dark?: unknown; light?: unknown }> }
    if (!Array.isArray(body.colors)) throw new Error("INVALID_CLASS_COLORS")
    const colors = body.colors.flatMap((item) => typeof item.id === "string" && typeof item.dark === "string" && typeof item.light === "string"
      ? [{ id: item.id, dark: item.dark, light: item.light }]
      : [])
    await updateClassAccentColors(colors)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Les couleurs des classes n’ont pas pu être enregistrées." }, { status: 400 })
  }
}
