/**
 * Où vit le menu modifié : sur le serveur partagé d'Eraser (portée « app-menu »), une seule
 * entrée « layout » pour toute la table — jamais dans Google Sheets. « Rétablir le menu
 * d'Eraser » efface cette entrée après l'avoir recopiée dans « layout-precedent » : un clic
 * la remet.
 *
 * La coque lit le menu à chaque page : il est gardé trente secondes en mémoire (une lecture du
 * serveur partagé, aucune de Google), et relu aussitôt après un enregistrement.
 */
import { withAsyncLock } from "@/lib/async-lock"
import { cleanMenuItems, keepAdminEntries, parseMenuLayout, type MenuLayout } from "@/lib/app-menu"
import { deleteChunked, PageStoreError, readChunked, writeChunked } from "@/lib/custom-pages-store"
import { sharedStoreAvailable } from "@/lib/shared-store"

export const MENU_SCOPE = "app-menu"
const KEY = "layout"
const PREVIOUS = "layout-precedent"

let cache: { expiresAt: number; promise: Promise<MenuLayout | null> } | null = null

async function read(key: string) {
  if (!sharedStoreAvailable()) return null
  const value = await readChunked(MENU_SCOPE, key)
  return value ? parseMenuLayout(value) : null
}

/** Le menu enregistré (`null` : le menu d'Eraser). */
export function readMenuLayout(options: { fresh?: boolean } = {}) {
  if (!options.fresh && cache && cache.expiresAt > Date.now()) return cache.promise
  const promise = read(KEY)
  cache = { expiresAt: Date.now() + 30_000, promise }
  promise.catch(() => { if (cache?.promise === promise) cache = null })
  return promise
}

export async function hasPreviousMenu() {
  return Boolean(await read(PREVIOUS).catch(() => null))
}

const unavailable = () => new PageStoreError("APP_MENU_UNAVAILABLE", "Le menu se garde sur le serveur partagé d’Eraser, qui n’est pas configuré ici.", 503)

/** Enregistre le menu ; refusé si quelqu'un l'a changé depuis `base` (sa date). */
export function saveMenuLayout(items: unknown, base: string, by: string, options: { admin: boolean } = { admin: true }) {
  if (!sharedStoreAvailable()) return Promise.reject(unavailable())
  return withAsyncLock("app-menu", async () => {
    const current = await read(KEY)
    if ((current?.updatedAt ?? "") !== base) throw new PageStoreError("APP_MENU_CHANGED", `Le menu a été modifié entre-temps${current?.updatedBy ? ` par ${current.updatedBy}` : ""}. Recharge l’éditeur pour voir sa dernière version.`, 409)
    const clean = cleanMenuItems(items)
    const layout: MenuLayout = { items: options.admin ? clean : keepAdminEntries(clean, current?.items), updatedAt: new Date().toISOString(), updatedBy: by }
    await writeChunked(MENU_SCOPE, KEY, JSON.stringify(layout))
    cache = { expiresAt: Date.now() + 30_000, promise: Promise.resolve(layout) }
    return layout
  })
}

/** « Rétablir le menu d'Eraser » : le réglage est gardé de côté, puis effacé. */
export function resetMenuLayout() {
  if (!sharedStoreAvailable()) return Promise.reject(unavailable())
  return withAsyncLock("app-menu", async () => {
    const current = await read(KEY)
    if (current) await writeChunked(MENU_SCOPE, PREVIOUS, JSON.stringify(current))
    await deleteChunked(MENU_SCOPE, KEY)
    cache = { expiresAt: Date.now() + 30_000, promise: Promise.resolve(null) }
  })
}

/** Remet le réglage gardé de côté par « Rétablir le menu d'Eraser ». */
export function restorePreviousMenu(by: string) {
  if (!sharedStoreAvailable()) return Promise.reject(unavailable())
  return withAsyncLock("app-menu", async () => {
    const previous = await read(PREVIOUS)
    if (!previous) throw new PageStoreError("APP_MENU_NO_PREVIOUS", "Il n’y a pas de menu précédent à remettre.", 404)
    const layout: MenuLayout = { items: previous.items, updatedAt: new Date().toISOString(), updatedBy: by }
    await writeChunked(MENU_SCOPE, KEY, JSON.stringify(layout))
    await deleteChunked(MENU_SCOPE, PREVIOUS)
    cache = { expiresAt: Date.now() + 30_000, promise: Promise.resolve(layout) }
    return layout
  })
}
