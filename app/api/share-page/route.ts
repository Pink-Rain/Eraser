import { NextResponse } from "next/server"

import { isSharedPageHref, sharePageWith } from "@/lib/item-notifications"
import { authorizedAccount } from "@/lib/server-auth"

/** Envoie une page de l'app à d'autres comptes : elle leur arrive en notification. */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { uids?: unknown; href?: unknown; title?: unknown; note?: unknown }
  const uids = Array.isArray(body.uids) ? body.uids.filter((uid): uid is string => typeof uid === "string" && Boolean(uid) && uid.length <= 120) : []
  const href = typeof body.href === "string" ? body.href : ""
  if (!uids.length || !isSharedPageHref(href)) return NextResponse.json({ error: "Choisis au moins un compte." }, { status: 400 })
  try {
    const sent = await sharePageWith(account, uids, { href, title: typeof body.title === "string" ? body.title : "", note: typeof body.note === "string" ? body.note : "" })
    return NextResponse.json({ sent })
  } catch (error) {
    const offline = error instanceof Error && error.message === "SHARED_STORE_UNAVAILABLE"
    if (!offline) console.error("SHARE_PAGE_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: offline ? "Le serveur partagé n’est pas configuré : la page ne peut pas être envoyée." : "La page n’a pas pu être envoyée. Réessaie dans un instant." }, { status: 503 })
  }
}
