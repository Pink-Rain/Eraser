import { NextResponse } from "next/server"

import { authorizedAccount } from "@/lib/server-auth"
import { getSoundFile } from "@/lib/sound-files"

/** Un son d'Eraser (dossier Drive « Sons »). Absent : 404, la page joue son son de secours. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const { name } = await params
  try {
    const sound = await getSoundFile(name)
    if (!sound) return NextResponse.json({ error: "Son introuvable." }, { status: 404 })
    return new NextResponse(sound.bytes, {
      headers: {
        "content-type": sound.contentType.startsWith("audio/") ? sound.contentType : "audio/mpeg",
        "cache-control": "private, max-age=600",
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    console.error("SOUND_LOAD_FAILED", name, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Son indisponible." }, { status: 502 })
  }
}
