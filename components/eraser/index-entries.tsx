"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Activity, BookText, Church, CircleUserRound, Drama, Flame, Gauge, Hammer, Hexagon, Languages, LibraryBig, Map, MapPin, Package, PawPrint, Sparkles, Swords, Trophy, Users, type LucideIcon } from "lucide-react"

import { arrangeIndexDirectory, emptyIndexDirectoryLayout, parseIndexDirectoryLayout, type IndexDirectoryLayout } from "@/lib/index-directory"
import { indexPages, type IndexPageKey } from "@/lib/index-pages"

export const indexPageIcons: Record<IndexPageKey, LucideIcon> = {
  campagnes: Map,
  classes: Swords,
  creatures: PawPrint,
  langues: Languages,
  lieux: MapPin,
  objets: Package,
  peuples: Users,
  personnages: CircleUserRound,
  pnjs: Drama,
  religions: Church,
  "sorts-classes": Sparkles,
  "sorts-creatures": Flame,
  etats: Activity,
  "armes-modificateurs": Hexagon,
  caracteristiques: Gauge,
  succes: Trophy,
  vocabulaire: BookText,
}

/** Un index de la page Index : ceux d'Eraser, le créateur de classe, et ceux créés depuis « Nouvel index ». */
export type IndexEntry = { key: string; href: string; label: string; description: string; icon: LucideIcon }

export const CLASS_CREATOR_KEY = "creation-de-classe"

const builtinEntries: IndexEntry[] = [
  ...indexPages.map((page) => ({ key: page.key, href: page.href, label: page.label, description: page.description, icon: indexPageIcons[page.key] })),
  { key: CLASS_CREATOR_KEY, href: "/creation-de-classe", label: "Création de classe", description: "Les classes, leurs rangs et leurs sorts : les créer et les régler.", icon: Hammer },
]

type CustomIndex = { key: string; title: string; description: string }

// Les index créés, lus une fois par fenêtre (le menu et la page Index les partagent).
let customIndexes: CustomIndex[] | null = null
let customRequest: Promise<CustomIndex[]> | null = null

function loadCustomIndexes() {
  customRequest ??= fetch("/api/resources/custom-indexes", { cache: "no-store" })
    .then((response) => response.ok ? response.json() as Promise<{ indexes?: CustomIndex[] }> : { indexes: [] })
    .then((payload) => { customIndexes = payload.indexes ?? []; return customIndexes })
    .catch(() => { customRequest = null; return customIndexes ?? [] })
  return customRequest
}

/** Tous les index : ceux d'Eraser tout de suite, ceux créés dès qu'ils sont lus. `enabled` : seulement pour les MJ et administrateurs. */
export function useIndexEntries(enabled = true) {
  const [custom, setCustom] = useState<CustomIndex[]>(() => customIndexes ?? [])
  useEffect(() => {
    if (!enabled) return
    let active = true
    void loadCustomIndexes().then((indexes) => { if (active) setCustom(indexes) })
    return () => { active = false }
  }, [enabled])
  return useMemo<IndexEntry[]>(() => [
    ...builtinEntries,
    ...custom.map((index) => ({ key: `custom:${index.key}`, href: `/ressources/index/${index.key}`, label: index.title, description: index.description || "Index créé dans Eraser.", icon: LibraryBig })),
  ], [custom])
}

// ---------------------------------------------------------------------------
// Les étoiles : propres à chaque installation (le menu est celui de la personne).
// ---------------------------------------------------------------------------

/** Sans étoile : seulement sur la page Index. Étoile : dans la section Index du menu. Rouge : directement dans le menu. */
export type IndexStar = "none" | "star" | "red"

const starsKey = "eraser:index-stars"
/** L'ancienne préférence : la liste des index sans étoile. */
const legacySecondaryKey = "eraser:index-secondary"
const defaultRed = new Set<string>(["objets", CLASS_CREATOR_KEY])
const starListeners = new Set<() => void>()

function readStars() {
  try {
    return window.localStorage.getItem(starsKey) ?? `legacy:${window.localStorage.getItem(legacySecondaryKey) ?? "[]"}`
  } catch {
    return "legacy:[]"
  }
}

function subscribeStars(listener: () => void) {
  starListeners.add(listener)
  const onStorage = (event: StorageEvent) => { if (event.key === starsKey || event.key === legacySecondaryKey) listener() }
  window.addEventListener("storage", onStorage)
  return () => { starListeners.delete(listener); window.removeEventListener("storage", onStorage) }
}

