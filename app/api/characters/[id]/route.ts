import { NextResponse } from "next/server"

import { saveCharacterPortrait } from "@/lib/character-portraits"
import { characterNarrativeStart, characterValueHeaders } from "@/lib/character-sheet-schema"
import { CharacterSheetChangedError, getCharacterForMj, patchCharacterSheet, type CharacterSheetChange } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Les cases envoyées par la fiche : chacune avec sa place, l'en-tête que la fiche y voyait et
 * sa valeur (et, pour une case JSON réécrite en entier, la valeur d'où elle est partie).
 */
function sheetChanges(raw: unknown): CharacterSheetChange[] {
  // `{}` : aucune case (un portrait seul, envoyé par une page de la version précédente).
  if (raw && typeof raw === "object" && !Array.isArray(raw) && !Object.keys(raw).length) return []
  if (!Array.isArray(raw)) throw new Error("INVALID_VALUES")
  return raw.map((item) => {
    const { index, header, value, before } = (item ?? {}) as Record<string, unknown>
    if (typeof index !== "number" || !Number.isInteger(index) || typeof header !== "string" || typeof value !== "string" || (before !== undefined && typeof before !== "string")) throw new Error("INVALID_VALUES")
    return { index, header, value, ...(typeof before === "string" ? { before } : {}) }
  })
}

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
      const portraitIndex = characterNarrativeStart + 1
      const changes = sheetChanges(JSON.parse(serializedChanges)).filter((change) => change.index !== portraitIndex)
      changes.push({ index: portraitIndex, header: characterValueHeaders[portraitIndex], value: await saveCharacterPortrait(id, file) })
      const character = await patchCharacterSheet(accountUid, id, changes)
      return NextResponse.json({ character })
    }
    const body = (await request.json()) as { changes?: unknown }
    const character = await patchCharacterSheet(accountUid, id, sheetChanges(body.changes))
    return NextResponse.json({ character })
  } catch (error) {
    // Rien n'a été écrit : la fiche relue part avec la réponse, la page l'affiche.
    if (error instanceof CharacterSheetChangedError) return NextResponse.json({ error: "La fiche a changé entre-temps : actualise puis recommence.", character: error.character }, { status: 409 })
    // Un refus (nom vide, image trop lourde) : 400, la fiche abandonne ce qui est refusé.
    // Le reste (Google lent ou injoignable) : 503, la fiche réessaie.
    const code = error instanceof Error ? error.message : ""
    if (code === "INVALID_CHARACTER_NAME") return NextResponse.json({ error: "Le nom du personnage est obligatoire (120 caractères au plus).", rejected: "name" }, { status: 400 })
    if (code === "INVALID_PORTRAIT") return NextResponse.json({ error: "Choisis une image de moins de 10 Mo.", rejected: "portrait" }, { status: 400 })
    if (code === "INVALID_VALUES") return NextResponse.json({ error: "Ces modifications sont illisibles : actualise la fiche.", rejected: "values" }, { status: 400 })
    console.error("CHARACTER_SHEET_SAVE_FAILED", id, code || "UNKNOWN_ERROR")
    return NextResponse.json({ error: "La fiche n’a pas pu être enregistrée." }, { status: 503 })
  }
}
