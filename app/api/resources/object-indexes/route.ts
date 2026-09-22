import { NextResponse } from "next/server"

import {
  addObjectIndexRow,
  addObjectIndexRowWithValues,
  insertObjectIndexRow,
  deleteObjectIndexRow,
  duplicateObjectIndexRow,
  enrichObjectIndexTables,
  ensureObjectIndexStackLimits,
  listObjectIndexTables,
  refreshObjectIndexTables,
  updateObjectIndexCell,
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
    const body = (await request.json()) as { action?: string; fileId?: string; tabName?: string; rowNumber?: number; rowNumbers?: unknown; column?: number; html?: string; values?: unknown[] }
    if (body.action === "enrich") {
      const result = await enrichObjectIndexTables()
      return NextResponse.json({ ok: true, result, tables: await listObjectIndexTables() })
    }
    if (body.action === "ensure-stack-limits") {
      const result = await ensureObjectIndexStackLimits()
      return NextResponse.json({ ok: true, result, tables: await listObjectIndexTables() })
    }
    if (!body.fileId || !body.tabName) throw new Error("INVALID_OBJECT_INDEX")
    // L’éditeur enregistre cellule par cellule : la réponse ne renvoie alors pas tout
    // le classeur, pour que la frappe reste fluide.
    if (body.action === "update-cell" && typeof body.rowNumber === "number" && typeof body.column === "number" && typeof body.html === "string") {
      await updateObjectIndexCell(body.fileId, body.tabName, body.rowNumber, body.column, body.html)
      return NextResponse.json({ ok: true })
    }
    // Plusieurs lignes se suppriment du bas vers le haut : retirer la première
    // décalerait toutes les suivantes.
    const rowNumbers = Array.isArray(body.rowNumbers) ? body.rowNumbers.filter((value): value is number => typeof value === "number") : []
    if (body.action === "add") {
      if (Array.isArray(body.values)) await addObjectIndexRowWithValues(body.fileId, body.tabName, body.values.map((value) => String(value ?? "")))
      else await addObjectIndexRow(body.fileId, body.tabName)
    } else if (body.action === "insert" && typeof body.rowNumber === "number") {
      await insertObjectIndexRow(body.fileId, body.tabName, body.rowNumber)
    } else if (body.action === "delete" && rowNumbers.length) {
      for (const row of [...rowNumbers].sort((left, right) => right - left)) await deleteObjectIndexRow(body.fileId, body.tabName, row)
    } else if (body.action === "duplicate" && rowNumbers.length) {
      for (const row of [...rowNumbers].sort((left, right) => right - left)) await duplicateObjectIndexRow(body.fileId, body.tabName, row)
    }
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
