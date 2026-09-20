import { NextResponse } from "next/server"

import {
  createGoogleOAuthFlow,
  googleAuthorizationUrl,
  googlePkceChallenge,
  randomOAuthState,
} from "@/lib/google-oauth"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"

function validEmailFrom(request: Request) {
  const requestUrl = new URL(request.url)
  return (requestUrl.searchParams.get("email") || "").trim().toLowerCase()
}

async function oauthRequest(request: Request, adminUid: string) {
  const requestUrl = new URL(request.url)
  const email = validEmailFrom(request)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("INVALID_EMAIL")
  const state = randomOAuthState()
  const codeVerifier = randomOAuthState()
  await createGoogleOAuthFlow({ state, googleEmail: email, codeVerifier, connectedBy: adminUid })
  const url = await googleAuthorizationUrl({
    email,
    state,
    origin: requestUrl.origin,
    codeChallenge: await googlePkceChallenge(codeVerifier),
    sessionToken: await currentAuthToken(),
  })
  return { url }
}

export async function POST(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    return NextResponse.json(await oauthRequest(request, admin.uid))
  } catch {
    return NextResponse.json({ error: "La connexion Google n’a pas pu démarrer." }, { status: 400 })
  }
}
