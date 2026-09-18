import { NextResponse } from "next/server"

import { createCampaignForMj } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  try {
    const body = (await request.json()) as { name?: string; description?: string; bannerUrl?: string; accentColor?: string }
    const campaign = await createCampaignForMj(account.uid, {
      name: body.name || "", description: body.description, bannerUrl: body.bannerUrl, accentColor: body.accentColor,
    })
    return NextResponse.json({ ok: true, campaign })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVALID_CAMPAIGN_NAME"
      ? "Le nom de la campagne est obligatoire."
      : code.includes("GOOGLE_DRIVE_NOT_AUTHORIZED")
        ? "Le compte Google du site doit être reconnecté."
        : "La campagne n’a pas pu être enregistrée."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
