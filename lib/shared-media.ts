import { env } from "cloudflare:workers"

import {
  downloadDriveFile,
  driveFolderWithLegacy,
  findDriveFolderByName,
  findDriveFileByName,
  listDriveFolderFiles,
  trashDriveFile,
  uploadDriveFile,
} from "@/lib/google-drive"

// Portraits, bannières et fonds de carte vivaient dans le stockage local de
// chaque installation : la personne qui envoyait une image était la seule à
// pouvoir la voir. Eraser est une application partagée, donc ces visuels
// appartiennent au Drive partagé, comme toutes les autres données.
//
// Le stockage local reste utilisé, mais uniquement comme cache : le Drive est
// la source de vérité, et une image déjà téléchargée n'est pas retéléchargée.
const MEDIA_FOLDER = "Eraser - Visuels"
const POINTER_TTL_MS = 5 * 60_000
// Un média absent n'est retenu comme absent qu'une minute : un portrait envoyé
// depuis un autre ordinateur restait sinon invisible jusqu'à cinq minutes.
const MISSING_TTL_MS = 60_000

type MediaPointer = { fileId: string; modifiedTime: string; contentType: string }

const pointerCache = new Map<string, { expiresAt: number; pointer: MediaPointer | null }>()
let mediaFolderId: Promise<string> | null = null

function localBucket() {
  return env.BUCKET ?? null
}

function driveName(key: string) {
  // "characters/<id>/portrait" -> "characters__<id>__portrait"
  return key.replace(/[^A-Za-z0-9_-]+/g, "__")
}

function cacheKey(key: string, modifiedTime: string) {
  return `${key}@${modifiedTime.replace(/[^0-9A-Za-z]/g, "")}`
}

/** Le dossier où les visuels ont toujours été rangés faute de « Eraser - Visuels ». */
const LEGACY_MEDIA_FOLDER = "Images Classe"
let legacyMediaFolderId: Promise<string | null> | null = null

async function folderId() {
  if (!mediaFolderId) {
    // Faute de dossier « Eraser - Visuels », les visuels sont dans « Images classes » depuis
    // toujours : on continue d'y lire et d'y écrire (un dossier neuf, vide, les aurait cachés).
    mediaFolderId = driveFolderWithLegacy(MEDIA_FOLDER, LEGACY_MEDIA_FOLDER).catch((error) => {
      mediaFolderId = null
      throw error
    })
  }
  return mediaFolderId
}

// One folder listing serves every image: a page showing twenty tokens would
// otherwise make twenty separate Drive searches on a cold cache.
let folderListing: { expiresAt: number; listedAt: number; byName: Promise<Map<string, MediaPointer>> } | null = null

/**
 * Les dossiers où chercher un visuel : le sien, puis l'ancien s'il est différent. Un dossier
 * « Eraser - Visuels » créé à la main (vide, ou rempli à moitié) ne cache aucun visuel.
 */
async function mediaFolders() {
  legacyMediaFolderId ??= findDriveFolderByName(LEGACY_MEDIA_FOLDER).then((folder) => folder?.id ?? null).catch(() => {
    legacyMediaFolderId = null
    return null
  })
  const [own, legacy] = await Promise.all([folderId(), legacyMediaFolderId])
  return legacy && legacy !== own ? [own, legacy] : [own]
}

async function listingByName() {
  if (folderListing && folderListing.expiresAt > Date.now()) return folderListing.byName
  const byName = mediaFolders()
    .then((folders) => Promise.all(folders.map((folder) => listDriveFolderFiles(folder))))
    // Le dossier du visuel l'emporte sur l'ancien, qui ne fait que compléter.
    .then((listings) => new Map(listings.reverse().flat().map((file) => [file.name, {
      fileId: file.id,
      modifiedTime: file.modifiedTime || "",
      contentType: file.mimeType || "image/*",
    }])))
    .catch((error) => {
      folderListing = null
      throw error
    })
  folderListing = { expiresAt: Date.now() + POINTER_TTL_MS, listedAt: Date.now(), byName }
  return byName
}

/** Un visuel cherché par son nom dans son dossier, puis dans l'ancien. */
async function findInMediaFolders(name: string) {
  for (const folder of await mediaFolders()) {
    const file = await findDriveFileByName(folder, name)
    if (file) return file
  }
  return null
}

async function pointerFor(key: string) {
  const cached = pointerCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.pointer
  const name = driveName(key)
  let pointer: MediaPointer | null = null
  try {
    pointer = (await listingByName()).get(name) ?? null
    // La liste du dossier a plus d'une minute : le média a pu être ajouté depuis.
    if (!pointer && folderListing && Date.now() - folderListing.listedAt > MISSING_TTL_MS) {
      const file = await findInMediaFolders(name).catch(() => null)
      if (file) pointer = { fileId: file.id, modifiedTime: file.modifiedTime || "", contentType: file.mimeType || "image/*" }
    }
  } catch {
    // Listing unavailable (folder too large to cache, transient failure):
    // fall back to a direct search for this one file.
    const file = await findInMediaFolders(name)
    pointer = file
      ? { fileId: file.id, modifiedTime: file.modifiedTime || "", contentType: file.mimeType || "image/*" }
      : null
  }
  pointerCache.set(key, { expiresAt: Date.now() + (pointer ? POINTER_TTL_MS : MISSING_TTL_MS), pointer })
  return pointer
}

