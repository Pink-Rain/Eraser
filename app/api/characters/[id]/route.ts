import { NextResponse } from "next/server"

import { saveCharacterPortrait } from "@/lib/character-portraits"
import { getCharacterForMj, patchCharacterSheet, updateCharacterSheet } from "@/lib/google-sheets"
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
      const serializedChanges = form.get("changes")
      if (file instanceof File && typeof serializedChanges === "string") {
        const parsed = JSON.parse(serializedChanges) as unknown
        const changes = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === "string")) as Record<string, string> : {}
        changes["36"] = await saveCharacterPortrait(id, file)
        const character = await patchCharacterSheet(accountUid, id, changes)
        return NextResponse.json({ character })
      }
      if (!(file instanceof File) || typeof serializedValues !== "string") throw new Error("INVALID_PORTRAIT")
      const values = JSON.parse(serializedValues) as unknown
      if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) throw new Error("INVALID_VALUES")
      values[36] = await saveCharacterPortrait(id, file)
      const character = await updateCharacterSheet(accountUid, id, values)
      return NextResponse.json({ character })
    }
    const body = (await request.json()) as { values?: unknown; changes?: unknown }
    // Les cases changées seulement (la fiche n'envoie plus toute la ligne).
    if (body.changes && typeof body.changes === "object" && !Array.isArray(body.changes)) {
      const changes = Object.fromEntries(Object.entries(body.changes as Record<string, unknown>).filter(([, value]) => typeof value === "string")) as Record<string, string>
      const character = await patchCharacterSheet(accountUid, id, changes)
      return NextResponse.json({ character })
    }
    // La largeur réelle de la fiche dépend de l'Index des caractéristiques et compétences ;
    // le serveur ignore ce qui dépasse ses colonnes.
    if (!Array.isArray(body.values) || body.values.length > 20_000 || !body.values.every((value) => typeof value === "string")) throw new Error("INVALID_VALUES")
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
