import { roll20NpcPortrait } from "@/lib/roll20-bridge"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url)
  const { id } = await params
  const portrait = await roll20NpcPortrait(url.searchParams.get("campaign") || "", id, url.searchParams.get("key") || "")
  if (!portrait) return new Response("Image introuvable.", { status: 404 })
  if ("redirect" in portrait) return Response.redirect(portrait.redirect, 302)
  return new Response(portrait.body, { headers: { "content-type": portrait.contentType, "cache-control": "private, max-age=3600" } })
}
