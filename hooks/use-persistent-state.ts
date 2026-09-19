import { useEffect, useState } from "react"

// Remembers a UI preference (a sort mode, an active tab, a selected filter…)
// across visits, so the player or MJ doesn't have to reselect it every time
// they come back to a page. Backed by localStorage; safe to use with SSR
// since it only reads/writes after mount, and silently no-ops if storage is
// unavailable (private browsing, quota, …).
export function usePersistentState<T>(key: string, initial: T, isValid: (value: unknown) => value is T) {
  const [value, setValue] = useState(initial)

  useEffect(() => {
    // Déféré hors du corps synchrone de l'effet (comme ailleurs dans l'appli)
    // pour éviter d'enchaîner un re-rendu directement pendant le montage.
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(key)
        if (stored !== null) {
          const parsed = JSON.parse(stored) as unknown
          if (isValid(parsed)) { setValue(parsed); return }
        }
      } catch { /* stockage indisponible : on garde la valeur par défaut */ }
      setValue(initial)
    }, 0)
    return () => window.clearTimeout(timer)
    // La clé peut changer (ex. un identifiant de personnage) : on relit à
    // chaque changement, pas seulement au montage. `initial` est traité comme
    // une valeur de repli stable, volontairement hors des dépendances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  function set(next: T) {
    setValue(next)
    try { window.localStorage.setItem(key, JSON.stringify(next)) } catch { /* stockage indisponible */ }
  }

  return [value, set] as const
}
