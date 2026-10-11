import { NextResponse } from "next/server"

import { deleteCampaignEvent, listCampaignEvents, saveCampaignEvent } from "@/lib/campaign-events"
import { sessionManager } from "@/lib/session-access"

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (code === "INVALID_EVENT") return "Donne un nom à l’événement."
  if (code === "EVENT_NOT_FOUND") return "Cet événement n’existe plus."
  return "L’événement n’a pas pu être enregistré."
}

/** Les événements préparés d'une campagne (page Événements) : le MJ et les admins seulement. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!await sessionManager(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    return NextResponse.json({ events: await listCampaignEvents(id) })
  } catch (error) {
    console.error("CAMPAIGN_EVENTS_READ_FAILED", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Les événements n’ont pas pu être chargés." }, { status: 502 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const manager = await sessionManager(id)
  if (!manager) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { event?: unknown }
    return NextResponse.json({ event: await saveCampaignEvent(id, body.event, manager.account.uid) })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!await sessionManager(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const eventId = new URL(request.url).searchParams.get("event") || ""
  try {
    await deleteCampaignEvent(id, eventId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}
