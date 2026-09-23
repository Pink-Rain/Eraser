import { NextResponse } from "next/server"

import { getCharacterForUser } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
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
    const file = (await request.formData()).get("token")
    if (!(file instanceof File)) throw new Error("INVALID_TOKEN")
    return NextResponse.json({ url: await saveToken(kind, id, file) })
  } catch (error) {
    const invalid = error instanceof Error && error.message === "INVALID_TOKEN"
    return NextResponse.json({ error: invalid ? "Le token doit être une image PNG de 5 Mo au plus." : "Le token n’a pas pu être enregistré dans Google Drive." }, { status: 400 })
  }
}
