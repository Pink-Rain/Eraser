import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { AUTH_COOKIE } from "@/lib/auth-cookies"
import { accountFromSession, forgetSessionAccount } from "@/lib/site-auth"

/** Relit le compte connecté sans cache : l'écran d'attente s'en sert pour « Actualiser ». */
export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE)?.value
  if (!token) return NextResponse.json({ account: null }, { status: 401 })
  forgetSessionAccount(token)
  const account = await accountFromSession(token).catch(() => null)
  if (!account) return NextResponse.json({ account: null }, { status: 401 })
  return NextResponse.json({ status: account.status, role: account.role }, { headers: { "cache-control": "no-store" } })
}
