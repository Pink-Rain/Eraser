import { NextResponse } from "next/server"

import { updateTabletopMap } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { authorizeTabletopMap, canManageTabletop } from "@/lib/tabletop-access"
import { readTabletopBackground, saveTabletopBackground } from "@/lib/tabletop-backgrounds"

function dimension(value: FormDataEntryValue | null, fallback: number, minimum: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(12000, Math.round(parsed))) : fallback
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  const roomKey = new URL(request.url).searchParams.get("roomKey") || ""
  const map = await authorizeTabletopMap(account, id, roomKey)
  if (!map) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const object = await readTabletopBackground(id)
  if (!object) return NextResponse.json({ error: "Image introuvable." }, { status: 404 })
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "image/jpeg",
      "cache-control": "private, max-age=3600",
    },
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account || !canManageTabletop(account)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { id } = await params
  const map = await authorizeTabletopMap(account, id)
  if (!map) return NextResponse.json({ error: "Carte introuvable." }, { status: 404 })
  try {
    const form = await request.formData()
    const file = form.get("background")
    if (!(file instanceof File)) throw new Error("INVALID_TABLETOP_BACKGROUND")
    const backgroundUrl = await saveTabletopBackground(id, file)
    const updated = await updateTabletopMap(id, {
      backgroundUrl,
      width: dimension(form.get("width"), map.width, 320),
      height: dimension(form.get("height"), map.height, 240),
    })
    if (!updated) throw new Error("TABLETOP_MAP_NOT_FOUND")
    return NextResponse.json({ map: updated })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({
      error: code === "INVALID_TABLETOP_BACKGROUND" ? "Choisis une image de moins de 20 Mo." : "L’image de fond n’a pas pu être enregistrée.",
    }, { status: 400 })
  }
}
