import type { ClassSpell } from "@/lib/class-content"
import type { ClassRecord } from "@/lib/google-sheets"
import type { RankBonusTable } from "@/lib/rank-bonuses"
import { deleteSharedRecord, listSharedRecords, readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

/**
 * Ce que la dernière installation a lu dans Google Sheets (classes et sorts, bonus de rang),
 * gardé aussi sur le serveur partagé d'Eraser.
 *
 * Toutes les installations lisent Google avec le même compte, donc le même quota (environ
 * 60 lectures par minute pour tout le groupe). Un joueur dont l'installation est neuve
 * devait lire les classeurs dans Google avant de voir la moindre classe : à cinq autour de
 * la table, le quota était épuisé et personne ne voyait rien. Désormais, une installation
 * qui n'a encore rien en mémoire, ou à qui Google refuse, prend cette copie (une seule
 * requête, hors quota Google) puis relit Google en arrière-plan, quand il a de la place.
 *
 * Google Sheets reste la source : cette copie n'est qu'un cache, remplacé à chaque lecture
 * de Google plus récente que lui, et jamais utilisé pour écrire.
 */
export type SharedClassCatalog = { classes: ClassRecord[]; spells: ClassSpell[]; readAt: string }
export type SharedRankBonuses = { table: RankBonusTable; readAt: string }

const MANIFEST = "manifest"
/** Le serveur partagé refuse une valeur de plus de 20 000 caractères : la copie est découpée. */
const PART_SIZE = 18_000
const MAX_PARTS = 80
/** Une image collée en entier dans la case (data:…) alourdirait la copie : seule l'adresse courte voyage. */
const MAX_IMAGE_LENGTH = 4_000

type Manifest = { version: 1; hash: string; parts: number; readAt: string }

function parseManifest(value: string | undefined): Manifest | null {
  try {
    const parsed = JSON.parse(value ?? "") as Partial<Manifest>
    if (parsed.version !== 1 || typeof parsed.hash !== "string" || typeof parsed.parts !== "number" || typeof parsed.readAt !== "string") return null
    return parsed as Manifest
  } catch {
    return null
  }
}

async function digest(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))
  return [...bytes.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Une copie partagée, rangée dans sa propre portée du serveur partagé : une annonce
 * (`manifest`) et ses morceaux (`part:<empreinte>:<n>`). `decode` valide ce qui est relu
 * (null : copie inutilisable) ; `encode` choisit ce qui voyage.
 */
function sharedSnapshot<T extends { readAt: string }>(name: string, scope: string, options: { encode: (value: T) => unknown; decode: (parsed: unknown, readAt: string) => T | null }) {
  let memory: { value: T | null; expiresAt: number } | null = null
  let reading: Promise<T | null> | null = null
  /** La copie que cette installation sait déjà être sur le serveur partagé. */
  let knownHash = ""
  let knownReadAt = ""
  let publishing: Promise<void> | null = null

  async function load(): Promise<T | null> {
    const records = await listSharedRecords(scope)
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
    const value = options.decode(JSON.parse(parts.join("")), manifest.readAt)
    if (!value) return null
    knownHash = manifest.hash
    knownReadAt = manifest.readAt
    return value
  }

  /** La copie partagée, ou null (aucune, illisible, serveur partagé absent). Gardée une minute. */
  function read(): Promise<T | null> {
    if (!sharedStoreAvailable()) return Promise.resolve(null)
    if (memory && memory.expiresAt > Date.now()) return Promise.resolve(memory.value)
    if (!reading) {
      reading = load()
        .catch((error) => {
          console.error(`SHARED_${name}_READ_FAILED`, error instanceof Error ? error.message : "UNKNOWN_ERROR")
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

  async function publish(value: T) {
    const serialized = JSON.stringify(options.encode(value))
    const hash = await digest(serialized)
    if (hash === knownHash) return
    const parts = Math.ceil(serialized.length / PART_SIZE)
    if (parts > MAX_PARTS) return
    // Une lecture plus récente a déjà été partagée par une autre installation : on ne la remplace pas.
    const current = parseManifest((await readSharedRecord(scope, MANIFEST))?.value)
    if (current && (current.hash === hash || current.readAt >= value.readAt)) {
      knownHash = current.hash
      knownReadAt = current.readAt
      return
    }
    // Les morceaux d'abord, l'annonce ensuite : une installation qui lit entre les deux garde l'ancienne copie.
    for (let index = 0; index < parts; index += 1) {
      await writeSharedRecord(scope, `part:${hash}:${index}`, serialized.slice(index * PART_SIZE, (index + 1) * PART_SIZE))
    }
    const manifest: Manifest = { version: 1, hash, parts, readAt: value.readAt }
    await writeSharedRecord(scope, MANIFEST, JSON.stringify(manifest))
    knownHash = hash
    knownReadAt = value.readAt
    memory = { value, expiresAt: Date.now() + 60_000 }
    // Les anciennes copies, une fois que plus personne ne peut être en train de les lire.
    const records = await listSharedRecords(scope).catch(() => [])
    const old = records.filter((record) => record.key.startsWith("part:") && !record.key.startsWith(`part:${hash}:`) && Date.now() - Date.parse(record.updatedAt) > 10 * 60_000)
    await Promise.all(old.map((record) => deleteSharedRecord(scope, record.key).catch(() => undefined)))
  }

  /** Partage ce qui vient d'être lu dans Google. Ne fait jamais échouer la lecture. */
  function share(value: T) {
    if (!sharedStoreAvailable()) return Promise.resolve()
    if (knownReadAt && knownReadAt >= value.readAt) return Promise.resolve()
    if (publishing) return publishing
    publishing = publish(value)
      .catch((error) => console.error(`SHARED_${name}_WRITE_FAILED`, error instanceof Error ? error.message : "UNKNOWN_ERROR"))
      .finally(() => { publishing = null })
    return publishing
  }

  return { read, share }
}

const classCatalog = sharedSnapshot<SharedClassCatalog>("CLASS_CATALOG", "class-catalog", {
  encode: (catalog) => ({
    classes: catalog.classes.map((item) => item.image.length > MAX_IMAGE_LENGTH ? { ...item, image: "" } : item),
    spells: catalog.spells,
  }),
  decode: (parsed, readAt) => {
    const value = parsed as Partial<SharedClassCatalog>
    if (!Array.isArray(value.classes) || !Array.isArray(value.spells) || !value.classes.length) return null
    return { classes: value.classes, spells: value.spells, readAt }
  },
})

const rankBonuses = sharedSnapshot<SharedRankBonuses>("RANK_BONUSES", "rank-bonuses", {
  encode: ({ table }) => ({ table }),
  decode: (parsed, readAt) => {
    const table = (parsed as { table?: Partial<RankBonusTable> }).table
    if (!table || !Array.isArray(table.bonuses) || !Array.isArray(table.headers) || !table.bonuses.length) return null
    return { table: { bonuses: table.bonuses, headers: table.headers, ...(Array.isArray(table.rows) ? { rows: table.rows } : {}), sheetUrl: String(table.sheetUrl ?? ""), exists: true }, readAt }
  },
})

/** Les classes et leurs sorts partagés, ou null. */
export function sharedClassCatalog() {
  return classCatalog.read()
}

/** Partage les classes et sorts lus dans Google (sorts dotés d'un ID réel seulement). */
export function shareClassCatalog(catalog: SharedClassCatalog) {
  if (!catalog.classes.length) return Promise.resolve()
  return classCatalog.share(catalog)
}

/** Les bonus de rang partagés, ou null. */
export async function sharedRankBonuses() {
  return (await rankBonuses.read())?.table ?? null
}

/** Partage les bonus de rang lus dans Google (un tableau vide ne remplace jamais une copie). */
export function shareRankBonuses(table: RankBonusTable, readAt: string) {
  if (!table.exists || !table.bonuses.length) return Promise.resolve()
  return rankBonuses.share({ table, readAt })
}
