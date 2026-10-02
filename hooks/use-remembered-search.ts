"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"

/**
 * Le texte d'une barre de recherche, gardé pour cette page le temps de la fenêtre :
 * changer d'onglet d'Eraser puis revenir le retrouve. Relu après le montage (le serveur
 * ne le connaît pas), vidé quand la recherche est effacée.
 */
export function useRememberedSearch(scope = "") {
  const pathname = usePathname()
  const key = `eraser:search:${pathname}${scope ? `:${scope}` : ""}`
  const [query, setQueryState] = useState("")

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.sessionStorage.getItem(key)
        if (stored) setQueryState(stored)
      } catch { /* stockage indisponible */ }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [key])

  const setQuery = useCallback((next: string) => {
    setQueryState(next)
    try {
      if (next) window.sessionStorage.setItem(key, next)
      else window.sessionStorage.removeItem(key)
    } catch { /* stockage indisponible */ }
  }, [key])

  return [query, setQuery] as const
}
