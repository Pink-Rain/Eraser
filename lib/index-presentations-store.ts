/**
 * Où vivent les présentations des onglets d'index (liste, kanban, maître-détail, calendrier,
 * tableau de bord, réglées dans « Modifier › Vues ») : sur le serveur partagé d'Eraser,
 * comme les cartes. Ce sont des réglages d'Eraser : rien n'est écrit dans Google Sheets, et
 * toutes les installations voient les mêmes.
 *
 * Une entrée par onglet : portée « index-presentations », clé « index::onglet », valeur
 * `{ kanban: {...}, calendar: {...} }` en JSON. Revenir aux réglages d'office efface l'entrée.
 */
import { cleanViewPreset, parseTabPresentations, type TabPresentations, type ViewLayout, type ViewPreset } from "@/lib/index-view-layouts"
import { cleanStats, type StatDefinition } from "@/lib/index-stats"
import { deleteSharedRecord, listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

const SCOPE = "index-presentations"
const SEPARATOR = "::"
const MAX_VALUE = 20_000

function recordKey(index: string, tab: string) {
  return `${index.trim()}${SEPARATOR}${tab.replace(/\s+/g, " ").trim()}`
}

let cache: { expiresAt: number; promise: Promise<Map<string, Record<string, TabPresentations>>> } | null = null

async function readAll() {
  const result = new Map<string, Record<string, TabPresentations>>()
  if (!sharedStoreAvailable()) return result
  for (const record of await listSharedRecords(SCOPE)) {
    const at = record.key.indexOf(SEPARATOR)
    if (at <= 0) continue
    const index = record.key.slice(0, at)
    const tab = record.key.slice(at + SEPARATOR.length)
    const parsed = parseTabPresentations(record.value)
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

/** Les présentations enregistrées d'un index, par onglet. Aucune sans serveur partagé. */
export async function listIndexPresentations(index: string): Promise<Record<string, TabPresentations>> {
  return (await all()).get(index.trim()) ?? {}
}

/** Enregistre les présentations d'onglets ; `null` : l'onglet revient aux réglages d'office. */
export async function saveIndexPresentations(index: string, changes: Array<{ tab: string; presentations: TabPresentations | null }>) {
  if (!index.trim()) throw new Error("INDEX_PRESENTATIONS_INVALID")
  if (!sharedStoreAvailable()) throw new Error("INDEX_PRESENTATIONS_UNAVAILABLE")
  for (const change of changes.filter((item) => item.tab.trim()).slice(0, 100)) {
    const key = recordKey(index, change.tab)
    const clean = change.presentations ? parseTabPresentations(change.presentations) : null
    if (!clean || !Object.keys(clean).length) { await deleteSharedRecord(SCOPE, key); continue }
    const value = JSON.stringify(clean)
    if (value.length > MAX_VALUE) throw new Error("INDEX_PRESENTATIONS_TOO_LARGE")
    await writeSharedRecord(SCOPE, key, value)
  }
  return (await all(true)).get(index.trim()) ?? {}
}

// ---------- Presets de vues (communs à tous les index) ----------

const PRESET_SCOPE = "index-view-presets"

export async function listViewPresets(): Promise<ViewPreset[]> {
  if (!sharedStoreAvailable()) return []
  return (await listSharedRecords(PRESET_SCOPE))
    .flatMap((record) => {
      let parsed: unknown = null
      try { parsed = JSON.parse(record.value) } catch { return [] }
      const preset = cleanViewPreset({ ...(parsed && typeof parsed === "object" ? parsed : {}), id: record.key, updatedAt: record.updatedAt })
      return preset ? [preset] : []
    })
    .sort((left, right) => left.name.localeCompare(right.name, "fr"))
}

/** Enregistre un preset de vue (nouveau, ou remplacé s'il a déjà cet `id`) ; rend son identifiant. */
export async function saveViewPreset(input: { id?: string; name: string; layout: ViewLayout | null }) {
  if (!sharedStoreAvailable()) throw new Error("INDEX_PRESENTATIONS_UNAVAILABLE")
  const name = input.name.replace(/\s+/g, " ").trim()
  if (!name || name.length > 60) throw new Error("INDEX_PRESET_NAME_INVALID")
  const clean = cleanViewPreset({ name, layout: input.layout })
  if (!clean) throw new Error("INDEX_PRESENTATIONS_INVALID")
  const id = input.id?.trim() && /^[A-Za-z0-9-]{4,40}$/.test(input.id.trim()) ? input.id.trim() : `VUE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const value = JSON.stringify({ name: clean.name, layout: clean.layout })
  if (value.length > MAX_VALUE) throw new Error("INDEX_PRESENTATIONS_TOO_LARGE")
  await writeSharedRecord(PRESET_SCOPE, id, value)
  return id
}

export async function deleteViewPreset(id: string) {
  if (!sharedStoreAvailable()) throw new Error("INDEX_PRESENTATIONS_UNAVAILABLE")
  await deleteSharedRecord(PRESET_SCOPE, id)
}

// ---------- Statistiques d'un index (Modifier › Stats ; l'onglet stat montre les épinglées) ----------

const STATS_SCOPE = "index-stats"

export async function listIndexStats(index: string): Promise<StatDefinition[]> {
  if (!sharedStoreAvailable() || !index.trim()) return []
  const record = (await listSharedRecords(STATS_SCOPE)).find((entry) => entry.key === index.trim())
  if (!record) return []
  try { return cleanStats((JSON.parse(record.value) as { stats?: unknown }).stats) } catch { return [] }
}

/** Enregistre toutes les statistiques d'un index (une liste vide efface l'entrée). */
export async function saveIndexStats(index: string, stats: unknown) {
  if (!index.trim()) throw new Error("INDEX_PRESENTATIONS_INVALID")
  if (!sharedStoreAvailable()) throw new Error("INDEX_PRESENTATIONS_UNAVAILABLE")
  const clean = cleanStats(stats)
  if (!clean.length) { await deleteSharedRecord(STATS_SCOPE, index.trim()); return [] }
  const value = JSON.stringify({ stats: clean })
  if (value.length > MAX_VALUE) throw new Error("INDEX_STATS_TOO_LARGE")
  await writeSharedRecord(STATS_SCOPE, index.trim(), value)
  return clean
}
