/**
 * L'affichage des items là où on les croise : l'inventaire, le magasin, la fouille. Réglé dans
 * « Index des items › Modifier › Affichage des items », un endroit à la fois.
 *
 * Chaque endroit garde sa forme, ses boutons et ce qui lui est propre (quantité, rareté du
 * tirage, prix modifiable…). Ce qui se règle, ce sont les colonnes de l'item : dans quelle zone
 * (à côté du nom, sous le nom, avec la description, avec l'effet), dans quel ordre, sous quelle
 * forme et pour qui. Une colonne absente de la liste est masquée ; une colonne ajoutée à l'index
 * l'est donc d'office. Une case vide ne s'affiche jamais.
 *
 * Une zone suit ce que l'endroit fait de sa place : « avec l'effet » est caché aux joueurs dans
 * un magasin, « avec la description » est repliée dans l'inventaire, etc.
 *
 * Sans dépendance : l'éditeur, les trois endroits, le serveur et les tests s'en servent.
 * Gardé sur le serveur partagé d'Eraser (lib/item-display-store.ts), jamais dans Google Sheets.
 */

export type ItemPlace = "inventory" | "shop" | "search"
export const itemPlaces: Array<{ value: ItemPlace; label: string; hint: string }> = [
  { value: "inventory", label: "Inventaire", hint: "Les inventaires des personnages, des PNJ, des compagnons et de la campagne." },
  { value: "shop", label: "Magasin", hint: "Les magasins : générateur, sauvegardes, sessions et journal." },
  { value: "search", label: "Fouille", hint: "Les tirages de la page Fouilles." },
]
export const isItemPlace = (value: unknown): value is ItemPlace => itemPlaces.some((place) => place.value === value)

export type ItemZone = "name" | "under" | "description" | "effect"
export const itemZones: Array<{ value: ItemZone; label: string }> = [
  { value: "name", label: "À côté du nom" },
  { value: "under", label: "Sous le nom" },
  { value: "description", label: "Avec la description" },
  { value: "effect", label: "Avec l’effet" },
]
const zoneSet = new Set<string>(itemZones.map((zone) => zone.value))

/** Ce que chaque endroit fait de chaque zone : la phrase de l'éditeur. */
export const itemZoneHints: Record<ItemPlace, Record<ItemZone, string>> = {
  inventory: {
    name: "Après le nom et ses charges.",
    under: "La ligne fine sous le nom, reliée par « · ».",
    description: "Repliée sous son chevron, dépliée d’un clic.",
    effect: "Toujours visible, sous la description.",
  },
  shop: {
    name: "Après la rareté du tirage et les exemplaires.",
    under: "La ligne fine sous le nom, reliée par « · ».",
    description: "Dans le volet déplié, sous le titre « Description ».",
    effect: "Dans le volet déplié, sous le titre « Effet » : caché aux joueurs.",
  },
  search: {
    name: "Juste après le nom.",
    under: "La ligne en capitales sous le nom, reliée par « · ».",
    description: "Toujours visible, sous le nom.",
    effect: "Toujours visible, après la description.",
  },
}

/** Ce qu'Eraser fixe dans chaque endroit, hors des colonnes : rappelé dans l'éditeur. */
export const itemPlaceFixed: Record<ItemPlace, string> = {
  inventory: "Icône, nom, charges, compétences liées, équiper, quantité, enclume, transférer, retirer.",
  shop: "Icône, nom, rareté du tirage, exemplaires, prix modifiable, relancer, choisir, acheter, déplier.",
  search: "Résultat, lieu, d100, rareté du tirage, heure, icône, nom, index d’origine, « Donné à », épingler, relancer, transférer, retirer.",
}

export type ItemFieldStyle = "value" | "label" | "text" | "pills"
export const itemFieldStyles: Array<{ value: ItemFieldStyle; label: string; hint: string }> = [
  { value: "value", label: "Valeur seule", hint: "La valeur, sans son nom." },
  { value: "label", label: "Libellé : valeur", hint: "« Poids : 2 kg »." },
  { value: "text", label: "Texte", hint: "Un paragraphe, mise en forme comprise." },
  { value: "pills", label: "Pastilles", hint: "Chaque valeur (séparées par des virgules) en pastille, aux couleurs de la liste." },
]
const styleSet = new Set<string>(itemFieldStyles.map((style) => style.value))

