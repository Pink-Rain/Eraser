import { NextResponse } from "next/server"

import { setAuthCookie } from "@/lib/auth-cookies"
import { loginAccount } from "@/lib/site-auth"

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string }
  const email = body.email?.trim().toLowerCase() ?? ""
  const password = body.password ?? ""
  if (!email || !password) {
    return NextResponse.json(
      { error: "Renseigne ton e-mail et ton mot de passe." },
      { status: 400 },
    )
  }

  try {
    const signedIn = await loginAccount(email, password)
    const response = NextResponse.json({
      ok: true,
      message:
        signedIn.account.status === "actif"
          ? "Connexion réussie."
          : "Connexion réussie. Ton rôle doit encore être attribué.",
    })
    setAuthCookie(response, signedIn.session)
    return response
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message =
      code.includes("INVALID_LOGIN_CREDENTIALS")
        ? "Adresse e-mail ou mot de passe incorrect."
        : "Impossible de se connecter pour le moment."
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
