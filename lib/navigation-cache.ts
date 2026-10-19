/**
 * Le routeur garde une copie de chaque page visitée (30 minutes, vite.config.ts) et la
 * réaffiche aussitôt quand on y revient. Une copie peut dater d'avant une modification (ici,
 * dans une autre fenêtre ou chez un autre joueur) : elle s'affiche quand même tout de suite,
 * puis la page se relit en arrière-plan et se met à jour sans squelette (`revalidateShownPage`).
 *
 * Seule la page où l'on vient d'écrire est oubliée : y revenir la relit, au lieu de montrer
 * un instant l'ancienne version (« les modifications semblaient perdues »). Sans accès à la
 * table du routeur (vinext changé), toutes les copies sont oubliées, comme avant.
 */
import { startTransition } from "react"

type VisitedPages = Map<string, unknown>
type VinextWindow = Window & {
  __VINEXT_CLEAR_NAV_CACHES__?: () => void
  __VINEXT_RSC_NAVIGATE__?: (href: string, redirectDepth?: number, navigationKind?: string, historyUpdateMode?: unknown, previousNextUrl?: unknown, programmaticTransition?: boolean) => Promise<void>
  __ERASER_VISITED_PAGES__?: VisitedPages
}

/** Une page revue plus vieille que ça (ou d'avant une écriture) se relit derrière son affichage. */
const REVALIDATE_AFTER_MS = 60_000

/** La page (adresse et paramètres, sans la marque `_rsc` du routeur) d'une adresse. */
function pageKey(href: string) {
  const url = new URL(href, window.location.href)
  url.searchParams.delete("_rsc")
  const path = url.pathname.endsWith(".rsc") ? url.pathname.slice(0, -4) || "/" : url.pathname
  const query = url.searchParams.toString()
  return query ? `${path}?${query}` : path
}

/** Quand chaque page a été lue sur le serveur pour la dernière fois (navigation, préchargement, relecture). */
const readAt = new Map<string, number>()
/** La dernière modification connue : les copies plus anciennes se relisent. */
let changedAt = 0

/** Une modification (écrite ici, ou annoncée par une autre fenêtre) rend les copies périmées. */
export function forgetVisitedPages(options: { here?: boolean } = {}) {
  if (typeof window === "undefined") return
  changedAt = Date.now()
  const visited = (window as VinextWindow).__ERASER_VISITED_PAGES__
  if (!visited) {
    try { (window as VinextWindow).__VINEXT_CLEAR_NAV_CACHES__?.() } catch { /* routeur absent : rien à oublier */ }
  } else if (options.here) {
    // La page où l'on vient d'écrire : y revenir la relira au lieu de montrer l'ancienne copie.
    const here = pageKey(window.location.href)
    // Une clé de la table : l'adresse de la page (« /regles.rsc?_rsc=… »), et après « \0 » le contexte d'interception.
    for (const key of [...visited.keys()]) {
      try { if (pageKey(key.split("\u0000")[0] ?? key) === here) visited.delete(key) } catch { visited.delete(key) }
    }
  }
  // Une réponse gardée pour un clic (plus bas) date d'avant la modification : elle ne sert plus.
  for (const [key, shared] of pagesInFlight) {
    pagesInFlight.delete(key)
    if (!shared.taken) { shared.taken = true; void shared.promise.then(({ spare }) => spare?.body?.cancel().catch(() => undefined), () => undefined) }
  }
}

let revalidating = ""
/** Le départ de la dernière navigation (signal du routeur, instrumentation-client.ts). */
let navigationStartedAt = 0

/**
 * Appelé quand une page s'affiche : servie depuis sa copie (aucune lecture pendant cette
 * navigation) et périmée, elle se relit derrière son affichage. La relecture garde ce qui est
 * à l'écran (pas de squelette) et ne vide pas les copies des autres pages, contrairement à
 * `router.refresh()`.
 */
export function revalidateShownPage() {
  if (typeof window === "undefined" || !navigationStartedAt) return
  const win = window as VinextWindow
  if (!win.__ERASER_VISITED_PAGES__ || typeof win.__VINEXT_RSC_NAVIGATE__ !== "function") return
  const key = pageKey(window.location.href)
  const read = readAt.get(key) ?? 0
  if (read >= navigationStartedAt) return
  if (read >= changedAt && Date.now() - read < REVALIDATE_AFTER_MS) return
  if (revalidating === key) return
  revalidating = key
  const navigate = win.__VINEXT_RSC_NAVIGATE__
  startTransition(() => {
    void navigate(window.location.href, 0, "refresh", undefined, undefined, true)
      .then(() => adoptFreshCopy(key), () => undefined)
      .finally(() => { if (revalidating === key) revalidating = "" })
  })
}

