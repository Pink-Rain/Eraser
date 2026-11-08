import { readFile } from "node:fs/promises"

import { extensionContentType, extensionOpenFor, linkedExtension } from "@/lib/extensions"
import { extensionFile } from "@/lib/extensions-install"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Les fichiers d'une extension installée (module, styles, images…). La version est dans
 * l'adresse : un fichier ne change jamais sous la même adresse, le navigateur le garde, et les
 * imports relatifs du module (`./morceau.js`) restent dans la même version.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; version: string; chemin: string[] }> },
) {
  const { id, version, chemin } = await params
  const account = await authorizedAccount()
  if (!account) return new Response("Accès refusé.", { status: 403 })
  if (!linkedExtension(id) || !extensionOpenFor(id, account)) return new Response("Extension introuvable.", { status: 404 })
  const file = await extensionFile(id, version, (chemin ?? []).join("/"))
  if (!file) return new Response("Fichier introuvable.", { status: 404 })
  return new Response(await readFile(file), {
    headers: {
      "Content-Type": extensionContentType(file),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
