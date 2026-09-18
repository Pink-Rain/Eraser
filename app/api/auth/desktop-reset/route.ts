import { NextResponse } from "next/server"

import { setAuthCookie } from "@/lib/auth-cookies"
import { resetDesktopAccount } from "@/lib/site-auth"

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string }
  const email = body.email?.trim().toLowerCase() ?? ""
  const password = body.password ?? ""
  if (!email || password.length < 8) {
    return NextResponse.json(
      { error: "Renseigne l’adresse e-mail du compte et un nouveau mot de passe d’au moins 8 caractères." },
      { status: 400 },
    )
  }

  try {
    const repaired = await resetDesktopAccount(email, password)
    const response = NextResponse.json({
      ok: true,
      message: "Accès réparé. Ton nouveau mot de passe est enregistré.",
    })
    setAuthCookie(response, repaired.session)
    return response
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code.includes("ACCOUNT_NOT_FOUND_CREATE_FIRST")
      ? "Aucun compte local n’existe encore. Utilise « Créer un compte »."
      : code.includes("ACCOUNT_NOT_FOUND")
        ? "Aucun compte local ne correspond à cette adresse."
        : "Impossible de réparer l’accès pour le moment."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
