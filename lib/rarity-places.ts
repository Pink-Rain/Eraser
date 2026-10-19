/**
 * La colonne « Rareté et emplacements » : une seule colonne pour dire où l'on trouve une
 * ligne (un objet, une créature, une ligne de n'importe quel index) et à quelle rareté. Une
 * case tient autant de raretés qu'on veut, chacune avec un ou plusieurs lieux (les
 * environnements et les magasins de l'Index des lieux) :
 *
 *   Commun : Armurerie - Marché noir
 *   Très rare : Bateau - Ville - Forêt noire
 *
 * Une ligne par rareté, la rareté puis « : », les lieux séparés par « - » : la case reste
 * lisible et modifiable dans Google Sheets. Les magasins, les fouilles et les événements
 * lisent cette colonne dans tous les index qui l'ont (lib/rarity-places-server.ts) ; les
 * anciennes colonnes « Rareté principale / Emplacement principal / … secondaire » ne servent
 * plus qu'aux tableaux qui n'ont pas encore la nouvelle colonne.
 *
 * Sans dépendance (sauf les règles des colonnes) : le serveur, la grille et les tests s'en servent.
 */
import { choiceKey, foldName, objectRarityOptions, splitListValue, type ChoiceOption, type ChoiceSource, type IndexColumnSpec } from "@/lib/index-columns"

export type RarityKey = "very-common" | "common" | "rare" | "very-rare" | "ultimate"

/** Une rareté et ses lieux. */
export type RarityPlacesEntry = { rarity: string; places: string[] }

/** Le nom proposé pour la colonne (la reprise des anciennes colonnes la crée sous ce nom). */
export const RARITY_PLACES_HEADER = "Rareté et emplacements"

/** Les en-têtes reconnus d'emblée comme une colonne « Rareté et emplacements ». */
const rarityPlacesHeaders = ["rarete et emplacements", "rarete et emplacement", "raretes et emplacements", "rarete/emplacement", "rarete / emplacement", "rarete/emplacements", "rarete - emplacement", "raretes emplacements"]

export function isRarityPlacesHeader(header: string) {
  return rarityPlacesHeaders.includes(foldName(header))
}

/** Les raretés proposées d'office : celles des magasins et de la fouille, du plus courant au plus précieux. */
export const defaultRarityOptions: ChoiceOption[] = objectRarityOptions

/** D'où viennent les lieux d'office : les environnements et les magasins de l'Index des lieux. */
export const defaultPlaceSources: ChoiceSource[] = [
  { index: "places", tab: "Environnement", onlyTab: true },
  { index: "places", tab: "Magasin", onlyTab: true },
]

/** Le réglage d'une colonne « Rareté et emplacements » toute neuve. */
export function rarityPlacesSpec(): IndexColumnSpec {
  return { kind: "rarity-places", options: defaultRarityOptions, description: "Une rareté par ligne, avec ses lieux (environnements, magasins). Les magasins, les fouilles et les événements la lisent." }
}

/** Les sources de lieux d'une colonne (celles réglées, sinon les environnements et les magasins). */
export function placeSourcesOf(spec: Pick<IndexColumnSpec, "rarityPlaces">) {
  const sources = spec.rarityPlaces?.sources?.filter((source) => source.index && source.tab)
  return sources?.length ? sources : defaultPlaceSources
}

/**
 * La rareté d'un texte, parmi les cinq que connaissent magasins et fouilles. Tolère les
 * fautes (« Utltime ») ; « Peu commun » compte comme « Commun ». `null` : pas une rareté.
 */
export function rarityKeyOf(value: string): RarityKey | null {
  const folded = value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, " ").trim()
  if (!folded) return null
  if (/\bu[lt]+[a-z]*me\b/.test(folded) || folded.includes("legendaire")) return "ultimate"
  if (folded.includes("tres rare")) return "very-rare"
  if (folded.includes("tres commun")) return "very-common"
  if (folded.includes("rare")) return "rare"
  if (folded.includes("commun")) return "common"
  return null
}

/** Les lieux d'une rareté : « Forêt - Ville », « Forêt, Ville » ou un par ligne. */
function placesOf(text: string) {
  return splitListValue(text, [], "-").map((place) => place.trim()).filter(Boolean)
}

/**
 * Les raretés et lieux d'une case. Une ligne « Rareté : lieux » par rareté ; une ligne sans
 * « : » n'a que des lieux (rareté vide), ou qu'une rareté si elle en est une. La même rareté
 * écrite deux fois réunit ses lieux.
 */
