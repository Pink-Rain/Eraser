import { NextResponse } from "next/server"

import { permanentlyDeleteItem, restoreItem } from "@/lib/google-sheets"
import { purgeObjectIndexTrash, restoreObjectIndexTrash } from "@/lib/object-schema"
import { authorizedAccount } from "@/lib/server-auth"
import { isCustomIndexKey, purgeCustomIndex, restoreCustomIndex } from "@/lib/custom-indexes"
import { knownWorldIndexKey, purgeWorldIndexTrash, restoreWorldIndexTrash } from "@/lib/world-indexes"

type IndexTrashBody = { kind: "index"; family?: string; key?: string; tab?: string; column?: string }

/** Une colonne ou un onglet d'index mis à la corbeille depuis « Modifier ». */
async function indexTrash(body: IndexTrashBody, operation: "restore" | "delete") {
  const tab = String(body.tab ?? "")
  const column = String(body.column ?? "")
  // Sans onglet ni colonne : tout un index créé dans Eraser.
  if (!tab && !column && body.family === "world" && isCustomIndexKey(body.key)) return operation === "restore" ? restoreCustomIndex(body.key) : purgeCustomIndex(body.key)
  if (!tab) throw new Error("INDEX_TRASH_NOT_FOUND")
  if (body.family === "objects") {
    if (!/^[A-Za-z0-9_-]+$/.test(body.key ?? "")) throw new Error("INDEX_TRASH_NOT_FOUND")
    return operation === "restore" ? restoreObjectIndexTrash(body.key!, tab, column) : purgeObjectIndexTrash(body.key!, tab, column)
  }
  const key = await knownWorldIndexKey(body.key)
  if (!key) throw new Error("INDEX_TRASH_NOT_FOUND")
  return operation === "restore" ? restoreWorldIndexTrash(key, tab, column) : purgeWorldIndexTrash(key, tab, column)
}

/** Pourquoi une colonne, un onglet ou un index n'a pas pu quitter la corbeille. */
function indexTrashMessage(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : ""
  if (code === "INDEX_TRASH_ENTITY_LOCKED") return "Cette colonne appartient à une feuille que d’autres pages d’Eraser lisent (personnages, campagnes, PNJ, classes, sorts) : elle ne s’efface pas d’ici. Restaure-la, ou laisse-la à la corbeille : elle reste masquée dans l’index."
  if (code === "INDEX_TRASH_AMBIGUOUS") return "Plusieurs colonnes portent ce nom dans Google Sheets : rien n’a été effacé. Supprime à la main celle qui est en trop, puis recommence."
  if (code === "CUSTOM_INDEX_FILE_MISMATCH") return "Le classeur relié à cet index n’est pas un classeur « Index · … » : il n’a pas été mis à la corbeille. Vérifie-le dans Google Drive."
  if (code === "INDEX_TRASH_NOT_FOUND" || code === "CUSTOM_INDEX_NOT_FOUND") return "Élément introuvable : il a peut-être déjà été restauré ou supprimé. Actualise la page."
  return fallback
}

const kinds = new Set(["todo", "character", "campaign"])

export async function PATCH(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json()) as { kind?: "todo" | "character" | "campaign" | "index"; id?: string }
  if (body.kind === "index") {
    try { await indexTrash(body as IndexTrashBody, "restore") } catch (error) { return NextResponse.json({ error: indexTrashMessage(error, "Élément introuvable.") }, { status: 400 }) }
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
    try { await indexTrash(body as IndexTrashBody, "delete") } catch (error) { return NextResponse.json({ error: indexTrashMessage(error, "La suppression n’a pas pu être faite dans Google Sheets.") }, { status: 400 }) }
    return NextResponse.json({ ok: true })
  }
  if (!body.kind || !body.id || !kinds.has(body.kind)) return NextResponse.json({ error: "Élément introuvable." }, { status: 400 })
  await permanentlyDeleteItem(body.kind, body.id)
  return NextResponse.json({ ok: true })
}
