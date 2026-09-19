import { NextResponse } from "next/server"

import { authorizedAccount } from "@/lib/server-auth"
import { resetAccountPasswordByAdmin } from "@/lib/site-auth"

export async function POST(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  const body = (await request.json()) as { uid?: string; password?: string }
  const uid = body.uid?.trim() ?? ""
  const password = body.password ?? ""
  if (!uid || password.length < 8) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit contenir au moins 8 caractères." },
      { status: 400 },
    )
  }

  try {
    await resetAccountPasswordByAdmin(uid, password)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Impossible de modifier ce mot de passe." }, { status: 400 })
  }
}
