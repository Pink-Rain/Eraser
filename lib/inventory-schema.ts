import type { ColumnStyle } from "@/lib/index-columns"

export const inventoryCategories = ["Armes", "Équipement", "Esthétique", "Inventaire", "Bourse"] as const

export type InventoryCategory = (typeof inventoryCategories)[number]

export type InventoryContainerTypeRecord = {
  id: string
  name: string
  category: InventoryCategory
  capacity: number
  columns: string[]
  active: boolean
}

export type InventoryItemRecord = {
  id: string
  name: string
  description: string
  type: string
  subtype: string
  effect: string
  /** Mise en forme d'origine (couleurs, gras, liens) quand l'objet vient de l'index. */
  nameHtml: string
  descriptionHtml: string
  effectHtml: string
  maxQuantity: number
  weight: string
  price: string
  bulk: string
  image: string
  icon: string
  notes: string
  link: string
  rarity: string
  attributes: string
  prerequisites: string
  edition: string
  active: boolean
} & ObjectCombatFields // Compétence, Distance, Action, Valeur… de l'index des objets (absentes sinon).

/**
 * Les colonnes de combat des index d'objets. Eraser les ajoute à droite des tableaux
 * qui ne les ont pas ; l'inventaire et les magasins les affichent avec la description
 * (Attributs : avec l'effet) quand elles sont remplies.
 */
export const objectCombatColumns = [
  { key: "skill", header: "Compétence", aliases: ["Compétence", "Competence", "Compétences", "Competences"] },
  { key: "distance", header: "Distance", aliases: ["Distance", "Portée", "Portee"] },
  { key: "action", header: "Action", aliases: ["Action", "Actions"] },
  { key: "reload", header: "Action de rechargement", aliases: ["Action de rechargement", "Rechargement", "Action rechargement"] },
  { key: "value", header: "Valeur", aliases: ["Valeur"] },
  { key: "attributes", header: "Attributs", aliases: ["Attributs", "Attribut"] },
  { key: "materials", header: "Matériaux", aliases: ["Matériaux", "Matériau", "Materiaux", "Materiau"] },
  { key: "runes", header: "Runes", aliases: ["Runes", "Rune"] },
] as const

/** Les en-têtes du prix. Un tableau sans aucun d'eux qui a une « Valeur » : c'est son prix (avant « Prix partout »). */
export const objectPriceHeaders = ["Prix", "Coût", "Cout"]

/** Les en-têtes de la rareté de l'emplacement principal et du secondaire (« Rareté » en double avant). */
export const objectPrimaryRarityHeaders = ["Rareté principale", "Rareté principal", "Rarete principale", "Rarete principal"]
export const objectSecondaryRarityHeaders = ["Rareté secondaire", "Rarete secondaire"]

/** Le nom qu'avait la colonne Valeur dans la version précédente. */
export const legacyObjectValueHeaders = ["Dégâts", "Dégât", "Degats", "Degat", "Dommages"]

/** Le rendu d'une colonne d'objets : son style imposé, ses options (couleurs), son unité. */
export type ObjectTraitLook = { style?: ColumnStyle; options?: Array<{ value: string; color?: string }>; unit?: string }

/** Les colonnes affichées sous l'effet dans le rendu de leur colonne (Matériaux et Runes : à leur couleur). */
export type ObjectTraitLookKey = "skill" | "distance" | "action" | "reload" | "attributes" | "value"

export type ObjectCombatFields = Partial<Record<(typeof objectCombatColumns)[number]["key"], string>> & {
  looks?: Partial<Record<ObjectTraitLookKey, ObjectTraitLook>>
}

export type InventorySlotRecord = {
  id: string
  index: number
  itemId: string
  quantity: number
  equipped: boolean
  /** Liens vers des caractéristiques ou compétences, au format JSON. Voir `lib/item-modifiers`. */
  modifiers: string
  item: InventoryItemRecord | null
}

export type InventoryContainerRecord = {
  id: string
  typeId: string
  name: string
  category: InventoryCategory
  capacity: number
  order: number
  isBase: boolean
  used: number
  slots: InventorySlotRecord[]
}

export type CharacterInventoryRecord = {
  containerTypes: InventoryContainerTypeRecord[]
  containers: InventoryContainerRecord[]
  items: InventoryItemRecord[]
  /** Lu sans le catalogue des objets (Google indisponible un instant) : à redemander. */
  catalogMissing?: boolean
}

export type InventoryTransferTarget = {
  id: string
  name: string
  kind: "campaign" | "character" | "npc"
  campaignId: string
  campaignName: string
}

export const baseInventoryContainerTypes: InventoryContainerTypeRecord[] = [
  { id: "TYPE-ARMES-BASE", name: "Armes de base", category: "Armes", capacity: 6, columns: [], active: true },
  { id: "TYPE-EQUIPEMENT-BASE", name: "Équipement de base", category: "Équipement", capacity: 8, columns: [], active: true },
  { id: "TYPE-ESTHETIQUE-BASE", name: "Purement esthétique", category: "Esthétique", capacity: 1, columns: [], active: true },
  { id: "TYPE-SAC-BASE", name: "Sac de base", category: "Inventaire", capacity: 15, columns: [], active: true },
  { id: "TYPE-BOURSE-BASE", name: "Bourse de base", category: "Bourse", capacity: 300, columns: ["Or", "Cuivre", "Or noir"], active: true },
]

export const baseInventoryTypeIds = new Set(baseInventoryContainerTypes.map((type) => type.id))

