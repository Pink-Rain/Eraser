import { NextResponse } from "next/server"

import { readPortraitFramings } from "@/lib/portrait-framing"
import { authorizedAccount } from "@/lib/server-auth"
import { isTokenKind, readTokenFrame, validTokenOwnerId } from "@/lib/tokens"

type Params = { params: Promise<{ kind: string; id: string }> }

/**
 * À l'ouverture de l'éditeur : le cadre enregistré avec le token (`null` : le cadre par
 * défaut) et le cadrage du portrait, pour retrouver l'image là où on l'avait placée.
 */
export async function GET(_request: Request, { params }: Params) {
  const { kind, id } = await params
  if (!await authorizedAccount(["admin", "mj", "joueur"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!isTokenKind(kind) || !validTokenOwnerId(id)) return NextResponse.json({ error: "Token introuvable." }, { status: 404 })
  const [frame, framings] = await Promise.all([readTokenFrame(kind, id).catch(() => null), readPortraitFramings().catch(() => ({}))])
  return NextResponse.json({ frame, framing: (framings as Record<string, unknown>)[`${kind}:${id}`] ?? null }, { headers: { "cache-control": "no-store" } })
}
