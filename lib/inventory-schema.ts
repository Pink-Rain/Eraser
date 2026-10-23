import type { ColumnStyle } from "@/lib/index-columns"

export const inventoryCategories = ["Armes", "Équipement", "Esthétique", "Inventaire", "Bourse", "Au sol"] as const

/**
 * « Au sol » : un seul par personnage, sans limite. Ce qui ne trouve plus de place (objet
 * reçu, ajouté, créé) y atterrit ; on ne peut pas en créer un deuxième ni le supprimer.
 */
export const GROUND_CATEGORY = "Au sol" satisfies InventoryCategory

/** Les contenants dont les cases s'ajoutent à la demande (pas de capacité). */
export function isUnlimitedInventoryCategory(category: InventoryCategory) {
  return category === "Esthétique" || category === GROUND_CATEGORY
}

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
  /**
   * Le genre de l'item (colonne « Genre » de l'Index des items) : il décide de son rangement
   * (Arme → armes, Équipement → équipement, le reste → inventaire classique). Vide : le type
   * et le sous-type en décident, comme avant.
   */
  genre?: string
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

/** Les colonnes affichées sous l’effet dans le rendu de leur colonne (Matériaux et Runes : à leur couleur, leur icône dans celle de la colonne). */
export type ObjectTraitLookKey = "skill" | "distance" | "action" | "reload" | "attributes" | "materials" | "runes" | "value"

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
  /** Un inventaire sur mesure (le + sous les deux colonnes) : sa couleur, son icône, ce qu'il accepte. */
  custom?: CustomInventoryLook
}

/**
 * Un inventaire sur mesure est un contenant « Inventaire » qui a une couleur (colonnes
 * « Couleur », « Icône », « Contenu accepté » de « Contenants personnages ») : une version
 * plus ancienne d'Eraser le voit comme un sac ordinaire.
 */
export type CustomInventoryLook = { color: string; icon: string; accepts: string; /** La colonne de l'onglet Inventaire où il s'affiche. */ side: CustomInventorySide }

export type CustomInventorySide = "left" | "right"

/** « Droite » (ou « right ») : la colonne de droite ; tout le reste, celle de gauche. */
export function customInventorySide(value: string | undefined): CustomInventorySide {
  return ["droite", "right"].includes((value ?? "").trim().toLocaleLowerCase("fr")) ? "right" : "left"
}

/** Le nom de la colonne dans la feuille. */
export function customInventorySideLabel(side: CustomInventorySide) {
  return side === "right" ? "Droite" : "Gauche"
}

/** Les icônes proposées (noms d'icônes lucide, gardés tels quels dans la feuille). */
export const customInventoryIcons = [
  "backpack", "briefcase", "package", "archive", "shopping-bag", "gem", "flask-conical", "book-open",
  "scroll", "leaf", "apple", "wrench", "hammer", "key", "feather", "sparkles", "skull", "shirt", "music", "map",
] as const

export type CustomInventoryIcon = (typeof customInventoryIcons)[number]

export const defaultCustomInventoryIcon: CustomInventoryIcon = "backpack"

export function customInventoryIcon(value: string | undefined): CustomInventoryIcon {
  return (customInventoryIcons as readonly string[]).includes(value ?? "") ? value as CustomInventoryIcon : defaultCustomInventoryIcon
}

