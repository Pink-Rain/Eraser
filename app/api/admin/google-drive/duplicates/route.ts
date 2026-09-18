import { NextResponse } from "next/server"

import { listDriveSpreadsheetDuplicates, trashRedundantDriveSpreadsheet } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function GET() {
  if (!await authorizedAccount(["admin"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json({ groups: await listDriveSpreadsheetDuplicates() })
}

export async function DELETE(request: Request) {
  if (!await authorizedAccount(["admin"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { fileId?: string }
    if (!body.fileId) throw new Error("INVALID_DRIVE_FILE_ID")
    await trashRedundantDriveSpreadsheet(body.fileId)
    return NextResponse.json({ ok: true, groups: await listDriveSpreadsheetDuplicates() })
  } catch {
    return NextResponse.json({ error: "Ce fichier est utilisé par Eraser ou n’est pas un doublon supprimable." }, { status: 400 })
  }
}
