import { NextResponse } from "next/server"

import {
  addCharacterInventoryItem, createCharacterInventoryItem, getCampaignDashboard, getNpcBackpackInventory, getNpcById,
  listInventoryTransferTargets,
  setCharacterInventoryItemQuantity, transferCharacterInventoryItem, updateCharacterInventoryItem,
} from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

async function authorizedNpc(id: string) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return null
  const npc = await getNpcById(id)
  if (!npc) return null
  if (npc.pageLinked === "bac-a-sable") return { account, npc }
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, npc.pageLinked).catch(() => null)
  return campaign ? { account, npc } : null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorization = await authorizedNpc(id)
  if (!authorization) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    if (new URL(request.url).searchParams.get("targets") === "1") {
      return NextResponse.json({ transferTargets: authorization.npc.pageLinked === "bac-a-sable" ? [] : await listInventoryTransferTargets(authorization.npc.pageLinked, id) })
    }
    const inventory = await getNpcBackpackInventory(id, new URL(request.url).searchParams.get("summary") !== "1")
    return NextResponse.json({ inventory: new URL(request.url).searchParams.get("summary") === "1" ? { ...inventory, items: [] } : inventory })
  } catch {
    return NextResponse.json({ error: "L’inventaire n’a pas pu être chargé." }, { status: 400 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorization = await authorizedNpc(id)
  if (!authorization) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as Record<string, unknown>
    let inventory
    if (body.action === "add-item" && typeof body.itemId === "string") inventory = await addCharacterInventoryItem(id, body.itemId, undefined, "npc")
    else if (body.action === "create-item" && typeof body.name === "string" && typeof body.description === "string" && typeof body.type === "string" && typeof body.subtype === "string" && typeof body.effect === "string") inventory = await createCharacterInventoryItem(id, "", { name: body.name, description: body.description, type: body.type, subtype: body.subtype, effect: body.effect }, "npc")
    else if (body.action === "set-quantity" && typeof body.slotId === "string" && typeof body.quantity === "number" && Number.isFinite(body.quantity)) inventory = await setCharacterInventoryItemQuantity(id, body.slotId, body.quantity, "npc")
    else if (body.action === "update-item" && typeof body.slotId === "string" && typeof body.name === "string" && typeof body.description === "string" && typeof body.type === "string" && typeof body.subtype === "string" && typeof body.effect === "string") inventory = await updateCharacterInventoryItem(id, body.slotId, { name: body.name, description: body.description, type: body.type, subtype: body.subtype, effect: body.effect }, "npc")
    else if (body.action === "transfer-item" && typeof body.slotId === "string" && typeof body.targetId === "string" && authorization.npc.pageLinked !== "bac-a-sable") {
      const targets = await listInventoryTransferTargets(authorization.npc.pageLinked, id)
      if (!targets.some((target) => target.id === body.targetId)) throw new Error("INVENTORY_TRANSFER_FORBIDDEN")
      inventory = await transferCharacterInventoryItem(id, body.slotId, body.targetId, "npc")
    }
    else throw new Error("INVALID_INVENTORY_ACTION")
    return NextResponse.json({ inventory: { ...inventory, items: [] } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVENTORY_FULL" ? "Il n’y a plus d’emplacement compatible disponible."
      : code === "INVENTORY_NO_COMPATIBLE_CONTAINER" ? "Ajoute d’abord un contenant compatible avec cet objet."
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
