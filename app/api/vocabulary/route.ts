import { NextResponse } from "next/server"

import { authorizedAccount } from "@/lib/server-auth"
import {
  createVocabularyEntry,
  deleteVocabularyEntry,
  listVocabulary,
  listVocabularyAfterWrite,
  updateVocabularyEntry,
} from "@/lib/vocabulary"

const editorRoles = ["admin", "mj"] as const

function errorMessage(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : ""
  if (code === "INVALID_VOCABULARY_TITLE") return "Le titre est obligatoire (160 caractères au plus)."
  if (code === "VOCABULARY_CONTENT_TOO_LONG") return "Le contenu est trop long pour une cellule Google Sheets."
  if (code === "VOCABULARY_NOT_FOUND") return "Ce mot n’existe plus dans la feuille « Vocabulaire ». Recharge la page."
  return fallback
}

export async function GET() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    return NextResponse.json({ entries: await listVocabulary() })
  } catch {
    return NextResponse.json({ error: "Le vocabulaire est momentanément indisponible." }, { status: 502 })
  }
}

export async function POST(request: Request) {
  if (!await authorizedAccount([...editorRoles])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { title?: string; content?: string }
    const entry = await createVocabularyEntry({ title: String(body.title ?? ""), content: String(body.content ?? "") })
    return NextResponse.json({ entry, entries: await listVocabularyAfterWrite() })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Le mot n’a pas pu être ajouté.") }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  if (!await authorizedAccount([...editorRoles])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { rowNumber?: number; expectedTitle?: string; title?: string; content?: string }
    if (!Number.isInteger(body.rowNumber) || !body.expectedTitle) throw new Error("VOCABULARY_NOT_FOUND")
    const entry = await updateVocabularyEntry(body.rowNumber!, body.expectedTitle, { title: String(body.title ?? ""), content: String(body.content ?? "") })
    return NextResponse.json({ entry, entries: await listVocabularyAfterWrite() })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Le mot n’a pas pu être modifié.") }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  if (!await authorizedAccount([...editorRoles])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { rowNumber?: number; expectedTitle?: string }
    if (!Number.isInteger(body.rowNumber) || !body.expectedTitle) throw new Error("VOCABULARY_NOT_FOUND")
    await deleteVocabularyEntry(body.rowNumber!, body.expectedTitle)
    return NextResponse.json({ entries: await listVocabularyAfterWrite() })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Le mot n’a pas pu être supprimé.") }, { status: 400 })
  }
}
