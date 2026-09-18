import { NextResponse } from "next/server"

import { linkLegacyIdentity } from "@/lib/identity-links"
import { listLegacyIdentityCandidates } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function GET() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    return NextResponse.json({ candidates: await listLegacyIdentityCandidates(admin.uid) })
  } catch {
    return NextResponse.json({ error: "Relie d’abord les feuilles Eraser existantes." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { legacyUid?: string }
    const candidates = await listLegacyIdentityCandidates(admin.uid)
    const candidate = candidates.find((item) => item.uid === body.legacyUid && item.available)
    if (!candidate) return NextResponse.json({ error: "Ce groupe de données n’est pas disponible." }, { status: 400 })
    await linkLegacyIdentity(admin.uid, candidate.uid)
    return NextResponse.json({ ok: true, candidates: await listLegacyIdentityCandidates(admin.uid) })
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE")
      ? "Ce groupe de données est déjà associé à un autre compte local."
      : "Les données existantes n’ont pas pu être associées."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
