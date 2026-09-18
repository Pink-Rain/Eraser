import { NextResponse } from "next/server"

import { copySavedShopsToPage, deleteSavedShops, getCampaignDashboard, listCampaignNpcs, listSavedShops, saveGeneratedShops } from "@/lib/google-sheets"
import type { GeneratedShop } from "@/lib/shop-schema"
import { authorizedAccount } from "@/lib/server-auth"

async function canUsePage(pageLinked: string) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account || !pageLinked) return null
  if (pageLinked === "bac-a-sable") return account
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, pageLinked).catch(() => null)
  return campaign ? account : null
}

function validShops(value: unknown): value is GeneratedShop[] {
  return Array.isArray(value) && value.length <= 100 && value.every((shop) => {
    if (!shop || typeof shop !== "object") return false
    const candidate = shop as Partial<GeneratedShop>
    return typeof candidate.id === "string" && candidate.id.length <= 200
      && typeof candidate.name === "string" && candidate.name.length <= 200
      && typeof candidate.cityName === "string" && candidate.cityName.length <= 200
      && Array.isArray(candidate.items) && candidate.items.length <= 30
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const pageLinked = url.searchParams.get("pageLinked") || ""
  if (!await canUsePage(pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const shops = await listSavedShops(pageLinked, url.searchParams.get("inCampaign") === "1")
    return NextResponse.json({ shops })
  } catch {
    return NextResponse.json({ error: "Les magasins sauvegardés n’ont pas pu être chargés." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; pageLinked?: string; sourcePageLinked?: string; shopIds?: unknown; shops?: unknown; npcId?: string }
    const pageLinked = body.pageLinked || ""
    if (!await canUsePage(pageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
    if (body.action === "import") {
      const sourcePageLinked = body.sourcePageLinked || ""
      if (!await canUsePage(sourcePageLinked)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      if (sourcePageLinked === pageLinked || !Array.isArray(body.shopIds) || !body.shopIds.length || body.shopIds.length > 100 || !body.shopIds.every((id) => typeof id === "string")) throw new Error("INVALID_SHOP_IMPORT")
      return NextResponse.json({ shops: await copySavedShopsToPage(sourcePageLinked, pageLinked, body.shopIds) })
    }
    if (!validShops(body.shops)) throw new Error("INVALID_SHOPS")
    if (body.action === "delete") {
      await deleteSavedShops(pageLinked, body.shops.map((shop) => shop.id))
      return NextResponse.json({ ok: true })
    }
    const npcId = typeof body.npcId === "string" ? body.npcId : ""
    if (npcId && pageLinked !== "bac-a-sable") {
      const npcs = await listCampaignNpcs(pageLinked)
      if (!npcs.some((npc) => npc.id === npcId)) throw new Error("NPC_NOT_FOUND")
    }
    const options = body.action === "replace"
      ? { replace: true }
      : body.action === "replace-latest"
        ? { replaceLatest: true }
      : body.action === "add-to-campaign"
        ? { inCampaign: true, npcId }
        : body.action === "remove-from-campaign"
          ? { inCampaign: false }
        : body.action === "link-npc"
          ? { npcId }
          : body.action === "save"
            ? {}
            : null
    if (!options) throw new Error("INVALID_SHOP_ACTION")
    await saveGeneratedShops(pageLinked, body.shops, options)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: code === "NPC_NOT_FOUND" ? "Ce PNJ n’existe pas dans cette campagne." : "Les magasins n’ont pas pu être enregistrés." }, { status: 400 })
  }
}
