import { NextResponse } from "next/server"

import { authorizedAccount } from "@/lib/server-auth"
import {
  addWorldIndexRow,
  deleteWorldIndexRows,
  duplicateWorldIndexRows,
  getWorldIndex,
  isWorldIndexKey,
  moveWorldIndexRows,
  updateWorldIndexCell,
  updateWorldIndexFields,
} from "@/lib/world-indexes"

async function authorized() {
  return authorizedAccount(["admin", "mj"])
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (code === "WORLD_INDEX_NAME_REQUIRED") return "Le nom est obligatoire."
  if (code === "WORLD_INDEX_ROW_NOT_FOUND") return "Cette ligne n’existe plus dans Google Sheets. Actualise le tableau."
  return "Cette modification n’a pas pu être enregistrée dans Google Sheets."
}

export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const parameters = new URL(request.url).searchParams
  const key = parameters.get("key")
  if (!isWorldIndexKey(key)) return NextResponse.json({ error: "Index inconnu." }, { status: 400 })
  try {
    // « Actualiser » relit Google Sheets ; sinon l'index gardé en mémoire suffit.
    return NextResponse.json({ data: await getWorldIndex(key, { refresh: parameters.get("refresh") === "1" }) })
  } catch {
    return NextResponse.json({ error: "Cet index n’a pas pu être chargé depuis Google Sheets." }, { status: 502 })
  }
}

export async function POST(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { key?: unknown; action?: string; tabName?: string; rowNumber?: number; rowNumbers?: unknown; column?: number; html?: string; values?: unknown[]; fields?: Record<string, unknown>; toTab?: string }
    if (!isWorldIndexKey(body.key) || !body.tabName) throw new Error("INVALID_WORLD_INDEX")
    const key = body.key
    const rowNumbers = Array.isArray(body.rowNumbers) ? body.rowNumbers.filter((value): value is number => Number.isInteger(value)) : []
    let changed: string[] = []
    if (body.action === "update-cell" && typeof body.rowNumber === "number" && typeof body.column === "number" && typeof body.html === "string") {
      changed = await updateWorldIndexCell(key, body.tabName, body.rowNumber, body.column, body.html)
      // La frappe reste fluide : le classeur n'est renvoyé que si un lien l'a modifié.
      return NextResponse.json({ ok: true, changed, data: changed.includes(key) ? await getWorldIndex(key) : undefined })
    }
    if (body.action === "add" && Array.isArray(body.values)) changed = await addWorldIndexRow(key, body.tabName, body.values.map((value) => String(value ?? "")))
    else if (body.action === "duplicate" && rowNumbers.length) await duplicateWorldIndexRows(key, body.tabName, rowNumbers)
    else if (body.action === "delete" && rowNumbers.length) await deleteWorldIndexRows(key, body.tabName, rowNumbers)
    else if (body.action === "move" && rowNumbers.length && typeof body.toTab === "string") await moveWorldIndexRows(key, body.tabName, body.toTab, rowNumbers)
    else if (body.action === "update-fields" && typeof body.rowNumber === "number" && body.fields && typeof body.fields === "object") {
      await updateWorldIndexFields(key, body.tabName, body.rowNumber, Object.fromEntries(Object.entries(body.fields).map(([header, value]) => [header, String(value ?? "")])))
    }
    else throw new Error("INVALID_WORLD_INDEX_ACTION")
    return NextResponse.json({ ok: true, changed, data: await getWorldIndex(key) })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}
