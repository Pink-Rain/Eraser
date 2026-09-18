import { NextResponse } from "next/server"

import { updateClassPresentationCell } from "@/lib/class-content"
import { authorizedAccount } from "@/lib/server-auth"

export async function POST(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: unknown; classId?: unknown; rowNumber?: unknown; column?: unknown; value?: unknown }
    if (body.action !== "update-presentation" || typeof body.classId !== "string" || typeof body.rowNumber !== "number" || typeof body.column !== "number" || typeof body.value !== "string") throw new Error("INVALID_CLASS_CONTENT_ACTION")
    await updateClassPresentationCell({ classId: body.classId, rowNumber: body.rowNumber, column: body.column, value: body.value })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Cette modification n’a pas pu être enregistrée dans Google Sheets." }, { status: 400 })
  }
}
