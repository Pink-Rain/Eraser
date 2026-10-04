import { NextResponse } from "next/server"

import { deleteClassSpell, ignoreSpellPairs, invalidateClassContentCaches, linkClassSpell, listClassResources, mergeClassSpells, saveClassSpell, type ClassSpellDraft, type SpellIndexKind } from "@/lib/class-content"
import { renameCreatureSpells } from "@/lib/world-indexes"
import { authorizedAccount } from "@/lib/server-auth"

async function authorized() {
  return authorizedAccount(["admin", "mj"])
}

/** « Sorts des classes » par défaut ; `index=creatures` pour « Sorts des créatures ». */
function spellIndexKind(value: unknown): SpellIndexKind {
  return value === "creatures" ? "creatures" : "classes"
}

/** La feuille a changé depuis que la page l'a lue : rien n'a été écrit, il faut actualiser. */
const conflicts = new Set(["CLASS_SPELL_MOVED", "CLASS_SPELL_CHANGED", "CLASS_SPELL_ID_DUPLICATE"])

function errorMessage(code: string) {
  if (code === "CLASS_SPELL_MOVED" || code === "CLASS_SPELL_CHANGED") return "La feuille a changé entre-temps : actualise puis recommence."
  if (code === "CLASS_SPELL_ID_DUPLICATE") return "Plusieurs lignes de la feuille des sorts portent cet ID : corrige-les dans Google Sheets, puis actualise."
  if (code === "CLASS_SPELL_ID_REQUIRED" || code === "CLASS_SPELL_ORIGINAL_REQUIRED") return "Ce sort n’a pas pu être identifié : actualise la page puis recommence."
  if (code === "CLASS_SPELL_ID_LOCKED") return "L’ID d’un sort existant ne se change pas : les fiches de personnage le citent."
  if (code === "CLASS_SPELL_ID_EXISTS") return "Cet ID de sort existe déjà."
  if (code === "CLASS_SPELL_EMPTY") return "Donne au moins un nom, un effet ou une description au sort."
  if (code === "CLASS_RANK_INVALID") return "Le rang doit être compris entre 0 et 20."
  if (code === "CLASS_SPELL_REFERENCES_FAILED") return "Les fiches de personnage n’ont pas pu être mises à jour : aucun sort n’a été supprimé. Actualise puis recommence."
  if (code.startsWith("CLASS_SPELL_COLUMN_MISSING:")) return `La feuille des sorts n’a pas de colonne « ${code.slice("CLASS_SPELL_COLUMN_MISSING:".length)} » : rien n’a été enregistré. Ajoute cette colonne en ligne 1 dans Google Sheets, puis recommence.`
  if (code.startsWith("CLASS_RANK_FULL")) return "Ce rang contient déjà trois sorts. Déplace ou retire d’abord l’un d’eux."
  if (code.startsWith("CLASS_COLUMN_NOT_FOUND")) return "Cette classe n’a pas de colonne dans la feuille « Sorts de classe » et elle n’a pas pu être ajoutée."
  return "Cette modification n’a pas pu être enregistrée dans Google Sheets."
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

/**
 * Modifier, lier, supprimer ou fusionner désigne chaque sort par son ID (`expectedId`,
 * `keep.id`, `remove[].id`) : le serveur le retrouve sur la feuille relue. Une
 * modification envoie aussi le sort tel que la page l'a vu (`original`) : seuls les
 * champs changés depuis sont écrits, s'ils n'ont pas changé entre-temps dans la feuille.
 */
export async function POST(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: unknown; rowNumber?: unknown; draft?: unknown; original?: unknown; classId?: unknown; rank?: unknown; originalRank?: unknown; keep?: unknown; remove?: unknown; pairs?: unknown; expectedId?: unknown; index?: unknown }
    const kind = spellIndexKind(body.index)
    const expectedId = typeof body.expectedId === "string" ? body.expectedId : ""
    const isTarget = (value: unknown): value is { rowNumber: number; id: string } => Boolean(value) && typeof value === "object" && Number.isInteger((value as { rowNumber?: unknown }).rowNumber) && typeof (value as { id?: unknown }).id === "string"
    const isDraft = (value: unknown): value is ClassSpellDraft => Boolean(value) && typeof value === "object" && !Array.isArray(value)
    let result: unknown = null
    if (body.action === "delete") result = await deleteClassSpell(expectedId, kind)
    else if (kind === "classes" && body.action === "link" && typeof body.classId === "string" && (body.rank === null || typeof body.rank === "number")) {
      result = await linkClassSpell(expectedId, body.classId, body.rank, body.originalRank === null || typeof body.originalRank === "number" ? body.originalRank : undefined)
    } else if (body.action === "merge" && isTarget(body.keep) && Array.isArray(body.remove) && body.remove.every(isTarget) && body.remove.length && isDraft(body.draft) && isDraft(body.original)) {
      const merged = await mergeClassSpells(body.keep, body.remove, body.draft, body.original, kind)
      // Les créatures qui utilisaient un sort supprimé passent au sort gardé (seulement pour les sorts des créatures).
      const creatures = kind !== "creatures" || !merged.keptName ? 0 : await renameCreatureSpells(merged.removedNames.filter((name) => name !== merged.keptName), merged.keptName).catch((error) => {
        console.error("CREATURE_SPELL_RENAME_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
        return 0
      })
      result = { ...merged, creatures }
    } else if (body.action === "ignore" && Array.isArray(body.pairs)) {
      result = await ignoreSpellPairs(body.pairs.filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2 && pair.every((id) => typeof id === "string")), kind)
    } else if (body.action === "add" && isDraft(body.draft)) {
      result = await saveClassSpell(null, body.draft, { kind })
    } else if (body.action === "update" && typeof body.rowNumber === "number" && isDraft(body.draft)) {
      result = await saveClassSpell(body.rowNumber, body.draft, { expectedId, original: isDraft(body.original) ? body.original : undefined, kind })
    } else throw new Error("INVALID_CLASS_RESOURCE_ACTION")
    // Les pages de classe et la fiche relisent la feuille modifiée.
    invalidateClassContentCaches({ keepSpellTabs: true })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    // Une écriture a pu aboutir en partie : rien ne doit rester en mémoire.
    invalidateClassContentCaches()
    const code = error instanceof Error ? error.message : ""
    // Toujours journalisé : une écriture refusée ne doit jamais passer inaperçue.
    console.error("CLASS_RESOURCE_WRITE_FAILED", code || "UNKNOWN_ERROR")
    return NextResponse.json({ error: errorMessage(code) }, { status: conflicts.has(code) ? 409 : 400 })
  }
}
