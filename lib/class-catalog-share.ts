import type { ClassSpell } from "@/lib/class-content"
import type { ClassRecord } from "@/lib/google-sheets"
import { deleteSharedRecord, listSharedRecords, readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

/**
 * Les classes et leurs sorts, tels que la dernière installation les a lus dans Google
 * Sheets, gardés aussi sur le serveur partagé d'Eraser.
 *
 * Toutes les installations lisent Google avec le même compte, donc le même quota (environ
 * 60 lectures par minute pour tout le groupe). Un joueur dont l'installation est neuve
 * devait lire les deux classeurs dans Google avant de voir la moindre classe : à cinq
 * autour de la table, le quota était épuisé et personne ne voyait rien. Désormais, une
 * installation qui n'a encore rien en mémoire prend cette copie (une seule requête, hors
 * quota Google) puis relit Google en arrière-plan, quand il a de la place.
 *
 * Google Sheets reste la source : cette copie n'est qu'un cache, remplacé à chaque lecture
 * de Google plus récente que lui, et jamais utilisé pour écrire.
 */
export type SharedClassCatalog = { classes: ClassRecord[]; spells: ClassSpell[]; readAt: string }

const SCOPE = "class-catalog"
const MANIFEST = "manifest"
/** Le serveur partagé refuse une valeur de plus de 20 000 caractères : la copie est découpée. */
const PART_SIZE = 18_000
const MAX_PARTS = 80
/** Une image collée en entier dans la case (data:…) alourdirait la copie : seule l'adresse courte voyage. */
const MAX_IMAGE_LENGTH = 4_000

type Manifest = { version: 1; hash: string; parts: number; readAt: string }

let memory: { value: SharedClassCatalog | null; expiresAt: number } | null = null
let reading: Promise<SharedClassCatalog | null> | null = null
/** La copie que cette installation sait déjà être sur le serveur partagé. */
let knownHash = ""
let knownReadAt = ""
let publishing: Promise<void> | null = null

function parseManifest(value: string | undefined): Manifest | null {
  try {
    const parsed = JSON.parse(value ?? "") as Partial<Manifest>
    if (parsed.version !== 1 || typeof parsed.hash !== "string" || typeof parsed.parts !== "number" || typeof parsed.readAt !== "string") return null
    return parsed as Manifest
  } catch {
    return null
  }
}

async function loadShared(): Promise<SharedClassCatalog | null> {
  const records = await listSharedRecords(SCOPE)
  const manifest = parseManifest(records.find((record) => record.key === MANIFEST)?.value)
  if (!manifest || manifest.parts < 1 || manifest.parts > MAX_PARTS) return null
  const byKey = new Map(records.map((record) => [record.key, record.value]))
  const parts: string[] = []
  for (let index = 0; index < manifest.parts; index += 1) {
    const part = byKey.get(`part:${manifest.hash}:${index}`)
    // Une copie en cours de remplacement : on ne l'assemble pas à moitié.
    if (part === undefined) return null
    parts.push(part)
  }
  const parsed = JSON.parse(parts.join("")) as Partial<SharedClassCatalog>
  if (!Array.isArray(parsed.classes) || !Array.isArray(parsed.spells) || !parsed.classes.length) return null
  knownHash = manifest.hash
  knownReadAt = manifest.readAt
  return { classes: parsed.classes, spells: parsed.spells, readAt: manifest.readAt }
}

/** La copie partagée, ou null (aucune, illisible, serveur partagé absent). Gardée une minute. */
export async function sharedClassCatalog(): Promise<SharedClassCatalog | null> {
  if (!sharedStoreAvailable()) return null
  if (memory && memory.expiresAt > Date.now()) return memory.value
  if (!reading) {
    reading = loadShared()
      .catch((error) => {
        console.error("SHARED_CLASS_CATALOG_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
        return null
      })
      .then((value) => {
        memory = { value, expiresAt: Date.now() + (value ? 60_000 : 20_000) }
        return value
      })
      .finally(() => { reading = null })
  }
  return reading
}

async function digest(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))
  return [...bytes.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function publish(catalog: SharedClassCatalog) {
  const serialized = JSON.stringify({
    classes: catalog.classes.map((item) => item.image.length > MAX_IMAGE_LENGTH ? { ...item, image: "" } : item),
    spells: catalog.spells,
  })
  const hash = await digest(serialized)
  if (hash === knownHash) return
  const parts = Math.ceil(serialized.length / PART_SIZE)
  if (parts > MAX_PARTS) return
  // Une lecture plus récente a déjà été partagée par une autre installation : on ne la remplace pas.
  const current = parseManifest((await readSharedRecord(SCOPE, MANIFEST))?.value)
  if (current && (current.hash === hash || current.readAt >= catalog.readAt)) {
    knownHash = current.hash
    knownReadAt = current.readAt
    return
  }
  // Les morceaux d'abord, l'annonce ensuite : une installation qui lit entre les deux garde l'ancienne copie.
  for (let index = 0; index < parts; index += 1) {
    await writeSharedRecord(SCOPE, `part:${hash}:${index}`, serialized.slice(index * PART_SIZE, (index + 1) * PART_SIZE))
  }
  const manifest: Manifest = { version: 1, hash, parts, readAt: catalog.readAt }
  await writeSharedRecord(SCOPE, MANIFEST, JSON.stringify(manifest))
  knownHash = hash
  knownReadAt = catalog.readAt
  memory = { value: { ...catalog }, expiresAt: Date.now() + 60_000 }
  // Les anciennes copies, une fois que plus personne ne peut être en train de les lire.
  const records = await listSharedRecords(SCOPE).catch(() => [])
  const old = records.filter((record) => record.key.startsWith("part:") && !record.key.startsWith(`part:${hash}:`) && Date.now() - Date.parse(record.updatedAt) > 10 * 60_000)
  await Promise.all(old.map((record) => deleteSharedRecord(SCOPE, record.key).catch(() => undefined)))
}

/**
 * Partage ce qui vient d'être lu dans Google (sorts dotés d'un ID réel seulement). Ne fait
 * jamais échouer la lecture : au pire, la copie partagée reste l'ancienne.
 */
export function shareClassCatalog(catalog: SharedClassCatalog) {
  if (!sharedStoreAvailable() || !catalog.classes.length) return Promise.resolve()
  if (knownReadAt && knownReadAt >= catalog.readAt) return Promise.resolve()
  if (publishing) return publishing
  publishing = publish(catalog)
    .catch((error) => console.error("SHARED_CLASS_CATALOG_WRITE_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR"))
    .finally(() => { publishing = null })
  return publishing
}
