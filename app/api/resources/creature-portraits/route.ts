import { NextResponse } from "next/server"

import { putSharedMedia } from "@/lib/shared-media"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Portrait d'une créature, rangé avec les autres médias partagés dans Drive. La feuille
 * garde l'adresse renvoyée ; réimporter une image pour la même créature la remplace.
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
    await putSharedMedia(`creatures/${id}/portrait`, await file.arrayBuffer(), file.type)
    // Le numéro de version force le rafraîchissement quand l'image est remplacée.
    return NextResponse.json({ url: `/api/resources/creature-portraits/${id}?v=${Date.now()}` })
  } catch (error) {
    console.error("CREATURE_PORTRAIT_UPLOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Le portrait n’a pas pu être enregistré dans Google Drive." }, { status: 400 })
  }
}
