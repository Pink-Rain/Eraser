import { NextResponse } from "next/server"

import { addCharacterInventoryItem, readCharacterPurse, replaceCharacterPurse, takeFromShop, undoShopSale } from "@/lib/google-sheets"
import { notifyItemReceived } from "@/lib/item-notifications"
import { isPositionalObjectId, positionalFromShopObjectId } from "@/lib/object-item-id"
import { shopAccess, shopBuyers, shopForPlayers } from "@/lib/shop-access"
import { amountInCopper, formatCoins, isCoin, planPayment, priceCoin, priceInCopper, shopItemQuantity, type ShopSale } from "@/lib/shop-purchase"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; shopId: string }> }

const refused = (error: string, status = 400) => NextResponse.json({ error }, { status })

/** La bourse d'un personnage pour qui le lecteur peut acheter : l'aperçu de la fenêtre d'achat. */
export async function GET(request: Request, { params }: Params) {
  const { id, shopId } = await params
  const url = new URL(request.url)
  const access = await shopAccess(id, shopId).catch(() => null)
  if (!access) return refused("Ce magasin n’est pas accessible.", 404)
  const characterId = url.searchParams.get("characterId") || ""
  const buyers = await shopBuyers(access, url.searchParams.get("session") || "")
  if (!buyers.some((buyer) => buyer.id === characterId)) return refused("Ce personnage ne peut pas acheter ici.", 403)
  try {
    return NextResponse.json({ purse: await readCharacterPurse(characterId) }, { headers: { "cache-control": "no-store" } })
  } catch {
    return refused("La bourse n’a pas pu être lue. Réessaie dans un instant.")
  }
}

/**
 * Un achat : le prix (celui du magasin, ou celui négocié à l'oral avec le MJ) sort de la bourse
 * du personnage, les exemplaires entrent dans son inventaire et quittent le magasin, et la
 * vente y est notée. Les exemplaires sont retenus d'abord : si la bourse ou l'inventaire
 * refuse ensuite, tout revient comme avant.
 */
