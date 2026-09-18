import { NextResponse } from "next/server"

import {
  addObjectIndexRow,
  deleteObjectIndexRow,
  duplicateObjectIndexRow,
  enrichObjectIndexTables,
  ensureObjectIndexStackLimits,
  listObjectIndexTables,
  refreshObjectIndexTables,
  updateObjectIndexRow,
} from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

async function authorized() {
  return authorizedAccount(["admin", "mj"])
}

export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1"
    return NextResponse.json({ tables: refresh ? await refreshObjectIndexTables() : await listObjectIndexTables() })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: code === "OBJECT_INDEX_FOLDER_NOT_FOUND"
      ? "Le dossier « Objets » est introuvable dans le Drive connecté."
      : "Les index d’objets n’ont pas pu être chargés." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: string; fileId?: string; tabName?: string; rowNumber?: number; values?: unknown[] }
    if (body.action === "enrich") {
      const result = await enrichObjectIndexTables()
      return NextResponse.json({ ok: true, result, tables: await listObjectIndexTables() })
    }
    if (body.action === "ensure-stack-limits") {
      const result = await ensureObjectIndexStackLimits()
      return NextResponse.json({ ok: true, result, tables: await listObjectIndexTables() })
    }
    if (!body.fileId || !body.tabName) throw new Error("INVALID_OBJECT_INDEX")
    if (body.action === "add") await addObjectIndexRow(body.fileId, body.tabName)
    else if (body.action === "update" && typeof body.rowNumber === "number" && Array.isArray(body.values)) {
      await updateObjectIndexRow(body.fileId, body.tabName, body.rowNumber, body.values.map((value) => String(value ?? "")))
    } else if (body.action === "duplicate" && typeof body.rowNumber === "number") {
      await duplicateObjectIndexRow(body.fileId, body.tabName, body.rowNumber)
    } else if (body.action === "delete" && typeof body.rowNumber === "number") {
      await deleteObjectIndexRow(body.fileId, body.tabName, body.rowNumber)
    } else throw new Error("INVALID_OBJECT_INDEX_ACTION")
    return NextResponse.json({ ok: true, tables: await listObjectIndexTables() })
  } catch {
    return NextResponse.json({ error: "Cette modification n’a pas pu être enregistrée dans Google Sheets." }, { status: 400 })
  }
}
