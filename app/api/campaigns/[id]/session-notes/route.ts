import { NextResponse } from "next/server"

import { listCampaignSessionsForDisplay } from "@/lib/campaign-sessions"
import { campaignReader } from "@/lib/session-access"
import { deleteSessionNote, listSessionNotes, reorderSessionEvents, saveSessionNote } from "@/lib/session-notes"

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (code === "INVALID_NOTE") return "Écris quelque chose dans la note."
  if (code === "SESSION_NOT_FOUND") return "Cette session n’existe plus."
  if (code === "NOTE_FORBIDDEN") return "Seul l’auteur de cette note (ou le MJ) peut la modifier."
  if (code === "NOTE_NOT_FOUND") return "Cette note n’existe plus."
  if (code === "INVALID_ORDER") return "Cet ordre n’a pas pu être lu."
  return "La note n’a pas pu être enregistrée."
}

/**
 * Les notes de session d'une campagne : les publiques et les notes privées du compte.
 * `?character=ID` : seulement les notes privées de ce personnage (sa fiche), avec les sessions.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reader = await campaignReader(id)
  if (!reader) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const characterId = new URL(request.url).searchParams.get("character") || ""
  try {
    const [notes, sessions] = await Promise.all([
      listSessionNotes(id, { uid: reader.account.uid, manager: reader.manager }),
      listCampaignSessionsForDisplay(id),
    ])
    return NextResponse.json({
      campaign: reader.campaign,
      viewer: { uid: reader.account.uid, manager: reader.manager },
      sessions: sessions.map((session) => ({ id: session.id, name: session.name, createdAt: session.createdAt })),
      notes: characterId ? notes.filter((note) => note.private && note.characterId === characterId) : notes,
    })
  } catch (error) {
    console.error("SESSION_NOTES_READ_FAILED", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Les notes n’ont pas pu être chargées." }, { status: 502 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reader = await campaignReader(id)
  if (!reader) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { note?: unknown }
    const sessions = await listCampaignSessionsForDisplay(id)
    const note = await saveSessionNote(id, body.note, { uid: reader.account.uid, manager: reader.manager, name: reader.account.displayName || "" }, sessions.map((session) => session.id))
    return NextResponse.json({ note })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}

/** Ranger la frise d'une session : `{ sessionId, order: [ID des événements dans l'ordre] }`. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reader = await campaignReader(id)
  if (!reader) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { sessionId?: unknown; order?: unknown }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : ""
    const notes = await reorderSessionEvents(id, sessionId, body.order, { uid: reader.account.uid, manager: reader.manager })
    return NextResponse.json({ notes })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "NOTE_FORBIDDEN" ? "Seul le MJ (ou l’auteur de chaque événement) peut changer leur ordre." : errorMessage(error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reader = await campaignReader(id)
  if (!reader) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const noteId = new URL(request.url).searchParams.get("note") || ""
  try {
    await deleteSessionNote(id, noteId, { uid: reader.account.uid, manager: reader.manager })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}
