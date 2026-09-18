import { NextResponse } from "next/server"

import { addCharacterToCampaign, getCampaignDashboard, listAvailableCampaignCharacters } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  if (!campaign) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json({ characters: await listAvailableCampaignCharacters() })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  try {
    const body = (await request.json()) as { characterId?: string; duplicate?: boolean }
    if (!body.characterId) throw new Error("CHARACTER_NOT_FOUND")
    const character = await addCharacterToCampaign(account.role === "admin" ? null : account.uid, id, body.characterId, body.duplicate !== false)
    if (!character) throw new Error("CHARACTER_NOT_FOUND")
    return NextResponse.json({ character })
  } catch {
    return NextResponse.json({ error: "Le personnage n’a pas pu être ajouté." }, { status: 400 })
  }
}
