import { NextResponse } from "next/server"

import { getCharacterForUser } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { savePortraitFraming } from "@/lib/portrait-framing"
import { cleanPortraitFraming } from "@/lib/portrait-framing-shared"
import { isTokenKind, readToken, saveToken, validTokenOwnerId } from "@/lib/tokens"

type Params = { params: Promise<{ kind: string; id: string }> }

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
  const manager = account.role === "admin" || account.role === "mj"
  // Un joueur prépare le token de ses propres personnages ; le reste appartient au MJ.
  if (!manager && (kind !== "character" || !await getCharacterForUser(account.uid, id).catch(() => null))) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  }
  try {
    const form = await request.formData()
    const file = form.get("token")
    if (!(file instanceof File)) throw new Error("INVALID_TOKEN")
    const url = await saveToken(kind, id, file)
    // Où se trouve le visage : les vues qui recadrent l'avatar s'en servent. Le token est
    // enregistré même si ce cadrage ne l'est pas.
    const framingField = form.get("framing")
    let framing = null
    try { framing = typeof framingField === "string" ? cleanPortraitFraming(JSON.parse(framingField)) : null } catch { framing = null }
    if (framing) await savePortraitFraming(kind, id, framing).catch((error) => console.error("PORTRAIT_FRAMING_SAVE_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"))
    return NextResponse.json({ url, framing })
  } catch (error) {
    const invalid = error instanceof Error && error.message === "INVALID_TOKEN"
    return NextResponse.json({ error: invalid ? "Le token doit être une image PNG de 5 Mo au plus." : "Le token n’a pas pu être enregistré dans Google Drive." }, { status: 400 })
  }
}
