import { NextResponse } from "next/server"

import {
  addCharacterInventoryContainer,
  addCharacterInventoryItem,
  createCharacterInventoryItem,
  createCharacterInventoryContainer,
  deleteCharacterInventoryContainer,
  getCharacterById,
  getCampaignDashboard,
  getCharacterForUser,
  getCharacterForMj,
  getCharacterInventory,
  getCharacterInventorySummary,
  listCharacterRelations,
  listInventoryTransferTargets,
  moveCharacterInventoryItem,
  setCharacterInventoryCurrency,
  setCharacterInventoryItemEquipped,
  setCharacterInventoryItemModifiers,
  setCharacterInventoryItemQuantity,
  transferCharacterInventoryItem,
  updateCharacterInventoryContainer,
  updateCharacterInventoryItem,
} from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

async function authorizedCharacter(id: string) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return null
  const character = await (account.role === "admin" ? getCharacterById(id) : account.role === "mj" ? getCharacterForMj(account.uid, id) : getCharacterForUser(account.uid, id)).catch(() => null)
  return character ? { account, character } : null
}

async function transferableCampaignIds(authorization: NonNullable<Awaited<ReturnType<typeof authorizedCharacter>>>) {
  if (authorization.account.role !== "mj") return authorization.character.campaigns.map((campaign) => campaign.id)
  const allowed = await Promise.all(authorization.character.campaigns.map(async (campaign) => await getCampaignDashboard(authorization.account.uid, campaign.id).catch(() => null) ? campaign.id : ""))
  return allowed.filter(Boolean)
}

