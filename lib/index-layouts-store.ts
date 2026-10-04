/**
 * Où vivent les mises en page des index (fiche et survol de chaque onglet) : sur le
 * serveur partagé de l'application (« eraser-accounts », `shared_records`), comme les
 * comptes. Ce sont des réglages d'Eraser, pas des données JDR : rien n'est écrit dans
 * Google Sheets, et toutes les installations voient les mêmes.
 *
 * Une entrée par onglet : portée « index-layouts », clé « index::onglet », valeur
 * `{ form, hover }` en JSON. Revenir à l'affichage automatique efface l'entrée.
 */
import { parseIndexLayout, type IndexLayout, type LayoutPreset, type TabLayouts } from "@/lib/index-layouts"
import { deleteSharedRecord, listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

const SCOPE = "index-layouts"
const SEPARATOR = "::"
/** La limite d'une valeur du serveur partagé. */
const MAX_VALUE = 20_000

function recordKey(index: string, tab: string) {
  return `${index.trim()}${SEPARATOR}${tab.replace(/\s+/g, " ").trim()}`
}

/**
 * Toutes les mises en page, gardées 30 secondes : le survol des références les lit à
 * chaque résolution. Un enregistrement d'ici les relit aussitôt.
 */
let cache: { expiresAt: number; promise: Promise<Map<string, Record<string, TabLayouts>>> } | null = null

async function readAll() {
  const result = new Map<string, Record<string, TabLayouts>>()
  if (!sharedStoreAvailable()) return result
  for (const record of await listSharedRecords(SCOPE)) {
    const at = record.key.indexOf(SEPARATOR)
    if (at <= 0) continue
    const index = record.key.slice(0, at)
    const tab = record.key.slice(at + SEPARATOR.length)
    let parsed: { form?: unknown; hover?: unknown } = {}
    try { parsed = JSON.parse(record.value) as typeof parsed } catch { continue }
    const form = parseIndexLayout(parsed.form)
    const hover = parseIndexLayout(parsed.hover)
    if (!tab || (!form && !hover)) continue
    const entry = result.get(index) ?? {}
    entry[tab] = { ...(form ? { form } : {}), ...(hover ? { hover } : {}) }
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

/** Les mises en page d'un index, par onglet. Aucune sans serveur partagé. */
export async function listIndexLayouts(index: string): Promise<Record<string, TabLayouts>> {
  return (await all()).get(index.trim()) ?? {}
}

/** Enregistre les mises en page d'onglets d'un index ; `null` partout : l'affichage automatique. */
export async function saveIndexLayouts(index: string, changes: Array<{ tab: string; form: IndexLayout | null; hover: IndexLayout | null }>) {
  if (!index.trim()) throw new Error("INDEX_LAYOUT_INVALID")
  if (!sharedStoreAvailable()) throw new Error("INDEX_LAYOUTS_UNAVAILABLE")
  for (const change of changes.filter((item) => item.tab.trim()).slice(0, 100)) {
    const key = recordKey(index, change.tab)
    if (!change.form && !change.hover) { await deleteSharedRecord(SCOPE, key); continue }
    const value = JSON.stringify({ ...(change.form ? { form: change.form } : {}), ...(change.hover ? { hover: change.hover } : {}) })
    if (value.length > MAX_VALUE) throw new Error("INDEX_LAYOUT_TOO_LARGE")
    await writeSharedRecord(SCOPE, key, value)
  }
  return (await all(true)).get(index.trim()) ?? {}
}

// ---------- Presets de mise en page ----------

/**
 * Les presets de mise en page : une fiche ou un survol enregistré sous un petit nom, pour
 * l'appliquer à d'autres onglets (tous les tableaux d'objets, par exemple). Communs à tous
 * les index, gardés sur le serveur partagé comme les mises en page : portée
 * « index-layout-presets », une entrée par preset.
 */
const PRESET_SCOPE = "index-layout-presets"


function presetOf(id: string, value: string, updatedAt: string): LayoutPreset | null {
  let parsed: { name?: unknown; kind?: unknown; layout?: unknown } = {}
  try { parsed = JSON.parse(value) as typeof parsed } catch { return null }
  const name = typeof parsed.name === "string" ? parsed.name.replace(/\s+/g, " ").trim().slice(0, 60) : ""
  const layout = parseIndexLayout(parsed.layout)
  if (!name || !layout || (parsed.kind !== "form" && parsed.kind !== "hover")) return null
  return { id, name, kind: parsed.kind, layout, updatedAt }
}

export async function listLayoutPresets(): Promise<LayoutPreset[]> {
  if (!sharedStoreAvailable()) return []
  return (await listSharedRecords(PRESET_SCOPE))
    .flatMap((record) => { const preset = presetOf(record.key, record.value, record.updatedAt); return preset ? [preset] : [] })
    .sort((left, right) => left.name.localeCompare(right.name, "fr"))
}

/** Enregistre un preset (nouveau, ou remplacé s'il a déjà cet `id`) ; rend son identifiant. */
export async function saveLayoutPreset(input: { id?: string; name: string; kind: "form" | "hover"; layout: IndexLayout | null }) {
  if (!sharedStoreAvailable()) throw new Error("INDEX_LAYOUTS_UNAVAILABLE")
  const name = input.name.replace(/\s+/g, " ").trim()
  if (!name || name.length > 60) throw new Error("INDEX_PRESET_NAME_INVALID")
  const layout = input.layout ? parseIndexLayout(input.layout) : null
  if (!layout) throw new Error("INDEX_LAYOUT_INVALID")
  const id = input.id?.trim() && /^[A-Za-z0-9-]{4,40}$/.test(input.id.trim()) ? input.id.trim() : `MEP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const value = JSON.stringify({ name, kind: input.kind, layout })
  if (value.length > MAX_VALUE) throw new Error("INDEX_LAYOUT_TOO_LARGE")
  await writeSharedRecord(PRESET_SCOPE, id, value)
  return id
}

export async function deleteLayoutPreset(id: string) {
  if (!sharedStoreAvailable()) throw new Error("INDEX_LAYOUTS_UNAVAILABLE")
  await deleteSharedRecord(PRESET_SCOPE, id)
}
