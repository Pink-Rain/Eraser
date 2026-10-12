import { NextResponse } from "next/server"

import { addCharacterInventoryItem, createCharacterInventoryItem, getRowInventory, setCharacterInventoryItemQuantity, updateCharacterInventoryItem, type InventoryOwnerMode } from "@/lib/google-sheets"
import { INVENTORY_CHANGED_MESSAGE, inventoryCategories, inventorySlotExpectation, type InventoryCategory } from "@/lib/inventory-schema"
import { authorizedAccount } from "@/lib/server-auth"
import { knownWorldIndexKey } from "@/lib/world-indexes"

/**
 * L'inventaire d'une ligne d'index (bloc Inventaire d'un formulaire) : un contenant de la
 * famille demandée (`accept` : all, Armes, Équipement, Esthétique, Bourse), propre à la
 * ligne (par son identifiant). MJ et admins seulement : ce sont eux qui remplissent les
 * index. Un PNJ récupéré dans une campagne emporte une copie de son inventaire.
 */
function modeOf(request: Request): { index: string; id: string; mode: InventoryOwnerMode } | null {
  const parameters = new URL(request.url).searchParams
  const index = parameters.get("index")?.trim() ?? ""
  const id = parameters.get("id")?.trim() ?? ""
  const accept = parameters.get("accept")?.trim() ?? "all"
  if (!index || !id || id.length > 200) return null
  const category: InventoryCategory = accept !== "all" && (inventoryCategories as readonly string[]).includes(accept) ? accept as InventoryCategory : "Inventaire"
  return { index, id, mode: `row:${category}` }
}

async function authorized(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return null
  const target = modeOf(request)
  if (!target || !(await knownWorldIndexKey(target.index))) return null
  return target
}

export async function GET(request: Request) {
  const target = await authorized(request)
  if (!target) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    if (new URL(request.url).searchParams.get("targets") === "1") return NextResponse.json({ transferTargets: [] })
    const summary = new URL(request.url).searchParams.get("summary") === "1"
    const inventory = await getRowInventory(target.id, target.mode.slice(4) as InventoryCategory, !summary)
    return NextResponse.json({ inventory: summary ? { ...inventory, items: [] } : inventory })
  } catch {
    return NextResponse.json({ error: "L’inventaire n’a pas pu être chargé." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const target = await authorized(request)
  if (!target) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const { id, mode } = target
    let inventory
    if (body.action === "add-item" && typeof body.itemId === "string") inventory = await addCharacterInventoryItem(id, body.itemId, undefined, mode)
    else if (body.action === "create-item" && typeof body.name === "string" && typeof body.description === "string" && typeof body.type === "string" && typeof body.subtype === "string" && typeof body.effect === "string") inventory = await createCharacterInventoryItem(id, "", { name: body.name, description: body.description, type: body.type, subtype: body.subtype, effect: body.effect }, mode)
    else if (body.action === "set-quantity" && typeof body.slotId === "string" && typeof body.quantity === "number" && Number.isFinite(body.quantity)) inventory = await setCharacterInventoryItemQuantity(id, body.slotId, body.quantity, mode, inventorySlotExpectation(body))
    else if (body.action === "update-item" && typeof body.slotId === "string" && typeof body.name === "string" && typeof body.description === "string" && typeof body.type === "string" && typeof body.subtype === "string" && typeof body.effect === "string") inventory = await updateCharacterInventoryItem(id, body.slotId, { name: body.name, description: body.description, type: body.type, subtype: body.subtype, effect: body.effect, nameHtml: typeof body.nameHtml === "string" ? body.nameHtml : undefined, descriptionHtml: typeof body.descriptionHtml === "string" ? body.descriptionHtml : undefined, effectHtml: typeof body.effectHtml === "string" ? body.effectHtml : undefined }, mode)
    else throw new Error("INVALID_INVENTORY_ACTION")
    return NextResponse.json({ inventory: { ...inventory, items: [] } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "INVENTORY_CHANGED") return NextResponse.json({ error: INVENTORY_CHANGED_MESSAGE }, { status: 409 })
    const message = code === "INVENTORY_FULL" ? "Il n’y a plus d’emplacement disponible."
      : code === "INVENTORY_ITEM_WRONG_CATEGORY" ? "Cet item n’est pas de la famille acceptée par cet inventaire."
      : code === "INVENTORY_NO_COMPATIBLE_CONTAINER" ? "Cet item n’est pas de la famille acceptée par cet inventaire."
      : code === "INVENTORY_ITEM_NOT_FOUND" ? "Cet item n’existe plus dans l’Index des items."
      : "L’inventaire n’a pas pu être modifié."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
