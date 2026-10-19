import { NextResponse } from "next/server"

import { googleFailureMessage } from "@/lib/google-failures"
import { enrichObjectIndexTables, ensureObjectIndexStackLimits, syncObjectIndexIcons } from "@/lib/google-sheets"
import { objectIndexRegroupStatus, regroupObjectIndexes, revertObjectIndexRegroup } from "@/lib/object-index-regroup-server"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Le regroupement des anciens classeurs d'items, et l'entretien de l'Index des items
 * (descriptions, icônes, « Nombre max »). Les items eux-mêmes se lisent et s'écrivent par le
 * moteur des index (/api/resources/world-indexes), comme tout index.
 */
async function authorized() {
  return authorizedAccount(["admin", "mj"])
}

const regroupMessages: Record<string, string> = {
  OBJECT_INDEX_FOLDER_NOT_FOUND: "Le dossier « Objets » est introuvable dans le Drive connecté.",
  OBJECT_REGROUP_NAME_TAKEN: "Un classeur « Index des objets » existe déjà dans le Drive : il n’est jamais recréé. Renomme-le ou range-le si c’est un ancien essai, puis relance.",
  OBJECT_REGROUP_NOTHING_TO_DO: "Il n’y a qu’un classeur dans le dossier « Objets » : rien à regrouper.",
  OBJECT_REGROUP_VERIFY_FAILED: "La copie ne correspond pas exactement aux index d’origine : rien n’a été basculé, les index restent comme avant.",
  OBJECT_REGROUP_NOT_FOUND: "Aucun regroupement à annuler dans le dossier « Objets ».",
  OBJECT_REGROUP_ROLLBACK_FAILED: "Le regroupement n’a pas pu se faire, et des anciens classeurs n’ont pas pu revenir dans « Objets » : remets-les à la main.",
  OBJECT_REGROUP_REVERT_INCOMPLETE: "L’annulation s’est arrêtée en chemin et n’a pas pu être défaite entièrement :",
  OBJECT_INDEX_UNAVAILABLE: "Les index d’objets n’ont pas pu être relus dans Google Sheets : rien n’a été fait. Réessaie dans un instant.",
}

/** Regrouper les index d'objets en un classeur à onglets (ou l'annuler) : réservé à la vue administrateur. */
async function regroupAction(action: string) {
  const account = await authorized()
  if (account?.role !== "admin") return NextResponse.json({ error: "Le regroupement des index d’items se fait depuis la vue administrateur." }, { status: 403 })
  try {
    if (action === "regroup-status") return NextResponse.json({ status: await objectIndexRegroupStatus() })
    const result = action === "regroup" ? await regroupObjectIndexes() : await revertObjectIndexRegroup()
    return NextResponse.json({ ok: true, result, status: await objectIndexRegroupStatus().catch(() => null) })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const details = (error as { details?: string[] } | null)?.details ?? []
    console.error("OBJECT_REGROUP_FAILED", action, code, details)
    const fallback = action === "regroup-revert" ? "L’annulation n’a pas pu se faire : le regroupement est resté en place." : "Le regroupement n’a pas pu se faire. Les index d’origine n’ont pas bougé."
    return NextResponse.json({ error: regroupMessages[code] ?? fallback, details }, { status: 400 })
  }
}

export async function POST(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: string }
    if (body.action === "regroup-status" || body.action === "regroup" || body.action === "regroup-revert") return regroupAction(body.action)
    if (body.action === "enrich") return NextResponse.json({ ok: true, result: await enrichObjectIndexTables() })
    if (body.action === "sync-icons") return NextResponse.json({ ok: true, result: await syncObjectIndexIcons() })
    if (body.action === "ensure-stack-limits") return NextResponse.json({ ok: true, result: await ensureObjectIndexStackLimits() })
    throw new Error("INVALID_OBJECT_INDEX_ACTION")
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("OBJECT_INDEX_WRITE_FAILED", code || "UNKNOWN_ERROR")
    return NextResponse.json({ error: googleFailureMessage(code) || "Cette modification n’a pas pu être enregistrée dans Google Sheets." }, { status: 400 })
  }
}
