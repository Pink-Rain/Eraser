import { NextResponse } from "next/server"

import { EXTENSION_API_VERSION, extensionOpenFor, linkedExtension } from "@/lib/extensions"
import { readInstalledExtension, runExtensionServer } from "@/lib/extensions-install"
import { extensionDataStore, listExtensionSettings } from "@/lib/extensions-store"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * La partie serveur d'une extension installée : `/api/extensions/<id>/serveur/<chemin>` lui est
 * confiée telle quelle, avec ce qu'Eraser lui prête (`eraser`, version `EXTENSION_API_VERSION`) :
 * le compte qui demande, le chemin et `store`, ses données sur le serveur partagé
 * (lib/extensions-store.ts). Elle n'accède à rien d'autre d'Eraser.
 */
async function handle(request: Request, { params }: { params: Promise<{ id: string; chemin?: string[] }> }) {
  const { id, chemin } = await params
  const account = await authorizedAccount()
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!linkedExtension(id) || !extensionOpenFor(await listExtensionSettings(), id, account)) return NextResponse.json({ error: "Extension introuvable." }, { status: 404 })
  const installed = await readInstalledExtension(id)
  if (!installed) return NextResponse.json({ error: "Cette extension n'est pas installée sur cet ordinateur." }, { status: 404 })
  if (installed.api > EXTENSION_API_VERSION) return NextResponse.json({ error: "Cette extension demande une version plus récente d'Eraser." }, { status: 409 })
  const eraser = {
    api: EXTENSION_API_VERSION,
    extension: { id, version: installed.version },
    account: { uid: account.uid, displayName: account.displayName, role: account.role, accountRole: account.accountRole },
    path: chemin ?? [],
    store: extensionDataStore(id),
  }
  try {
    return await runExtensionServer(installed, request, eraser)
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR"
    console.error("EXTENSION_SERVER_FAILED", id, message)
    return NextResponse.json({ error: `L'extension n'a pas pu répondre : ${message}` }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
