import { NextResponse } from "next/server"

import type { AccountStatus, SiteRole } from "@/lib/auth-types"
import { authorizedAccount } from "@/lib/server-auth"
import { updateAccountAccess } from "@/lib/site-auth"

const roles: SiteRole[] = ["admin", "mj", "joueur"]
const statuses: AccountStatus[] = ["en_attente", "actif", "suspendu"]

export async function POST(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  const body = (await request.json()) as {
    uid?: string
    role?: SiteRole
    status?: AccountStatus
  }
  if (!body.uid || !body.role || !roles.includes(body.role) || !body.status || !statuses.includes(body.status)) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 })
  }
  if (body.uid === admin.uid && (body.status !== "actif" || body.role !== "admin")) {
    return NextResponse.json(
      { error: "Un administrateur ne peut pas retirer son propre accès ici." },
      { status: 400 },
    )
  }

  const updated = await updateAccountAccess(body.uid, body.role, body.status)
  return NextResponse.json({ ok: true, account: updated })
}
