"use client"

/**
 * Les références « {État:Sérénité} » côté navigateur : le catalogue du menu « { » et la
 * résolution des références affichées, regroupées en une demande et gardées un moment.
 * Un index modifié (dans cette fenêtre ou une autre) vide tout : les noms renommés
 * s'affichent aussitôt.
 */
import { useEffect, useMemo, useState } from "react"

import { parseReferenceHref, referenceKey, type ReferenceCatalog, type ReferenceRequest, type ResolvedReference } from "@/lib/index-references"
import { onWorldIndexChange } from "@/lib/world-index-events"

const CATALOG_MS = 60_000
const RESOLVED_MS = 30_000

let catalog: { at: number; promise: Promise<ReferenceCatalog | null> } | null = null
/** Refusé une fois (un joueur) : le menu « { » ne se propose plus pendant la session. */
let catalogDenied = false
const resolved = new Map<string, { at: number; value: ResolvedReference | null }>()
const waiting = new Map<string, { request: ReferenceRequest; resolvers: Array<(value: ResolvedReference | null) => void> }>()
let timer: ReturnType<typeof setTimeout> | null = null
let version = 0
const listeners = new Set<() => void>()
let watching = false

function watch() {
  if (watching || typeof window === "undefined") return
  watching = true
  onWorldIndexChange(() => {
    catalog = null
    resolved.clear()
    version += 1
    for (const listener of [...listeners]) listener()
  })
}

/** Le catalogue (MJ et admins) ; null si le compte ne peut pas citer d'index ou si la lecture échoue. */
export function loadReferenceCatalog(fresh = false): Promise<ReferenceCatalog | null> {
  watch()
  if (catalogDenied) return Promise.resolve(null)
  if (!fresh && catalog && Date.now() - catalog.at < CATALOG_MS) return catalog.promise
  const promise = fetch(fresh ? "/api/references?fresh=1" : "/api/references", { cache: "no-store" })
    .then(async (response) => {
      if (response.status === 403) catalogDenied = true
      if (!response.ok) return null
      const payload = (await response.json().catch(() => ({}))) as { catalog?: ReferenceCatalog }
      return payload.catalog ?? null
    })
    .catch(() => null)
  catalog = { at: Date.now(), promise }
  // Un échec n'est pas gardé : la prochaine ouverture du menu réessaie.
  void promise.then((value) => { if (!value && catalog?.promise === promise) catalog = null })
  return promise
}

function flush() {
  timer = null
  const batch = [...waiting.values()]
  waiting.clear()
  if (!batch.length) return
  const settle = (results: Record<string, ResolvedReference | null> | null) => {
    for (const { request, resolvers } of batch) {
      const key = referenceKey(request)
      const value = results ? results[key] ?? null : null
      // Une demande qui a échoué n'est pas gardée : le prochain affichage réessaie.
      if (results) resolved.set(key, { at: Date.now(), value })
      for (const resolve of resolvers) resolve(value)
    }
  }
  void fetch("/api/references", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ references: batch.map((item) => item.request) }) })
    .then(async (response) => response.ok ? ((await response.json().catch(() => ({}))) as { results?: Record<string, ResolvedReference | null> }).results ?? null : null)
    .catch(() => null)
    .then(settle)
}

/** Ce qu'on sait déjà d'une référence : `undefined` tant qu'elle n'a pas été lue. */
export function knownReference(request: ReferenceRequest): ResolvedReference | null | undefined {
  const entry = resolved.get(referenceKey(request))
  return entry && Date.now() - entry.at < RESOLVED_MS ? entry.value : undefined
}

/**
 * Le texte qu'affiche un lien de référence déjà lu (le nom actuel de la ligne, ou la
 * valeur de la case citée), même un peu ancien : le tri des index range sur ce texte.
 */
export function shownReferenceText(href: string): string | undefined {
  const reference = parseReferenceHref(href)
  if (!reference) return undefined
  const value = resolved.get(referenceKey(reference))?.value
  if (!value) return undefined
  return reference.column ? value.value || undefined : value.name || undefined
}

/** Oublie les références lues (un survol vient d'être remis en page) : elles sont relues à l'affichage. */
export function forgetResolvedReferences() {
  resolved.clear()
  version += 1
  for (const listener of [...listeners]) listener()
}

export function referenceCatalogDenied() {
  return catalogDenied
}

/** Résout une référence ; les demandes faites au même moment partent ensemble. */
export function resolveReference(request: ReferenceRequest): Promise<ResolvedReference | null> {
  watch()
  const known = knownReference(request)
  if (known !== undefined) return Promise.resolve(known)
  const key = referenceKey(request)
  return new Promise((resolve) => {
    const entry = waiting.get(key)
    if (entry) entry.resolvers.push(resolve)
    else waiting.set(key, { request, resolvers: [resolve] })
    timer ??= setTimeout(flush, 25)
  })
}

/** Change quand un index change : les références affichées sont relues. */
export function useReferenceVersion() {
  const [current, setCurrent] = useState(version)
  useEffect(() => {
    watch()
    const listener = () => setCurrent(version)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])
  return current
}

/**
 * Les références d'un texte, résolues. Une référence pas encore lue est absente de la
 * carte ; lue mais introuvable, elle vaut null.
 */
export function useResolvedReferences(requests: ReferenceRequest[]) {
  const current = useReferenceVersion()
  const signature = useMemo(() => requests.map(referenceKey).join("\u0002"), [requests])
  const initial = () => new Map(requests.flatMap((request) => { const known = knownReference(request); return known === undefined ? [] : [[referenceKey(request), known] as const] }))
  const [values, setValues] = useState<Map<string, ResolvedReference | null>>(initial)
  useEffect(() => {
    if (!requests.length) return
    let active = true
    void Promise.all(requests.map(async (request) => [referenceKey(request), await resolveReference(request)] as const)).then((entries) => {
      if (active) setValues(new Map(entries))
    })
    return () => { active = false }
    // La signature résume les demandes : un nouveau tableau identique ne relit rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, current])
  return values
}
