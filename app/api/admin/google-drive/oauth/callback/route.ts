import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import {
  exchangeAuthorizationCode,
  googleEmailForAccessToken,
  saveGoogleAuthorization,
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

export async function GET(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.redirect(new URL("/", request.url))

  const requestUrl = new URL(request.url)
  if (requestUrl.searchParams.get("error")) return completedResponse(request, "access_denied")

  const cookieStore = await cookies()
  const receivedState = requestUrl.searchParams.get("state")
  const expectedState = cookieStore.get(STATE_COOKIE)?.value
  const expectedEmail = cookieStore.get(EMAIL_COOKIE)?.value?.trim().toLowerCase()
  const codeVerifier = cookieStore.get(PKCE_COOKIE)?.value
  const code = requestUrl.searchParams.get("code")
  if (
    !receivedState ||
    !expectedState ||
    receivedState !== expectedState ||
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
