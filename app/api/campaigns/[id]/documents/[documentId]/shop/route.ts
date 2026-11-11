import { NextResponse } from "next/server"

import { getCampaignDocument, sellDocumentInShop } from "@/lib/campaign-documents"
import { cleanDocumentPrice } from "@/lib/document-model"
import { listSavedShops } from "@/lib/google-sheets"
import { sessionManager } from "@/lib/session-access"

/**
 * Le MJ met le document en vente dans un magasin sauvegardé de la campagne (`shopId`), à son prix
 * (`price`, « 5 PO », vide : à négocier) et en `quantity` exemplaires. Il le change ensuite dans
 * le magasin comme tout item ; un joueur qui l'achète le reçoit dans son inventaire.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  const manager = await sessionManager(id)
  if (!manager) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { shopId?: unknown; price?: unknown; quantity?: unknown }
    const shopId = typeof body.shopId === "string" ? body.shopId : ""
    const quantity = typeof body.quantity === "number" && Number.isInteger(body.quantity) ? body.quantity : 1
    if (quantity < 1 || quantity > 99) throw new Error("INVALID_QUANTITY")
    // Le magasin est retrouvé parmi ceux de la campagne : un ID écrit à la main n'ouvre rien.
    const [document, shops] = await Promise.all([getCampaignDocument(id, documentId), listSavedShops(id)])
    if (!document) throw new Error("DOCUMENT_NOT_FOUND")
    if (!document.renderVersion) throw new Error("DOCUMENT_NOT_RENDERED")
    const shop = shops.find((candidate) => candidate.id === shopId)
    if (!shop) throw new Error("SHOP_NOT_FOUND")
    const price = cleanDocumentPrice(body.price)
    const result = await sellDocumentInShop(document, shop.id, price, quantity)
    return NextResponse.json({ ok: true, shopName: shop.name, added: result.added, price })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "DOCUMENT_NOT_FOUND" ? "Ce document n’existe plus."
      : code === "DOCUMENT_NOT_RENDERED" ? "Enregistre d’abord le document : son image n’existe pas encore."
        : code === "SHOP_NOT_FOUND" ? "Ce magasin n’est plus dans la campagne."
          : code === "SHOP_FULL" ? "Ce magasin a déjà 30 items en rayon : retires-en un, puis recommence."
            : code === "INVALID_QUANTITY" ? "Entre 1 et 99 exemplaires."
              : code === "SHOP_ITEMS_UNREADABLE" ? "La liste d’objets de ce magasin est illisible dans Google Sheets : corrige-la avant d’y ajouter un document."
                : "Le document n’a pas pu être mis en vente."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
