import { useCallback, useMemo, useSyncExternalStore } from "react"

// Remembers a UI preference (a sort mode, an active tab, a selected filter…)
// across visits, so the player or MJ doesn't have to reselect it every time
// they come back to a page. Backed by localStorage, and silently keeps the
// value for the session if storage is unavailable (private browsing, quota, …).
//
// Le stockage est lu par `useSyncExternalStore`, comme la source extérieure à
// React qu'il est. Avant, il était relu dans un `setTimeout(0)` après le montage :
// chaque composant s'affichait avec la valeur par défaut, puis se redessinait en
// entier après peinture sur la valeur enregistrée (un saut visible, et dans un
// tableau, toutes les cellules remontées). Désormais, un composant monté après
// le chargement (navigation interne) lit la bonne valeur dès son premier rendu ;
// le rendu serveur et l'hydratation reçoivent la valeur par défaut, puis React
// passe à la valeur enregistrée avant de rendre la main : pas d'écart d'hydratation.

const listeners = new Set<() => void>()

function subscribe(onStoreChange: () => void) {
  // Une écriture de cette fenêtre (`listeners`) comme d'une autre (`storage`).
  listeners.add(onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

function notify() {
  listeners.forEach((listener) => listener())
}

function readRaw(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, raw: string) {
  try {
    window.localStorage.setItem(key, raw)
    return true
  } catch {
    return false
  }
}

const NONE = Symbol("none")

/**
 * La dernière lecture de chaque clé, parsée une seule fois. `getSnapshot` doit rendre la
 * même valeur tant que le stockage n'a pas bougé (un nouvel objet à chaque appel ferait
 * boucler React) ; la clé seule la détermine, si bien que deux composants qui lisent la
 * même préférence reçoivent le même objet.
 */
const parsedByKey = new Map<string, { raw: string | null; candidate: unknown }>()

function candidateOf(key: string) {
  const raw = readRaw(key)
  const cached = parsedByKey.get(key)
  if (cached && cached.raw === raw) return cached.candidate
  let candidate: unknown = NONE
  if (raw !== null) {
    try {
      candidate = JSON.parse(raw) as unknown
    } catch { /* préférence illisible ou d'une ancienne version */ }
  }
  parsedByKey.set(key, { raw, candidate })
  return candidate
}

export function usePersistentState<T>(key: string, initial: T, isValid: (value: unknown) => value is T) {
  // La valeur par défaut est un repli stable pour une clé donnée (comme avant) : un `{}`
  // écrit en ligne ne change pas de référence à chaque rendu.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fallback = useMemo(() => initial, [key])

  const getSnapshot = useCallback(() => {
    const candidate = candidateOf(key)
    return candidate !== NONE && isValid(candidate) ? candidate : fallback
  }, [fallback, isValid, key])
  const getServerSnapshot = useCallback(() => fallback, [fallback])

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const set = useCallback((next: T) => {
    const raw = JSON.stringify(next)
    // Stockage indisponible : la valeur vaut pour la session (la lecture garde l'ancienne chaîne).
    const stored = writeRaw(key, raw)
    parsedByKey.set(key, { raw: stored ? raw : readRaw(key), candidate: next })
    notify()
  }, [key])

  return [value, set] as const
}

/** Les textes écrits quand le stockage est indisponible : ils valent pour la session. */
const sessionTexts = new Map<string, string>()
const emptyText = () => ""

/**
 * Même mécanique, pour une préférence enregistrée en texte brut plutôt qu'en JSON (le
 * personnage et la campagne retenus dans la barre latérale) : son format ne change pas,
 * les installations existantes la retrouvent.
 */
export function useStoredText(key: string) {
  const read = useCallback(() => readRaw(key) ?? sessionTexts.get(key) ?? "", [key])
  const value = useSyncExternalStore(subscribe, read, emptyText)

  const set = useCallback((next: string) => {
    if (readRaw(key) === next) return
    if (!writeRaw(key, next)) sessionTexts.set(key, next)
    notify()
  }, [key])

  return [value, set] as const
}
