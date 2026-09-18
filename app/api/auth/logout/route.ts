import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { AUTH_COOKIE, clearAuthCookies } from "@/lib/auth-cookies"
import { deleteSession } from "@/lib/site-auth"

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE)?.value
  if (token) await deleteSession(token).catch(() => undefined)
  const response = NextResponse.json({ ok: true })
  clearAuthCookies(response)
  return response
}
