import { NextResponse } from "next/server"

import { addDocumentBackground, readDocumentBackgroundLibrary, setBuiltinBackgroundKeywords } from "@/lib/document-backgrounds"
import { authorizedAccount } from "@/lib/server-auth"

const message = (code: string) => code === "SHARED_STORE_UNAVAILABLE" ? "Le serveur partagé d’Eraser n’est pas joignable : les fonds ne peuvent pas être gardés pour toutes les installations."
  : code === "INVALID_BACKGROUND_FILE" ? "Cette image est trop lourde (15 Mo au plus) ou d’un format inconnu."
    : "La bibliothèque des fonds n’a pas pu être modifiée."

/**
 * La bibliothèque des fonds de documents (roue de réglages d'Eraser Doc), lue par l'éditeur : MJ et
 * administrateurs. `POST` (administrateurs) : un fond ajouté, multipart (`image`, `name`,
 * `keywords` en JSON). `PATCH` (administrateurs) : les mots-clés des fonds fournis (`builtin`).
 */
export async function GET() {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    return NextResponse.json(await readDocumentBackgroundLibrary(), { headers: { "cache-control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "La bibliothèque des fonds n’a pas pu être lue." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  if (!await authorizedAccount(["admin"])) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 })
  try {
    const form = await request.formData()
    const image = form.get("image")
    if (!(image instanceof File)) throw new Error("INVALID_BACKGROUND_FILE")
    let keywords: unknown = []
    try { keywords = JSON.parse(String(form.get("keywords") || "[]")) } catch { keywords = [] }
    return NextResponse.json({ background: await addDocumentBackground({ name: form.get("name"), keywords }, image) })
  } catch (error) {
    return NextResponse.json({ error: message(error instanceof Error ? error.message : "") }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  if (!await authorizedAccount(["admin"])) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 })
  try {
    const body = (await request.json()) as { builtin?: unknown }
    const builtin = body.builtin && typeof body.builtin === "object" ? body.builtin as Record<string, unknown> : {}
    return NextResponse.json({ builtin: await setBuiltinBackgroundKeywords(builtin) })
  } catch (error) {
    return NextResponse.json({ error: message(error instanceof Error ? error.message : "") }, { status: 400 })
  }
}
