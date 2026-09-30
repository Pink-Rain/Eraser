import { NextResponse } from "next/server"

import { applyObjectSchemaOperations, objectEditorModel, objectSchemas } from "@/lib/object-schema"
import { authorizedAccount } from "@/lib/server-auth"
import type { SchemaOperation } from "@/lib/index-schema-shared"
import { applyWorldSchemaOperations, knownWorldIndexKey, worldEditorModel } from "@/lib/world-indexes"

async function authorized() {
  return authorizedAccount(["admin", "mj"])
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (code.startsWith("INDEX_SCHEMA_LOCKED:")) return `Colonne verrouillée : ${code.slice("INDEX_SCHEMA_LOCKED:".length)}`
  if (code.startsWith("INDEX_SCHEMA_INVALID:")) return code.slice("INDEX_SCHEMA_INVALID:".length)
  if (code === "WORLD_INDEX_TAB_NOT_FOUND" || code === "OBJECT_INDEX_NOT_FOUND") return "Cet onglet n’existe plus dans Google Sheets. Actualise puis recommence."
  if (code === "WORLD_INDEX_COLUMN_NOT_FOUND" || code === "OBJECT_INDEX_COLUMN_NOT_FOUND") return "Cette colonne n’existe plus dans Google Sheets. Actualise puis recommence."
  return "Les changements n’ont pas pu être écrits dans Google Sheets."
}

const isOperation = (value: unknown): value is SchemaOperation => Boolean(value) && typeof value === "object" && typeof (value as { op?: unknown }).op === "string"

/** Ce que l'éditeur « Modifier » montre d'un index. */
export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const parameters = new URL(request.url).searchParams
  try {
    if (parameters.get("family") === "objects") return NextResponse.json({ model: await objectEditorModel(parameters.get("key") ?? "") })
    const key = await knownWorldIndexKey(parameters.get("key"))
    if (!key) return NextResponse.json({ error: "Index inconnu." }, { status: 400 })
    return NextResponse.json({ model: await worldEditorModel(key) })
  } catch (error) {
    console.error("INDEX_SCHEMA_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les colonnes de cet index n’ont pas pu être lues." }, { status: 502 })
  }
}

/** Applique les changements de l'éditeur. */
export async function POST(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { family?: string; key?: string; operations?: unknown[] }
    const operations = Array.isArray(body.operations) ? body.operations.filter(isOperation).slice(0, 200) : []
    if (!operations.length) throw new Error("INDEX_SCHEMA_INVALID:Aucun changement à écrire.")
    if (body.family === "objects") {
      const tables = await applyObjectSchemaOperations(body.key ?? "", operations)
      return NextResponse.json({ ok: true, tables, schemas: await objectSchemas(tables) })
    }
    const key = await knownWorldIndexKey(body.key)
    if (!key) throw new Error("INDEX_SCHEMA_INVALID:Index inconnu.")
    return NextResponse.json({ ok: true, data: await applyWorldSchemaOperations(key, operations) })
  } catch (error) {
    console.error("INDEX_SCHEMA_APPLY_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}
