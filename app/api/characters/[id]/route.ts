import { NextResponse } from "next/server"

import { saveCharacterPortrait } from "@/lib/character-portraits"
import { characterValueHeaders } from "@/lib/character-sheet-schema"
import { getCharacterForMj, updateCharacterSheet } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  if (account.role === "mj" && !await getCharacterForMj(account.uid, id).catch(() => null)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const accountUid = account.role === "admin" || account.role === "mj" ? null : account.uid
  try {
    const contentType = request.headers.get("content-type") || ""
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      const file = form.get("portrait")
      const serializedValues = form.get("values")
      if (!(file instanceof File) || typeof serializedValues !== "string") throw new Error("INVALID_PORTRAIT")
      const values = JSON.parse(serializedValues) as unknown
      if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) throw new Error("INVALID_VALUES")
      values[36] = await saveCharacterPortrait(id, file)
      const character = await updateCharacterSheet(accountUid, id, values)
      return NextResponse.json({ character })
    }
    const body = (await request.json()) as { values?: unknown }
    if (!Array.isArray(body.values) || body.values.length > characterValueHeaders.length || !body.values.every((value) => typeof value === "string")) throw new Error("INVALID_VALUES")
    const character = await updateCharacterSheet(accountUid, id, body.values)
    return NextResponse.json({ character })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVALID_CHARACTER_NAME" ? "Le nom du personnage est obligatoire."
      : code === "INVALID_PORTRAIT" ? "Choisis une image de moins de 10 Mo."
        : "La fiche n’a pas pu être enregistrée."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