function parseStars(raw: string): Record<string, IndexStar> {
  try {
    if (raw.startsWith("legacy:")) {
      // Repris de l'ancienne préférence : les index qu'on avait désétoilés le restent.
      const secondary = JSON.parse(raw.slice("legacy:".length)) as unknown
      return Object.fromEntries((Array.isArray(secondary) ? secondary : []).filter((key): key is string => typeof key === "string").map((key) => [key, "none" as const]))
    }
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== "object") return {}
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, IndexStar] => entry[1] === "none" || entry[1] === "star" || entry[1] === "red"))
  } catch {
    return {}
  }
}

export function useIndexStars() {
  const raw = useSyncExternalStore(subscribeStars, readStars, () => "legacy:[]")
  const stars = useMemo(() => parseStars(raw), [raw])
  // Par défaut, un index est étoilé ; l'index des objets et le créateur de classe sont en rouge.
  const starOf = useCallback((key: string): IndexStar => stars[key] ?? (defaultRed.has(key) ? "red" : "star"), [stars])
  const setStar = useCallback((key: string, star: IndexStar) => {
    const next = { ...parseStars(readStars()), [key]: star }
    try {
      window.localStorage.setItem(starsKey, JSON.stringify(next))
    } catch {
      return
    }
    starListeners.forEach((listener) => listener())
  }, [])
  return { starOf, setStar }
}

// ---------------------------------------------------------------------------
// Le rangement (dossiers, ordre) : commun à toute la table.
// ---------------------------------------------------------------------------

const layoutFallbackKey = "eraser:index-directory"
let knownLayout: IndexDirectoryLayout | null = null
let layoutRequest: Promise<IndexDirectoryLayout> | null = null
const layoutListeners = new Set<(layout: IndexDirectoryLayout) => void>()

function localLayout() {
  try { return parseIndexDirectoryLayout(JSON.parse(window.localStorage.getItem(layoutFallbackKey) ?? "null")) } catch { return emptyIndexDirectoryLayout }
}

function loadLayout() {
  layoutRequest ??= fetch("/api/resources/index-directory", { cache: "no-store" })
    .then(async (response) => (await response.json().catch(() => ({}))) as { layout?: unknown; shared?: boolean })
    .then((payload) => {
      // Sans serveur partagé, le rangement reste dans cette installation.
      knownLayout = payload.layout ? parseIndexDirectoryLayout(payload.layout) : payload.shared === false ? localLayout() : emptyIndexDirectoryLayout
      return knownLayout
    })
    .catch(() => { layoutRequest = null; return knownLayout ?? localLayout() })
  return layoutRequest
}

/** Le rangement appliqué aux index existants, et de quoi l'enregistrer (MJ et administrateurs). */
export function useIndexDirectoryLayout(entries: IndexEntry[], enabled = true) {
  const [layout, setLayout] = useState<IndexDirectoryLayout>(() => knownLayout ?? emptyIndexDirectoryLayout)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!enabled) return
    let active = true
    void loadLayout().then((loaded) => { if (active) setLayout(loaded) })
    const listener = (next: IndexDirectoryLayout) => { if (active) setLayout(next) }
    layoutListeners.add(listener)
    return () => { active = false; layoutListeners.delete(listener) }
  }, [enabled])
  const arranged = useMemo(() => arrangeIndexDirectory(layout, entries), [entries, layout])
  const save = useCallback(async (next: IndexDirectoryLayout) => {
    const previous = knownLayout ?? layout
    knownLayout = next
    layoutListeners.forEach((listener) => listener(next))
    setError("")
    try {
      const response = await fetch("/api/resources/index-directory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ layout: next }) })
      if (response.status === 503) {
        try { window.localStorage.setItem(layoutFallbackKey, JSON.stringify(next)) } catch { /* rien à garder */ }
        return
      }
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "Le rangement n’a pas pu être enregistré.")
    } catch (caught) {
      // Refusé : le rangement d'avant revient, avec le message.
      knownLayout = previous
      layoutListeners.forEach((listener) => listener(previous))
      setError(caught instanceof Error ? caught.message : "Le rangement n’a pas pu être enregistré.")
    }
  }, [layout])
  return { layout: arranged, save, error }
}