export async function putSharedMedia(key: string, bytes: ArrayBuffer, contentType: string) {
  const bucket = localBucket()
  const previous = await pointerFor(key).catch(() => null)
  const uploaded = await uploadDriveFile({ folderId: await folderId(), name: driveName(key), contentType, bytes })
  // Replace rather than accumulate: the previous version is only trashed once
  // the new one is safely stored.
  if (previous && previous.fileId !== uploaded.id) await trashDriveFile(previous.fileId).catch(() => undefined)
  const pointer: MediaPointer = {
    fileId: uploaded.id,
    modifiedTime: uploaded.modifiedTime || new Date().toISOString(),
    contentType,
  }
  pointerCache.set(key, { expiresAt: Date.now() + POINTER_TTL_MS, pointer })
  folderListing = null
  if (bucket) {
    await bucket.put(cacheKey(key, pointer.modifiedTime), bytes, { httpMetadata: { contentType } }).catch(() => undefined)
  }
  return pointer
}

export async function getSharedMedia(key: string) {
  void migrateLocalMediaOnce()
  const bucket = localBucket()
  const pointer = await pointerFor(key).catch((error) => {
    console.error("SHARED_MEDIA_LOOKUP_FAILED", key, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return null
  })

  if (pointer) {
    if (bucket) {
      const cached = await bucket.get(cacheKey(key, pointer.modifiedTime)).catch(() => null)
      if (cached) return cached
    }
    const response = await downloadDriveFile(pointer.fileId)
    if (response.ok) {
      const bytes = await response.arrayBuffer()
      const contentType = response.headers.get("content-type") || pointer.contentType
      if (bucket) {
        await bucket.put(cacheKey(key, pointer.modifiedTime), bytes, { httpMetadata: { contentType } }).catch(() => undefined)
        const stored = await bucket.get(cacheKey(key, pointer.modifiedTime)).catch(() => null)
        if (stored) return stored
      }
      return { body: bytes, httpMetadata: { contentType } }
    }
  }

  // Images sent before visuals moved to Drive only exist on the machine that
  // uploaded them. Serve them, and push them to Drive so everyone else can
  // finally see them too.
  if (!bucket) return null
  const legacy = await bucket.get(key).catch(() => null)
  if (!legacy) return null
  // Read the bytes once: the stored body may be a stream, and uploading it to
  // Drive would otherwise consume it before it could be served.
  const bytes = legacy.body instanceof ArrayBuffer
    ? legacy.body
    : await new Response(legacy.body as BodyInit).arrayBuffer()
  const contentType = legacy.httpMetadata?.contentType || "image/png"
  if (!pointer) void migrateLegacyMedia(key, bytes, contentType)
  return { body: bytes, httpMetadata: { contentType } }
}

async function migrateLegacyMedia(key: string, bytes: ArrayBuffer, contentType: string) {
  try {
    await putSharedMedia(key, bytes, contentType)
  } catch (error) {
    console.error("SHARED_MEDIA_MIGRATION_FAILED", key, error instanceof Error ? error.message : "UNKNOWN_ERROR")
  }
}

export async function copySharedMedia(sourceKey: string, targetKey: string) {
  const source = await getSharedMedia(sourceKey)
  if (!source) return false
  const bytes = source.body instanceof ArrayBuffer
    ? source.body
    : await new Response(source.body as BodyInit).arrayBuffer()
  await putSharedMedia(targetKey, bytes, source.httpMetadata?.contentType || "image/png")
  return true
}

/**
 * Date de la version enregistrée dans Drive, ou `null` si le média n'existe pas.
 * La liste du dossier est gardée cinq minutes : un média enregistré entre-temps
 * (depuis un autre ordinateur, par exemple) est cherché directement avant de
 * conclure qu'il n'existe pas.
 */
export async function sharedMediaVersion(key: string) {
  const pointer = await pointerFor(key).catch(() => null)
  if (pointer) return pointer.modifiedTime || "1"
  const file = await findDriveFileByName(await folderId(), driveName(key)).catch(() => null)
  if (!file) return null
  const found: MediaPointer = { fileId: file.id, modifiedTime: file.modifiedTime || "", contentType: file.mimeType || "image/*" }
  pointerCache.set(key, { expiresAt: Date.now() + POINTER_TTL_MS, pointer: found })
  return found.modifiedTime || "1"
}

/**
 * Les images envoyées avant le passage au Drive (portraits, avatars…) n'existent que
 * sur l'ordinateur qui les a envoyées : les autres voyaient une case vide. Au premier
 * accès à un média, chaque installation parcourt son stockage local et envoie dans
 * le Drive partagé celles qui n'y sont pas encore. Rien n'est supprimé ni remplacé.
 */
let legacySweep: Promise<void> | null = null

async function sweepLegacyMedia() {
  const root = process.env.ERASER_DESKTOP_DATA_DIR
  const bucket = localBucket()
  if (!root || !bucket) return
  const { readdir } = await import("node:fs/promises")
  const { join, relative, sep } = await import("node:path")
  const base = join(root, "objects")
  const keys: string[] = []
  async function walk(directory: string, depth: number) {
    if (depth > 5) return
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path, depth + 1)
      // Une copie de cache porte « @date » ; l'original n'a pas ce suffixe.
      else if (!entry.name.includes("@") && !entry.name.endsWith(".metadata.json")) keys.push(relative(base, path).split(sep).join("/"))
    }
  }
  await walk(base, 0)
  for (const key of keys) {
    const pointer = await pointerFor(key).catch(() => undefined)
    if (pointer !== null) continue
    const legacy = await bucket.get(key).catch(() => null)
    if (!legacy) continue
    const bytes = legacy.body instanceof ArrayBuffer ? legacy.body : await new Response(legacy.body as BodyInit).arrayBuffer()
    await migrateLegacyMedia(key, bytes, legacy.httpMetadata?.contentType || "image/png")
  }
}

export function migrateLocalMediaOnce() {
  legacySweep ??= sweepLegacyMedia().catch((error) => {
    console.error("SHARED_MEDIA_SWEEP_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  })
  return legacySweep
}

