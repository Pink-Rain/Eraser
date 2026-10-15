/**
 * Où vivent les vues enregistrées des index (roadmap « Vues des index », D3) : sur le serveur
 * partagé d'Eraser, comme les présentations et les cartes, jamais dans Google Sheets. Toutes
 * les installations voient les mêmes.
 *
 * Une entrée par vue (le serveur partagé garde 20 000 caractères par entrée) : portée
 * « index-saved-views », clé « index::identifiant », valeur la vue en JSON, ou la marque d'une
 * vue retirée. Les onglets-fenêtres de la feuille « Eraser · Réglages des index » restent lus
 * et ne sont jamais modifiés ici : `mergeSavedViews` les réunit aux vues enregistrées.
 */
import { cleanSavedView, cleanStoredSavedView, mergeSavedViews, remapSavedViewSources, type SavedView, type StoredSavedView } from "@/lib/index-saved-views"
import type { IndexWindow } from "@/lib/index-windows"
import { deleteSharedRecord, listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

const SCOPE = "index-saved-views"
const SEPARATOR = "::"
const MAX_VALUE = 20_000

function recordKey(index: string, id: string) {
  return `${index.trim()}${SEPARATOR}${id}`
}

let cache: { expiresAt: number; promise: Promise<Map<string, StoredSavedView[]>> } | null = null

async function readAll() {
  const result = new Map<string, StoredSavedView[]>()
  if (!sharedStoreAvailable()) return result
  for (const record of await listSharedRecords(SCOPE)) {
    const at = record.key.indexOf(SEPARATOR)
    if (at <= 0) continue
    const index = record.key.slice(0, at)
    let parsed: unknown = null
    try { parsed = JSON.parse(record.value) } catch { continue }
    const entry = cleanStoredSavedView(parsed)
    // Une entrée rangée sous un autre index que le sien, ou sous un autre identifiant, est écartée.
    if (!entry || entry.id !== record.key.slice(at + SEPARATOR.length) || ("index" in entry && entry.index !== index)) continue
    result.set(index, [...(result.get(index) ?? []), entry])
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

/** Ce que le serveur partagé garde pour un index (vues et retraits). Rien sans serveur partagé. */
export async function listStoredSavedViews(index: string, fresh = false): Promise<StoredSavedView[]> {
  return (await all(fresh)).get(index.trim()) ?? []
}

/**
 * Les vues d'un index : celles enregistrées, et les onglets-fenêtres de la feuille (déjà lus par
 * l'appelant, aucune lecture Google de plus). Un serveur partagé injoignable est une erreur, pas
 * un repli silencieux sur les seuls onglets-fenêtres.
 */
export async function listIndexSavedViews(index: string, windows: IndexWindow[]): Promise<SavedView[]> {
  return mergeSavedViews(await listStoredSavedViews(index), windows.filter((tabWindow) => tabWindow.index === index.trim()))
}

/**
 * Enregistre une vue (nouvelle, ou celle de cet identifiant, onglet-fenêtre compris : elle le
 * remplace désormais à l'affichage, la feuille ne change pas). Une vue prévue par Eraser ne
 * s'enregistre pas. Rend la vue telle qu'enregistrée.
 */
export async function saveIndexSavedView(input: unknown): Promise<SavedView> {
  if (!sharedStoreAvailable()) throw new Error("INDEX_SAVED_VIEWS_UNAVAILABLE")
  const view = cleanSavedView(input)
  if (!view || view.builtin) throw new Error("INDEX_SAVED_VIEW_INVALID")
  const value = JSON.stringify(view)
  if (value.length > MAX_VALUE) throw new Error("INDEX_SAVED_VIEW_TOO_LARGE")
  await writeSharedRecord(SCOPE, recordKey(view.index, view.id), value)
  cache = null
  return view
}

/** Retire une vue : une marque reste, pour que l'onglet-fenêtre du même identifiant ne revienne pas. */
export async function removeIndexSavedView(index: string, id: string) {
  if (!sharedStoreAvailable()) throw new Error("INDEX_SAVED_VIEWS_UNAVAILABLE")
  const clean = cleanStoredSavedView({ id, removed: true })
  if (!index.trim() || !clean) throw new Error("INDEX_SAVED_VIEW_INVALID")
  await writeSharedRecord(SCOPE, recordKey(index, clean.id), JSON.stringify(clean))
  cache = null
}

/**
 * Le retour en arrière : efface tout ce que le serveur partagé garde pour un index. Ses vues
 * redeviennent exactement les onglets-fenêtres de la feuille, qui n'ont jamais été modifiés.
 */
export async function forgetIndexSavedViews(index: string) {
  if (!sharedStoreAvailable()) throw new Error("INDEX_SAVED_VIEWS_UNAVAILABLE")
  for (const entry of await listStoredSavedViews(index, true)) await deleteSharedRecord(SCOPE, recordKey(index, entry.id))
  cache = null
}

/** Les vues enregistrées d'un index qui suivent leurs tableaux (regroupement des index d'objets). */
export async function remapIndexSavedViewSources(index: string, mapping: Map<string, string>) {
  if (!sharedStoreAvailable()) return 0
  const views = (await listStoredSavedViews(index, true)).filter((entry): entry is SavedView => !("removed" in entry))
  const moved = remapSavedViewSources(views, mapping)
  for (const view of moved) await writeSharedRecord(SCOPE, recordKey(index, view.id), JSON.stringify(view))
  if (moved.length) cache = null
  return moved.length
}
