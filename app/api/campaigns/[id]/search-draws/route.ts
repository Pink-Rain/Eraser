import { NextResponse } from "next/server"

import { addCharacterInventoryItem, getCampaignDashboard, listInventoryTransferTargets } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { readSearchDraws, searchDrawsShared, writeSearchDraws } from "@/lib/search-draws-store"

async function authorizedCampaign(id: string) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return null
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  return campaign ? { account, campaign } : null
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!await authorizedCampaign(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json({ draws: await readSearchDraws(id), shared: searchDrawsShared() })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!await authorizedCampaign(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: string; draws?: unknown; itemId?: unknown; targetId?: unknown }
    if (body.action === "save") {
      const count = await writeSearchDraws(id, body.draws)
      return NextResponse.json({ shared: count !== null, count })
    }
    if (body.action === "give" && typeof body.itemId === "string" && typeof body.targetId === "string" && body.itemId && body.targetId) {
      const target = (await listInventoryTransferTargets(id)).find((candidate) => candidate.id === body.targetId)
      if (!target) throw new Error("INVENTORY_TRANSFER_FORBIDDEN")
      const mode = target.kind === "npc" ? "npc" : "character"
      // Un objet sans colonne ID a deux identifiants selon qu'il vient des magasins
      // ou des inventaires : on essaie les deux.
      try {
        await addCharacterInventoryItem(target.id, body.itemId, undefined, mode)
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "INVENTORY_ITEM_NOT_FOUND" || body.itemId.startsWith("DRIVE-")) throw error
        await addCharacterInventoryItem(target.id, `DRIVE-${body.itemId}`, undefined, mode)
      }
      return NextResponse.json({ ok: true, target: { id: target.id, name: target.name, kind: target.kind } })
    }
    throw new Error("INVALID_SEARCH_ACTION")
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVENTORY_FULL" ? "Cet inventaire est plein."
      : code === "INVENTORY_NO_COMPATIBLE_CONTAINER" ? "Le destinataire n’a pas de contenant compatible avec cet objet."
        : code === "INVENTORY_ITEM_NOT_FOUND" ? "Cet objet n’est plus dans l’index Objets."
          : code === "INVENTORY_TRANSFER_FORBIDDEN" ? "Ce destinataire ne fait pas partie de la campagne."
            : "Le tirage n’a pas pu être enregistré."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
