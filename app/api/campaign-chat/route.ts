import { NextResponse } from "next/server"

import { saveTabletopActivity } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { chatRoomId, getChatBootstrapForAccount, getTabletopSpeakerName, listChatCampaignsForAccount } from "@/lib/tabletop-access"
import type { TabletopActivityKind } from "@/lib/tabletop-schema"

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const url = new URL(request.url)
  try {
    if (url.searchParams.get("campaigns") === "1") {
      return NextResponse.json({ campaigns: await listChatCampaignsForAccount(account) })
    }
    const pageLinked = text(url.searchParams.get("pageLinked"), 200)
    if (!pageLinked) return NextResponse.json({ error: "Campagne requise." }, { status: 400 })
    const bootstrap = await getChatBootstrapForAccount(account, pageLinked)
    if (!bootstrap) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
    return NextResponse.json(bootstrap)
  } catch {
    return NextResponse.json({ error: "Le chat n’a pas pu être chargé." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const pageLinked = text(body.pageLinked, 200)
    if (!pageLinked) throw new Error("INVALID_CAMPAIGN")
    const bootstrap = await getChatBootstrapForAccount(account, pageLinked)
    if (!bootstrap) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
    const kind: TabletopActivityKind | null = body.kind === "chat" || body.kind === "dice" ? body.kind : null
    if (!kind) throw new Error("INVALID_ACTIVITY")
    const authorName = await getTabletopSpeakerName(account, pageLinked, text(body.speakerId, 200))
    const activity = {
      id: text(body.id, 200) || crypto.randomUUID(),
      mapId: chatRoomId(pageLinked),
      kind,
      authorUid: account.uid,
      authorName,
      text: text(body.text, 1200),
      diceExpression: kind === "dice" ? text(body.diceExpression, 40) : "",
      diceResult: kind === "dice" ? text(body.diceResult, 500) : "",
      createdAt: new Date().toISOString(),
      audience: body.audience === "gm" || body.audience === "character" ? body.audience : "public" as "public" | "gm" | "character",
      recipientId: text(body.recipientId, 200),
      recipientName: text(body.recipientName, 120),
    }
    if (kind === "chat" && !activity.text) throw new Error("EMPTY_MESSAGE")
    await saveTabletopActivity(activity)
    return NextResponse.json({ activity })
  } catch {
    return NextResponse.json({ error: "Le message n’a pas pu être envoyé." }, { status: 400 })
  }
}
