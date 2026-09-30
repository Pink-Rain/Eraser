import { NextResponse } from "next/server"

import { putSharedMedia } from "@/lib/shared-media"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Image d'une colonne « Image » de n'importe quel index (icône d'objet, portrait…),
 * rangée avec les autres médias partagés dans Drive. La feuille garde l'adresse
 * renvoyée ; réimporter une image dans la même cellule remplace la précédente.
 */
export async function POST(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const form = await request.formData()
    const file = form.get("file")
    const previous = String(form.get("id") || "")
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size <= 0 || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Choisis une image de 10 Mo au plus." }, { status: 400 })
    }
    const id = /^[\w-]{8,64}$/.test(previous) ? previous : crypto.randomUUID()
    await putSharedMedia(`index-images/${id}`, await file.arrayBuffer(), file.type)
    // Le numéro de version force le rafraîchissement quand l'image est remplacée.
    return NextResponse.json({ url: `/api/resources/index-images/${id}?v=${Date.now()}` })
  } catch (error) {
    console.error("INDEX_IMAGE_UPLOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "L’image n’a pas pu être enregistrée dans Google Drive." }, { status: 400 })
  }
}
