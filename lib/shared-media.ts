import { env } from "cloudflare:workers"

import {
  downloadDriveFile,
  ensureDriveFolder,
  findDriveFileByName,
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

async function folderId() {
  if (!mediaFolderId) {
    mediaFolderId = ensureDriveFolder(MEDIA_FOLDER).catch((error) => {
      mediaFolderId = null
      throw error
    })
  }
  return mediaFolderId
}

async function pointerFor(key: string) {
  const cached = pointerCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.pointer
  const file = await findDriveFileByName(await folderId(), driveName(key))
  const pointer: MediaPointer | null = file
    ? { fileId: file.id, modifiedTime: file.modifiedTime || "", contentType: file.mimeType || "image/*" }
    : null
  pointerCache.set(key, { expiresAt: Date.now() + POINTER_TTL_MS, pointer })
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
  if (bucket) {
    await bucket.put(cacheKey(key, pointer.modifiedTime), bytes, { httpMetadata: { contentType } }).catch(() => undefined)
  }
  return pointer
}

export async function getSharedMedia(key: string) {
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
  if (!pointer) void migrateLegacyMedia(key, legacy)
  return legacy
}

type LegacyObject = { body: unknown; httpMetadata?: { contentType?: string } }

async function migrateLegacyMedia(key: string, legacy: LegacyObject) {
  try {
    const bytes = legacy.body instanceof ArrayBuffer
      ? legacy.body
      : await new Response(legacy.body as BodyInit).arrayBuffer()
    await putSharedMedia(key, bytes, legacy.httpMetadata?.contentType || "image/png")
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
