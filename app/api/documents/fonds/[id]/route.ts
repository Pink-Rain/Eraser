import { NextResponse } from "next/server"

import { removeDocumentBackground, updateDocumentBackground } from "@/lib/document-backgrounds"
import { authorizedAccount } from "@/lib/server-auth"

/** Le nom et les mots-clés d'un fond de la bibliothèque (administrateurs). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorizedAccount(["admin"])) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 })
  const { id } = await params
  try {
    const body = (await request.json()) as { name?: unknown; keywords?: unknown }
    return NextResponse.json({ background: await updateDocumentBackground(id, body) })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: code === "BACKGROUND_NOT_FOUND" ? "Ce fond n’est plus dans la bibliothèque." : "Le fond n’a pas pu être modifié." }, { status: 400 })
  }
}

/** Retire un fond de la bibliothèque (administrateurs) : les documents qui s'en servent le gardent. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorizedAccount(["admin"])) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 })
  const { id } = await params
  try {
    await removeDocumentBackground(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Le fond n’a pas pu être retiré." }, { status: 400 })
  }
}
