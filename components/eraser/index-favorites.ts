"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

import type { IndexPageKey } from "@/lib/index-pages"

/**
 * Les index sans étoile, rangés dans « Index secondaire ». On retient ceux-là plutôt
 * que les favoris : un index ajouté plus tard arrive donc étoilé. C'est une préférence
 * d'affichage propre à cette installation, gardée dans le navigateur d'Eraser.
 */
const storageKey = "eraser:index-secondary"
const listeners = new Set<() => void>()

function readSnapshot() {
  try {
    return window.localStorage.getItem(storageKey) || "[]"
  } catch {
    return "[]"
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => { if (event.key === storageKey) listener() }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function parse(raw: string) {
  try {
    const value = JSON.parse(raw) as unknown
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [])
  } catch {
    return new Set<string>()
  }
}

export function useIndexFavorites() {
  const raw = useSyncExternalStore(subscribe, readSnapshot, () => "[]")
  const secondary = useMemo(() => parse(raw), [raw])
  const isFavorite = useCallback((key: IndexPageKey) => !secondary.has(key), [secondary])
  const setFavorite = useCallback((key: IndexPageKey, favorite: boolean) => {
    const next = parse(readSnapshot())
    if (favorite) next.delete(key)
    else next.add(key)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]))
    } catch {
      return
    }
    listeners.forEach((listener) => listener())
  }, [])
  return { isFavorite, setFavorite }
}
