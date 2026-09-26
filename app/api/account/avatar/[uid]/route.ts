import { NextResponse } from "next/server"

import { readAccountAvatar } from "@/lib/account-avatars"
import { currentAccount } from "@/lib/server-auth"

export async function GET(_request: Request, { params }: { params: Promise<{ uid: string }> }) {
  if (!await currentAccount()) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { uid } = await params
  const object = await readAccountAvatar(uid).catch(() => null)
  // Un compte sans avatar répond aussi avec un cache court : le menu affiche alors
  // ses initiales sans redemander l’image à chaque page.
  if (!object) return NextResponse.json({ error: "Aucun avatar." }, { status: 404, headers: { "cache-control": "private, max-age=120" } })
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=300" } })
}
