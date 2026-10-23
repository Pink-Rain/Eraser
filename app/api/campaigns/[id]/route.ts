import { NextResponse } from "next/server"

import { saveCampaignBanner } from "@/lib/campaign-banners"
import { setCampaignRoll20Url } from "@/lib/campaign-roll20-url"
import { getCampaignForMj, updateCampaignForMj } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

function campaignErrorMessage(code: string) {
  if (code === "INVALID_BANNER") return "Choisis une image de moins de 10 Mo."
  if (code === "CAMPAIGN_ROW_NOT_FOUND") return "Cette campagne n’est plus dans la feuille « Campagnes ». Recharge la page."
  if (code === "CAMPAIGNS_SHEET_UNAVAILABLE") return "La feuille « Campagnes » n’est pas reliée."
  if (code === "INVALID_ROLL20_URL") return "Colle le lien de la partie tel que Roll20 le donne (https://app.roll20.net/…)."
  if (code === "SHARED_STORE_UNAVAILABLE") return "Le serveur partagé est injoignable : le lien Roll20 n’a pas pu être enregistré."
  return "La campagne n’a pas pu être modifiée."
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  try {
    const contentType = request.headers.get("content-type") || ""
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      const file = form.get("banner")
      if (!(file instanceof File)) throw new Error("INVALID_BANNER")
      // La bannière n'est enregistrée qu'après le contrôle d'accès : un autre MJ ne la remplace pas.
      if (account.role !== "admin" && !await getCampaignForMj(account.uid, id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const bannerUrl = await saveCampaignBanner(id, file)
      const accentColor = form.get("accentColor")
      const campaign = await updateCampaignForMj(account.role === "admin" ? null : account.uid, id, {
        bannerUrl,
        ...(typeof accentColor === "string" ? { accentColor } : {}),
      })
      return NextResponse.json({ campaign })
    }
    const patch = (await request.json()) as Record<string, string>
    // Le lien de la partie Roll20 : sur le serveur partagé, pas dans la feuille « Campagnes ».
    if (typeof patch.roll20Url === "string") {
      if (account.role !== "admin" && !await getCampaignForMj(account.uid, id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      return NextResponse.json({ roll20Url: await setCampaignRoll20Url(id, patch.roll20Url) })
    }
    const campaign = await updateCampaignForMj(account.role === "admin" ? null : account.uid, id, {
      ...(typeof patch.name === "string" ? { name: patch.name } : {}),
      ...(typeof patch.description === "string" ? { description: patch.description } : {}),
      ...(typeof patch.bannerUrl === "string" ? { bannerUrl: patch.bannerUrl } : {}),
      ...(typeof patch.accentColor === "string" ? { accentColor: patch.accentColor } : {}),
    })
    return NextResponse.json({ campaign })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: campaignErrorMessage(code) }, { status: 400 })
  }
}
