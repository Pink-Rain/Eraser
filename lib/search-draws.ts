import type { ShopRarity } from "@/lib/shop-schema"

/** Ce que le MJ décide du test de Fouille du joueur. */
export type SearchResult = "critical-failure" | "failure" | "success" | "critical-success"

export const searchResults: Array<{ key: SearchResult; label: string; shortcut: string }> = [
  { key: "critical-failure", label: "Échec critique", shortcut: "1" },
  { key: "failure", label: "Échec", shortcut: "2" },
  { key: "success", label: "Réussite", shortcut: "3" },
  { key: "critical-success", label: "Réussite critique", shortcut: "4" },
]

/**
 * Les tables du d100, bornes comprises, du plus haut au plus bas. Ce sont les plages
 * qui font foi : « 100 à 61 » donne 40 faces sur 100.
 */
export const searchTables: Record<SearchResult, Array<{ min: number; max: number; rarity: ShopRarity }>> = {
  success: [
    { min: 61, max: 100, rarity: "common" },
    { min: 20, max: 60, rarity: "rare" },
    { min: 2, max: 19, rarity: "very-rare" },
    { min: 1, max: 1, rarity: "ultimate" },
  ],
  "critical-success": [
    { min: 60, max: 100, rarity: "rare" },
    { min: 25, max: 59, rarity: "very-rare" },
    { min: 1, max: 24, rarity: "ultimate" },
  ],
  failure: [
    { min: 16, max: 100, rarity: "very-common" },
    { min: 1, max: 15, rarity: "common" },
  ],
  "critical-failure": [
    { min: 1, max: 100, rarity: "very-common" },
  ],
}

/**
 * Les lieux de fouille d'origine : ceux de l'onglet « Environnement » de l'Index des lieux les
 * remplacent dès qu'il est lu (un lieu renommé ou supprimé là l'est aussi ici).
 */
export const searchPlaces = [
  "Marais", "Désert", "Savane", "Forêt", "Forêt noire", "Jungle", "Plaine", "Montagne", "Caverne",
  "Ville", "Aquatique", "Ruine / donjon", "Maison", "Maison noble", "Bateau", "Corps", "Corps noble",
]

/** Un lieu de fouille : un nom de l'onglet Lieux › Environnement. */
export type SearchPlace = string

export const searchRarityLabels: Record<ShopRarity, string> = { "very-common": "Très commun", common: "Commun", rare: "Rare", "very-rare": "Très rare", ultimate: "Ultime" }

export function rarityForRoll(result: SearchResult, roll: number): ShopRarity {
  const table = searchTables[result]
  return (table.find((range) => roll >= range.min && roll <= range.max) ?? table[table.length - 1]).rarity
}

export function foldSearchText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, " ").trim()
}

export function searchRarityFrom(value: string): ShopRarity | null {
  const folded = foldSearchText(value)
  // « Utltime » existe dans une feuille : une faute de frappe ne doit pas cacher l'objet.
  if (/\bu[lt]+[a-z]*me\b/.test(folded)) return "ultimate"
  if (folded.includes("tres rare")) return "very-rare"
  if (folded.includes("tres commun")) return "very-common"
  if (folded.includes("rare")) return "rare"
  if (folded.includes("commun")) return "common"
  return null
}

// Les mots écrits autrement dans les emplacements des items.
const placeAliases: Record<string, string> = { grotte: "caverne", grottes: "caverne", navire: "bateau", navires: "bateau", cadavre: "corps", cadavres: "corps", ruine: "donjon", ruines: "donjon" }
/** « nobles », « noble », « noir », « noire » : un mot sans son s ni son e final. */
function placeWord(word: string) { return (placeAliases[word] ?? word).replace(/s$/, "").replace(/e$/, "") }
function placeWords(value: string) { return foldSearchText(value).split(" ").filter(Boolean).map(placeWord) }

