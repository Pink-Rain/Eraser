import { NextResponse } from "next/server"

import { listObjectIndexTables, setObjectIndexIcon } from "@/lib/google-sheets"
import { forgetObjectIconFolderFiles, uploadObjectIcon } from "@/lib/object-icon-drive"
import { OBJECT_INDEX_CHANGED_MESSAGE, parseObjectIndexRowRef } from "@/lib/object-index-refs"
import { authorizedAccount } from "@/lib/server-auth"

const MAX_ICON_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif"])

/** Importe une image dans le dossier « icone objet » et la pose dans la case « Icône » d'une ligne. */
export async function POST(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const form = await request.formData()
    const fileId = String(form.get("fileId") || "")
    const tabName = String(form.get("tabName") || "")
    // La ligne par son ID (son numéro n'est qu'un indice), retrouvée dans la feuille au moment d'écrire.
    const row = parseObjectIndexRowRef({ id: String(form.get("id") ?? ""), rowNumber: Number(form.get("rowNumber")), name: String(form.get("name") ?? "") })
    const file = form.get("file")
    if (!fileId || !tabName || !row || !(file instanceof File)) {
      return NextResponse.json({ error: "Import incomplet." }, { status: 400 })
    }
    if (!IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: "Choisis une image (PNG, JPEG, WebP, GIF, SVG ou AVIF)." }, { status: 400 })
    if (file.size > MAX_ICON_BYTES) return NextResponse.json({ error: "Cette image dépasse 5 Mo." }, { status: 400 })
    const name = (file.name || "icone").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "icone"
    const driveFileId = await uploadObjectIcon(name, file.type, await file.arrayBuffer())
    forgetObjectIconFolderFiles()
    await setObjectIndexIcon(fileId, tabName, row, driveFileId)
    return NextResponse.json({ ok: true, tables: await listObjectIndexTables() })
  } catch (error) {
    if (error instanceof Error && error.message === "OBJECT_INDEX_CHANGED") return NextResponse.json({ error: OBJECT_INDEX_CHANGED_MESSAGE }, { status: 409 })
    return NextResponse.json({ error: "L’icône n’a pas pu être importée dans le Drive." }, { status: 400 })
  }
}
