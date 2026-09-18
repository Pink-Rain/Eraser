import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import {
  exchangeAuthorizationCode,
  googleEmailForAccessToken,
  saveGoogleAuthorization,
  takeGoogleOAuthFlow,
} from "@/lib/google-oauth"
import { authorizedAccount } from "@/lib/server-auth"

const STATE_COOKIE = "eraser_google_oauth_state"
const EMAIL_COOKIE = "eraser_google_oauth_email"
const PKCE_COOKIE = "eraser_google_oauth_pkce"
const CALLBACK_PATH = "/api/admin/google-drive/oauth/callback"

function completedResponse(request: Request, status: string) {
  const response = NextResponse.redirect(
    new URL(`/administration/google-drive?google=${encodeURIComponent(status)}`, request.url),
  )
  response.cookies.set(STATE_COOKIE, "", { path: CALLBACK_PATH, maxAge: 0 })
  response.cookies.set(EMAIL_COOKIE, "", { path: CALLBACK_PATH, maxAge: 0 })
  response.cookies.set(PKCE_COOKIE, "", { path: CALLBACK_PATH, maxAge: 0 })
  return response
}

function desktopResponse(status: string) {
  const success = status === "connected"
  const title = success ? "Google Drive est connecté" : "Connexion Google incomplète"
  const detail = success
    ? "Tu peux fermer cet onglet et revenir dans Eraser."
    : "Ferme cet onglet, retourne dans Eraser puis relance la connexion."
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;background:#f4ead6;color:#2c241a;font:16px system-ui;display:grid;min-height:100vh;place-items:center}.card{max-width:560px;margin:24px;padding:32px;border:1px solid #c7ad7c;border-radius:20px;background:#fffaf0;box-shadow:0 18px 60px #604b2930}h1{margin:0 0 12px;font:700 30px Georgia,serif}p{line-height:1.6;margin:0}</style><main class="card"><h1>${title}</h1><p>${detail}</p></main></html>`, {
    status: success ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const receivedState = requestUrl.searchParams.get("state") || ""
  const desktopFlow = await takeGoogleOAuthFlow(receivedState)
  if (desktopFlow) {
    if (requestUrl.searchParams.get("error")) return desktopResponse("access_denied")
    const code = requestUrl.searchParams.get("code")
    if (!code) return desktopResponse("invalid_state")
    try {
      const token = await exchangeAuthorizationCode({
        code,
        origin: requestUrl.origin,
        codeVerifier: desktopFlow.codeVerifier,
      })
      const googleEmail = await googleEmailForAccessToken(token.access_token!)
      if (googleEmail !== desktopFlow.googleEmail) return desktopResponse("account_mismatch")
      if (!token.refresh_token) return desktopResponse("missing_refresh_token")
      await saveGoogleAuthorization({
        googleEmail,
        refreshToken: token.refresh_token,
        scopes: token.scope,
        connectedBy: desktopFlow.connectedBy,
      })
      return desktopResponse("connected")
    } catch {
      return desktopResponse("failed")
    }
  }

  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.redirect(new URL("/", request.url))
  if (requestUrl.searchParams.get("error")) return completedResponse(request, "access_denied")

  const cookieStore = await cookies()
  const cookieState = requestUrl.searchParams.get("state")
  const expectedState = cookieStore.get(STATE_COOKIE)?.value
  const expectedEmail = cookieStore.get(EMAIL_COOKIE)?.value?.trim().toLowerCase()
  const codeVerifier = cookieStore.get(PKCE_COOKIE)?.value
  const code = requestUrl.searchParams.get("code")
  if (
    !cookieState ||
    !expectedState ||
    cookieState !== expectedState ||
    !code ||
    !expectedEmail ||
    !codeVerifier
  ) {
    return completedResponse(request, "invalid_state")
  }

  try {
    const token = await exchangeAuthorizationCode({
      code,
      origin: requestUrl.origin,
      codeVerifier,
    })
    const googleEmail = await googleEmailForAccessToken(token.access_token!)
    if (googleEmail !== expectedEmail) return completedResponse(request, "account_mismatch")
    if (!token.refresh_token) return completedResponse(request, "missing_refresh_token")
    await saveGoogleAuthorization({
      googleEmail,
      refreshToken: token.refresh_token,
      scopes: token.scope,
      connectedBy: admin.uid,
    })
    return completedResponse(request, "connected")
  } catch {
    return completedResponse(request, "failed")
  }
}
