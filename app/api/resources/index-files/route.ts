import { NextResponse } from "next/server"

import { putSharedMedia } from "@/lib/shared-media"
import { authorizedAccount } from "@/lib/server-auth"

/** Familles de fichiers qu'une colonne Fichier peut limiter. */
const families: Record<string, (type: string) => boolean> = {
  image: (type) => type.startsWith("image/"),
  audio: (type) => type.startsWith("audio/"),
  video: (type) => type.startsWith("video/"),
  pdf: (type) => type === "application/pdf",
  any: () => true,
}

function familyOf(type: string) {
  if (type.startsWith("image/")) return "image"
  if (type.startsWith("audio/")) return "audio"
  if (type.startsWith("video/")) return "video"
  if (type === "application/pdf") return "pdf"
  return "file"
}

/**
 * Fichier d'une colonne « Fichier » de n'importe quel index, rangé avec les autres
 * médias partagés dans Drive. L'adresse renvoyée garde le nom et la famille du fichier
 * (pour l'afficher sans le télécharger) ; réimporter à la même place le remplace.
 */
export async function POST(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const form = await request.formData()
    const file = form.get("file")
    const accept = String(form.get("accept") || "any")
    const previous = String(form.get("id") || "")
    if (!(file instanceof File) || file.size <= 0 || file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Choisis un fichier de 25 Mo au plus." }, { status: 400 })
    const type = file.type || "application/octet-stream"
    if (!(families[accept] ?? families.any)(type)) return NextResponse.json({ error: "Ce type de fichier n’est pas accepté par cette colonne." }, { status: 400 })
    const id = /^[\w-]{8,64}$/.test(previous) ? previous : crypto.randomUUID()
    await putSharedMedia(`index-files/${id}`, await file.arrayBuffer(), type)
    const name = file.name.slice(0, 120)
    return NextResponse.json({ url: `/api/resources/index-files/${id}?t=${familyOf(type)}&n=${encodeURIComponent(name)}&v=${Date.now()}` })
  } catch (error) {
    console.error("INDEX_FILE_UPLOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Le fichier n’a pas pu être enregistré dans Google Drive." }, { status: 400 })
  }
}
