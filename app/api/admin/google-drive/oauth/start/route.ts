import { NextResponse } from "next/server"

import {
  googleAuthorizationUrl,
  googlePkceChallenge,
  randomOAuthState,
} from "@/lib/google-oauth"
import { authorizedAccount } from "@/lib/server-auth"

const STATE_COOKIE = "eraser_google_oauth_state"
const EMAIL_COOKIE = "eraser_google_oauth_email"
const PKCE_COOKIE = "eraser_google_oauth_pkce"
const CALLBACK_PATH = "/api/admin/google-drive/oauth/callback"

export async function GET(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.redirect(new URL("/", request.url))

  const requestUrl = new URL(request.url)
  const email = (requestUrl.searchParams.get("email") || "").trim().toLowerCase()
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
