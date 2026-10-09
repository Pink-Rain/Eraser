import { NextResponse } from "next/server"

import { authorizedCompanionCharacter, companionBackpack, type CompanionAccess } from "@/lib/companion-access"
import { companionInventoryOwnerId } from "@/lib/companions"
import {
  addCharacterInventoryItem, createCharacterInventoryItem, getCharacterCompanions, getNpcBackpackInventory,
  listCharacterRelations, listInventoryTransferTargets,
  setCharacterInventoryItemQuantity, transferCharacterInventoryItem, updateCharacterInventoryItem,
} from "@/lib/google-sheets"
import { INVENTORY_CHANGED_MESSAGE, inventorySlotExpectation, type InventoryTransferTarget } from "@/lib/inventory-schema"
import { transferWithNotification } from "@/lib/item-notifications"

/**
 * Le sac à dos d'un compagnon : celui du PNJ (le même que voit le MJ), ou celui de la
 * créature, propre au personnage. Géré par ceux qui gèrent la fiche.
 */
async function authorized(id: string, companionId: string) {
  const access = await authorizedCompanionCharacter(id)
  if (!access) return null
  const backpack = await companionBackpack(access, companionId).catch(() => null)
  return backpack ? { access, ...backpack } : null
}

/**
 * Le personnage, ses créatures compagnons, puis ce que le personnage peut atteindre dans ses
 * campagnes (ses PNJ compagnons y sont, s'il les voit : un ID écrit à la main n'ouvre rien).
 */
async function transferTargets(access: CompanionAccess, ownerId: string): Promise<InventoryTransferTarget[]> {
  const companions = await getCharacterCompanions(access.character.id)
  const campaign = access.campaigns[0]
  const own: InventoryTransferTarget[] = [
    { id: access.character.id, name: access.character.name, kind: "character", campaignId: campaign?.id ?? "", campaignName: campaign?.name ?? "" },
    ...companions.flatMap((companion): InventoryTransferTarget[] => companion.kind === "creature" ? [{
      id: companionInventoryOwnerId(access.character.id, companion.id), name: companion.name, kind: "npc", campaignId: campaign?.id ?? "", campaignName: "Compagnon",
    }] : []),
  ]
  const playerVisibility = access.account.role === "joueur"
    ? { uid: access.account.uid, relatedNpcIds: new Set((await listCharacterRelations(access.character.id).catch(() => [])).filter((relation) => relation.targetKind === "npc").map((relation) => relation.targetId)) }
    : undefined
  const groups = await Promise.all(access.campaigns.map((item) => listInventoryTransferTargets(item.id, ownerId, playerVisibility).catch(() => [] as InventoryTransferTarget[])))
  return [...new Map([...own, ...groups.flat()].filter((target) => target.id !== ownerId).map((target) => [target.id, target])).values()]
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; companionId: string }> }) {
  const { id, companionId } = await params
  const authorization = await authorized(id, companionId)
  if (!authorization) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const url = new URL(request.url)
  try {
    if (url.searchParams.get("targets") === "1") return NextResponse.json({ transferTargets: await transferTargets(authorization.access, authorization.ownerId) })
    const summary = url.searchParams.get("summary") === "1"
    const inventory = await getNpcBackpackInventory(authorization.ownerId, !summary)
    return NextResponse.json({ inventory: summary ? { ...inventory, items: [] } : inventory })
  } catch {
    return NextResponse.json({ error: "L’inventaire n’a pas pu être chargé." }, { status: 503 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; companionId: string }> }) {
  const { id, companionId } = await params
  const authorization = await authorized(id, companionId)
  if (!authorization) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const owner = authorization.ownerId
  try {
    const body = (await request.json()) as Record<string, unknown>
    let inventory
    if (body.action === "add-item" && typeof body.itemId === "string") inventory = await addCharacterInventoryItem(owner, body.itemId, undefined, "npc")
    else if (body.action === "create-item" && typeof body.name === "string" && typeof body.description === "string" && typeof body.type === "string" && typeof body.subtype === "string" && typeof body.effect === "string") inventory = await createCharacterInventoryItem(owner, "", { name: body.name, description: body.description, type: body.type, subtype: body.subtype, effect: body.effect }, "npc")
    else if (body.action === "set-quantity" && typeof body.slotId === "string" && typeof body.quantity === "number" && Number.isFinite(body.quantity)) inventory = await setCharacterInventoryItemQuantity(owner, body.slotId, body.quantity, "npc", inventorySlotExpectation(body))
    else if (body.action === "update-item" && typeof body.slotId === "string" && typeof body.name === "string" && typeof body.description === "string" && typeof body.type === "string" && typeof body.subtype === "string" && typeof body.effect === "string") inventory = await updateCharacterInventoryItem(owner, body.slotId, { name: body.name, description: body.description, type: body.type, subtype: body.subtype, effect: body.effect, nameHtml: typeof body.nameHtml === "string" ? body.nameHtml : undefined, descriptionHtml: typeof body.descriptionHtml === "string" ? body.descriptionHtml : undefined, effectHtml: typeof body.effectHtml === "string" ? body.effectHtml : undefined }, "npc")
    else if (body.action === "transfer-item" && typeof body.slotId === "string" && typeof body.targetId === "string") {
      if (!(await transferTargets(authorization.access, owner)).some((target) => target.id === body.targetId)) throw new Error("INVENTORY_TRANSFER_FORBIDDEN")
      const slotId = body.slotId, targetId = body.targetId, expected = inventorySlotExpectation(body)
      inventory = await transferWithNotification(authorization.access.account, (onMoved) => transferCharacterInventoryItem(owner, slotId, targetId, "npc", onMoved, expected))
    }
    else throw new Error("INVALID_INVENTORY_ACTION")
    return NextResponse.json({ inventory: { ...inventory, items: [] } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "INVENTORY_CHANGED") return NextResponse.json({ error: INVENTORY_CHANGED_MESSAGE }, { status: 409 })
    const message = code === "INVENTORY_FULL" ? "Il n’y a plus d’emplacement compatible disponible."
      : code === "INVENTORY_NO_COMPATIBLE_CONTAINER" ? "Ajoute d’abord un contenant compatible avec cet objet."
        : code === "INVENTORY_ITEM_NOT_FOUND" ? "Cet objet n’existe plus dans la feuille Objets."
          : code === "INVENTORY_ITEM_WRONG_CATEGORY" ? "Ce type d’objet n’est pas compatible avec ce contenant."
            : code === "INVALID_INVENTORY_ITEM" ? "Vérifie le nom et les informations de l’objet."
              : code === "INVENTORY_TRANSFER_FORBIDDEN" ? "Cet objet ne peut pas être donné à ce destinataire."
                : "La modification de l’inventaire n’a pas pu être enregistrée."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