/** Qui voit la colonne : tout le monde, le MJ (et l'admin) seulement, les joueurs seulement. */
export type ItemAudience = "all" | "mj" | "players"
export const itemAudiences: Array<{ value: ItemAudience; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "mj", label: "MJ seul" },
  { value: "players", label: "Joueurs seuls" },
]
const audienceSet = new Set<string>(itemAudiences.map((audience) => audience.value))

/** Une colonne placée. Son style et son public par défaut ne s'enregistrent pas (`value`/`label`, `all`). */
export type ItemDisplayField = { column: string; zone: ItemZone; style?: ItemFieldStyle; audience?: ItemAudience }
/** Les colonnes d'un endroit, dans l'ordre d'affichage (zone par zone) ; une colonne absente est masquée. */
export type ItemPlaceDisplay = { fields: ItemDisplayField[] }
/** Les réglages enregistrés ; un endroit absent garde l'affichage d'Eraser. */
export type ItemDisplaySettings = Partial<Record<ItemPlace, ItemPlaceDisplay>>

/** Le lecteur : le MJ (et l'admin), ou un joueur. */
export type ItemViewer = "mj" | "players"

// ---------------------------------------------------------------------------
// Les colonnes qu'Eraser connaît déjà (lues dans l'item, retouches de l'exemplaire comprises)
// ---------------------------------------------------------------------------

/** Les traits de combat : dessinés comme leur colonne de l'index (couleurs, icônes), ensemble. */
export const itemTraitKeys = ["attributes", "materials", "runes", "skill", "distance", "action", "reload"] as const
export type ItemTraitKey = (typeof itemTraitKeys)[number]
export type ItemFieldKey = "description" | "effect" | "type" | "subtype" | "price" | "value" | ItemTraitKey

/** Le nom de chaque colonne connue, puis ce qu'on accepte à sa place (les mêmes noms que la lecture de l'index). */
export const itemKnownColumns: Array<{ key: ItemFieldKey; header: string; aliases: string[] }> = [
  { key: "type", header: "Type", aliases: ["Type", "Catégorie", "Categorie"] },
  { key: "subtype", header: "Sous-type", aliases: ["Sous-type", "Sous type", "Subtype"] },
  { key: "price", header: "Prix", aliases: ["Prix", "Coût", "Cout"] },
  { key: "description", header: "Description", aliases: ["Description", "Déscription"] },
  { key: "effect", header: "Effet", aliases: ["Effet", "Effets"] },
  { key: "value", header: "Valeur", aliases: ["Valeur"] },
  { key: "attributes", header: "Attributs", aliases: ["Attributs", "Attribut"] },
  { key: "materials", header: "Matériaux", aliases: ["Matériaux", "Matériau", "Materiaux", "Materiau"] },
  { key: "runes", header: "Runes", aliases: ["Runes", "Rune"] },
  { key: "skill", header: "Compétence", aliases: ["Compétence", "Competence", "Compétences", "Competences"] },
  { key: "distance", header: "Distance", aliases: ["Distance", "Portée", "Portee"] },
  { key: "action", header: "Action", aliases: ["Action", "Actions"] },
  { key: "reload", header: "Action de rechargement", aliases: ["Action de rechargement", "Rechargement", "Action rechargement"] },
]

/** Les colonnes qu'aucune zone ne montre : le nom, l'identifiant, l'icône et l'image ont leur place fixe. */
const fixedColumns = ["Nom", "Nom de l'objet", "ID", "Identifiant", "Icône", "Icone", "Icon", "Image", "Illustration", "URL image"]

export function foldItemColumn(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase()
}

const knownByFold = new Map(itemKnownColumns.flatMap((column) => column.aliases.map((alias) => [foldItemColumn(alias), column.key] as const)))
const fixedFolds = new Set(fixedColumns.map(foldItemColumn))

/** La colonne connue que désigne un en-tête (« Catégorie » : le type), sinon `null`. */
export function knownItemField(header: string): ItemFieldKey | null {
  return knownByFold.get(foldItemColumn(header)) ?? null
}

export const isItemTrait = (key: ItemFieldKey | null): key is ItemTraitKey => key !== null && (itemTraitKeys as readonly string[]).includes(key)

