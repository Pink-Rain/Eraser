import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"

/**
 * Les images d'Eraser sont livrées avec l'application (`public/icones/objets`).
 * Le serveur autonome tourne dans son propre dossier (ou une archive asar) :
 * on cherche donc à côté du serveur, puis dans le dossier de travail.
 */
export async function bundledIconBytes(key: string) {
  const relative = join("icones", "objets", ...`${key}.webp`.split("/"))
  const roots = [
    process.argv[1] ? join(dirname(process.argv[1]), "public") : "",
    join(process.cwd(), "public"),
    join(process.cwd(), "dist", "client"),
  ].filter(Boolean)
  for (const root of roots) {
    try {
      const bytes = await readFile(join(root, relative))
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    } catch {
      // Emplacement suivant.
    }
  }
  throw new Error(`OBJECT_ICON_ASSET_MISSING:${key}`)
}
