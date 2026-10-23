import { NextResponse } from "next/server"

import { getCharacterForUser } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { savePortraitFraming } from "@/lib/portrait-framing"
import { cleanPortraitFraming } from "@/lib/portrait-framing-shared"
import { authorizedCompanionCharacter, companionNpc, findCompanion } from "@/lib/companion-access"
import { companionOfTokenId } from "@/lib/companions"
import { isTokenKind, readToken, saveToken, saveTokenFrame, validTokenOwnerId, type TokenKind } from "@/lib/tokens"

type Params = { params: Promise<{ kind: string; id: string }> }

/**
 * Le MJ et l'administrateur préparent tous les tokens. Un joueur prépare celui de ses
 * personnages et de leurs compagnons : une créature compagnon (son token lui est propre) ou
 * un PNJ compagnon, désigné avec le personnage dont il est le compagnon.
 */
async function mayPrepareToken(account: { uid: string; role: string }, kind: TokenKind, id: string, character: FormDataEntryValue | null) {
  if (account.role === "admin" || account.role === "mj") return true
  if (kind === "character") return Boolean(await getCharacterForUser(account.uid, id).catch(() => null))
  if (kind === "creature") {
    const owner = companionOfTokenId(id)
    if (!owner || !await getCharacterForUser(account.uid, owner.characterId).catch(() => null)) return false
    return Boolean(await findCompanion(owner.characterId, (companion) => companion.kind === "creature" && companion.id === owner.companionId).catch(() => null))
  }
  if (kind === "npc" && typeof character === "string" && character) {
    const access = await authorizedCompanionCharacter(character).catch(() => null)
    return Boolean(access && await companionNpc(access, id).catch(() => null))
  }
  return false
}

export async function GET(_request: Request, { params }: Params) {
  const { kind, id } = await params
  if (!await authorizedAccount(["admin", "mj", "joueur"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!isTokenKind(kind) || !validTokenOwnerId(id)) return NextResponse.json({ error: "Token introuvable." }, { status: 404 })
  const object = await readToken(kind, id)
  if (!object) return NextResponse.json({ error: "Token introuvable." }, { status: 404 })
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/png", "cache-control": "private, max-age=3600" } })
}

export async function POST(request: Request, { params }: Params) {
  const { kind, id } = await params
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!isTokenKind(kind) || !validTokenOwnerId(id)) return NextResponse.json({ error: "Token invalide." }, { status: 400 })
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: "Token invalide." }, { status: 400 })
  if (!await mayPrepareToken(account, kind, id, form.get("character"))) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const file = form.get("token")
    if (!(file instanceof File)) throw new Error("INVALID_TOKEN")
    const url = await saveToken(kind, id, file)
    // Où se trouve le visage : les vues qui recadrent l'avatar s'en servent. Le token est
    // enregistré même si ce cadrage ne l'est pas.
    const framingField = form.get("framing")
    let framing = null
    try { framing = typeof framingField === "string" ? cleanPortraitFraming(JSON.parse(framingField)) : null } catch { framing = null }
    if (framing) await savePortraitFraming(kind, id, framing).catch((error) => console.error("PORTRAIT_FRAMING_SAVE_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"))
    // Le cadre choisi, pour que l'éditeur le propose à la prochaine ouverture.
    const frame = form.get("frame")
    if (typeof frame === "string" && frame) await saveTokenFrame(kind, id, frame).catch((error) => console.error("TOKEN_FRAME_SAVE_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"))
    return NextResponse.json({ url, framing })
  } catch (error) {
    const invalid = error instanceof Error && error.message === "INVALID_TOKEN"
    return NextResponse.json({ error: invalid ? "Le token doit être une image PNG de 5 Mo au plus." : "Le token n’a pas pu être enregistré dans Google Drive." }, { status: 400 })
  }
}
