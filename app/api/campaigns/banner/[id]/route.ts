import { NextResponse } from "next/server"

import { readCampaignBanner } from "@/lib/campaign-banners"
import { getCampaignDashboard, getCampaignForPlayer } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const campaign = await (account.role === "joueur"
    ? getCampaignForPlayer(account.uid, id)
    : getCampaignDashboard(account.role === "admin" ? null : account.uid, id)).catch(() => null)
  if (!campaign) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const object = await readCampaignBanner(id)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } })
}
