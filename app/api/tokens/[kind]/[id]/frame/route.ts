import { NextResponse } from "next/server"

import { companionNpcIds } from "@/lib/google-sheets"
import { readPortraitFramings } from "@/lib/portrait-framing"
import { authorizedAccount } from "@/lib/server-auth"
import { isTokenKind, readTokenFrame, validTokenOwnerId } from "@/lib/tokens"

type Params = { params: Promise<{ kind: string; id: string }> }

/**
 * À l'ouverture de l'éditeur : le cadre enregistré avec le token (`null` : le cadre par
 * défaut), le cadrage du portrait, pour retrouver l'image là où on l'avait placée, et pour un
 * PNJ s'il est le compagnon d'un personnage (son cadre par défaut en dépend).
 */
export async function GET(_request: Request, { params }: Params) {
  const { kind, id } = await params
  if (!await authorizedAccount(["admin", "mj", "joueur"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!isTokenKind(kind) || !validTokenOwnerId(id)) return NextResponse.json({ error: "Token introuvable." }, { status: 404 })
  const [frame, framings, companions] = await Promise.all([
    readTokenFrame(kind, id).catch(() => null),
    readPortraitFramings().catch(() => ({})),
    kind === "npc" ? companionNpcIds().catch(() => new Set<string>()) : new Set<string>(),
  ])
  return NextResponse.json({ frame, framing: (framings as Record<string, unknown>)[`${kind}:${id}`] ?? null, companion: companions.has(id) }, { headers: { "cache-control": "no-store" } })
}