export const inventoryWorkbookTabs = [
  {
    name: "Types de contenants",
    headers: ["ID", "Nom", "Catégorie", "Capacité", "Colonnes spéciales", "Actif"],
    widths: [170, 230, 140, 110, 260, 90],
  },
  {
    name: "Contenants personnages",
    headers: ["ID", "ID personnage", "ID type", "Nom personnalisé", "Catégorie", "Capacité", "Ordre", "Créé le", "Supprimé le"],
    widths: [170, 190, 170, 220, 140, 110, 90, 170, 170],
  },
  {
    name: "Objets",
    headers: [
      "ID", "Nom", "Description", "Type", "Sous-type", "Effet", "Nombre max", "Poids", "Prix",
      "Encombrement", "Image", "Notes", "Lien", "Rareté", "Attributs", "Prérequis", "Édition", "Actif", "Icône",
    ],
    widths: [160, 220, 360, 130, 150, 320, 110, 100, 100, 120, 300, 280, 260, 120, 260, 260, 120, 90, 100],
  },
  {
    name: "Contenu inventaire",
    headers: [
      "ID", "ID personnage", "ID contenant", "Emplacement", "ID objet", "Nombre", "Nom personnalisé",
      "Description personnalisée", "Type", "Sous-type", "Effet", "Modifié le", "Équipé", "Modificateurs",
      "Nom mis en forme", "Description mise en forme", "Effet mis en forme",
    ],
    widths: [170, 190, 170, 110, 170, 100, 220, 360, 130, 150, 320, 170, 100, 320, 220, 360, 320],
  },
] as const

export function parseInventoryCategory(value: string): InventoryCategory | null {
  const normalized = value.trim().toLocaleLowerCase("fr")
  if (normalized === "arme" || normalized === "armes") return "Armes"
  if (normalized === "armure" || normalized === "equipement" || normalized === "équipement") return "Équipement"
  if (normalized === "esthetique" || normalized === "esthétique" || normalized === "purement esthetique" || normalized === "purement esthétique") return "Esthétique"
  if (normalized === "inventaire" || normalized === "objet" || normalized === "objets" || normalized === "ressource" || normalized === "ressources") return "Inventaire"
  if (normalized === "bourse" || normalized === "monnaie" || normalized === "monnaies") return "Bourse"
  return null
}

export function compatibleInventoryCategory(itemType: string): InventoryCategory {
  const normalized = itemType.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
  if (/monnaie|bourse|piece/.test(normalized)) return "Bourse"
  if (/arme|epee|dague|lame|arc|arbalete|lance|hache|marteau|masse|baton de combat|pistolet|fusil|bouclier|\becu\b/.test(normalized)) return "Armes"
  if (/equipement|armure|casque|anneau|bague|collier|amulette|botte|gant|ceinture|cape|outil/.test(normalized)) return "Équipement"
  return parseInventoryCategory(itemType) ?? "Inventaire"
}

export function canItemGoInInventoryCategory(itemType: string, category: InventoryCategory) {
  const specializedCategory = compatibleInventoryCategory(itemType)
  // L’esthétique accepte tout le catalogue, comme le sac à dos : seule la bourse reste réservée aux monnaies.
  if (category === "Esthétique" || category === "Inventaire") return specializedCategory !== "Bourse"
  return specializedCategory === category
}

/**
 * Placement automatique (ajout sans contenant choisi, transfert entre fiches) : le rangement
 * esthétique n’accueille un objet que lorsqu’il est explicitement visé, même s’il accepte tout
 * le catalogue à la recherche.
 */
export function canItemBeAutoPlacedInInventoryCategory(itemType: string, category: InventoryCategory) {
  return category !== "Esthétique" && canItemGoInInventoryCategory(itemType, category)
}

export function emptyCharacterInventory(): CharacterInventoryRecord {
  return { containerTypes: baseInventoryContainerTypes, containers: [], items: [] }
}

const catalogExtras = ["skill", "distance", "action", "reload", "value", "attributes", "materials", "runes", "looks"] as const

/**
 * Un inventaire « résumé » (lu sans le catalogue des objets, pour aller vite) n'a pas les
 * colonnes de combat des objets. Il garde celles qu'un chargement complet a déjà
 * apportées, objet par objet : sans cela, le résumé arrivé après coup les effaçait
 * (« {Valeur} » brut, plus rien sous l'effet).
 */
export function keepCatalogFields(next: CharacterInventoryRecord, previous: CharacterInventoryRecord | null | undefined): CharacterInventoryRecord {
  if (!previous) return next
  const known = new Map<string, InventoryItemRecord>()
  for (const item of previous.items) known.set(item.id, item)
  for (const container of previous.containers) for (const slot of container.slots) if (slot.item) known.set(slot.item.id, slot.item)
  const enrich = (item: InventoryItemRecord) => {
    const source = known.get(item.id)
    if (!source) return item
    const extras: Partial<InventoryItemRecord> = {}
    for (const key of catalogExtras) if (item[key] === undefined && source[key] !== undefined) (extras as Record<string, unknown>)[key] = source[key]
    return Object.keys(extras).length ? { ...item, ...extras } : item
  }
  return {
    ...next,
    items: next.items.length ? next.items.map(enrich) : previous.items,
    containers: next.containers.map((container) => ({ ...container, slots: container.slots.map((slot) => slot.item ? { ...slot, item: enrich(slot.item) } : slot) })),
  }
}