/** Une colonne qui a sa place fixe (nom, ID, icône, image) : jamais proposée. */
export function isFixedItemColumn(header: string) {
  return fixedFolds.has(foldItemColumn(header))
}

/** Deux noms de colonne qui désignent la même : même nom (accents et casse ignorés), ou même colonne connue. */
export function sameItemColumn(left: string, right: string) {
  if (foldItemColumn(left) === foldItemColumn(right)) return true
  const known = knownItemField(left)
  return known !== null && known === knownItemField(right)
}

// ---------------------------------------------------------------------------
// L'affichage d'Eraser (celui d'avant les réglages, à l'identique)
// ---------------------------------------------------------------------------

const traitFields = (zone: ItemZone): ItemDisplayField[] => itemTraitKeys.map((key) => ({ column: itemKnownColumns.find((column) => column.key === key)!.header, zone }))

const defaults: Record<ItemPlace, ItemDisplayField[]> = {
  inventory: [
    { column: "Type", zone: "under" },
    { column: "Sous-type", zone: "under" },
    { column: "Description", zone: "description", style: "text" },
    { column: "Effet", zone: "effect" },
    ...traitFields("effect"),
  ],
  shop: [
    { column: "Type", zone: "under" },
    { column: "Sous-type", zone: "under" },
    { column: "Description", zone: "description", style: "text" },
    { column: "Effet", zone: "effect", style: "text" },
    ...traitFields("effect"),
  ],
  search: [
    { column: "Type", zone: "under" },
    { column: "Sous-type", zone: "under" },
    { column: "Prix", zone: "under" },
    { column: "Description", zone: "description", style: "text" },
    { column: "Effet", zone: "effect" },
    ...traitFields("effect"),
  ],
}

/** Le style d'office d'une colonne posée dans une zone : en pastilles à côté du nom, la valeur seule sous le nom, sinon « Libellé : valeur ». */
export function defaultItemFieldStyle(zone: ItemZone): ItemFieldStyle {
  return zone === "name" ? "pills" : zone === "under" ? "value" : "label"
}

export function itemFieldStyle(field: ItemDisplayField): ItemFieldStyle {
  return field.style ?? defaultItemFieldStyle(field.zone)
}

/** L'affichage d'Eraser pour un endroit. */
export function defaultItemPlaceDisplay(place: ItemPlace): ItemPlaceDisplay {
  return { fields: defaults[place].map((field) => ({ ...field })) }
}

/** L'affichage d'un endroit : le réglé, sinon celui d'Eraser. */
export function itemPlaceDisplay(settings: ItemDisplaySettings | null | undefined, place: ItemPlace): ItemPlaceDisplay {
  return settings?.[place] ?? defaultItemPlaceDisplay(place)
}

/** Un endroit réglé exactement comme Eraser le montre d'office (rien à enregistrer). */
export function isDefaultItemPlaceDisplay(place: ItemPlace, display: ItemPlaceDisplay) {
  return JSON.stringify(cleanPlace(display)) === JSON.stringify(cleanPlace(defaultItemPlaceDisplay(place)))
}

// ---------------------------------------------------------------------------
// Lecture d'un réglage enregistré (borné, nettoyé)
// ---------------------------------------------------------------------------

const MAX_FIELDS = 80

function cleanPlace(value: unknown): ItemPlaceDisplay | null {
  if (!value || typeof value !== "object") return null
  const raw = (value as { fields?: unknown }).fields
  if (!Array.isArray(raw)) return null
  const fields: ItemDisplayField[] = []
  for (const item of raw.slice(0, MAX_FIELDS * 2)) {
    if (!item || typeof item !== "object") continue
    const source = item as Record<string, unknown>
    const column = typeof source.column === "string" ? source.column.replace(/\s+/g, " ").trim().slice(0, 120) : ""
    if (!column || !zoneSet.has(String(source.zone))) continue
    // Une colonne ne se place qu'une fois par endroit : la première l'emporte.
    if (fields.some((field) => foldItemColumn(field.column) === foldItemColumn(column))) continue
    const zone = source.zone as ItemZone
    const field: ItemDisplayField = { column, zone }
    if (styleSet.has(String(source.style)) && source.style !== defaultItemFieldStyle(zone)) field.style = source.style as ItemFieldStyle
    if (audienceSet.has(String(source.audience)) && source.audience !== "all") field.audience = source.audience as ItemAudience
    fields.push(field)
    if (fields.length >= MAX_FIELDS) break
  }
  // Rangées zone par zone, chacune dans son ordre.
  return { fields: itemZones.flatMap((zone) => fields.filter((field) => field.zone === zone.value)) }
}

