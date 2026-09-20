import { NextResponse } from "next/server"

import { saveGoogleOAuthSettings } from "@/lib/google-oauth"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"

export async function POST(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  try {
    const body = (await request.json()) as { clientId?: string; clientSecret?: string }
    const clientId = body.clientId?.trim() || ""
    if (!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      return NextResponse.json(
        { error: "Cet identifiant client OAuth Google n’est pas valide." },
        { status: 400 },
      )
    }
    if ((body.clientSecret?.length || 0) > 500) {
      return NextResponse.json({ error: "Le secret OAuth est trop long." }, { status: 400 })
    }
    const settings = await saveGoogleOAuthSettings({
      clientId,
      clientSecret: body.clientSecret,
      configuredBy: admin.uid,
      sessionToken: await currentAuthToken(),
    })
    return NextResponse.json({ ok: true, settings })
  } catch {
    return NextResponse.json(
      { error: "La configuration OAuth Google n’a pas pu être enregistrée." },
      { status: 400 },
    )
  }
}
