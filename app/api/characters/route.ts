import { NextResponse } from "next/server"

import { createCharacterForUser } from "@/lib/google-sheets"
import { preferredIdentityUid } from "@/lib/identity-links"
import { authorizedAccount } from "@/lib/server-auth"

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  try {
    const body = (await request.json()) as { values?: unknown }
    if (!Array.isArray(body.values) || !body.values.every((value) => typeof value === "string")) {
      return NextResponse.json({ error: "Le formulaire est incomplet." }, { status: 400 })
    }
    const character = await createCharacterForUser(await preferredIdentityUid(account.uid), body.values)
    return NextResponse.json({ ok: true, character })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVALID_CHARACTER_NAME"
      ? "Le nom du personnage est obligatoire."
      : code.includes("GOOGLE_DRIVE_NOT_AUTHORIZED")
        ? "Le compte Google du site doit être reconnecté."
        : "Le personnage n’a pas pu être enregistré."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
