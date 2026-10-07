import { NextResponse } from "next/server"

import { googleFailureMessage } from "@/lib/google-failures"
import {
  addObjectIndexRow,
  addObjectIndexRowWithValues,
  insertObjectIndexRow,
  deleteObjectIndexRows,
  duplicateObjectIndexRows,
  enrichObjectIndexTables,
  ensureObjectIndexStackLimits,
  listObjectIndexTables,
  listObjectIndexTablesForDisplay,
  refreshObjectIndexTables,
  syncObjectIndexIcons,
  updateObjectIndexCell,
} from "@/lib/google-sheets"
import { OBJECT_INDEX_CHANGED_MESSAGE, parseObjectIndexRowRef, type ObjectIndexRowRef } from "@/lib/object-index-refs"
import { objectIndexRegroupStatus, regroupObjectIndexes, revertObjectIndexRegroup } from "@/lib/object-index-regroup-server"
import { objectSchemas } from "@/lib/object-schema"
import { authorizedAccount } from "@/lib/server-auth"

async function authorized() {
  return authorizedAccount(["admin", "mj"])
}

export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1"
    const tables = refresh ? await refreshObjectIndexTables() : await listObjectIndexTablesForDisplay()
    return NextResponse.json({ tables, schemas: await objectSchemas(tables) })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: code === "OBJECT_INDEX_FOLDER_NOT_FOUND"
      ? "Le dossier « Objets » est introuvable dans le Drive connecté."
      : `Les index d’objets n’ont pas pu être chargés${code ? ` (${code.slice(0, 160)})` : ""}.` }, { status: 400 })
  }
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
  if (account?.role !== "admin") return NextResponse.json({ error: "Le regroupement des index d’objets se fait depuis la vue administrateur." }, { status: 403 })
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
    const body = (await request.json()) as { action?: string; fileId?: string; tabName?: string; row?: unknown; rows?: unknown; before?: unknown; count?: number; header?: unknown; occurrence?: unknown; html?: string; values?: unknown }
    if (body.action === "regroup-status" || body.action === "regroup" || body.action === "regroup-revert") return regroupAction(body.action)
    if (body.action === "enrich") {
      const result = await enrichObjectIndexTables()
      return NextResponse.json({ ok: true, result, tables: await listObjectIndexTables() })
    }
    if (body.action === "sync-icons") {
      const result = await syncObjectIndexIcons()
      return NextResponse.json({ ok: true, result, tables: await listObjectIndexTables() })
    }
    if (body.action === "ensure-stack-limits") {
      const result = await ensureObjectIndexStackLimits()
      return NextResponse.json({ ok: true, result, tables: await listObjectIndexTables() })
    }
    if (!body.fileId || !body.tabName) throw new Error("INVALID_OBJECT_INDEX")
    // Chaque ligne est désignée par son ID (son numéro n'est qu'un indice) et chaque case
    // par son en-tête : le serveur les retrouve dans la feuille relue au moment d'écrire.
    const row = parseObjectIndexRowRef(body.row)
    const rows = Array.isArray(body.rows) ? body.rows.map(parseObjectIndexRowRef) : []
    // L’éditeur enregistre cellule par cellule : la réponse ne renvoie alors pas tout
    // le classeur, pour que la frappe reste fluide.
    if (body.action === "update-cell" && row && typeof body.header === "string" && typeof body.html === "string") {
      await updateObjectIndexCell(body.fileId, body.tabName, { ...row, header: body.header, occurrence: typeof body.occurrence === "number" ? body.occurrence : 0 }, body.html)
      return NextResponse.json({ ok: true })
    }
    if (body.action === "add") {
      if (body.values === undefined) await addObjectIndexRow(body.fileId, body.tabName)
      else await addObjectIndexRowWithValues(body.fileId, body.tabName, objectIndexValues(body.values))
    } else if (body.action === "insert" && row) {
      await insertObjectIndexRow(body.fileId, body.tabName, row, typeof body.count === "number" ? body.count : 1, body.before === true)
    } else if (body.action === "delete" && rows.length && rows.every(Boolean)) {
      await deleteObjectIndexRows(body.fileId, body.tabName, rows as ObjectIndexRowRef[])
    } else if (body.action === "duplicate" && rows.length && rows.every(Boolean)) {
      await duplicateObjectIndexRows(body.fileId, body.tabName, rows as ObjectIndexRowRef[])
    } else throw new Error("INVALID_OBJECT_INDEX_ACTION")
    return NextResponse.json({ ok: true, tables: await listObjectIndexTables() })
  } catch (error) {
    // La ligne ou la colonne n'est plus là où la page la voyait : rien n'a été écrit.
    if (error instanceof Error && error.message === "OBJECT_INDEX_CHANGED") return NextResponse.json({ error: OBJECT_INDEX_CHANGED_MESSAGE }, { status: 409 })
    const code = error instanceof Error ? error.message : ""
    console.error("OBJECT_INDEX_WRITE_FAILED", code || "UNKNOWN_ERROR")
    return NextResponse.json({ error: googleFailureMessage(code) || "Cette modification n’a pas pu être enregistrée dans Google Sheets." }, { status: 400 })
  }
}

/** Les valeurs du formulaire : des paires [en-tête, valeur] dans l'ordre des colonnes (jamais des places). */
function objectIndexValues(value: unknown): Array<[string, string]> {
  if (!Array.isArray(value)) throw new Error("INVALID_OBJECT_INDEX_VALUES")
  return value.map((pair) => {
    if (!Array.isArray(pair) || typeof pair[0] !== "string") throw new Error("INVALID_OBJECT_INDEX_VALUES")
    return [pair[0], String(pair[1] ?? "")]
  })
}
