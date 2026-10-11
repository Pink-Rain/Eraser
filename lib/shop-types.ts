import type { CityKey, ShopGeneratorItem } from "@/lib/shop-schema"
import type { IndexColumnSpec } from "@/lib/index-columns"

/**
 * Les types de magasin (Marché, Librairie…). Chaque ligne de l'onglet « Magasin » de
 * l'Index des lieux en décrit un ; les types prévus par Eraser servent tant que l'onglet
 * ne les reprend pas (ou s'il est illisible). Sans import serveur : lu par le générateur.
 */

/** « Apparaît dans » : la génération d'une ville (Magasins), les événements de session, les deux, aucun. */
export type ShopAppearance = "shops" | "events" | "both" | "none"

export type ShopTypeDefinition = {
  /** Identifiant stable, gardé dans chaque magasin sauvegardé (« Type de magasin »). */
  key: string
  name: string
  /** Une étiquette de `shopTypeIcons` (« Boutique », « Livre »…). */
  icon: string
  color: string
  /** Les emplacements des items vendus ici, tels qu'écrits dans l'index (« Marché », « Librairie »). */
  places: string[]
  /** Types et sous-types autorisés ; vide : tous. */
  types: string[]
  subtypes: string[]
  /** Les index où l'on trouve ce qui se vend : « objects » (les items) et d'autres (« creatures »…). */
  finds: string[]
  /** Nombre d'items fixe ou tiré entre deux bornes ; `null` : selon la taille du magasin. */
  count: { min: number; max: number } | null
  /** Chance d'apparaître (en %) selon la taille de la ville. */
  chances: Record<CityKey, number>
  appearsIn: ShopAppearance
}

export const cityKeys: CityKey[] = ["bourg", "village", "small-city", "medium-city", "large-city", "capital"]
export const cityLabels: Record<CityKey, string> = { bourg: "Bourg", village: "Village", "small-city": "Petite ville", "medium-city": "Ville moyenne", "large-city": "Grande ville", capital: "Capitale" }

/** Les icônes proposées dans la colonne « Icône » : étiquette française → icône Lucide. */
export const shopTypeIcons: Record<string, string> = {
  Boutique: "Store", Livre: "BookOpen", Gemme: "Gem", Bouclier: "Shield", Pilier: "Landmark", Fiole: "Beaker", Couverts: "UtensilsCrossed",
  Caravane: "Caravan", Épée: "Sword", Couronne: "Crown", Clé: "KeyRound", Plume: "Feather", Feuille: "Leaf", Crâne: "Skull", Ancre: "Anchor",
  Pièces: "Coins", Patte: "PawPrint", Marteau: "Hammer", Parchemin: "Scroll", Étoile: "Sparkles",
}

const chances = (values: number[]): Record<CityKey, number> => Object.fromEntries(cityKeys.map((key, index) => [key, values[index] ?? 0])) as Record<CityKey, number>
const base = { color: "", types: [], subtypes: [], finds: ["objects"], count: null, appearsIn: "shops" as ShopAppearance }

/** Les types d'origine d'Eraser : exactement le générateur d'avant l'onglet « Magasin ». */
export const builtinShopTypes: ShopTypeDefinition[] = [
  { ...base, key: "market", name: "Marché", icon: "Boutique", places: ["Marché", "Marché ordinaire"], chances: chances([100, 100, 100, 100, 100, 100]) },
  { ...base, key: "bookshop", name: "Librairie", icon: "Livre", places: ["Librairie"], chances: chances([20, 20, 40, 40, 50, 70]) },
  { ...base, key: "antique", name: "Antiquaire", icon: "Gemme", places: ["Antiquaire"], chances: chances([10, 30, 50, 70, 90, 100]) },
  { ...base, key: "armory", name: "Armurerie", icon: "Bouclier", places: ["Armurier", "Armurerie"], chances: chances([30, 50, 70, 90, 100, 100]) },
  { ...base, key: "black-market", name: "Marché noir", icon: "Pilier", places: ["Marché noir"], chances: chances([10, 20, 30, 50, 70, 100]) },
  { ...base, key: "alchemist", name: "Alchimiste", icon: "Fiole", places: ["Alchimiste"], chances: chances([40, 50, 60, 70, 80, 100]) },
  { ...base, key: "tavern", name: "Taverne", icon: "Couverts", places: ["Taverne"], chances: chances([100, 100, 100, 100, 100, 100]) },
  { ...base, key: "travelling-market", name: "Marché ambulant", icon: "Caravane", places: ["Marché ambulant"], count: { min: 4, max: 8 }, chances: chances([0, 0, 0, 0, 0, 0]), appearsIn: "events" },
]

export function foldText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, " ").trim()
}

/** Une case qui liste plusieurs valeurs : « Marché ordinaire - Marché ambulant », ou une par ligne. */
export function listCell(value: string) {
  return value.replace(/<[^>]+>/g, "\n").split(/\s*-\s+|\s+-\s*|\n|;|,/).map((part) => part.trim()).filter(Boolean)
}

