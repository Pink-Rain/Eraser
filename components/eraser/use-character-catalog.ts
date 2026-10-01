"use client"

import { useEffect, useState } from "react"

import { builtinCharacterCatalog, catalogNames, type CharacterCatalog } from "@/lib/character-catalog"
import { setOfficialSkillNames } from "@/lib/class-stats"

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
