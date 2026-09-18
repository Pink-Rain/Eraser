import { NextResponse } from "next/server"

import type { SiteRole } from "@/lib/auth-types"

export const AUTH_COOKIE = "eraser_session"
export const VIEW_ROLE_COOKIE = "eraser_view_role"

export function setAuthCookie(
  response: NextResponse,
  session: { token: string; expiresAt: string },
) {
  const secure = process.env.NODE_ENV === "production" && process.env.ERASER_DESKTOP !== "1"
  response.cookies.set(AUTH_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(session.expiresAt),
  })
  response.cookies.set(VIEW_ROLE_COOKIE, "", { path: "/", maxAge: 0 })
}

export function setViewRoleCookie(response: NextResponse, role: SiteRole) {
  const secure = process.env.NODE_ENV === "production" && process.env.ERASER_DESKTOP !== "1"
  response.cookies.set(VIEW_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  })
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 })
  response.cookies.set(VIEW_ROLE_COOKIE, "", { path: "/", maxAge: 0 })
}
