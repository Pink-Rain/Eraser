import { NextResponse } from "next/server"

import { setAuthCookie } from "@/lib/auth-cookies"
import { registerAccount } from "@/lib/site-auth"

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string
    password?: string
    displayName?: string
    adminCode?: string
  }
  const email = body.email?.trim().toLowerCase() ?? ""
  const password = body.password ?? ""
  const displayName = body.displayName?.trim() ?? ""
  if (!email || password.length < 8 || displayName.length < 2) {
    return NextResponse.json(
      { error: "Vérifie le nom, l’adresse e-mail et le mot de passe." },
      { status: 400 },
    )
  }

  try {
    const created = await registerAccount({
      email,
      password,
      displayName,
      adminCode: body.adminCode?.trim(),
    })
    const response = NextResponse.json({
      ok: true,
      message:
        created.account.status === "actif"
          ? "Compte administrateur créé."
          : "Compte créé. Il attend maintenant l’attribution d’un rôle.",
    })
    setAuthCookie(response, created.session)
    return response
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("account_registration_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: code,
    })
    const message = code.includes("EMAIL_EXISTS")
      ? "Un compte existe déjà avec cette adresse e-mail."
      : "Impossible de créer le compte pour le moment."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
