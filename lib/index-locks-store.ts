/**
 * Où vivent les cadenas des colonnes (« Modifier » › Colonnes) : sur le serveur partagé de
 * l'application (« eraser-accounts », `shared_records`), comme les mises en page. Une entrée
 * par onglet : portée « index-locks », clé « index::onglet », valeur `{ colonne: réglage }` en
 * JSON. Plus aucun réglage dans l'onglet : l'entrée est effacée.
 */
import { cleanTabLocks, tabLocksOf, type TabLocks } from "@/lib/index-locks"

// Règle pure, gardée ici pour les lecteurs du serveur ; la page l'importe de lib/index-locks.
export { tabLocksOf }
import { deleteSharedRecord, listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

const SCOPE = "index-locks"
const SEPARATOR = "::"
const MAX_VALUE = 20_000

function recordKey(index: string, tab: string) {
  return `${index.trim()}${SEPARATOR}${tab.replace(/\s+/g, " ").trim()}`
}

let cache: { expiresAt: number; promise: Promise<Map<string, Record<string, TabLocks>>> } | null = null

async function readAll() {
  const result = new Map<string, Record<string, TabLocks>>()
  if (!sharedStoreAvailable()) return result
  for (const record of await listSharedRecords(SCOPE)) {
    const at = record.key.indexOf(SEPARATOR)
    if (at <= 0) continue
    const index = record.key.slice(0, at)
    const tab = record.key.slice(at + SEPARATOR.length)
    const locks = cleanTabLocks(record.value)
    if (!tab || !locks) continue
    const entry = result.get(index) ?? {}
    entry[tab] = locks
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

/** Les cadenas réglés d'un index, par onglet. Aucun sans serveur partagé (ou s'il ne répond pas). */
export async function listIndexLocks(index: string): Promise<Record<string, TabLocks>> {
  try { return (await all()).get(index.trim()) ?? {} } catch { return {} }
}

/** Enregistre les cadenas d'onglets d'un index ; `null` : plus aucun réglage dans l'onglet. */
export async function saveIndexLocks(index: string, changes: Array<{ tab: string; locks: TabLocks | null }>) {
  if (!index.trim()) throw new Error("INDEX_LOCKS_INVALID")
  if (!sharedStoreAvailable()) throw new Error("INDEX_LOCKS_UNAVAILABLE")
  for (const change of changes.filter((item) => item.tab.trim()).slice(0, 100)) {
    const key = recordKey(index, change.tab)
    const clean = change.locks ? cleanTabLocks(change.locks) : null
    if (!clean) { await deleteSharedRecord(SCOPE, key); continue }
    const value = JSON.stringify(clean)
    if (value.length > MAX_VALUE) throw new Error("INDEX_LOCKS_TOO_LARGE")
    await writeSharedRecord(SCOPE, key, value)
  }
  return (await all(true)).get(index.trim()) ?? {}
}

