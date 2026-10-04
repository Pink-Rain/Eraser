import { NextResponse } from "next/server"

import { acknowledgeItemNotifications, listItemNotifications } from "@/lib/item-notifications"
import { authorizedAccount } from "@/lib/server-auth"

/** Les objets reçus en attente ; chacun reste rendu tant que la page ne l'a pas montré. */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ notifications: [] }, { status: 401 })
  // `target` : les objets reçus par ce personnage, relevés à l'ouverture de sa fiche.
  const target = new URL(request.url).searchParams.get("target")?.trim() ?? ""
  const notifications = await listItemNotifications(account.uid, target).catch(() => [])
  return NextResponse.json({ notifications }, { headers: { "cache-control": "no-store" } })
}

/** `seen` : les notifications que la page vient de montrer ; elles sont effacées. */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ ok: false }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { seen?: unknown }
  const seen = Array.isArray(body.seen) ? body.seen.filter((id): id is string => typeof id === "string" && Boolean(id) && id.length <= 100) : []
  await acknowledgeItemNotifications(account.uid, seen).catch(() => undefined)
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
}