export function shopTypeKeyOf(name: string) {
  return foldText(name).replace(/\s+/g, "-").slice(0, 60) || "magasin"
}

/* ---------- l'onglet « Magasin » ---------- */

export const SHOP_TYPE_HEADERS = {
  key: "Clé",
  icon: "Icône",
  color: "Couleur",
  places: "Emplacements",
  types: "Types autorisés",
  subtypes: "Sous-types autorisés",
  finds: "Trouvailles",
  count: "Nombre d'items",
  appearsIn: "Apparaît dans",
} as const
export const cityChanceHeader = (city: CityKey) => `Chance ${cityLabels[city]} (%)`

const appearanceLabels: Record<ShopAppearance, string> = { shops: "Magasins", events: "Événements", both: "Les deux", none: "Aucun" }
/** Les index proposés dans « Trouvailles » ; un autre index se tape à la main, par son nom. */
export const findLabels: Record<string, string> = { objects: "Items", creatures: "Créatures" }

/** Les colonnes que l'onglet doit avoir, et leur type dans le moteur des index. */
export function shopTypeColumns(): Array<{ header: string; spec: IndexColumnSpec }> {
  const choice = (values: string[], extra: Partial<IndexColumnSpec> = {}): IndexColumnSpec => ({ kind: "choice", options: values.map((value) => ({ value })), ...extra })
  return [
    { header: SHOP_TYPE_HEADERS.icon, spec: choice(Object.keys(shopTypeIcons)) },
    { header: SHOP_TYPE_HEADERS.color, spec: { kind: "color" } },
    { header: SHOP_TYPE_HEADERS.places, spec: choice([], { multiple: true, allowCustom: true, description: "Les emplacements des items vendus ici, comme écrits dans l’Index des items (« Marché », « Librairie »). Le plus précis l’emporte : « Marché noir » ne va pas au Marché." }) },
    { header: SHOP_TYPE_HEADERS.types, spec: choice([], { multiple: true, allowCustom: true, description: "Vide : tous les types." }) },
    { header: SHOP_TYPE_HEADERS.subtypes, spec: choice([], { multiple: true, allowCustom: true, description: "Vide : tous les sous-types." }) },
    { header: SHOP_TYPE_HEADERS.finds, spec: choice(Object.values(findLabels), { multiple: true, allowCustom: true, description: "Les index où l’on trouve ce qui se vend ici. Vide : les items." }) },
    { header: SHOP_TYPE_HEADERS.count, spec: { kind: "rich", description: "Vide : selon la taille du magasin. Sinon un nombre (« 6 ») ou deux bornes (« 4-8 »)." } },
    ...cityKeys.map((city) => ({ header: cityChanceHeader(city), spec: { kind: "number", number: { suffix: " %" } } as IndexColumnSpec })),
    { header: SHOP_TYPE_HEADERS.appearsIn, spec: choice(Object.values(appearanceLabels)) },
    { header: SHOP_TYPE_HEADERS.key, spec: { kind: "rich", description: "Ne pas modifier : relie les magasins sauvegardés à ce type. Vide : tirée du nom." } },
  ]
}

/** Les cases d'une ligne pour un type (création de l'onglet). */
export function shopTypeRowFields(type: ShopTypeDefinition): Record<string, string> {
  return {
    [SHOP_TYPE_HEADERS.key]: type.key,
    [SHOP_TYPE_HEADERS.icon]: type.icon,
    [SHOP_TYPE_HEADERS.color]: type.color,
    [SHOP_TYPE_HEADERS.places]: type.places.join(" - "),
    [SHOP_TYPE_HEADERS.types]: type.types.join(" - "),
    [SHOP_TYPE_HEADERS.subtypes]: type.subtypes.join(" - "),
    [SHOP_TYPE_HEADERS.finds]: type.finds.map((key) => findLabels[key] ?? key).join(" - "),
    [SHOP_TYPE_HEADERS.count]: type.count ? (type.count.min === type.count.max ? String(type.count.min) : `${type.count.min}-${type.count.max}`) : "",
    ...Object.fromEntries(cityKeys.map((city) => [cityChanceHeader(city), String(type.chances[city])])),
    [SHOP_TYPE_HEADERS.appearsIn]: appearanceLabels[type.appearsIn],
  }
}

function countOf(value: string): ShopTypeDefinition["count"] {
  const numbers = (value.match(/\d+/g) ?? []).map(Number).filter((number) => number > 0).map((number) => Math.min(number, 30))
  if (!numbers.length) return null
  const [first, second = first] = numbers
  return { min: Math.min(first, second), max: Math.max(first, second) }
}

function appearanceOf(value: string): ShopAppearance | null {
  const folded = foldText(value)
  if (!folded) return null
  if (folded.includes("deux") || (folded.includes("magasin") && folded.includes("evenement"))) return "both"
  if (folded.includes("evenement")) return "events"
  if (folded.includes("magasin")) return "shops"
  if (folded.includes("aucun")) return "none"
  return null
}

/**
 * Une ligne de l'onglet (en-tête → texte) devenue un type. Une case vide garde la valeur du
 * type d'Eraser du même nom ou de la même clé (une colonne pas encore remplie ne change rien).
 * `findKeyOf` : le nom d'un index (« Créatures ») → sa clé.
 */