/**
 * Qui reconnaît les lieux de fouille dans un emplacement d'item. Un emplacement est une liste
 * (« Marais - Désert - Forêt noire ») ; chaque morceau va au lieu dont tous les mots y sont,
 * le plus précis l'emportant (« Forêt noire » plutôt que « Forêt », « Maison noble » plutôt
 * que « Maison »).
 */
export function searchPlaceMatcher(places: readonly string[]) {
  const known = places.map((place) => ({ place, words: placeWords(place) })).filter((entry) => entry.words.length)
  return (value: string): SearchPlace[] => {
    const found = new Set<SearchPlace>()
    for (const part of value.split(/\s+[-–—]\s+|\s*-\s*\n|[,;\n]+|\s+-$|^-\s+/)) {
      const words = new Set(placeWords(part))
      if (!words.size) continue
      const matches = known.filter((entry) => entry.words.every((word) => words.has(word)))
      const longest = Math.max(0, ...matches.map((entry) => entry.words.length))
      for (const entry of matches) if (entry.words.length === longest) found.add(entry.place)
    }
    return [...found]
  }
}

/** Les lieux de fouille d'origine trouvés dans un emplacement (sans l'onglet Environnement). */
export function searchPlacesIn(value: string, places: readonly string[] = searchPlaces): SearchPlace[] {
  return searchPlaceMatcher(places)(value)
}

/** Un tirage tel qu'il est gardé : l'objet est relu dans le catalogue par son identifiant. */
export type SearchDraw = {
  id: string
  at: string
  result: SearchResult
  place: SearchPlace
  roll: number
  rarity: ShopRarity
  /** Vide quand aucun objet de cette rareté n'est répertorié pour ce lieu. */
  itemId: string
  itemName: string
  /** L'objet vient d'un autre lieu, faute d'objet de cette rareté ici. */
  elsewhere: boolean
  pinned: boolean
  /** Le nom de qui l'a reçu, une fois transféré. */
  givenTo: string
}

/** Les 20 derniers tirages restent ; un tirage épinglé ne s'efface jamais seul. */
export const SEARCH_DRAW_KEEP = 20
export const SEARCH_DRAW_MAX_PINNED = 40

export function keepSearchDraws(draws: SearchDraw[]) {
  const sorted = [...draws].sort((left, right) => right.at.localeCompare(left.at))
  let unpinned = 0
  let pinned = 0
  return sorted.filter((draw) => draw.pinned ? ++pinned <= SEARCH_DRAW_MAX_PINNED : ++unpinned <= SEARCH_DRAW_KEEP)
}

const resultKeys = new Set<string>(searchResults.map((result) => result.key))
const rarityKeys = new Set<string>(Object.keys(searchRarityLabels))

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : ""
}

/** Relit des tirages venus du navigateur ou du stockage partagé ; ignore le reste. */
export function parseSearchDraws(value: unknown): SearchDraw[] {
  if (!Array.isArray(value)) return []
  return keepSearchDraws(value.flatMap<SearchDraw>((candidate) => {
    if (!candidate || typeof candidate !== "object") return []
    const draw = candidate as Record<string, unknown>
    const id = text(draw.id, 80)
    const roll = Number(draw.roll)
    if (!id || !resultKeys.has(String(draw.result)) || !text(draw.place, 120).trim() || !rarityKeys.has(String(draw.rarity)) || !Number.isInteger(roll) || roll < 1 || roll > 100) return []
    return [{
      id,
      at: text(draw.at, 40) || new Date(0).toISOString(),
      result: draw.result as SearchResult,
      place: text(draw.place, 120).trim(),
      roll,
      rarity: draw.rarity as ShopRarity,
      itemId: text(draw.itemId, 300),
      itemName: text(draw.itemName, 200),
      elsewhere: draw.elsewhere === true,
      pinned: draw.pinned === true,
      givenTo: text(draw.givenTo, 200),
    }]
  }))
}
