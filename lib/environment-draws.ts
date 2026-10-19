/**
 * Les tirages d'un environnement (Lieux › Environnement) : ce qu'on y croise au cours d'un
 * événement. Les candidats sont les lignes des index nommés dans la colonne « Événement » de
 * l'environnement, trouvables à ce lieu d'après leur colonne « Rareté et emplacements » (ou,
 * avant elle, leurs anciennes colonnes). La rareté se tire comme dans un magasin (le commun
 * plus souvent que l'ultime), puis une ligne de cette rareté. Règles pures (page Événements, tests).
 */
import { rarityKeyOf, samePlace, type RarityKey } from "@/lib/rarity-places"
import { searchPlaceMatcher } from "@/lib/search-draws"
import type { ShopGeneratorItem } from "@/lib/shop-schema"
import { itemSourceOf } from "@/lib/shop-types"

/** Les chances de chaque rareté, comme dans les magasins. */
export const encounterWeights: Array<{ rarity: RarityKey; weight: number }> = [
  { rarity: "very-common", weight: 25 }, { rarity: "common", weight: 40 }, { rarity: "rare", weight: 20 }, { rarity: "very-rare", weight: 10 }, { rarity: "ultimate", weight: 5 },
]

export const encounterRarityLabels: Record<RarityKey, string> = { "very-common": "Très commun", common: "Commun", rare: "Rare", "very-rare": "Très rare", ultimate: "Ultime" }

export type EncounterCandidate = { item: ShopGeneratorItem; rarity: RarityKey }

/**
 * Ce qu'on peut croiser dans `place` : les lignes des index `sources` qui s'y trouvent, une fois
 * par rareté. `places` : tous les environnements (pour reconnaître un lieu des anciennes colonnes).
 */
export function encounterPool(items: ShopGeneratorItem[], place: string, sources: string[], places: readonly string[]): EncounterCandidate[] {
  if (!sources.length) return []
  const legacy = searchPlaceMatcher(places)
  const pool: EncounterCandidate[] = []
  for (const item of items) {
    if (!sources.includes(itemSourceOf(item))) continue
    const seen = new Set<RarityKey>()
    for (const location of item.locations) {
      const rarity = rarityKeyOf(location.rarity)
      if (!rarity || seen.has(rarity)) continue
      const here = location.exact ? samePlace(location.place, place) : legacy(location.place).includes(place)
      if (!here) continue
      seen.add(rarity)
      pool.push({ item, rarity })
    }
  }
  return pool
}

/** Un tirage : une rareté parmi celles qui ont des candidats (pondérée), puis un candidat de cette rareté. */
export function drawEncounter(pool: EncounterCandidate[], random: () => number = Math.random, exclude = ""): EncounterCandidate | null {
  const remaining = pool.filter((candidate) => candidate.item.id !== exclude)
  const rarities = encounterWeights.filter((entry) => remaining.some((candidate) => candidate.rarity === entry.rarity))
  if (!rarities.length) return null
  let roll = random() * rarities.reduce((sum, entry) => sum + entry.weight, 0)
  let rarity = rarities[rarities.length - 1].rarity
  for (const entry of rarities) { roll -= entry.weight; if (roll < 0) { rarity = entry.rarity; break } }
  const choices = remaining.filter((candidate) => candidate.rarity === rarity)
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] ?? null
}
