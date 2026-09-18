import { NextResponse } from "next/server"

import { deleteClassSpell, linkClassSpell, listClassResources, saveClassSpell, type ClassSpellDraft } from "@/lib/class-content"
import { authorizedAccount } from "@/lib/server-auth"

async function authorized() {
  return authorizedAccount(["admin", "mj"])
}

export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1"
    return NextResponse.json({ data: await listClassResources(refresh) })
  } catch (error) {
    console.error("CLASS_RESOURCES_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les sorts de classe n’ont pas pu être chargés depuis Google Sheets." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: unknown; rowNumber?: unknown; draft?: unknown; classId?: unknown; rank?: unknown }
    let result: unknown = null
    if (body.action === "delete" && typeof body.rowNumber === "number") await deleteClassSpell(body.rowNumber)
    else if (body.action === "link" && typeof body.rowNumber === "number" && typeof body.classId === "string" && (body.rank === null || typeof body.rank === "number")) await linkClassSpell(body.rowNumber, body.classId, body.rank)
    else if ((body.action === "add" || body.action === "update") && (body.rowNumber === null || typeof body.rowNumber === "number") && body.draft && typeof body.draft === "object") {
      result = await saveClassSpell(body.action === "add" ? null : body.rowNumber as number, body.draft as ClassSpellDraft)
    } else throw new Error("INVALID_CLASS_RESOURCE_ACTION")
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: code === "CLASS_SPELL_ID_EXISTS" ? "Cet ID de sort existe déjà." : code === "CLASS_SPELL_NAME_REQUIRED" ? "Le nom du sort est obligatoire." : code === "CLASS_RANK_INVALID" ? "Le rang doit être compris entre 0 et 20." : code.startsWith("CLASS_RANK_FULL") ? "Ce rang contient déjà trois sorts. Déplace ou retire d’abord l’un d’eux." : "Cette modification n’a pas pu être enregistrée dans Google Sheets." }, { status: 400 })
  }
}
