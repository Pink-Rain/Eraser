import { NextResponse } from "next/server"

import { permanentlyDeleteItem, restoreItem } from "@/lib/google-sheets"
import { purgeObjectIndexTrash, restoreObjectIndexTrash } from "@/lib/object-schema"
import { authorizedAccount } from "@/lib/server-auth"
import { knownWorldIndexKey, purgeWorldIndexTrash, restoreWorldIndexTrash } from "@/lib/world-indexes"

type IndexTrashBody = { kind: "index"; family?: string; key?: string; tab?: string; column?: string }

/** Une colonne ou un onglet d'index mis à la corbeille depuis « Modifier ». */
async function indexTrash(body: IndexTrashBody, operation: "restore" | "delete") {
  const tab = String(body.tab ?? "")
  const column = String(body.column ?? "")
  if (!tab) throw new Error("INDEX_TRASH_NOT_FOUND")
  if (body.family === "objects") {
    if (!/^[A-Za-z0-9_-]+$/.test(body.key ?? "")) throw new Error("INDEX_TRASH_NOT_FOUND")
    return operation === "restore" ? restoreObjectIndexTrash(body.key!, tab, column) : purgeObjectIndexTrash(body.key!, tab, column)
  }
  const key = await knownWorldIndexKey(body.key)
  if (!key) throw new Error("INDEX_TRASH_NOT_FOUND")
  return operation === "restore" ? restoreWorldIndexTrash(key, tab, column) : purgeWorldIndexTrash(key, tab, column)
}

const kinds = new Set(["todo", "character", "campaign"])

export async function PATCH(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json()) as { kind?: "todo" | "character" | "campaign" | "index"; id?: string }
  if (body.kind === "index") {
    try { await indexTrash(body as IndexTrashBody, "restore") } catch { return NextResponse.json({ error: "Élément introuvable." }, { status: 400 }) }
    return NextResponse.json({ ok: true })
  }
  if (!body.kind || !body.id || !kinds.has(body.kind)) return NextResponse.json({ error: "Élément introuvable." }, { status: 400 })
  await restoreItem(body.kind, body.id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json()) as { kind?: "todo" | "character" | "campaign" | "index"; id?: string }
  if (body.kind === "index") {
    try { await indexTrash(body as IndexTrashBody, "delete") } catch { return NextResponse.json({ error: "La suppression n’a pas pu être faite dans Google Sheets." }, { status: 400 }) }
    return NextResponse.json({ ok: true })
  }
  if (!body.kind || !body.id || !kinds.has(body.kind)) return NextResponse.json({ error: "Élément introuvable." }, { status: 400 })
  await permanentlyDeleteItem(body.kind, body.id)
  return NextResponse.json({ ok: true })
}
