import { cleanBackgroundKeywords, builtinBackgroundKeys, type BuiltinBackgroundKey, type DocumentLibraryBackground } from "@/lib/document-model"
import { getSharedMedia, putSharedMedia } from "@/lib/shared-media"
import { deleteSharedRecord, listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

/**
 * La bibliothèque des fonds de documents : les fonds qu'un administrateur ajoute (roue de réglages
 * d'Eraser Doc, Administration › Extensions), avec leur nom et leurs mots-clés, et les mots-clés
 * des fonds fournis. Partagée par toutes les campagnes et toutes les installations : la liste sur
 * le serveur partagé (portée `document-backgrounds` : une entrée par fond, et `fournis`), les
 * images dans Drive (`documents/fonds/<id>`).
 *
 * Un fond retiré quitte la liste, mais son image reste : les documents qui s'en servent gardent
 * leur fond.
 */

const SCOPE = "document-backgrounds"
const BUILTIN_KEY = "fournis"
const mediaKey = (id: string) => `documents/fonds/${id}`
const validId = (value: string) => /^[\w-]{1,80}$/.test(value)

/** Les mots-clés des fonds fournis tant qu'un administrateur ne les a pas changés. */
export const defaultBuiltinKeywords: Record<BuiltinBackgroundKey, string[]> = { parchemin: ["Parchemin"], rouleau: ["Rouleau"], livre: ["Livre"] }

export type DocumentBackgroundLibrary = { backgrounds: DocumentLibraryBackground[]; builtin: Record<BuiltinBackgroundKey, string[]> }

function backgroundOf(value: string): DocumentLibraryBackground | null {
  try {
    const raw = JSON.parse(value) as Record<string, unknown>
    const id = typeof raw.id === "string" && validId(raw.id) ? raw.id : ""
    if (!id || raw.hidden === true) return null
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : ""
    return { id, name: name || "Fond", keywords: cleanBackgroundKeywords(raw.keywords), updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "" }
  } catch { return null }
}

/** La bibliothèque : les fonds ajoutés (par nom), et les mots-clés des fonds fournis. */
export async function readDocumentBackgroundLibrary(): Promise<DocumentBackgroundLibrary> {
  const builtin = { ...defaultBuiltinKeywords }
  if (!sharedStoreAvailable()) return { backgrounds: [], builtin }
  const records = await listSharedRecords(SCOPE)
  const backgrounds: DocumentLibraryBackground[] = []
  for (const record of records) {
    if (record.key === BUILTIN_KEY) {
      try {
        const raw = JSON.parse(record.value) as Record<string, unknown>
        for (const key of builtinBackgroundKeys) if (Array.isArray(raw[key])) builtin[key] = cleanBackgroundKeywords(raw[key])
      } catch { /* illisibles : ceux d'office */ }
      continue
    }
    const background = backgroundOf(record.value)
    if (background) backgrounds.push(background)
  }
  backgrounds.sort((left, right) => left.name.localeCompare(right.name, "fr"))
  return { backgrounds, builtin }
}

function requireStore() {
  if (!sharedStoreAvailable()) throw new Error("SHARED_STORE_UNAVAILABLE")
}

/** Un fond ajouté : son image dans Drive d'abord, puis sa ligne dans la bibliothèque. */
export async function addDocumentBackground(input: { name: unknown; keywords: unknown }, image: File) {
  requireStore()
  if (!/^image\//.test(image.type) || image.size <= 0 || image.size > 15 * 1024 * 1024) throw new Error("INVALID_BACKGROUND_FILE")
  const id = crypto.randomUUID()
  await putSharedMedia(mediaKey(id), await image.arrayBuffer(), image.type)
  const background: DocumentLibraryBackground = {
    id,
    name: (typeof input.name === "string" ? input.name.trim().slice(0, 80) : "") || "Fond",
    keywords: cleanBackgroundKeywords(input.keywords),
    updatedAt: new Date().toISOString(),
  }
  await writeSharedRecord(SCOPE, id, JSON.stringify(background))
  return background
}

/** Le nom et les mots-clés d'un fond ajouté. */
export async function updateDocumentBackground(id: string, change: { name?: unknown; keywords?: unknown }) {
  requireStore()
  const current = (await readDocumentBackgroundLibrary()).backgrounds.find((background) => background.id === id)
  if (!current) throw new Error("BACKGROUND_NOT_FOUND")
  const next: DocumentLibraryBackground = {
    ...current,
    ...(typeof change.name === "string" ? { name: change.name.trim().slice(0, 80) || current.name } : {}),
    ...(change.keywords !== undefined ? { keywords: cleanBackgroundKeywords(change.keywords) } : {}),
    updatedAt: new Date().toISOString(),
  }
  await writeSharedRecord(SCOPE, id, JSON.stringify(next))
  return next
}

/** Retire un fond de la bibliothèque ; son image reste pour les documents qui s'en servent. */
export async function removeDocumentBackground(id: string) {
  requireStore()
  if (!validId(id) || id === BUILTIN_KEY) throw new Error("BACKGROUND_NOT_FOUND")
  await deleteSharedRecord(SCOPE, id)
}

/** Les mots-clés des fonds fournis (ceux qui ne sont pas donnés restent comme avant). */
export async function setBuiltinBackgroundKeywords(change: Record<string, unknown>) {
  requireStore()
  const { builtin } = await readDocumentBackgroundLibrary()
  for (const key of builtinBackgroundKeys) if (change[key] !== undefined) builtin[key] = cleanBackgroundKeywords(change[key])
  await writeSharedRecord(SCOPE, BUILTIN_KEY, JSON.stringify(builtin))
  return builtin
}

export async function readDocumentBackgroundImage(id: string) {
  return validId(id) ? getSharedMedia(mediaKey(id)) : null
}
