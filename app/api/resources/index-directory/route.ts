import { NextResponse } from "next/server"

import { parseIndexDirectoryLayout } from "@/lib/index-directory"
import { authorizedAccount } from "@/lib/server-auth"
import { sharedSnapshot } from "@/lib/shared-snapshot"
import { readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

const scope = "index-directory"
const key = "layout"
// Servi tout de suite, relu derrière passé 30 s (lib/shared-snapshot.ts).
const stored = sharedSnapshot(() => readSharedRecord(scope, key))

/** Le rangement de la page Index (dossiers, ordre), commun à toute la table. */
export async function GET() {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!sharedStoreAvailable()) return NextResponse.json({ layout: null, shared: false })
  try {
    const record = await stored.read()
    return NextResponse.json({ layout: record ? parseIndexDirectoryLayout(JSON.parse(record.value)) : null, shared: true })
  } catch (error) {
    console.error("INDEX_DIRECTORY_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ layout: null, shared: true, error: "Le rangement des index n’a pas pu être lu." })
  }
}

export async function POST(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!sharedStoreAvailable()) return NextResponse.json({ error: "Le rangement se garde sur le serveur partagé d’Eraser, qui n’est pas configuré ici." }, { status: 503 })
  try {
    const body = (await request.json()) as { layout?: unknown }
    const layout = parseIndexDirectoryLayout(body.layout)
    await writeSharedRecord(scope, key, JSON.stringify(layout))
    stored.forget()
    return NextResponse.json({ layout })
  } catch (error) {
    console.error("INDEX_DIRECTORY_WRITE_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Le rangement des index n’a pas pu être enregistré." }, { status: 400 })
  }
}
