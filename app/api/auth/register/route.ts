import { NextResponse } from "next/server"

import { setAuthCookie } from "@/lib/auth-cookies"
import { registerAccount } from "@/lib/site-auth"

export async function POST(request: Request) {
  const jsonRequest = request.headers.get("content-type")?.includes("application/json") ?? false
  const body = jsonRequest
    ? ((await request.json()) as {
        email?: string
        password?: string
        displayName?: string
        adminCode?: string
      })
    : Object.fromEntries(await request.formData()) as {
        email?: string
        password?: string
        displayName?: string
        adminCode?: string
      }
  const email = body.email?.trim().toLowerCase() ?? ""
  const password = body.password ?? ""
  const displayName = body.displayName?.trim() ?? ""
  if (!email || password.length < 8 || displayName.length < 2) {
    const error = "Vérifie le nom, l’adresse e-mail et le mot de passe."
    if (jsonRequest) return NextResponse.json({ error }, { status: 400 })
    return authRedirect(request, error)
  }

  try {
    const created = await registerAccount({
      email,
      password,
      displayName,
      adminCode: body.adminCode?.trim(),
    })
    const message = created.account.status === "actif"
      ? "Compte administrateur créé."
      : "Compte créé. Il attend maintenant l’attribution d’un rôle."
    const response = jsonRequest
      ? NextResponse.json({ ok: true, message })
      : NextResponse.redirect(new URL("/", request.url), 303)
    setAuthCookie(response, created.session)
    return response
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("account_registration_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: code,
    })
    const message = code.includes("EMAIL_EXISTS")
      ? "Un compte local existe déjà avec cette adresse. Connecte-toi avec son mot de passe."
      : "Impossible de créer le compte pour le moment."
    if (jsonRequest) return NextResponse.json({ error: message }, { status: 400 })
    return authRedirect(request, message)
  }
}

function authRedirect(request: Request, error: string) {
  const target = new URL("/connexion", request.url)
  target.searchParams.set("authError", error)
  return NextResponse.redirect(target, 303)
}
