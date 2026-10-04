import { NextResponse } from "next/server"

import { saveCampaignBanner } from "@/lib/campaign-banners"
import { getCampaignForMj, updateCampaignForMj } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

function campaignErrorMessage(code: string) {
  if (code === "INVALID_BANNER") return "Choisis une image de moins de 10 Mo."
  if (code === "CAMPAIGN_ROW_NOT_FOUND") return "Cette campagne n’est plus dans la feuille « Campagnes ». Recharge la page."
  if (code === "CAMPAIGNS_SHEET_UNAVAILABLE") return "La feuille « Campagnes » n’est pas reliée."
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
