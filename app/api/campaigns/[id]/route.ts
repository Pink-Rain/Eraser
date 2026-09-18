import { NextResponse } from "next/server"

import { saveCampaignBanner } from "@/lib/campaign-banners"
import { updateCampaignForMj } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

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
    return NextResponse.json({ error: code === "INVALID_BANNER" ? "Choisis une image de moins de 10 Mo." : "La campagne n’a pas pu être modifiée." }, { status: 400 })
  }
}
