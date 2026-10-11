import { NextResponse } from "next/server"

import { companionInventoryOwnerId } from "@/lib/companions"
import { addCharacterInventoryItem, getCharacterCompanions, listInventoryTransferTargets } from "@/lib/google-sheets"
import type { GiveDestination } from "@/lib/inventory-schema"
import { notifyItemReceived } from "@/lib/item-notifications"
import { authorizedAccount } from "@/lib/server-auth"
import { listTabletopSourcePages } from "@/lib/tabletop-access"
import { isPositionalObjectId, positionalFromShopObjectId } from "@/lib/object-item-id"

/** Les campagnes du compte (toutes pour l'administrateur, les siennes pour un MJ), sans le bac à sable. */
async function campaignsOf(account: NonNullable<Awaited<ReturnType<typeof authorizedAccount>>>) {
  return (await listTabletopSourcePages(account)).filter((page) => page.id !== "bac-a-sable")
}

async function destinations(account: NonNullable<Awaited<ReturnType<typeof authorizedAccount>>>, withCreatures: boolean, onlyCampaign = "") {
  const campaigns = (await campaignsOf(account)).filter((campaign) => !onlyCampaign || campaign.id === onlyCampaign)
  const groups = await Promise.all(campaigns.map(async (campaign) => {
    const targets = await listInventoryTransferTargets(campaign.id).catch(() => [])
    const listed: GiveDestination[] = targets.map((target) => ({ id: target.id, name: target.kind === "campaign" ? `Inventaire de ${campaign.name}` : target.name, kind: target.kind, campaignId: campaign.id, campaignName: campaign.name }))
    if (!withCreatures) return listed
    // Les créatures nommées : les compagnons des personnages de la campagne (leur sac est propre au personnage).
    // Lues seulement quand on les demande : une lecture de fiche par personnage.
    const creatures = await Promise.all(targets.filter((target) => target.kind === "character").map(async (character) => (await getCharacterCompanions(character.id).catch(() => []))
      .flatMap((companion): GiveDestination[] => companion.kind === "creature" ? [{ id: companionInventoryOwnerId(character.id, companion.id), name: companion.name, kind: "creature", campaignId: campaign.id, campaignName: campaign.name, ownerName: character.name }] : [])))
    return [...listed, ...creatures.flat()]
  }))
  return groups.flat()
}

export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const url = new URL(request.url)
    return NextResponse.json({
      campaigns: (await campaignsOf(account)).map((campaign) => ({ id: campaign.id, name: campaign.name })),
      destinations: await destinations(account, url.searchParams.get("creatures") === "1"),
    })
  } catch {
    return NextResponse.json({ error: "Les inventaires n’ont pas pu être chargés." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { targetId?: unknown; campaignId?: unknown; itemId?: unknown; itemName?: unknown }
    if (typeof body.targetId !== "string" || typeof body.campaignId !== "string" || typeof body.itemId !== "string" || !body.itemId) throw new Error("INVALID_GIVE")
    // La destination est retrouvée parmi celles du compte : un ID écrit à la main n'ouvre rien.
    const target = (await destinations(account, body.targetId.startsWith("COMPAGNON:"), body.campaignId)).find((candidate) => candidate.id === body.targetId)
    if (!target) throw new Error("INVENTORY_TRANSFER_FORBIDDEN")
    const mode = target.kind === "npc" || target.kind === "creature" ? "npc" : "character"
    let result
    try {
      result = await addCharacterInventoryItem(target.id, body.itemId, undefined, mode)
    } catch (error) {
      // Un objet sans colonne ID a deux identifiants selon qu'il vient des magasins ou des inventaires.
      if (!(error instanceof Error) || error.message !== "INVENTORY_ITEM_NOT_FOUND" || isPositionalObjectId(body.itemId)) throw error
      result = await addCharacterInventoryItem(target.id, positionalFromShopObjectId(body.itemId), undefined, mode)
    }
    const landedOnGround = Boolean(result.landedOnGround)
    const itemName = typeof body.itemName === "string" ? body.itemName.trim().slice(0, 200) : ""
    if (itemName && target.kind !== "creature") await notifyItemReceived(account, { name: itemName, quantity: 1, targetId: target.id, targetMode: mode, ...(landedOnGround ? { onGround: true } : {}) })
    return NextResponse.json({ ok: true, target, landedOnGround })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVENTORY_FULL" ? "Cet inventaire est plein."
      : code === "INVENTORY_NO_COMPATIBLE_CONTAINER" ? "Ce destinataire n’a pas de contenant compatible avec cet item."
        : code === "INVENTORY_ITEM_NOT_FOUND" ? "Cet item n’est pas encore lu par les inventaires : actualise l’index puis recommence."
          : code === "INVENTORY_TRANSFER_FORBIDDEN" ? "Cet inventaire ne fait pas partie de tes campagnes."
            : "L’item n’a pas pu être envoyé."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
