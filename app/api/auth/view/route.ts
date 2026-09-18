import { NextResponse } from "next/server"

import { setViewRoleCookie } from "@/lib/auth-cookies"
import { allowedRoleViews, type SiteRole } from "@/lib/auth-types"
import { currentAccount } from "@/lib/server-auth"

export async function POST(request: Request) {
  const account = await currentAccount()
  if (!account || account.status !== "actif" || !account.role) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { role?: SiteRole } | null
  const role = body?.role
  if (!role || !allowedRoleViews[account.role].includes(role)) {
    return NextResponse.json({ error: "Cette vue n’est pas disponible pour ce compte." }, { status: 403 })
  }

  const response = NextResponse.json({ ok: true, role })
  setViewRoleCookie(response, role)
  return response
}
