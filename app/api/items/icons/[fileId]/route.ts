import { NextResponse } from "next/server"

import { downloadDriveFile } from "@/lib/google-drive"
import { objectIndexIconDriveFileIds } from "@/lib/google-sheets"
import { objectIconFolderFileIds } from "@/lib/object-icon-drive"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Icône d'objet stockée sur le Drive. Seules les images du dossier « icone objet »
 * ou citées dans une colonne « Icône » des index sont servies.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  const { fileId } = await params
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  try {
    const allowed = (await objectIconFolderFileIds()).has(fileId) || (await objectIndexIconDriveFileIds()).has(fileId)
    if (!allowed) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
    const driveResponse = await downloadDriveFile(fileId)
    const contentType = driveResponse.headers.get("content-type") || ""
    if (!driveResponse.ok || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
    }
    return new NextResponse(driveResponse.body, {
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=3600, stale-while-revalidate=86400",
        "x-content-type-options": "nosniff",
      },
    })
  } catch {
    return NextResponse.json({ error: "Image indisponible." }, { status: 502 })
  }
}
