import { NextResponse } from "next/server"

import { saveCharacterPortrait } from "@/lib/character-portraits"
import { characterNarrativeStart } from "@/lib/character-sheet-schema"
import { createCharacterForUser } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  try {
    // Le formulaire envoie l’image importée avec la fiche : le portrait est rangé sous
    // l’identifiant du futur personnage avant que la ligne ne soit écrite dans Sheets.
    const id = crypto.randomUUID()
    let values: unknown
    let portrait: File | null = null
    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await request.formData()
      const serialized = form.get("values")
      values = typeof serialized === "string" ? JSON.parse(serialized) : null
      const file = form.get("portrait")
      portrait = file instanceof File && file.size > 0 ? file : null
    } else {
      values = ((await request.json()) as { values?: unknown }).values
    }
    if (!isStringList(values)) {
      return NextResponse.json({ error: "Le formulaire est incomplet." }, { status: 400 })
    }
    if (portrait) values[characterNarrativeStart + 1] = await saveCharacterPortrait(id, portrait)
    const character = await createCharacterForUser(account.uid, values, id)
    return NextResponse.json({ ok: true, character })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVALID_CHARACTER_NAME"
      ? "Le nom du personnage est obligatoire."
      : code === "INVALID_PORTRAIT"
        ? "Choisis une image de moins de 10 Mo."
        : code.includes("GOOGLE_DRIVE_NOT_AUTHORIZED")
          ? "Le compte Google du site doit être reconnecté."
          : "Le personnage n’a pas pu être enregistré."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
