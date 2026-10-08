import { env } from "cloudflare:workers"

import { downloadDriveFile, findDriveFolderByName, listDriveFolderFiles } from "@/lib/google-drive"
import { isSoundName, soundFileNames, type SoundName } from "@/lib/sound-names"

/**
 * Les sons d'Eraser, rangés dans le dossier « Sons » du Drive partagé (levelup.mp3,
 * choixsort.mp3…). Le Drive reste la source : remplacer un fichier là-bas change le son
 * pour tout le monde. Le stockage local n'est qu'un cache, par date de modification.
 */
const SOUND_FOLDER = "Sons"
const LISTING_TTL_MS = 10 * 60_000
const MISSING_TTL_MS = 60_000

type SoundPointer = { fileId: string; modifiedTime: string; contentType: string }
let listing: { expiresAt: number; files: Promise<Map<string, SoundPointer>> } | null = null

function soundListing() {
  if (listing && listing.expiresAt > Date.now()) return listing.files
  const files = findDriveFolderByName(SOUND_FOLDER)
    .then(async (folder) => folder ? await listDriveFolderFiles(folder.id) : [])
    .then((found) => new Map(found.map((file) => [file.name.trim().toLocaleLowerCase("fr"), { fileId: file.id, modifiedTime: file.modifiedTime || "", contentType: file.mimeType || "audio/mpeg" }])))
  listing = { expiresAt: Date.now() + LISTING_TTL_MS, files }
  // Un dossier introuvable ou vide n'est retenu qu'une minute : les sons peuvent arriver entre-temps.
  void files.then((found) => { if (!found.size && listing?.files === files) listing.expiresAt = Date.now() + MISSING_TTL_MS }).catch(() => { if (listing?.files === files) listing = null })
  return files
}

/** Le son demandé, depuis le cache local ou le Drive ; null s'il n'existe pas (la page joue alors son son de secours). */
export async function getSoundFile(name: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  if (!isSoundName(name)) return null
  const pointer = (await soundListing()).get(soundFileNames[name as SoundName])
  if (!pointer) return null
  const bucket = env.BUCKET ?? null
  const key = `sons/${name}@${pointer.modifiedTime.replace(/[^0-9A-Za-z]/g, "")}`
  if (bucket) {
    const cached = await bucket.get(key).catch(() => null)
    if (cached) {
      const bytes = cached.body instanceof ArrayBuffer ? cached.body : await new Response(cached.body as BodyInit).arrayBuffer()
      return { bytes, contentType: cached.httpMetadata?.contentType || pointer.contentType }
    }
  }
  const response = await downloadDriveFile(pointer.fileId)
  if (!response.ok) return null
  const bytes = await response.arrayBuffer()
  const contentType = response.headers.get("content-type") || pointer.contentType
  if (bucket) await bucket.put(key, bytes, { httpMetadata: { contentType } }).catch(() => undefined)
  return { bytes, contentType }
}