/**
 * La relecture range sa copie sous sa propre clé (le routeur la marque comme relecture) : la
 * copie qu'une prochaine visite reprendrait est remplacée par elle, la plus récente.
 */
function adoptFreshCopy(key: string) {
  const visited = (window as VinextWindow).__ERASER_VISITED_PAGES__
  if (!visited) return
  const copies = [...visited.entries()].filter(([entry]) => { try { return pageKey(entry.split("\u0000")[0] ?? entry) === key } catch { return false } }) as Array<[string, { expiresAt?: number }]>
  if (copies.length < 2) return
  const newest = copies.reduce((best, entry) => (entry[1].expiresAt ?? 0) > (best[1].expiresAt ?? 0) ? entry : best)
  for (const [entry] of copies) if (entry !== newest[0]) visited.set(entry, newest[1])
}

let installed = false

/**
 * Des POST qui ne changent aucune page : la lecture des références « { » (affichées dans
 * presque toutes les pages), le chat (jamais rendu par le serveur), l'accusé de lecture des
 * notifications (envoyé dès qu'une notification s'affiche, et lues par la page elle-même) et
 * le partage d'une page (qui écrit chez les autres, pas ici). Les compter comme des
 * écritures vidait les copies à chaque affichage, et chaque retour sur une page la relisait.
 */
const notPageWrites = new Set(["/api/references", "/api/campaign-chat", "/api/notifications", "/api/share-page"])

function isApiWrite(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
  if (method === "GET" || method === "HEAD") return false
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href)
  return url.origin === window.location.origin && url.pathname.startsWith("/api/") && !notPageWrites.has(url.pathname)
}

/**
 * Une page préchargée au survol d'un lien, puis cliquée avant que le préchargement soit fini :
 * le routeur la redemandait au serveur (deux rendus complets, Google compris). La seconde
 * demande identique reprend maintenant la réponse déjà en route, dédoublée dès son arrivée.
 * La copie non reprise est abandonnée au bout de quelques secondes.
 */
type SharedPage = { promise: Promise<{ first: Response; spare: Response | null }>; taken: boolean }
const pagesInFlight = new Map<string, SharedPage>()
const SPARE_KEPT_MS = 10_000

function rscGetKey(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
  if (method !== "GET") return null
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href)
  return url.origin === window.location.origin && url.pathname.endsWith(".rsc") ? url.href : null
}

function sharedPageFetch(original: typeof window.fetch, key: string, input: RequestInfo | URL, init?: RequestInit) {
  const running = pagesInFlight.get(key)
  if (running && !running.taken) {
    running.taken = true
    return running.promise.then(({ spare }) => spare ?? original(input, init))
  }
  const startedAt = Date.now()
  const shared: SharedPage = {
    taken: false,
    promise: original(input, init).then((first) => ({ first, spare: first.ok && first.body ? first.clone() : null })),
  }
  pagesInFlight.set(key, shared)
  const forget = () => {
    if (pagesInFlight.get(key) === shared) pagesInFlight.delete(key)
    // Personne ne l'a reprise : la copie cesse de garder la réponse en mémoire.
    if (!shared.taken) void shared.promise.then(({ spare }) => spare?.body?.cancel().catch(() => undefined), () => undefined)
  }
  shared.promise.then(({ first }) => {
    // Lue au départ de la requête : une modification faite pendant qu'elle roulait la rend périmée.
    if (first.ok) { try { readAt.set(pageKey(key), startedAt) } catch { /* adresse illisible */ } }
    window.setTimeout(forget, SPARE_KEPT_MS)
  }, forget)
  return shared.promise.then(({ first }) => first)
}

/** À appeler une fois dans la page : partage des pages en route, et écritures suivies. */
export function installNavigationCacheGuard() {
  if (installed || typeof window === "undefined") return
  installed = true
  // La page ouverte au lancement vient d'être lue.
  try { readAt.set(pageKey(window.location.href), Date.now()) } catch { /* adresse illisible */ }
  window.addEventListener("eraser:navigation-start", () => { navigationStartedAt = Date.now() })
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let key: string | null = null
    try { key = rscGetKey(input, init) } catch { /* adresse illisible : requête ordinaire */ }
    if (key) return sharedPageFetch(original, key, input, init)
    const response = await original(input, init)
    try {
      if (response.ok && isApiWrite(input, init)) forgetVisitedPages({ here: true })
    } catch { /* adresse illisible : on laisse la réponse passer */ }
    return response
  }
}
