import { NextResponse } from "next/server"

import { copySavedShopsToPage, deleteSavedShops, getCampaignDashboard, listCampaignNpcs, listLatestShops, listSavedShops, saveGeneratedShops } from "@/lib/google-sheets"
import type { GeneratedShop } from "@/lib/shop-schema"
import { authorizedAccount } from "@/lib/server-auth"

function shopErrorMessage(error: unknown, isAdmin = false) {
  const code = error instanceof Error ? error.message : ""
  if (!code) return ""
  // Le message générique masquait la vraie cause (onglet absent, quota,
  // cellule trop longue…). Un administrateur voit le code brut de Google.
  const detail = isAdmin ? ` (${code})` : ""
  if (code === "NPC_NOT_FOUND") return "Ce PNJ n’existe pas dans cette campagne."
  if (code === "SHOPS_SHEET_UNAVAILABLE") return "La feuille Google Sheets des magasins n’est pas reliée."
  if (code.startsWith("SHOPS_WRITE_NOT_PERSISTED")) {
    return `Google a accepté l’enregistrement mais les magasins ne sont pas dans la feuille après relecture. Ouvre Administration › Google Drive et Sheets pour voir l’état de la feuille « Magasins ».${detail}`
  }
  if (code.startsWith("SHEETS_API_ERROR") || code === "GOOGLE_DRIVE_NOT_AUTHORIZED") {
    return `La connexion à Google Sheets a échoué. Vérifie la connexion Google Drive dans Administration.${detail}`
  }
  return isAdmin ? `Les magasins n’ont pas pu être enregistrés.${detail}` : ""
}

async function canUsePage(pageLinked: string) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account || !pageLinked) return null
  if (pageLinked === "bac-a-sable") return account
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, pageLinked).catch(() => null)
  return campaign ? account : null
}

function validShops(value: unknown): value is GeneratedShop[] {
  const validRarities = new Set(["very-common", "common", "rare", "very-rare", "ultimate"])
  const validItem = (item: unknown) => {
    if (!item || typeof item !== "object") return false
    const candidate = item as Record<string, unknown>
    return typeof candidate.id === "string" && candidate.id.trim().length > 0 && candidate.id.length <= 300
      && typeof candidate.name === "string" && candidate.name.trim().length > 0 && candidate.name.length <= 300
      && typeof candidate.price === "string" && candidate.price.length <= 500
      && typeof candidate.rarity === "string" && validRarities.has(candidate.rarity)
      && (candidate.description === undefined || typeof candidate.description === "string" && candidate.description.length <= 20_000)
      && (candidate.effect === undefined || typeof candidate.effect === "string" && candidate.effect.length <= 20_000)
      && (candidate.type === undefined || typeof candidate.type === "string" && candidate.type.length <= 300)
      && (candidate.subtype === undefined || typeof candidate.subtype === "string" && candidate.subtype.length <= 300)
      && (candidate.icon === undefined || typeof candidate.icon === "string" && candidate.icon.length <= 2_000)
  }
  return Array.isArray(value) && value.length <= 100 && value.every((shop) => {
    if (!shop || typeof shop !== "object") return false
    const candidate = shop as Partial<GeneratedShop>
    return typeof candidate.id === "string" && candidate.id.length <= 200
      && typeof candidate.name === "string" && candidate.name.length <= 200
      && typeof candidate.cityName === "string" && candidate.cityName.length <= 200
      && Array.isArray(candidate.items) && candidate.items.length <= 30
      && candidate.items.every(validItem)
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const pageLinked = url.searchParams.get("pageLinked") || ""
  const account = await canUsePage(pageLinked)
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const shops = url.searchParams.get("view") === "latest"
      ? await listLatestShops(pageLinked)
      : await listSavedShops(pageLinked, url.searchParams.get("inCampaign") === "1")
    return NextResponse.json({ shops }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: shopErrorMessage(error, account.role === "admin") || "Les magasins sauvegardés n’ont pas pu être chargés." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  // Le compte est résolu avant de lire le corps de la requête : c'est l'ordre
  // suivi par toutes les autres routes qui écrivent, et les cookies de session
  // se lisent de manière fiable au tout début de la requête.
  const viewer = await authorizedAccount(["admin", "mj"])
  if (!viewer) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const isAdmin = viewer.role === "admin"
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
    const saved = await saveGeneratedShops(pageLinked, body.shops, options)
    return NextResponse.json({ ok: true, shops: saved })
  } catch (error) {
    return NextResponse.json({ error: shopErrorMessage(error, isAdmin) || "Les magasins n’ont pas pu être enregistrés." }, { status: 400 })
  }
}
