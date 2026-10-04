/**
 * Le routeur garde une copie de chaque page visitée (5 minutes, 30 pour Précédent /
 * Suivant) et la réaffiche telle quelle quand on y revient. Pour un index qu'on vient
 * de modifier, c'est l'ancienne version : les modifications semblaient perdues jusqu'à
 * « Actualiser ». Ici, toute écriture réussie vers l'API oublie ces copies ; la page
 * suivante est relue sur le serveur, dont le cache, lui, est à jour.
 */
type VinextWindow = Window & { __VINEXT_CLEAR_NAV_CACHES__?: () => void }

/** Oublie les copies des pages visitées : la prochaine visite les redemande au serveur. */
export function forgetVisitedPages() {
  if (typeof window === "undefined") return
  try { (window as VinextWindow).__VINEXT_CLEAR_NAV_CACHES__?.() } catch { /* routeur absent : rien à oublier */ }
}

let installed = false

/**
 * Des POST qui ne changent aucune page : la lecture des références « { » (affichées dans
 * presque toutes les pages) et le chat (jamais rendu par le serveur). Les compter comme des
 * écritures vidait les copies à chaque affichage, et chaque retour sur une page la relisait.
 */
const notPageWrites = new Set(["/api/references", "/api/campaign-chat"])

function isApiWrite(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
  if (method === "GET" || method === "HEAD") return false
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href)
  return url.origin === window.location.origin && url.pathname.startsWith("/api/") && !notPageWrites.has(url.pathname)
}

/** À appeler une fois dans la page : chaque écriture réussie vers /api oublie les pages visitées. */
export function installNavigationCacheGuard() {
  if (installed || typeof window === "undefined") return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init)
    try {
      if (response.ok && isApiWrite(input, init)) forgetVisitedPages()
    } catch { /* adresse illisible : on laisse la réponse passer */ }
    return response
  }
}
