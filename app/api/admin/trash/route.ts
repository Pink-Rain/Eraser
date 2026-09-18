import { NextResponse } from "next/server"

import { permanentlyDeleteItem, restoreItem } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

const kinds = new Set(["todo", "character", "campaign"])

export async function PATCH(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json()) as { kind?: "todo" | "character" | "campaign"; id?: string }
  if (!body.kind || !body.id || !kinds.has(body.kind)) return NextResponse.json({ error: "Élément introuvable." }, { status: 400 })
  await restoreItem(body.kind, body.id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json()) as { kind?: "todo" | "character" | "campaign"; id?: string }
  if (!body.kind || !body.id || !kinds.has(body.kind)) return NextResponse.json({ error: "Élément introuvable." }, { status: 400 })
  await permanentlyDeleteItem(body.kind, body.id)
  return NextResponse.json({ ok: true })
}
