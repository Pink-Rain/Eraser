import { useCallback, useRef, useSyncExternalStore } from "react"

// Les préférences d'interface (un tri, un onglet actif, une largeur de colonne)
// vivent dans localStorage. Le stockage est ici traité comme ce qu'il est — une
// source extérieure à React — et lu par `useSyncExternalStore`.
//
// La version précédente le lisait dans un `useEffect` différé par un
// `setTimeout(0)`, ce qui coûtait à chaque montage un rendu complet du composant
// *après* la peinture : la page s'affichait avec la valeur par défaut puis
// sautait sur la valeur enregistrée. Dans un tableau, ce saut changeait la clé de
// mise en page et remontait toutes les cellules. Le détour par le minuteur
// servait aussi à contourner la règle qui interdit `setState` dans un effet.
//
// Ici, rien de tout cela : le premier rendu client lit déjà la bonne valeur, et
// le rendu serveur reçoit la valeur par défaut, donc l'hydratation reste saine.

const listeners = new Set<() => void>()

function subscribe(onStoreChange: () => void) {
  // Une écriture venue de cette fenêtre (`listeners`) comme d'une autre
  // (`storage`) doit rafraîchir les lecteurs de la préférence.
  listeners.add(onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

function readRaw(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function usePersistentState<T>(key: string, initial: T, isValid: (value: unknown) => value is T) {
  // `getSnapshot` doit renvoyer une valeur stable tant que le stockage n'a pas
  // bougé : re-parser le JSON à chaque appel rendrait une nouvelle référence et
  // ferait boucler React. La dernière chaîne lue et sa valeur sont donc gardées.
  const parsed = useRef<{ raw: string | null; key: string; value: T } | null>(null)

  const getSnapshot = useCallback(() => {
    const raw = readRaw(key)
    const cached = parsed.current
    if (cached && cached.key === key && cached.raw === raw) return cached.value
    let value = initial
    if (raw !== null) {
      try {
        const candidate = JSON.parse(raw) as unknown
        if (isValid(candidate)) value = candidate
      } catch { /* préférence illisible ou d'une ancienne version */ }
    }
    parsed.current = { raw, key, value }
    return value
    // `initial` est un repli volontairement stable, comme dans la version
    // précédente : il n'entre pas dans les dépendances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isValid])

  // Côté serveur, aucune préférence n'est connue : c'est la valeur par défaut.
  const getServerSnapshot = useCallback(() => initial, [initial])

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const set = useCallback((next: T) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(next))
    } catch { /* stockage indisponible : la valeur reste celle de la session */ }
    // La valeur est publiée tout de suite, même si l'écriture a échoué : une
    // fenêtre de navigation privée doit rester utilisable.
    parsed.current = { raw: readRaw(key), key, value: next }
    listeners.forEach((listener) => listener())
  }, [key])

  return [value, set] as const
}

/**
 * Même mécanique, pour une préférence déjà enregistrée en texte brut plutôt
 * qu'en JSON (le personnage et la campagne retenus dans la barre latérale).
 * Garder leur format évite de repartir de zéro sur les installations existantes.
 */
export function useStoredText(key: string) {
  const read = useCallback(() => readRaw(key) ?? "", [key])
  const value = useSyncExternalStore(subscribe, read, () => "")

  const set = useCallback((next: string) => {
    try {
      window.localStorage.setItem(key, next)
    } catch { /* stockage indisponible */ }
    listeners.forEach((listener) => listener())
  }, [key])

  return [value, set] as const
}
