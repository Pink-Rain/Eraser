import { NextResponse } from "next/server"

import { saveCharacterPortrait } from "@/lib/character-portraits"
import { getCharacterForMj, patchCharacterSheet } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  if (account.role === "mj" && !await getCharacterForMj(account.uid, id).catch(() => null)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const accountUid = account.role === "admin" || account.role === "mj" ? null : account.uid
  try {
    const contentType = request.headers.get("content-type") || ""
    // Seules les cases changées sont écrites : réécrire toute la fiche avec la copie du
    // navigateur effaçait ce qu'un autre (le MJ, le tabletop) venait d'y modifier.
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      const file = form.get("portrait")
      const serializedChanges = form.get("changes")
      if (!(file instanceof File) || typeof serializedChanges !== "string") throw new Error("INVALID_PORTRAIT")
      const parsed = JSON.parse(serializedChanges) as unknown
      const changes = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === "string")) as Record<string, string> : {}
      changes["36"] = await saveCharacterPortrait(id, file)
      const character = await patchCharacterSheet(accountUid, id, changes)
      return NextResponse.json({ character })
    }
    const body = (await request.json()) as { changes?: unknown }
    if (!body.changes || typeof body.changes !== "object" || Array.isArray(body.changes)) throw new Error("INVALID_VALUES")
    const changes = Object.fromEntries(Object.entries(body.changes as Record<string, unknown>).filter(([, value]) => typeof value === "string")) as Record<string, string>
    const character = await patchCharacterSheet(accountUid, id, changes)
    return NextResponse.json({ character })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVALID_CHARACTER_NAME" ? "Le nom du personnage est obligatoire."
      : code === "INVALID_PORTRAIT" ? "Choisis une image de moins de 10 Mo."
        : "La fiche n’a pas pu être enregistrée."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
