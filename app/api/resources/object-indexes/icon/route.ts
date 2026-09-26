import { NextResponse } from "next/server"

import { listObjectIndexTables, setObjectIndexIcon } from "@/lib/google-sheets"
import { forgetObjectIconFolderFiles, uploadObjectIcon } from "@/lib/object-icon-drive"
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
    const rowNumber = Number(form.get("rowNumber"))
    const file = form.get("file")
    if (!fileId || !tabName || !Number.isInteger(rowNumber) || rowNumber < 2 || !(file instanceof File)) {
      return NextResponse.json({ error: "Import incomplet." }, { status: 400 })
    }
    if (!IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: "Choisis une image (PNG, JPEG, WebP, GIF, SVG ou AVIF)." }, { status: 400 })
    if (file.size > MAX_ICON_BYTES) return NextResponse.json({ error: "Cette image dépasse 5 Mo." }, { status: 400 })
    const name = (file.name || "icone").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "icone"
    const driveFileId = await uploadObjectIcon(name, file.type, await file.arrayBuffer())
    forgetObjectIconFolderFiles()
    await setObjectIndexIcon(fileId, tabName, rowNumber, driveFileId)
    return NextResponse.json({ ok: true, tables: await listObjectIndexTables() })
  } catch {
    return NextResponse.json({ error: "L’icône n’a pas pu être importée dans le Drive." }, { status: 400 })
  }
}
