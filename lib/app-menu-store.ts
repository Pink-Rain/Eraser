/**
 * Où vit le menu modifié : sur le serveur partagé d'Eraser (portée « app-menu »), une seule
 * entrée « layout » pour toute la table — jamais dans Google Sheets. « Rétablir le menu
 * d'Eraser » efface cette entrée après l'avoir recopiée dans « layout-precedent » : un clic
 * la remet.
 *
 * La coque de chaque page (app/layout.tsx) n'attend jamais le serveur partagé : elle prend
 * la copie en mémoire (`knownMenuLayout`, le menu d'Eraser tant que rien n'a été lu), qui
 * suit chaque enregistrement fait sur cette installation et se relit en arrière-plan au plus
 * toutes les soixante secondes. L'éditeur du menu, lui, lit toujours le serveur (`readMenuLayout`).
 */
import { withAsyncLock } from "@/lib/async-lock"
import { cleanMenuItems, keepAdminEntries, parseMenuLayout, type MenuLayout } from "@/lib/app-menu"
import { deleteChunked, PageStoreError, readChunked, writeChunked } from "@/lib/custom-pages-store"
import { sharedStoreAvailable } from "@/lib/shared-store"
import { withTimeBudget } from "@/lib/time-budget"

export const MENU_SCOPE = "app-menu"
const KEY = "layout"
const PREVIOUS = "layout-precedent"
/** Au plus une relecture en arrière-plan par minute. */
const REFRESH_EVERY = 60_000

/** La copie en mémoire (`undefined` : jamais lue ; `null` : le menu d'Eraser). */
let known: MenuLayout | null | undefined
let refreshDueAt = 0
let refreshing: Promise<unknown> | null = null
/** Compte les enregistrements : une lecture partie avant l'un d'eux ne reprend pas la main. */
let writes = 0

function remember(layout: MenuLayout | null) {
  known = layout
  refreshDueAt = Date.now() + REFRESH_EVERY
}

async function read(key: string) {
  if (!sharedStoreAvailable()) return null
  const value = await readChunked(MENU_SCOPE, key)
  return value ? parseMenuLayout(value) : null
}

/** Le menu enregistré, lu sur le serveur partagé (`null` : le menu d'Eraser). */
export async function readMenuLayout() {
  const stamp = writes
  const layout = await read(KEY)
  if (stamp === writes) remember(layout)
  return layout
}

/**
 * Le menu connu tout de suite, sans attendre le serveur partagé : `undefined` tant qu'il
 * n'a jamais été lu (la coque montre alors le menu d'Eraser), sinon le dernier lu ou
 * enregistré ici. Lance la relecture en arrière-plan quand la copie date de plus d'une minute.
 */
export function knownMenuLayout(): MenuLayout | null | undefined {
  if (sharedStoreAvailable() && !refreshing && Date.now() >= refreshDueAt) {
    refreshDueAt = Date.now() + REFRESH_EVERY
    refreshing = readMenuLayout().catch(() => null).finally(() => { refreshing = null })
  }
  return known
}

/** La toute première lecture (démarrage d'Eraser) : attendue une seule fois, et peu. */
let firstRead: Promise<unknown> | null = null
let firstReadDone = false
/** Jusqu'à quand le premier rendu peut attendre la première lecture (le même délai pour toutes les pages). */
let firstReadDeadline: number | null = null

/**
 * Comme `knownMenuLayout`, mais au tout premier rendu (menu encore jamais lu) attend sa
 * lecture, au plus `budgetMs` : le menu réglé (ses liens, ses pages) est là dès l'ouverture
 * d'Eraser, au lieu du menu d'origine jusqu'au rechargement suivant.
 */
export async function knownMenuLayoutSoon(budgetMs = 3_000): Promise<MenuLayout | null | undefined> {
  if (known !== undefined || firstReadDone || !sharedStoreAvailable()) return knownMenuLayout()
  if (!refreshing) {
    refreshDueAt = Date.now() + REFRESH_EVERY
    refreshing = readMenuLayout().catch(() => null).finally(() => { refreshing = null })
  }
  firstRead ??= refreshing.finally(() => { firstReadDone = true })
  // Une seule attente en tout, pas une par page : passé ce délai, plus personne n'attend.
  firstReadDeadline ??= Date.now() + budgetMs
  const left = firstReadDeadline - Date.now()
  if (left > 0) await withTimeBudget(firstRead, left, "APP_MENU_SLOW").catch(() => null)
  return knownMenuLayout()
}

/** Oublie la copie en mémoire (tests). */
export function forgetMenuLayout() {
  known = undefined
  refreshDueAt = 0
  refreshing = null
  firstRead = null
  firstReadDone = false
  firstReadDeadline = null
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
    writes += 1
    remember(layout)
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
    writes += 1
    remember(null)
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
    writes += 1
    remember(layout)
    return layout
  })
}
