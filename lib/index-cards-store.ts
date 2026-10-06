/**
 * Où vivent les cartes des index : sur le serveur partagé de l'application
 * (« eraser-accounts », `shared_records`), comme les mises en page. Ce sont des réglages
 * d'Eraser, pas des données JDR : rien n'est écrit dans Google Sheets, et toutes les
 * installations voient les mêmes.
 *
 * Une entrée par onglet : portée « index-cards », clé « index::onglet », valeur
 * `{ cards, defaultId }` en JSON. Une liste vide reste enregistrée (les cartes d'office
 * ont été retirées) ; « Revenir aux cartes d'Eraser » efface l'entrée.
 *
 * Les presets de cartes : portée « index-card-presets », une entrée par preset.
 */
import { parseCardTemplate, parseTabCards, type CardPreset, type CardTemplate, type TabCards } from "@/lib/index-cards"
import { deleteSharedRecord, listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

const SCOPE = "index-cards"
const PRESET_SCOPE = "index-card-presets"
const SEPARATOR = "::"
/** La limite d'une valeur du serveur partagé. */
const MAX_VALUE = 20_000

function recordKey(index: string, tab: string) {
  return `${index.trim()}${SEPARATOR}${tab.replace(/\s+/g, " ").trim()}`
}

let cache: { expiresAt: number; promise: Promise<Map<string, Record<string, TabCards>>> } | null = null

async function readAll() {
  const result = new Map<string, Record<string, TabCards>>()
  if (!sharedStoreAvailable()) return result
  for (const record of await listSharedRecords(SCOPE)) {
    const at = record.key.indexOf(SEPARATOR)
    if (at <= 0) continue
    const index = record.key.slice(0, at)
    const tab = record.key.slice(at + SEPARATOR.length)
    const parsed = parseTabCards(record.value)
    if (!tab || !parsed) continue
    const entry = result.get(index) ?? {}
    entry[tab] = parsed
    result.set(index, entry)
  }
  return result
}

function all(fresh = false) {
  if (!fresh && cache && cache.expiresAt > Date.now()) return cache.promise
  const promise = readAll()
  cache = { expiresAt: Date.now() + 30_000, promise }
  promise.catch(() => { if (cache?.promise === promise) cache = null })
  return promise
}

/** Les cartes enregistrées d'un index, par onglet. Aucune sans serveur partagé. */
export async function listIndexCards(index: string): Promise<Record<string, TabCards>> {
  return (await all()).get(index.trim()) ?? {}
}

/**
 * Enregistre les cartes d'onglets d'un index. `null` : l'onglet revient aux cartes
 * d'Eraser (l'entrée est effacée).
 */
export async function saveIndexCards(index: string, changes: Array<{ tab: string; cards: TabCards | null }>) {
  if (!index.trim()) throw new Error("INDEX_CARDS_INVALID")
  if (!sharedStoreAvailable()) throw new Error("INDEX_CARDS_UNAVAILABLE")
  for (const change of changes.filter((item) => item.tab.trim()).slice(0, 100)) {
    const key = recordKey(index, change.tab)
    if (!change.cards) { await deleteSharedRecord(SCOPE, key); continue }
    const clean = parseTabCards(change.cards)
    if (!clean) throw new Error("INDEX_CARDS_INVALID")
    const value = JSON.stringify(clean)
    if (value.length > MAX_VALUE) throw new Error("INDEX_CARDS_TOO_LARGE")
    await writeSharedRecord(SCOPE, key, value)
  }
  return (await all(true)).get(index.trim()) ?? {}
}

// ---------- Presets de cartes ----------

function presetOf(id: string, value: string, updatedAt: string): CardPreset | null {
  let parsed: { name?: unknown; card?: unknown } = {}
  try { parsed = JSON.parse(value) as typeof parsed } catch { return null }
  const name = typeof parsed.name === "string" ? parsed.name.replace(/\s+/g, " ").trim().slice(0, 60) : ""
  const card = parseCardTemplate(parsed.card)
  if (!name || !card) return null
  return { id, name, card, updatedAt }
}

export async function listCardPresets(): Promise<CardPreset[]> {
  if (!sharedStoreAvailable()) return []
  return (await listSharedRecords(PRESET_SCOPE))
    .flatMap((record) => { const preset = presetOf(record.key, record.value, record.updatedAt); return preset ? [preset] : [] })
    .sort((left, right) => left.name.localeCompare(right.name, "fr"))
}

/** Enregistre un preset (nouveau, ou remplacé s'il a déjà cet `id`) ; rend son identifiant. */
export async function saveCardPreset(input: { id?: string; name: string; card: CardTemplate | null }) {
  if (!sharedStoreAvailable()) throw new Error("INDEX_CARDS_UNAVAILABLE")
  const name = input.name.replace(/\s+/g, " ").trim()
  if (!name || name.length > 60) throw new Error("INDEX_PRESET_NAME_INVALID")
  const card = input.card ? parseCardTemplate(input.card) : null
  if (!card) throw new Error("INDEX_CARDS_INVALID")
  const id = input.id?.trim() && /^[A-Za-z0-9-]{4,40}$/.test(input.id.trim()) ? input.id.trim() : `CAR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const value = JSON.stringify({ name, card })
  if (value.length > MAX_VALUE) throw new Error("INDEX_CARDS_TOO_LARGE")
  await writeSharedRecord(PRESET_SCOPE, id, value)
  return id
}

export async function deleteCardPreset(id: string) {
  if (!sharedStoreAvailable()) throw new Error("INDEX_CARDS_UNAVAILABLE")
  await deleteSharedRecord(PRESET_SCOPE, id)
}
