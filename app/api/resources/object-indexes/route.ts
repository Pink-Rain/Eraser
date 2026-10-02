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
  syncObjectIndexIcons,
  updateObjectIndexCell,
  updateObjectIndexRow,
} from "@/lib/google-sheets"
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
    const tables = refresh ? await refreshObjectIndexTables() : await listObjectIndexTables()
    return NextResponse.json({ tables, schemas: await objectSchemas(tables) })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: code === "OBJECT_INDEX_FOLDER_NOT_FOUND"
      ? "Le dossier « Objets » est introuvable dans le Drive connecté."
      : "Les index d’objets n’ont pas pu être chargés." }, { status: 400 })
  }
}

const regroupMessages: Record<string, string> = {
  OBJECT_INDEX_FOLDER_NOT_FOUND: "Le dossier « Objets » est introuvable dans le Drive connecté.",
  OBJECT_REGROUP_NAME_TAKEN: "Un classeur « Index des objets » existe déjà dans le Drive : il n’est jamais recréé. Renomme-le ou range-le si c’est un ancien essai, puis relance.",
  OBJECT_REGROUP_NOTHING_TO_DO: "Il n’y a qu’un classeur dans le dossier « Objets » : rien à regrouper.",
  OBJECT_REGROUP_VERIFY_FAILED: "La copie ne correspond pas exactement aux index d’origine : rien n’a été basculé, les index restent comme avant.",
  OBJECT_REGROUP_NOT_FOUND: "Aucun regroupement à annuler dans le dossier « Objets ».",
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
    return NextResponse.json({ error: regroupMessages[code] ?? "Le regroupement n’a pas pu se faire. Les index d’origine n’ont pas bougé.", details }, { status: 400 })
  }
}

export async function POST(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: string; fileId?: string; tabName?: string; rowNumber?: number; rowNumbers?: unknown; count?: number; column?: number; html?: string; values?: unknown[] }
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
      await insertObjectIndexRow(body.fileId, body.tabName, body.rowNumber, typeof body.count === "number" ? body.count : 1)
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