async function transferTargets(authorization: NonNullable<Awaited<ReturnType<typeof authorizedCharacter>>>) {
  const playerVisibility = authorization.account.role === "joueur"
    ? {
        uid: authorization.account.uid,
        relatedNpcIds: new Set((await listCharacterRelations(authorization.character.id)).filter((relation) => relation.targetKind === "npc").map((relation) => relation.targetId)),
      }
    : undefined
  const groups = await Promise.all((await transferableCampaignIds(authorization)).map((campaignId) =>
    listInventoryTransferTargets(campaignId, authorization.character.id, playerVisibility),
  ))
  return [...new Map(groups.flat().map((target) => [target.id, target])).values()]
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorization = await authorizedCharacter(id)
  if (!authorization) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const url = new URL(request.url)
    if (url.searchParams.get("targets") === "1") {
      return NextResponse.json({ transferTargets: await transferTargets(authorization) })
    }
    const summary = url.searchParams.get("summary") === "1"
    const inventory = summary ? await getCharacterInventorySummary(id) : await getCharacterInventory(id)
    return NextResponse.json({ inventory })
  } catch {
    return NextResponse.json({ error: "L’inventaire n’a pas pu être chargé." }, { status: 400 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorization = await authorizedCharacter(id)
  if (!authorization) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as Record<string, unknown>
    let inventory
    if (body.action === "add-container" && typeof body.typeId === "string") {
      inventory = await addCharacterInventoryContainer(id, body.typeId)
    } else if (body.action === "create-container" && typeof body.name === "string" && typeof body.category === "string" && typeof body.capacity === "number" && Number.isFinite(body.capacity)) {
      inventory = await createCharacterInventoryContainer(id, { name: body.name, category: body.category, capacity: body.capacity })
    } else if (body.action === "update-container" && typeof body.containerId === "string" && typeof body.name === "string" && typeof body.capacity === "number" && Number.isFinite(body.capacity)) {
      inventory = await updateCharacterInventoryContainer(id, body.containerId, { name: body.name, capacity: body.capacity })
    } else if (body.action === "delete-container" && typeof body.containerId === "string") {
      inventory = await deleteCharacterInventoryContainer(id, body.containerId)
    } else if (body.action === "add-item" && typeof body.itemId === "string") {
      inventory = await addCharacterInventoryItem(id, body.itemId, typeof body.containerId === "string" ? body.containerId : undefined)
    } else if (body.action === "create-item" && typeof body.containerId === "string" && typeof body.name === "string" && typeof body.description === "string" && typeof body.type === "string" && typeof body.subtype === "string" && typeof body.effect === "string") {
      inventory = await createCharacterInventoryItem(id, body.containerId, { name: body.name, description: body.description, type: body.type, subtype: body.subtype, effect: body.effect })
    } else if (body.action === "set-quantity" && typeof body.slotId === "string" && typeof body.quantity === "number" && Number.isFinite(body.quantity)) {
      inventory = await setCharacterInventoryItemQuantity(id, body.slotId, body.quantity)
    } else if (body.action === "set-equipped" && typeof body.slotId === "string" && typeof body.equipped === "boolean") {
      inventory = await setCharacterInventoryItemEquipped(id, body.slotId, body.equipped)
    } else if (body.action === "set-modifiers" && typeof body.slotId === "string" && typeof body.modifiers === "string") {
      inventory = await setCharacterInventoryItemModifiers(id, body.slotId, body.modifiers)
    } else if (body.action === "update-item" && typeof body.slotId === "string" && typeof body.name === "string" && typeof body.description === "string" && typeof body.type === "string" && typeof body.subtype === "string" && typeof body.effect === "string") {
      inventory = await updateCharacterInventoryItem(id, body.slotId, { name: body.name, description: body.description, type: body.type, subtype: body.subtype, effect: body.effect })
    } else if (body.action === "move-item" && typeof body.slotId === "string" && typeof body.containerId === "string") {
      inventory = await moveCharacterInventoryItem(id, body.slotId, body.containerId)
    } else if (body.action === "transfer-item" && typeof body.slotId === "string" && typeof body.targetId === "string") {
      if (!(await transferTargets(authorization)).some((target) => target.id === body.targetId)) throw new Error("INVENTORY_TRANSFER_FORBIDDEN")
      inventory = await transferCharacterInventoryItem(id, body.slotId, body.targetId)
    } else if (body.action === "set-currency" && typeof body.containerId === "string" && typeof body.currency === "string" && typeof body.amount === "number" && Number.isFinite(body.amount)) {
      inventory = await setCharacterInventoryCurrency(id, body.containerId, body.currency, body.amount)
    } else {
      throw new Error("INVALID_INVENTORY_ACTION")
    }
    return NextResponse.json({ inventory: { ...inventory, items: [] } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVENTORY_FULL" ? "Il n’y a plus d’emplacement compatible disponible."
      : code === "INVENTORY_NO_COMPATIBLE_CONTAINER" ? "Ajoute d’abord un contenant compatible avec cet objet."
        : code === "INVALID_INVENTORY_MODIFIERS" ? "Ces liens vers des caractéristiques sont trop nombreux."
        : code === "INVENTORY_SLOT_NOT_FOUND" ? "Cet objet n’est plus dans cet inventaire."
        : code === "INVENTORY_ITEM_NOT_FOUND" ? "Cet objet n’existe plus dans la feuille Objets."
          : code === "INVENTORY_CONTAINER_TYPE_NOT_FOUND" ? "Ce type de contenant n’est plus disponible."
            : code === "INVALID_INVENTORY_CONTAINER" ? "Donne un nom au contenant et une capacité comprise entre 1 et 10 000."
              : code === "INVENTORY_CONTAINER_NOT_EMPTY" ? "Vide d’abord ce contenant avant de le supprimer."
                : code === "INVENTORY_CONTAINER_NOT_FOUND" ? "Ce contenant n’existe plus."
                  : code === "INVENTORY_ITEM_WRONG_CATEGORY" ? "Ce type d’objet n’est pas compatible avec ce contenant."
                    : code === "INVALID_INVENTORY_ITEM" ? "Vérifie le nom et les informations de l’objet."
            : "La modification de l’inventaire n’a pas pu être enregistrée."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
