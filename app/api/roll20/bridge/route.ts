import { NextResponse } from "next/server"

import { roll20CampaignPayload, roll20LinkFromToken, updateRoll20HitPoints } from "@/lib/roll20-bridge"

const corsHeaders = {
  // This endpoint never accepts cookies: the campaign-specific bearer key is
  // the sole credential. Allowing the Chrome companion origin is therefore
  // safe and required because extension origins are generated at install time.
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, PATCH, OPTIONS",
  "cache-control": "no-store",
}

function tokenFrom(request: Request) {
  const authorization = request.headers.get("authorization") || ""
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: Request) {
  const link = await roll20LinkFromToken(tokenFrom(request))
  if (!link) return NextResponse.json({ error: "Liaison Eraser invalide ou révoquée." }, { status: 401, headers: corsHeaders })
  try {
    const url = new URL(request.url)
    const payload = await roll20CampaignPayload(link, url.origin, {
      id: url.searchParams.get("gameId") || "",
      name: url.searchParams.get("gameName") || "",
    })
    return NextResponse.json(payload, { headers: corsHeaders })
  } catch {
    return NextResponse.json({ error: "La campagne Eraser n’a pas pu être chargée." }, { status: 400, headers: corsHeaders })
  }
}

export async function PATCH(request: Request) {
  const link = await roll20LinkFromToken(tokenFrom(request))
  if (!link) return NextResponse.json({ error: "Liaison Eraser invalide ou révoquée." }, { status: 401, headers: corsHeaders })
  try {
    const body = (await request.json()) as { hitPoints?: unknown }
    if (!Array.isArray(body.hitPoints) || body.hitPoints.length > 500) throw new Error("INVALID_HP")
    const hitPoints = body.hitPoints.flatMap<{ id: string; currentHp: number; totalHp?: number }>((value) => {
      if (!value || typeof value !== "object") return []
      const item = value as { id?: unknown; currentHp?: unknown; totalHp?: unknown }
      if (typeof item.id !== "string" || item.id.length > 200) return []
      const currentHp = Number(item.currentHp)
      const totalHp = item.totalHp === undefined ? undefined : Number(item.totalHp)
      if (!Number.isFinite(currentHp) || (totalHp !== undefined && !Number.isFinite(totalHp))) return []
      return [{ id: item.id, currentHp: Math.max(0, Math.min(99999, Math.trunc(currentHp))), ...(totalHp === undefined ? {} : { totalHp: Math.max(0, Math.min(99999, Math.trunc(totalHp))) }) }]
    })
    if (hitPoints.length !== body.hitPoints.length) throw new Error("INVALID_HP")
    return NextResponse.json({ updated: await updateRoll20HitPoints(link, hitPoints) }, { headers: corsHeaders })
  } catch {
    return NextResponse.json({ error: "Les points de vie n’ont pas pu être mis à jour." }, { status: 400, headers: corsHeaders })
  }
}
