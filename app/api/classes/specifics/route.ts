import { NextResponse } from "next/server"

import { sanitizeGauge } from "@/lib/class-specifics"
import { deleteClassGauge, listClassGauges, saveClassGauge } from "@/lib/class-specifics-store"
import { googleFailureMessage } from "@/lib/google-failures"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Spécificités de classe (pour l'instant, les jauges), lues par tous : la fiche d'un joueur
 * en a besoin. `create=1` (administrateur ou MJ) ajoute l'onglet « Jauges » s'il manque.
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const url = new URL(request.url)
  const canEdit = account.role === "admin" || account.role === "mj"
  try {
    const table = await listClassGauges({ create: canEdit && url.searchParams.get("create") === "1", refresh: url.searchParams.get("refresh") === "1" })
    return NextResponse.json({ ...table, canEdit })
  } catch (error) {
    console.error("CLASS_SPECIFICS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les spécificités de classe n’ont pas pu être chargées depuis Google Sheets." }, { status: 503 })
  }
}

/**
 * Administrateur ou MJ. { action: "save-gauge", gauge } crée ou met à jour une jauge (un ID
 * est donné à une nouvelle) ; { action: "delete-gauge", id } la supprime.
 */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: unknown; gauge?: unknown; id?: unknown }
    if (body.action === "delete-gauge") {
      if (typeof body.id !== "string" || !body.id.trim()) throw new Error("CLASS_GAUGE_INVALID")
      return NextResponse.json({ ...(await deleteClassGauge(body.id.trim())), canEdit: true })
    }
    if (body.action !== "save-gauge") throw new Error("CLASS_GAUGE_INVALID")
    const raw = body.gauge && typeof body.gauge === "object" ? body.gauge as Record<string, unknown> : {}
    const id = typeof raw.id === "string" && /^JAU-[A-Z0-9]{4,16}$/.test(raw.id) ? raw.id : `JAU-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`
    const gauge = sanitizeGauge({ ...raw, id })
    if (!gauge || !gauge.classId) throw new Error("CLASS_GAUGE_INVALID")
    const table = await saveClassGauge(gauge)
    return NextResponse.json({ ...table, canEdit: true, saved: gauge.id })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("CLASS_SPECIFICS_SAVE_FAILED", code)
    const message = code === "CLASS_GAUGE_INVALID" ? "Cette jauge n’a pas de nom ou de classe."
      : code === "CLASS_GAUGE_DUPLICATE" ? "Plusieurs lignes de l’onglet « Jauges » portent cet ID : corrige-les dans Google Sheets."
        : code === "CLASS_GAUGE_NOT_FOUND" ? "Cette jauge n’est plus dans l’onglet « Jauges »."
          : code === "CLASS_SPELLS_SHEET_NOT_FOUND" ? "Le classeur « Sorts de classe » est introuvable."
            : googleFailureMessage(code) || "La jauge n’a pas pu être enregistrée dans Google Sheets."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
