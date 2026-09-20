import { NextResponse } from "next/server"

import { addCharacterToCampaign, getCampaignDashboard, listAvailableCampaignCharacters, removeCharacterFromCampaign } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

function membershipErrorMessage(error: unknown, fallback: string, showDetail: boolean) {
  const code = error instanceof Error ? error.message : ""
  const message = code === "CAMPAIGN_NOT_FOUND"
    ? "Cette campagne est introuvable ou tu n’y as pas accès."
    : code === "CHARACTER_NOT_FOUND"
      ? "Ce personnage est introuvable."
      : code === "CHARACTER_SHEET_ROW_NOT_FOUND"
        ? "La fiche de ce personnage est introuvable dans Google Sheets."
        : code === "CHARACTERS_SHEET_UNAVAILABLE"
          ? "La feuille Google Sheets des personnages n’est pas reliée."
          : code === "CAMPAIGN_CHARACTERS_SHEET_UNAVAILABLE"
            ? "La feuille Google Sheets « Personnages des campagnes » n’est pas reliée."
            : code.startsWith("SHEETS_API_ERROR") || code === "GOOGLE_DRIVE_NOT_AUTHORIZED"
              ? "La connexion à Google Sheets a échoué. Vérifie la connexion Google Drive dans Administration."
              : fallback
  // Un administrateur a besoin du code brut pour diagnostiquer ; un joueur non.
  return showDetail && code && message === fallback ? `${fallback} (${code})` : message
}

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
  } catch (error) {
    return NextResponse.json({ error: membershipErrorMessage(error, "Le personnage n’a pas pu être ajouté.", account.role === "admin") }, { status: 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const characterId = new URL(request.url).searchParams.get("characterId") || ""
  const { id } = await params
  try {
    if (!characterId) throw new Error("CHARACTER_NOT_FOUND")
    await removeCharacterFromCampaign(account.role === "admin" ? null : account.uid, id, characterId)
    return NextResponse.json({ removed: characterId })
  } catch (error) {
    return NextResponse.json({ error: membershipErrorMessage(error, "Le personnage n’a pas pu être retiré.", account.role === "admin") }, { status: 400 })
  }
}
