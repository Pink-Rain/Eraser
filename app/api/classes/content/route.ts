import { NextResponse } from "next/server"

import { invalidateClassContentCaches, listClassPresentations, updateClassPresentationCell } from "@/lib/class-content"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * La présentation d'une classe (caractéristiques, spécialités), pour le créateur de classe :
 * c'est là qu'elle se modifie ; Règles › Classes la montre seulement.
 */
export async function GET(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const parameters = new URL(request.url).searchParams
  const classId = parameters.get("classId") ?? ""
  if (!classId) return NextResponse.json({ error: "Classe inconnue." }, { status: 400 })
  try {
    const { presentations, file } = await listClassPresentations(parameters.get("refresh") === "1")
    return NextResponse.json({
      presentation: presentations.find((item) => item.classId === classId) ?? null,
      sheetUrl: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("CLASS_PRESENTATION_LOAD_FAILED", code || "UNKNOWN_ERROR")
    if (code === "CLASS_PRESENTATION_SHEET_NOT_FOUND") return NextResponse.json({ error: "La feuille « Présentation des classes » n’a pas été trouvée dans le Drive relié." }, { status: 404 })
    return NextResponse.json({ error: "La présentation de cette classe n’a pas pu être lue dans Google Sheets." }, { status: 502 })
  }
}

/**
 * Modifie une case de la présentation d'une classe : `header` (l'en-tête de sa colonne) et
 * `occurrence` (son rang parmi les en-têtes identiques) la désignent, jamais sa place.
 */
export async function POST(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: unknown; classId?: unknown; header?: unknown; occurrence?: unknown; value?: unknown }
    const occurrence = body.occurrence === undefined ? 0 : body.occurrence
    if (body.action !== "update-presentation" || typeof body.classId !== "string" || typeof body.header !== "string" || !body.header.trim() || typeof occurrence !== "number" || !Number.isInteger(occurrence) || occurrence < 0 || typeof body.value !== "string") throw new Error("INVALID_CLASS_CONTENT_ACTION")
    await updateClassPresentationCell({ classId: body.classId, header: body.header, occurrence, value: body.value })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("CLASS_PRESENTATION_WRITE_FAILED", code || "UNKNOWN_ERROR")
    if (code === "CLASS_PRESENTATION_NOT_FOUND" || code === "CLASS_PRESENTATION_FIELD_NOT_EDITABLE") return NextResponse.json({ error: "La feuille « Présentation des classes » a changé entre-temps : actualise puis recommence." }, { status: 409 })
    if (code === "CLASS_PRESENTATION_DUPLICATE") return NextResponse.json({ error: "Cette classe occupe plusieurs lignes de « Présentation des classes » : corrige la feuille, puis actualise." }, { status: 409 })
    return NextResponse.json({ error: "Cette modification n’a pas pu être enregistrée dans Google Sheets." }, { status: 400 })
  } finally {
    // La présentation modifiée doit apparaître au prochain affichage de la classe.
    invalidateClassContentCaches({ keepSpellTabs: true })
  }
}
