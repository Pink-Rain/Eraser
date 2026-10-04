"use client"

import { useEffect, useState } from "react"

import { builtinCharacterCatalog, catalogNames, type CharacterCatalog } from "@/lib/character-catalog"
import { setOfficialSkillNames } from "@/lib/class-stats"
import { onWorldIndexChange } from "@/lib/world-index-events"

let loaded: CharacterCatalog | null = null
let pending: Promise<CharacterCatalog | null> | null = null

function remember(catalog: CharacterCatalog) {
  loaded = catalog
  setOfficialSkillNames(catalogNames(catalog))
}

async function fetchCatalog() {
  try {
    const response = await fetch("/api/resources/character-catalog", { cache: "no-store" })
    if (!response.ok) return null
    const payload = (await response.json()) as { catalog?: CharacterCatalog }
    return payload.catalog ?? null
  } catch {
    return null
  }
}

/**
 * Les caractéristiques et compétences de la fiche (Index des caractéristiques et
 * compétences), chargées une fois par page. En attendant, ou sans réseau, la liste
 * d'origine.
 */
export function useCharacterCatalog(initial?: CharacterCatalog) {
  const [catalog, setCatalog] = useState<CharacterCatalog>(initial ?? loaded ?? builtinCharacterCatalog)
  useEffect(() => {
    if (initial) { remember(initial); return }
    if (loaded) return
    let active = true
    pending ??= fetchCatalog()
    void pending.then((result) => {
      if (!result) { pending = null; return }
      remember(result)
      if (active) setCatalog(result)
    })
    return () => { active = false }
  }, [initial])
  return catalog
}

let descriptions: Record<string, string> | null = null
let descriptionsPending: Promise<Record<string, string> | null> | null = null
// L'index modifié (ici ou ailleurs) : la prochaine fiche ouverte relit ses descriptions.
if (typeof window !== "undefined") onWorldIndexChange((keys) => { if (keys.includes("skills")) { descriptions = null; descriptionsPending = null } })

async function fetchDescriptions() {
  try {
    const response = await fetch("/api/resources/character-catalog?descriptions=1", { cache: "no-store" })
    if (!response.ok) return null
    const payload = (await response.json()) as { descriptions?: Record<string, string> }
    return payload.descriptions ?? null
  } catch {
    return null
  }
}

/**
 * Les descriptions de l'index (colonne « Description »), pour le « ? » de la fiche.
 * Longues : demandées une fois, après l'affichage de la fiche, jamais avec elle.
 */
export function useCatalogDescriptions() {
  const [current, setCurrent] = useState<Record<string, string> | null>(descriptions)
  useEffect(() => {
    if (descriptions) return
    let active = true
    const timer = window.setTimeout(() => {
      descriptionsPending ??= fetchDescriptions()
      void descriptionsPending.then((result) => {
        if (!result) { descriptionsPending = null; return }
        descriptions = result
        if (active) setCurrent(result)
      })
    }, 400)
    return () => { active = false; window.clearTimeout(timer) }
  }, [])
  return current
}
