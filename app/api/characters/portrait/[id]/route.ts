import { NextResponse } from "next/server"

import { readCharacterPortrait } from "@/lib/character-portraits"
import { downloadDriveFile } from "@/lib/google-drive"
import { characterSheetSummaries, getCharacterById, getCharacterForMj, listCampaignsForPlayer } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { identityUidsForUser } from "@/lib/identity-links"
import { ownedBy } from "@/lib/ownership"

/** Identifiant d'un fichier Drive dans un lien de partage (…/d/<id>/…, ?id=<id>). */
function driveFileId(value: string) {
  if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(value)) return null
  return value.match(/\/d\/([A-Za-z0-9_-]{10,})/)?.[1] ?? value.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1] ?? null
}

/**
 * Portrait d'un personnage. D'abord l'image envoyée dans Eraser (Drive partagé) ; à
 * défaut, celle de la cellule « Portrait » de la fiche, comme l'affiche la fiche
 * elle-même : un lien d'image, un fichier Drive ou une image intégrée.
 */
async function portraitFromSheet(id: string) {
  const cell = (await characterSheetSummaries().catch(() => null))?.get(id)?.portrait ?? ""
  if (!cell || cell.startsWith("/api/characters/portrait/")) return null
  const inline = cell.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (inline) return new Response(Buffer.from(inline[2], "base64"), { headers: { "content-type": inline[1], "cache-control": "private, max-age=300" } })
  const fileId = driveFileId(cell)
  if (fileId) {
    const response = await downloadDriveFile(fileId).catch(() => null)
    if (response?.ok) return new Response(await response.arrayBuffer(), { headers: { "content-type": response.headers.get("content-type") || "image/jpeg", "cache-control": "private, max-age=300" } })
    return null
  }
  if (/^https?:\/\//i.test(cell)) return NextResponse.redirect(cell, 302)
  return null
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const character = await getCharacterById(id).catch(() => null)
  let allowed = Boolean(character && account.role === "admin")
  if (character && account.role === "mj") allowed = Boolean(await getCharacterForMj(account.uid, id).catch(() => null))
  if (character && account.role === "joueur") {
    const visibleCampaignIds = new Set((await listCampaignsForPlayer(account.uid)).map((campaign) => campaign.id))
    const identities = await identityUidsForUser(account.uid)
    allowed = ownedBy(character.ownerUid, identities) || character.campaigns.some((campaign) => visibleCampaignIds.has(campaign.id))
  }
  if (!allowed) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const object = await readCharacterPortrait(id)
  if (object) return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } })
  const fallback = await portraitFromSheet(id)
  return fallback ?? NextResponse.json({ error: "Image introuvable." }, { status: 404 })
}
