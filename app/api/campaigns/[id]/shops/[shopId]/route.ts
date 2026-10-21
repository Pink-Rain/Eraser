import { NextResponse } from "next/server"

import { listCampaignNpcs } from "@/lib/google-sheets"
import { shopAccess, shopBuyers, shopForPlayers } from "@/lib/shop-access"
import { loadShopGeneratorData, loadShopTypeCatalog } from "@/lib/shop-types-server"

export const dynamic = "force-dynamic"

/**
 * Un magasin pour sa fenêtre (journal) : le MJ le reçoit entier, avec l'index des items pour
 * relancer ou choisir une ligne ; un joueur, sans les effets, s'il lui a été révélé. `buyers` :
 * pour qui le lecteur peut acheter (`?session=` : la session affichée).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; shopId: string }> }) {
  const { id, shopId } = await params
  const access = await shopAccess(id, shopId).catch(() => null)
  if (!access) return NextResponse.json({ error: "Ce magasin n’est pas accessible." }, { status: 404 })
  try {
    const sessionId = new URL(request.url).searchParams.get("session") || ""
    const [buyers, npcs, generator] = await Promise.all([
      shopBuyers(access, sessionId),
      listCampaignNpcs(id).catch(() => []),
      access.manager ? loadShopGeneratorData() : loadShopTypeCatalog().then((catalog) => ({ catalog, items: [] })),
    ])
    // Un joueur ne reçoit que le marchand du magasin, sans notes MJ ni note de fond.
    const shownNpcs = access.manager ? npcs : npcs.filter((npc) => npc.id === access.shop.npcId).map((npc) => ({ ...npc, gmNotes: "", lore: "" }))
    return NextResponse.json({
      shop: access.manager ? access.shop : shopForPlayers(access.shop),
      canManage: access.manager,
      buyers,
      npcs: shownNpcs,
      types: generator.catalog.types,
      generatorItems: access.manager ? generator.items ?? [] : [],
    }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("SHOP_VIEW_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Le magasin n’a pas pu être lu. Réessaie dans un instant." }, { status: 400 })
  }
}
