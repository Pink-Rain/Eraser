import { NextResponse } from "next/server"

import { setAuthCookie } from "@/lib/auth-cookies"
import { loginAccount } from "@/lib/site-auth"

export async function POST(request: Request) {
  const jsonRequest = request.headers.get("content-type")?.includes("application/json") ?? false
  const body = jsonRequest
    ? ((await request.json()) as { email?: string; password?: string })
    : Object.fromEntries(await request.formData()) as { email?: string; password?: string }
  const email = body.email?.trim().toLowerCase() ?? ""
  const password = body.password ?? ""
  if (!email || !password) {
    const error = "Renseigne ton e-mail et ton mot de passe."
    if (jsonRequest) return NextResponse.json({ error }, { status: 400 })
    return authRedirect(request, error)
  }

  try {
    const signedIn = await loginAccount(email, password)
    const message = signedIn.account.status === "actif"
      ? "Connexion réussie."
      : "Connexion réussie. Ton rôle doit encore être attribué."
    const response = jsonRequest
      ? NextResponse.json({ ok: true, message })
      : NextResponse.redirect(new URL("/", request.url), 303)
    setAuthCookie(response, signedIn.session)
    return response
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message =
      code.includes("INVALID_LOGIN_CREDENTIALS")
        ? "Adresse e-mail ou mot de passe incorrect."
        : "Impossible de se connecter pour le moment."
    if (jsonRequest) return NextResponse.json({ error: message }, { status: 401 })
    return authRedirect(request, message)
  }
}

function authRedirect(request: Request, error: string) {
  const target = new URL("/connexion", request.url)
  target.searchParams.set("authError", error)
  return NextResponse.redirect(target, 303)
}
