import { NextResponse } from "next/server"

import {
  createGoogleOAuthFlow,
  googleAuthorizationUrl,
  googlePkceChallenge,
  randomOAuthState,
} from "@/lib/google-oauth"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"

const STATE_COOKIE = "eraser_google_oauth_state"
const EMAIL_COOKIE = "eraser_google_oauth_email"
const PKCE_COOKIE = "eraser_google_oauth_pkce"
const CALLBACK_PATH = "/api/admin/google-drive/oauth/callback"

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

export async function GET(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.redirect(new URL("/", request.url))

  const requestUrl = new URL(request.url)
  const email = validEmailFrom(request)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.redirect(new URL("/administration/google-drive?google=failed", request.url))
  }

  try {
    const state = randomOAuthState()
    const codeVerifier = randomOAuthState()
    const response = NextResponse.redirect(
      await googleAuthorizationUrl({
        email,
        state,
        origin: requestUrl.origin,
        codeChallenge: await googlePkceChallenge(codeVerifier),
        sessionToken: await currentAuthToken(),
      }),
    )
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: CALLBACK_PATH,
      maxAge: 10 * 60,
    }
    response.cookies.set(STATE_COOKIE, state, cookieOptions)
    response.cookies.set(EMAIL_COOKIE, email, cookieOptions)
    response.cookies.set(PKCE_COOKIE, codeVerifier, cookieOptions)
    return response
  } catch {
    return NextResponse.redirect(new URL("/administration/google-drive?google=failed", request.url))
  }
}
