import { NextResponse } from "next/server"

import { createCampaignSession, listCampaignSessions } from "@/lib/campaign-sessions"
import { sessionManager } from "@/lib/session-access"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!await sessionManager(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    return NextResponse.json({ sessions: await listCampaignSessions(id) }, { headers: { "cache-control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Les sessions n’ont pas pu être chargées." }, { status: 400 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await sessionManager(id)
  if (!access) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { name?: unknown }
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : ""
    if (!name) return NextResponse.json({ error: "Donne un titre à la session." }, { status: 400 })
    return NextResponse.json({ session: await createCampaignSession(id, name, access.account.uid) })
  } catch {
    return NextResponse.json({ error: "La session n’a pas pu être créée." }, { status: 400 })
  }
}
