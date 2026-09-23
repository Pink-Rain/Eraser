import { NextResponse } from "next/server"

import { sessionManager } from "@/lib/session-access"
import { deleteCampaignSession, renameCampaignSession, saveSessionBanner, updateSessionMembership, type SessionMembership } from "@/lib/campaign-sessions"

function ids(value: unknown) {
  return Array.isArray(value) && value.length <= 200 && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 200) ? value as string[] : undefined
}

function membership(value: unknown): SessionMembership {
  if (!value || typeof value !== "object") return {}
  const candidate = value as Record<string, unknown>
  return { characterIds: ids(candidate.characterIds), npcIds: ids(candidate.npcIds), shopIds: ids(candidate.shopIds) }
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (code === "INVALID_BANNER") return "Choisis une image de moins de 10 Mo."
  if (code === "SESSION_NOT_FOUND") return "Cette session n’existe plus."
  return "La session n’a pas pu être modifiée."
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params
  if (!await sessionManager(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
      const file = (await request.formData()).get("banner")
      if (!(file instanceof File)) throw new Error("INVALID_BANNER")
      return NextResponse.json({ session: await saveSessionBanner(id, sessionId, file) })
    }
    const body = (await request.json()) as { name?: unknown; add?: unknown; remove?: unknown }
    if (typeof body.name === "string") {
      const name = body.name.trim().slice(0, 160)
      if (!name) return NextResponse.json({ error: "Donne un titre à la session." }, { status: 400 })
      return NextResponse.json({ session: await renameCampaignSession(id, sessionId, name) })
    }
    return NextResponse.json({ session: await updateSessionMembership(id, sessionId, membership(body.add), membership(body.remove)) })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params
  if (!await sessionManager(id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    await deleteCampaignSession(id, sessionId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}
