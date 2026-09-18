import { NextResponse } from "next/server"

import {
  addCharacterInventoryItem,
  campaignInventoryOwnerId,
  createCharacterInventoryItem,
  getCampaignDashboard,
  getCampaignForPlayer,
  getCampaignInventory,
  getCampaignInventorySummary,
  listInventoryTransferTargets,
  moveCharacterInventoryItem,
  setCharacterInventoryItemQuantity,
  transferCharacterInventoryItem,
  updateCharacterInventoryContainer,
  updateCharacterInventoryItem,
} from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

async function authorizedCampaign(id: string) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return null
  const campaign = await (account.role === "joueur"
    ? getCampaignForPlayer(account.uid, id)
    : getCampaignDashboard(account.role === "admin" ? null : account.uid, id)).catch(() => null)
  return campaign ? { account, campaign, canManage: account.role !== "joueur" } : null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorization = await authorizedCampaign(id)
  if (!authorization) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const url = new URL(request.url)
    if (url.searchParams.get("targets") === "1") {
      return NextResponse.json({ transferTargets: authorization.canManage ? await listInventoryTransferTargets(id, campaignInventoryOwnerId(id)) : [] })
    }
    const summary = url.searchParams.get("summary") === "1"
    const inventory = summary ? await getCampaignInventorySummary(id) : await getCampaignInventory(id)
    return NextResponse.json({ inventory })
  } catch {
    return NextResponse.json({ error: "L’inventaire de campagne n’a pas pu être chargé." }, { status: 400 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorization = await authorizedCampaign(id)
  if (!authorization?.canManage) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const ownerId = campaignInventoryOwnerId(id)
  try {
    const body = (await request.json()) as Record<string, unknown>
    let inventory
    if (body.action === "update-container" && typeof body.containerId === "string" && typeof body.name === "string" && typeof body.capacity === "number" && Number.isFinite(body.capacity)) {
      inventory = await updateCharacterInventoryContainer(ownerId, body.containerId, { name: body.name, capacity: body.capacity })
    } else if (body.action === "add-item" && typeof body.itemId === "string") {
      inventory = await addCharacterInventoryItem(ownerId, body.itemId, typeof body.containerId === "string" ? body.containerId : undefined)
    } else if (body.action === "create-item" && typeof body.containerId === "string" && typeof body.name === "string" && typeof body.description === "string" && typeof body.type === "string" && typeof body.subtype === "string" && typeof body.effect === "string") {
      inventory = await createCharacterInventoryItem(ownerId, body.containerId, { name: body.name, description: body.description, type: body.type, subtype: body.subtype, effect: body.effect })
    } else if (body.action === "set-quantity" && typeof body.slotId === "string" && typeof body.quantity === "number" && Number.isFinite(body.quantity)) {
      inventory = await setCharacterInventoryItemQuantity(ownerId, body.slotId, body.quantity)
    } else if (body.action === "update-item" && typeof body.slotId === "string" && typeof body.name === "string" && typeof body.description === "string" && typeof body.type === "string" && typeof body.subtype === "string" && typeof body.effect === "string") {
      inventory = await updateCharacterInventoryItem(ownerId, body.slotId, { name: body.name, description: body.description, type: body.type, subtype: body.subtype, effect: body.effect })
    } else if (body.action === "move-item" && typeof body.slotId === "string" && typeof body.containerId === "string") {
      inventory = await moveCharacterInventoryItem(ownerId, body.slotId, body.containerId)
    } else if (body.action === "transfer-item" && typeof body.slotId === "string" && typeof body.targetId === "string") {
      const targets = await listInventoryTransferTargets(id, ownerId)
      if (!targets.some((target) => target.id === body.targetId)) throw new Error("INVENTORY_TRANSFER_FORBIDDEN")
      inventory = await transferCharacterInventoryItem(ownerId, body.slotId, body.targetId)
    } else throw new Error("INVALID_INVENTORY_ACTION")
    return NextResponse.json({ inventory: { ...inventory, items: [] } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVENTORY_FULL" ? "Il n’y a plus d’emplacement disponible dans cet inventaire."
      : code === "INVENTORY_NO_COMPATIBLE_CONTAINER" ? "Le destinataire n’a pas de contenant compatible disponible."
        : code === "INVALID_INVENTORY_CONTAINER" ? "Donne un nom et une limite comprise entre 1 et 10 000."
          : code === "INVALID_INVENTORY_ITEM" ? "Vérifie le nom et les informations de l’objet."
            : "La modification de l’inventaire de campagne n’a pas pu être enregistrée."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