/** Un endroit relu tel qu'enregistré (ou envoyé par l'éditeur) ; `null` s'il n'a pas de sens. */
export function parseItemPlaceDisplay(value: unknown): ItemPlaceDisplay | null {
  if (typeof value === "string") {
    try { return cleanPlace(JSON.parse(value)) } catch { return null }
  }
  return cleanPlace(value)
}

/** Tous les endroits relus ; ceux qui n'ont pas de sens sont oubliés (ils reprennent l'affichage d'Eraser). */
export function parseItemDisplaySettings(value: unknown): ItemDisplaySettings {
  let source = value
  if (typeof source === "string") {
    try { source = JSON.parse(source) } catch { return {} }
  }
  if (!source || typeof source !== "object") return {}
  const settings: ItemDisplaySettings = {}
  for (const place of itemPlaces) {
    const parsed = parseItemPlaceDisplay((source as Record<string, unknown>)[place.value])
    if (parsed) settings[place.value] = parsed
  }
  return settings
}

// ---------------------------------------------------------------------------
// Ce que voit un lecteur
// ---------------------------------------------------------------------------

/** Une colonne que ce lecteur voit à cet endroit (son public ; l'effet d'un magasin, jamais aux joueurs). */
export function itemFieldVisible(place: ItemPlace, field: ItemDisplayField, viewer: ItemViewer) {
  const audience = field.audience ?? "all"
  if (audience === "mj" && viewer !== "mj") return false
  if (audience === "players" && viewer !== "players") return false
  if (place === "shop" && field.zone === "effect" && viewer !== "mj") return false
  return true
}

/** Les réglages tels qu'un lecteur les reçoit : sans ce qu'il ne voit pas (le serveur les retire). */
export function itemDisplayForViewer(settings: ItemDisplaySettings, viewer: ItemViewer): Required<ItemDisplaySettings> {
  return Object.fromEntries(itemPlaces.map((place) => {
    const display = itemPlaceDisplay(settings, place.value)
    return [place.value, { fields: display.fields.filter((field) => itemFieldVisible(place.value, field, viewer)) }]
  })) as Required<ItemDisplaySettings>
}

/**
 * Les colonnes dont un lecteur doit recevoir la valeur avec les items : celles qu'un endroit lui
 * montre et qu'Eraser ne lit pas déjà dans l'item (description, effet, type, traits…).
 */
export function itemExtraColumns(settings: Required<ItemDisplaySettings>): string[] {
  const columns: string[] = []
  for (const place of itemPlaces) {
    for (const field of settings[place.value].fields) {
      if (knownItemField(field.column) || isFixedItemColumn(field.column)) continue
      if (!columns.some((column) => foldItemColumn(column) === foldItemColumn(field.column))) columns.push(field.column)
    }
  }
  return columns
}

/** Les colonnes d'une zone, dans l'ordre. */
export function itemZoneFields(display: ItemPlaceDisplay, zone: ItemZone) {
  return display.fields.filter((field) => field.zone === zone)
}

/**
 * Une colonne renommée dans l'index : chaque endroit qui la place suit son nouveau nom. Rend
 * `null` si rien ne change.
 */
export function renameItemDisplayColumns(settings: ItemDisplaySettings, renames: Array<{ from: string; to: string }>): ItemDisplaySettings | null {
  let changed = false
  const next: ItemDisplaySettings = {}
  for (const place of itemPlaces) {
    const display = settings[place.value]
    if (!display) continue
    next[place.value] = {
      fields: display.fields.map((field) => {
        const rename = renames.find((candidate) => foldItemColumn(candidate.from) === foldItemColumn(field.column))
        if (!rename || !rename.to.trim() || rename.to === field.column) return field
        changed = true
        return { ...field, column: rename.to.trim() }
      }),
    }
  }
  return changed ? next : null
}

/** Les valeurs d'une liste écrite dans une case (« Lame, Contact | Feu »). */
export function itemListValues(value: string) {
  return value.replace(/<[^>]+>/g, " ").split(/\s*[,;|\n]\s*/).map((part) => part.trim()).filter(Boolean)
}