/** Une couleur « #rrggbb » (minuscules), ou "" si la valeur n'en est pas une. */
export function customInventoryColor(value: string | undefined) {
  const trimmed = (value ?? "").trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed
  if (/^#[0-9a-f]{3}$/.test(trimmed)) return `#${[...trimmed.slice(1)].map((digit) => digit + digit).join("")}`
  return ""
}

/** Les familles qu'un inventaire sur mesure peut accepter, et leur nom dans la feuille. */
export const customInventoryFamilies = [
  { category: "Armes", label: "Armes" },
  { category: "Équipement", label: "Équipement" },
  { category: "Inventaire", label: "Objets" },
] as const satisfies ReadonlyArray<{ category: InventoryCategory; label: string }>

export type CustomInventoryFamily = (typeof customInventoryFamilies)[number]["category"]

export type CustomInventoryAccepts = { families: CustomInventoryFamily[]; keywords: string[] }

function customFamilyOf(token: string): CustomInventoryFamily | null {
  const normalized = plainCategory(token)
  if (normalized === "arme" || normalized === "armes") return "Armes"
  if (normalized === "equipement" || normalized === "equipements") return "Équipement"
  if (normalized === "objet" || normalized === "objets") return "Inventaire"
  return null
}

/**
 * « Contenu accepté », tel qu'écrit dans la feuille : des familles (Armes, Équipement, Objets)
 * et des mots-clés, séparés par « | ». Vide : tout sauf la monnaie. Exemple : « Objets | Potion ».
 */
export function parseCustomInventoryAccepts(raw: string | undefined): CustomInventoryAccepts {
  const families: CustomInventoryFamily[] = []
  const keywords: string[] = []
  for (const token of (raw ?? "").split(/\s*[|,;\n]\s*/).map((part) => part.trim()).filter(Boolean)) {
    const family = customFamilyOf(token)
    if (family) { if (!families.includes(family)) families.push(family) }
    else if (!keywords.some((keyword) => plainCategory(keyword) === plainCategory(token))) keywords.push(token.slice(0, 60))
  }
  return { families, keywords }
}

export function formatCustomInventoryAccepts(accepts: CustomInventoryAccepts) {
  const families = customInventoryFamilies.filter((family) => accepts.families.includes(family.category)).map((family) => family.label)
  // Un mot-clé en double, ou qui se lirait comme une famille (« objets »), est écarté.
  const keywords = parseCustomInventoryAccepts(accepts.keywords.join(" | ")).keywords
  return [...families, ...keywords].join(" | ")
}

/**
 * Un item rangé exprès dans un inventaire sur mesure : jamais une monnaie ; de l'une des familles
 * choisies (toutes sinon) ; et, s'il y a des mots-clés, l'un d'eux dans son nom, son type, son
 * sous-type ou son genre.
 */
export function canItemGoInCustomInventory(item: { name?: string; genre?: string; type?: string; subtype?: string }, accepts: string) {
  const family = compatibleInventoryCategory(inventoryKindOf(item))
  if (family === "Bourse") return false
  const rules = parseCustomInventoryAccepts(accepts)
  const itemFamily: CustomInventoryFamily = family === "Armes" || family === "Équipement" ? family : "Inventaire"
  if (rules.families.length && !rules.families.includes(itemFamily)) return false
  if (!rules.keywords.length) return true
  const text = plainCategory([item.name, item.type, item.subtype, item.genre].filter(Boolean).join(" "))
  return rules.keywords.some((keyword) => text.includes(plainCategory(keyword)))
}

/** Un item peut-il être rangé exprès dans ce contenant (recherche, déplacement) ? */
export function canItemGoInContainer(item: { name?: string; genre?: string; type?: string; subtype?: string }, container: { category: InventoryCategory; custom?: CustomInventoryLook }) {
  return container.custom ? canItemGoInCustomInventory(item, container.custom.accepts) : canItemGoInInventoryCategory(inventoryKindOf(item), container.category)
}

/** « Accepte… » en quelques mots, sous le nom d'un inventaire sur mesure. */
export function describeCustomInventoryAccepts(accepts: string) {
  const rules = parseCustomInventoryAccepts(accepts)
  const families = customInventoryFamilies.filter((family) => rules.families.includes(family.category)).map((family) => family.label.toLocaleLowerCase("fr"))
  const some = families.length > 0 && families.length < customInventoryFamilies.length
  const text = rules.keywords.length ? `${some ? families.join(", ") : "tout"} : ${rules.keywords.join(", ")}` : some ? `${families.join(", ")} seulement` : "tout sauf la monnaie"
  return text.charAt(0).toLocaleUpperCase("fr") + text.slice(1)
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

/** Une destination où donner un objet de l'index : l'inventaire d'une campagne, d'un personnage, d'un PNJ ou d'une créature nommée. */
export type GiveDestination = {
  id: string
  name: string
  kind: "campaign" | "character" | "npc" | "creature"
  campaignId: string
  campaignName: string
  /** Le personnage d'une créature compagnon. */
  ownerName?: string
}

/**
 * Ce que la page montrait dans la case qu'elle modifie (objet, nombre). Le serveur relit la
 * feuille et refuse si elle a changé depuis, ici ou sur une autre installation.
 */
export type InventorySlotExpectation = { itemId?: string; quantity?: number }

/** Réponse (HTTP 409) quand la case n'est plus celle que la page montrait. */
export const INVENTORY_CHANGED_MESSAGE = "L’inventaire a changé entre-temps : actualise puis recommence."

/** `expectedItemId` et `expectedQuantity` d'une requête, s'ils sont donnés. */
export function inventorySlotExpectation(body: Record<string, unknown>): InventorySlotExpectation | undefined {
  const itemId = typeof body.expectedItemId === "string" ? body.expectedItemId : undefined
  const quantity = typeof body.expectedQuantity === "number" && Number.isFinite(body.expectedQuantity) ? body.expectedQuantity : undefined
  return itemId === undefined && quantity === undefined ? undefined : { itemId, quantity }
}

export const baseInventoryContainerTypes: InventoryContainerTypeRecord[] = [
  { id: "TYPE-ARMES-BASE", name: "Armes de base", category: "Armes", capacity: 6, columns: [], active: true },
  { id: "TYPE-EQUIPEMENT-BASE", name: "Équipement de base", category: "Équipement", capacity: 8, columns: [], active: true },
  { id: "TYPE-ESTHETIQUE-BASE", name: "Purement esthétique", category: "Esthétique", capacity: 1, columns: [], active: true },
  { id: "TYPE-SAC-BASE", name: "Sac de base", category: "Inventaire", capacity: 15, columns: [], active: true },
  { id: "TYPE-BOURSE-BASE", name: "Bourse de base", category: "Bourse", capacity: 300, columns: ["Or", "Cuivre", "Or noir"], active: true },
  { id: "TYPE-SOL-BASE", name: "Au sol", category: "Au sol", capacity: 1, columns: [], active: true },
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
    // Couleur, Icône, Contenu accepté, Colonne : ceux d'un inventaire sur mesure (vides pour les autres).
    headers: ["ID", "ID personnage", "ID type", "Nom personnalisé", "Catégorie", "Capacité", "Ordre", "Créé le", "Supprimé le", "Couleur", "Icône", "Contenu accepté", "Colonne"],
    widths: [170, 190, 170, 220, 140, 110, 90, 170, 170, 100, 120, 280, 100],
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

const plainCategory = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()

export function parseInventoryCategory(value: string): InventoryCategory | null {
  const normalized = plainCategory(value)
  if (normalized === "arme" || normalized === "armes") return "Armes"
  if (normalized === "armure" || normalized === "armures" || normalized === "equipement" || normalized === "equipements") return "Équipement"
  if (normalized === "esthetique" || normalized === "purement esthetique") return "Esthétique"
  if (normalized === "inventaire" || normalized === "inventaire classique" || normalized === "objet" || normalized === "objets" || normalized === "ressource" || normalized === "ressources") return "Inventaire"
  if (normalized === "bourse" || normalized === "monnaie" || normalized === "monnaies") return "Bourse"
  if (normalized === "au sol" || normalized === "sol" || normalized === "par terre") return "Au sol"
  return null
}

/**
 * La famille d'un item d'après son genre (colonne « Genre ») : Arme, Équipement, Monnaie, ou
 * l'inventaire classique pour tout autre genre (un objet va aussi au sol ou en esthétique).
 * `null` sans genre : le type en décide.
 */
export function genreInventoryCategory(genre: string | undefined): InventoryCategory | null {
  if (!genre?.trim()) return null
  const family = parseInventoryCategory(genre)
  return family === "Armes" || family === "Équipement" || family === "Bourse" ? family : "Inventaire"
}

/**
 * Ce qui décide du rangement d'un item : son genre s'il en a un, sinon son type et son sous-type.
 * À passer à `canItemGoInInventoryCategory` et `canItemBeAutoPlacedInInventoryCategory`.
 */
export function inventoryKindOf(item: { genre?: string; type?: string; subtype?: string }) {
  const family = genreInventoryCategory(item.genre)
  if (family === "Armes") return "Arme"
  if (family === "Équipement") return "Équipement"
  if (family === "Bourse") return "Monnaie"
  if (family) return "Objet"
  return `${item.type ?? ""} ${item.subtype ?? ""}`.trim()
}

export function compatibleInventoryCategory(itemType: string): InventoryCategory {
  const normalized = itemType.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
  // Chaque mot reconnu commence un mot : « Parchemin » (arc), « Marchandise » ou « Charme » (arme)
  // passaient pour des armes, « Élégant » (gant) pour un équipement.
  if (/\b(monnaie|bourse|piece)/.test(normalized)) return "Bourse"
  if (/\b(arme|epee|dague|lame|arc|arbalete|lance|hache|marteau|masse|baton de combat|pistolet|fusil|bouclier)|\becu\b/.test(normalized)) return "Armes"
  if (/\b(equipement|armure|casque|anneau|bague|collier|amulette|botte|gant|ceinture|cape|outil)/.test(normalized)) return "Équipement"
  return parseInventoryCategory(itemType) ?? "Inventaire"
}

export function canItemGoInInventoryCategory(itemType: string, category: InventoryCategory) {
  // Tout peut être posé au sol.
  if (category === GROUND_CATEGORY) return true
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
  return category !== "Esthétique" && category !== GROUND_CATEGORY && canItemGoInInventoryCategory(itemType, category)
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
