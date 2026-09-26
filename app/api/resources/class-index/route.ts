import { NextResponse } from "next/server"

import { deleteClassSpell, ignoreSpellPairs, linkClassSpell, listClassResources, mergeClassSpells, saveClassSpell, type ClassSpellDraft, type SpellIndexKind } from "@/lib/class-content"
import { renameCreatureSpells } from "@/lib/world-indexes"
import { authorizedAccount } from "@/lib/server-auth"

async function authorized() {
  return authorizedAccount(["admin", "mj"])
}

/** « Sorts des classes » par défaut ; `index=creatures` pour « Sorts des créatures ». */
function spellIndexKind(value: unknown): SpellIndexKind {
  return value === "creatures" ? "creatures" : "classes"
}

export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const url = new URL(request.url)
    const refresh = url.searchParams.get("refresh") === "1"
    return NextResponse.json({ data: await listClassResources(refresh, spellIndexKind(url.searchParams.get("index"))) })
  } catch (error) {
    console.error("CLASS_RESOURCES_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les sorts n’ont pas pu être chargés depuis Google Sheets." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: unknown; rowNumber?: unknown; draft?: unknown; classId?: unknown; rank?: unknown; keep?: unknown; remove?: unknown; pairs?: unknown; expectedId?: unknown; index?: unknown }
    const kind = spellIndexKind(body.index)
    const isTarget = (value: unknown): value is { rowNumber: number; id: string } => Boolean(value) && typeof value === "object" && Number.isInteger((value as { rowNumber?: unknown }).rowNumber) && typeof (value as { id?: unknown }).id === "string"
    let result: unknown = null
    if (body.action === "delete" && typeof body.rowNumber === "number") await deleteClassSpell(body.rowNumber, kind)
    else if (kind === "classes" && body.action === "link" && typeof body.rowNumber === "number" && typeof body.classId === "string" && (body.rank === null || typeof body.rank === "number")) await linkClassSpell(body.rowNumber, body.classId, body.rank)
    else if (body.action === "merge" && isTarget(body.keep) && Array.isArray(body.remove) && body.remove.every(isTarget) && body.remove.length && body.draft && typeof body.draft === "object") {
      const merged = await mergeClassSpells(body.keep, body.remove, body.draft as ClassSpellDraft, kind)
      // Les créatures qui utilisaient un sort supprimé passent au sort gardé.
      const creatures = !merged.keptName ? 0 : await renameCreatureSpells(merged.removedNames.filter((name) => name !== merged.keptName), merged.keptName).catch((error) => {
        console.error("CREATURE_SPELL_RENAME_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
        return 0
      })
      result = { ...merged, creatures }
    } else if (body.action === "ignore" && Array.isArray(body.pairs)) {
      await ignoreSpellPairs(body.pairs.filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2 && pair.every((id) => typeof id === "string")), kind)
    }
    else if ((body.action === "add" || body.action === "update") && (body.rowNumber === null || typeof body.rowNumber === "number") && body.draft && typeof body.draft === "object") {
      result = await saveClassSpell(body.action === "add" ? null : body.rowNumber as number, body.draft as ClassSpellDraft, { expectedId: typeof body.expectedId === "string" ? body.expectedId : undefined, kind })
    } else throw new Error("INVALID_CLASS_RESOURCE_ACTION")
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: code === "CLASS_SPELL_ID_EXISTS" ? "Cet ID de sort existe déjà." : code === "CLASS_SPELL_EMPTY" ? "Donne au moins un nom, un effet ou une description au sort." : code === "CLASS_RANK_INVALID" ? "Le rang doit être compris entre 0 et 20." : code === "CLASS_SPELL_MOVED" ? "La feuille des sorts a changé entre-temps. Actualise puis recommence." : code.startsWith("CLASS_RANK_FULL") ? "Ce rang contient déjà trois sorts. Déplace ou retire d’abord l’un d’eux." : "Cette modification n’a pas pu être enregistrée dans Google Sheets." }, { status: 400 })
  }
}
