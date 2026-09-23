import { roll20Image } from "@/lib/roll20-bridge"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url)
  const { id } = await params
  // Sans `kind` ni `type` : le portrait d'un PNJ, comme avant la 0.7.0 du compagnon.
  const image = await roll20Image(url.searchParams.get("campaign") || "", url.searchParams.get("kind") || "npc", id, url.searchParams.get("type") || "portrait", url.searchParams.get("key") || "")
  if (!image) return new Response("Image introuvable.", { status: 404 })
  if ("redirect" in image) return Response.redirect(image.redirect, 302)
  return new Response(image.body, { headers: { "content-type": image.contentType, "cache-control": "private, max-age=3600" } })
}
