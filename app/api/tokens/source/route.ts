import { NextResponse } from "next/server"

import { authorizedAccount } from "@/lib/server-auth"

/**
 * L'éditeur de token dessine l'avatar dans un canvas. Une image d'un autre site
 * (avatar collé par URL) rendrait le canvas illisible : elle passe donc par ici.
 */
export async function GET(request: Request) {
  if (!await authorizedAccount(["admin", "mj", "joueur"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const source = new URL(request.url).searchParams.get("url") || ""
  let target: URL
  try { target = new URL(source) } catch { return NextResponse.json({ error: "Adresse invalide." }, { status: 400 }) }
  if (target.protocol !== "https:" && target.protocol !== "http:") return NextResponse.json({ error: "Adresse invalide." }, { status: 400 })
  try {
    const response = await fetch(target, { redirect: "follow" })
    const type = (response.headers.get("content-type") || "").split(";")[0]
    if (!response.ok || !type.startsWith("image/")) throw new Error("NOT_AN_IMAGE")
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 15 * 1024 * 1024) throw new Error("TOO_LARGE")
    return new Response(bytes, { headers: { "content-type": type, "cache-control": "private, max-age=600" } })
  } catch {
    return NextResponse.json({ error: "Cette image n’a pas pu être chargée." }, { status: 400 })
  }
}