export function parseRarityPlaces(value: string): RarityPlacesEntry[] {
  const text = value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
  const entries: RarityPlacesEntry[] = []
  for (const line of text.split(/\r?\n|\s*\|\s*/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(":")
    let rarity = colon >= 0 ? trimmed.slice(0, colon).trim() : ""
    let places = colon >= 0 ? placesOf(trimmed.slice(colon + 1)) : placesOf(trimmed)
    // Une ligne qui n'est qu'une rareté (« Rare », sans lieu encore) : une rareté, pas un lieu.
    if (colon < 0 && places.length === 1 && /^(tres |peu )?(commun|rare)$|^ultime$|^legendaire$/.test(foldName(places[0]))) { rarity = places[0]; places = [] }
    const same = entries.find((entry) => choiceKey(entry.rarity) === choiceKey(rarity))
    if (same) { for (const place of places) if (!same.places.some((known) => choiceKey(known) === choiceKey(place))) same.places.push(place) }
    else entries.push({ rarity, places })
  }
  return entries
}

/** La case : une ligne par rareté (« Commun : Forêt - Ville »), les raretés vides de tout sautées. */
export function formatRarityPlaces(entries: RarityPlacesEntry[]) {
  return entries
    .map((entry) => ({ rarity: entry.rarity.trim(), places: entry.places.map((place) => place.trim()).filter(Boolean) }))
    .filter((entry) => entry.rarity || entry.places.length)
    .map((entry) => entry.places.length ? `${entry.rarity} : ${entry.places.join(" - ")}`.trim() : entry.rarity)
    .join("\n")
}

/** Toutes les paires (rareté, lieu) d'une case, dans l'ordre : ce que lisent magasins et fouilles. */
export function rarityPlacePairs(value: string) {
  return parseRarityPlaces(value).flatMap((entry) => entry.places.map((place) => ({ rarity: entry.rarity, place })))
}

/** Les raretés d'une case (sans les lieux), dans l'ordre : pour les statistiques « rareté seule ». */
export function raritiesOf(value: string) {
  return parseRarityPlaces(value).map((entry) => entry.rarity).filter(Boolean)
}

/** Les lieux d'une case (sans les raretés), sans doublon : pour les statistiques « emplacements seuls ». */
export function placesIn(value: string) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of parseRarityPlaces(value)) for (const place of entry.places) { const key = choiceKey(place); if (!seen.has(key)) { seen.add(key); out.push(place) } }
  return out
}

/**
 * La case déduite des anciennes colonnes (« Rareté principale » + « Emplacement principal »,
 * « Rareté secondaire » + « Emplacement secondaire ») : une rareté par paire remplie, la même
 * rareté réunie. `resolvePlace` réécrit un lieu sous son nom de l'Index des lieux (« Armurier »
 * → « Armurerie ») ; il garde le lieu tel quel s'il ne le connaît pas.
 */
export function entriesFromLegacy(pairs: Array<{ rarity: string; place: string }>, resolvePlace: (place: string) => string = (place) => place): RarityPlacesEntry[] {
  const entries: RarityPlacesEntry[] = []
  for (const pair of pairs) {
    const rarity = pair.rarity.replace(/<[^>]+>/g, "").trim()
    const places = placesOf(pair.place.replace(/<[^>]+>/g, " ")).map(resolvePlace)
    if (!rarity || !places.length) continue
    const same = entries.find((entry) => choiceKey(entry.rarity) === choiceKey(rarity))
    const target = same ?? { rarity, places: [] }
    if (!same) entries.push(target)
    for (const place of places) if (!target.places.some((known) => choiceKey(known) === choiceKey(place))) target.places.push(place)
  }
  return entries
}

/**
 * Un lieu tel qu'écrit dans les anciennes colonnes, sous son nom de l'Index des lieux : le nom
 * d'un environnement ou d'un magasin, ou une autre façon de l'écrire (colonne « Emplacements »
 * du magasin : « Armurier » est l'Armurerie, « Marché ordinaire » le Marché).
 */
export function placeResolver(places: Array<{ name: string; aliases?: string[] }>) {
  const byKey = new Map<string, string>()
  for (const place of places) byKey.set(choiceKey(place.name), place.name)
  for (const place of places) for (const alias of place.aliases ?? []) if (!byKey.has(choiceKey(alias))) byKey.set(choiceKey(alias), place.name)
  return (place: string) => byKey.get(choiceKey(place)) ?? place.trim()
}

/** Le lieu d'une paire est-il ce magasin, cet environnement (même nom, accents et pluriel ignorés) ? */
export function samePlace(place: string, name: string) {
  return Boolean(place.trim()) && choiceKey(place) === choiceKey(name)
}