export async function POST(request: Request, { params }: Params) {
  const { id, shopId } = await params
  const access = await shopAccess(id, shopId).catch(() => null)
  if (!access) return refused("Ce magasin n’est pas accessible.", 404)
  const body = await request.json().catch(() => ({})) as { characterId?: unknown; itemId?: unknown; quantity?: unknown; sessionId?: unknown; pay?: unknown; negotiated?: unknown; expectedPrice?: unknown }
  const characterId = typeof body.characterId === "string" ? body.characterId : ""
  const itemId = typeof body.itemId === "string" ? body.itemId : ""
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : ""
  const quantity = typeof body.quantity === "number" && Number.isInteger(body.quantity) ? body.quantity : 0
  const negotiated = body.negotiated && typeof body.negotiated === "object" ? body.negotiated as { amount?: unknown; coin?: unknown } : null
  const pay = negotiated ? negotiated.coin : body.pay
  if (!itemId || quantity < 1 || !isCoin(pay)) return refused("Cet achat est incomplet.")

  const buyer = (await shopBuyers(access, sessionId)).find((candidate) => candidate.id === characterId)
  if (!buyer) return refused("Ce personnage ne peut pas acheter ici.", 403)
  const item = access.shop.items.find((candidate) => candidate.id === itemId)
  if (!item) return refused("Cet item n’est plus en vente.", 409)
  if (quantity > shopItemQuantity(item)) return refused(`Il n’en reste que ${shopItemQuantity(item)}.`, 409)
  if (!negotiated && typeof body.expectedPrice === "string" && body.expectedPrice !== item.price) return refused("Le prix vient de changer : regarde-le avant d’acheter.", 409)

  const unit = negotiated ? null : priceInCopper(item.price)
  const cost = negotiated ? amountInCopper(typeof negotiated.amount === "number" || typeof negotiated.amount === "string" ? negotiated.amount : "", pay) : unit === null ? null : unit * quantity
  if (cost === null) return refused(negotiated ? "Ce prix n’est pas un nombre." : "Le prix de cet item est illisible : négocie-le avec le MJ.")

  let purse
  try { purse = await readCharacterPurse(characterId) } catch { return refused("La bourse n’a pas pu être lue. Réessaie dans un instant.") }
  if (!purse) return refused(`${buyer.name} n’a pas de bourse.`)
  const plan = planPayment(purse, cost, pay)
  if (!plan.ok) return refused(`Il manque ${formatCoins(plan.missing, plan.missing >= 100 ? "PO" : "PC")} à ${buyer.name}.`, 409)

  const at = new Date().toISOString()
  const sale: ShopSale = {
    itemId: item.id, name: item.name, icon: item.icon, type: item.type, subtype: item.subtype, quantity,
    price: negotiated ? formatCoins(cost, pay) : formatCoins(cost, priceCoin(item.price)),
    negotiated: Boolean(negotiated), characterId, characterName: buyer.name, sessionId, at,
  }
  let taken
  try {
    taken = await takeFromShop(id, shopId, itemId, quantity, sale)
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return refused(code === "SHOP_ITEM_SOLD_OUT" || code === "SHOP_ITEM_NOT_FOUND" ? "Quelqu’un vient d’acheter cet item : il n’en reste plus assez." : "Le magasin n’a pas pu être modifié. Réessaie dans un instant.", 409)
  }
  const putBack = () => undoShopSale(id, shopId, taken.item, taken.position, quantity, at).catch((error) => console.error("SHOP_SALE_UNDO_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"))

  try {
    await replaceCharacterPurse(characterId, purse, plan.after)
  } catch (error) {
    await putBack()
    const code = error instanceof Error ? error.message : ""
    return refused(code === "INVENTORY_CHANGED" ? "La bourse vient de changer : réessaie." : "La bourse n’a pas pu être débitée. Rien n’a été acheté.", 409)
  }

  let landedOnGround = false
  try {
    let added
    try {
      added = await addCharacterInventoryItem(characterId, itemId, undefined, "character", quantity)
    } catch (error) {
      // Un objet sans colonne ID a deux identifiants selon qu'il vient des magasins ou des inventaires.
      if (!(error instanceof Error) || error.message !== "INVENTORY_ITEM_NOT_FOUND" || isPositionalObjectId(itemId)) throw error
      added = await addCharacterInventoryItem(characterId, positionalFromShopObjectId(itemId), undefined, "character", quantity)
    }
    landedOnGround = Boolean(added.landedOnGround)
  } catch (error) {
    // L'objet n'est pas entré : l'argent revient et les exemplaires retournent en vitrine.
    await replaceCharacterPurse(characterId, plan.after, purse).catch((refund) => console.error("SHOP_REFUND_FAILED", refund instanceof Error ? refund.message : "UNKNOWN_ERROR"))
    await putBack()
    const code = error instanceof Error ? error.message : ""
    return refused(code === "INVENTORY_ITEM_NOT_FOUND" ? "Cet item n’est pas dans l’Index des items lu par les inventaires : rien n’a été acheté." : code === "INVENTORY_FULL" ? "L’inventaire est plein : rien n’a été acheté." : "L’item n’a pas pu entrer dans l’inventaire : rien n’a été acheté.", 409)
  }

  // Le MJ qui fait acheter un joueur : son joueur est prévenu (et son inventaire se relit).
  if (access.manager) await notifyItemReceived(access.account, { name: item.name, quantity, targetId: characterId, targetMode: "character", ...(landedOnGround ? { onGround: true } : {}) }).catch(() => {})
  return NextResponse.json({
    shop: access.manager ? taken.shop : shopForPlayers(taken.shop),
    purse: plan.after,
    given: plan.given,
    change: plan.change,
    landedOnGround,
  })
}
