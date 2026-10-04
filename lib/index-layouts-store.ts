/**
 * Où vivent les mises en page des index (fiche et survol de chaque onglet) : sur le
 * serveur partagé de l'application (« eraser-accounts », `shared_records`), comme les
 * comptes. Ce sont des réglages d'Eraser, pas des données JDR : rien n'est écrit dans
 * Google Sheets, et toutes les installations voient les mêmes.
 *
 * Une entrée par onglet : portée « index-layouts », clé « index::onglet », valeur
 * `{ form, hover }` en JSON. Revenir à l'affichage automatique efface l'entrée.
 */
import { parseIndexLayout, type IndexLayout, type TabLayouts } from "@/lib/index-layouts"
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
