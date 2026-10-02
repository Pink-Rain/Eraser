import { NextResponse } from "next/server"

import { takeItemNotifications } from "@/lib/item-notifications"
import { authorizedAccount } from "@/lib/server-auth"

/** Les objets reçus depuis la dernière relève ; chacun n'est rendu qu'une fois. */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ notifications: [] }, { status: 401 })
  // `target` : les objets reçus par ce personnage, relevés à l'ouverture de sa fiche.
  const target = new URL(request.url).searchParams.get("target")?.trim() ?? ""
  const notifications = await takeItemNotifications(account.uid, target).catch(() => [])
  return NextResponse.json({ notifications }, { headers: { "cache-control": "no-store" } })
}
