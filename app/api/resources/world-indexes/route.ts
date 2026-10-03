import { NextResponse } from "next/server"

import { authorizedAccount } from "@/lib/server-auth"
import {
  addWorldIndexRow,
  deleteWorldIndexRows,
  duplicateWorldIndexRows,
  ensureWorldIndexEntry,
  insertWorldIndexRows,
  getWorldIndex,
  knownWorldIndexKey,
  moveWorldIndexRows,
  sortWorldIndexRow,
  normalizeWorldIndexChoices,
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
  if (code === "WORLD_INDEX_TAB_NOT_FOUND") return "Cet onglet n’existe plus dans Google Sheets. Actualise le tableau."
  // Le refus de Google, tel quel : sans lui, impossible de savoir ce qui bloque.
  const google = code.match(/^SHEETS_API_ERROR:(\d+)(?::([\s\S]*))?$/)
  if (google?.[1] === "429") return "Google Sheets refuse : trop de modifications d’un coup. Attends une minute puis recommence."
  if (google) return `Google Sheets a refusé la modification (${google[1]}${google[2] ? ` : ${google[2].slice(0, 300)}` : ""}).`
  return `Cette modification n’a pas pu être enregistrée dans Google Sheets.${/^[A-Z0-9_]{3,60}$/.test(code) ? ` (${code})` : ""}`
}

export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const parameters = new URL(request.url).searchParams
  const key = await knownWorldIndexKey(parameters.get("key"))
  if (!key) return NextResponse.json({ error: "Index inconnu." }, { status: 400 })
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
    const body = (await request.json()) as { key?: unknown; action?: string; tabName?: string; rowNumber?: number; rowNumbers?: unknown; column?: number; html?: string; values?: unknown[]; name?: unknown; fields?: Record<string, unknown>; toTab?: string; count?: number; header?: string }
    const key = await knownWorldIndexKey(body.key)
    if (!key || !body.tabName) throw new Error("INVALID_WORLD_INDEX")
    const rowNumbers = Array.isArray(body.rowNumbers) ? body.rowNumbers.filter((value): value is number => Number.isInteger(value)) : []
    let changed: string[] = []
    if (body.action === "update-cell" && typeof body.rowNumber === "number" && typeof body.column === "number" && typeof body.html === "string") {
      changed = await updateWorldIndexCell(key, body.tabName, body.rowNumber, body.column, body.html)
      // La frappe reste fluide : le classeur n'est renvoyé que si un lien l'a modifié.
      return NextResponse.json({ ok: true, changed, data: changed.includes(key) ? await getWorldIndex(key) : undefined })
    }
    if (body.action === "ensure" && typeof body.name === "string") {
      // Liste déroulante liée : la réponse reste légère, la page n'affiche pas cet index.
      // Une liste filtrée (« Type : Rune ») remplit aussi ce champ dans la ligne créée.
      const fields = body.fields && typeof body.fields === "object" ? Object.fromEntries(Object.entries(body.fields as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : undefined
      const created = await ensureWorldIndexEntry(key, body.tabName, body.name, fields)
      return NextResponse.json({ ok: true, created })
    }
    if (body.action === "normalize-choices") {
      const corrected = await normalizeWorldIndexChoices(key)
      return NextResponse.json({ ok: true, corrected, data: await getWorldIndex(key) })
    }
    if (body.action === "add" && Array.isArray(body.values)) changed = await addWorldIndexRow(key, body.tabName, body.values.map((value) => String(value ?? "")))
    else if (body.action === "insert" && typeof body.rowNumber === "number") await insertWorldIndexRows(key, body.tabName, body.rowNumber, typeof body.count === "number" ? body.count : 1)
    else if (body.action === "duplicate" && rowNumbers.length) await duplicateWorldIndexRows(key, body.tabName, rowNumbers)
    else if (body.action === "delete" && rowNumbers.length) await deleteWorldIndexRows(key, body.tabName, rowNumbers)
    else if (body.action === "move" && rowNumbers.length && typeof body.toTab === "string") await moveWorldIndexRows(key, body.tabName, body.toTab, rowNumbers)
    else if (body.action === "sort" && typeof body.rowNumber === "number" && typeof body.header === "string" && typeof body.html === "string") await sortWorldIndexRow(key, body.tabName, body.rowNumber, body.header, body.html)
    else if (body.action === "update-fields" && typeof body.rowNumber === "number" && body.fields && typeof body.fields === "object") {
      await updateWorldIndexFields(key, body.tabName, body.rowNumber, Object.fromEntries(Object.entries(body.fields).map(([header, value]) => [header, String(value ?? "")])))
    }
    else throw new Error("INVALID_WORLD_INDEX_ACTION")
    return NextResponse.json({ ok: true, changed, data: await getWorldIndex(key) })
  } catch (error) {
    console.error("WORLD_INDEX_WRITE_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}
