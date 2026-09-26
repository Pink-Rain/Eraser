import { NextResponse } from "next/server"

import { takeItemNotifications } from "@/lib/item-notifications"
import { authorizedAccount } from "@/lib/server-auth"

/** Les objets reçus depuis la dernière relève ; chacun n'est rendu qu'une fois. */
export async function GET() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ notifications: [] }, { status: 401 })
  const notifications = await takeItemNotifications(account.uid).catch(() => [])
  return NextResponse.json({ notifications }, { headers: { "cache-control": "no-store" } })
}