export function shopTypeFromRow(cells: Record<string, string>, findKeyOf: (label: string) => string | null = (label) => Object.entries(findLabels).find(([, value]) => foldText(value) === foldText(label))?.[0] ?? null): ShopTypeDefinition | null {
  const value = (header: string) => (cells[header] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const name = value("Nom")
  if (!name) return null
  const key = value(SHOP_TYPE_HEADERS.key) ? shopTypeKeyOf(value(SHOP_TYPE_HEADERS.key)) : ""
  const builtin = builtinShopTypes.find((type) => (key && type.key === key) || (!key && foldText(type.name) === foldText(name)))
  const fallback = builtin ?? { ...builtinShopTypes[0], key: key || shopTypeKeyOf(name), name, icon: "Boutique", places: [name], chances: chances([]), count: null, appearsIn: "shops" as ShopAppearance }
  const list = (header: string) => listCell(cells[header] ?? "")
  const finds = list(SHOP_TYPE_HEADERS.finds).map((label) => findKeyOf(label)).filter((found): found is string => Boolean(found))
  const color = value(SHOP_TYPE_HEADERS.color)
  return {
    key: key || builtin?.key || shopTypeKeyOf(name),
    name,
    icon: shopTypeIcons[value(SHOP_TYPE_HEADERS.icon)] ? value(SHOP_TYPE_HEADERS.icon) : fallback.icon,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : fallback.color,
    places: list(SHOP_TYPE_HEADERS.places).length ? list(SHOP_TYPE_HEADERS.places) : fallback.places,
    types: cells[SHOP_TYPE_HEADERS.types] !== undefined ? list(SHOP_TYPE_HEADERS.types) : fallback.types,
    subtypes: cells[SHOP_TYPE_HEADERS.subtypes] !== undefined ? list(SHOP_TYPE_HEADERS.subtypes) : fallback.subtypes,
    finds: finds.length ? [...new Set(finds)] : fallback.finds,
    count: value(SHOP_TYPE_HEADERS.count) ? countOf(value(SHOP_TYPE_HEADERS.count)) : fallback.count,
    chances: Object.fromEntries(cityKeys.map((city) => {
      const raw = value(cityChanceHeader(city)).replace(",", ".")
      const number = Number.parseFloat(raw)
      return [city, raw && Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback.chances[city]]
    })) as Record<CityKey, number>,
    appearsIn: appearanceOf(value(SHOP_TYPE_HEADERS.appearsIn)) ?? fallback.appearsIn,
  }
}

/** Les types de l'onglet, plus ceux d'Eraser qu'il ne reprend pas encore. Une clé en double : la première ligne gagne. */
export function mergeShopTypes(rows: ShopTypeDefinition[]) {
  const seen = new Set<string>()
  const fromSheet = rows.filter((type) => !seen.has(type.key) && seen.add(type.key))
  return [...fromSheet, ...builtinShopTypes.filter((type) => !seen.has(type.key))]
}

/* ---------- ce que vend un type ---------- */

/**
 * Qui vend quoi : chaque emplacement d'une case (« Marché ordinaire - Marché noir ») va au
 * type dont l'emplacement correspond le plus précisément (« Marché noir » plutôt que « Marché »).
 */
export function shopPlaceMatcher(types: ShopTypeDefinition[]) {
  const entries = types.flatMap((type) => type.places.map((place) => ({ key: type.key, place: foldText(place) }))).filter((entry) => entry.place)
  const cache = new Map<string, Set<string>>()
  return (value: string, key: string) => {
    let owners = cache.get(value)
    if (!owners) {
      owners = new Set<string>()
      for (const segment of listCell(value).map(foldText)) {
        const matches = entries.filter((entry) => ` ${segment} `.includes(` ${entry.place} `) || segment.startsWith(entry.place))
        const longest = Math.max(0, ...matches.map((entry) => entry.place.length))
        for (const entry of matches) if (entry.place.length === longest) owners.add(entry.key)
      }
      cache.set(value, owners)
    }
    return owners.has(key)
  }
}

/** Le type et le sous-type d'un item sont-ils permis par ce type de magasin ? */
export function shopTypeAllows(type: ShopTypeDefinition, item: Pick<ShopGeneratorItem, "type" | "subtype">) {
  const allowed = (list: string[], value: string) => !list.length || list.some((entry) => foldText(entry) === foldText(value))
  return allowed(type.types, item.type) && allowed(type.subtypes, item.subtype)
}

/** L'index d'où vient un item (« objects » pour l'Index des items). */
export function itemSourceOf(item: Pick<ShopGeneratorItem, "source">) {
  return item.source || "objects"
}

export function shopTypeOf(types: ShopTypeDefinition[], key: string): ShopTypeDefinition {
  return types.find((type) => type.key === key) ?? builtinShopTypes.find((type) => type.key === key) ?? { ...builtinShopTypes[0], key, name: "Magasin", places: [], appearsIn: "none" }
}
