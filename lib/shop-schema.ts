import { objectCombatFields, objectIndexPrice } from "@/lib/google-sheets"
import { objectCatalog } from "@/lib/object-catalog"
import type { ObjectCombatFields } from "@/lib/inventory-schema"
import { objectLocationColumns } from "@/lib/object-combat"
import { shopObjectId } from "@/lib/object-item-id"
import { columnOfKind, objectTableSpecs } from "@/lib/index-kinds-server"
import { rarityPlacePairs } from "@/lib/rarity-places"
import type { ShopSale } from "@/lib/shop-purchase"

export type ShopRarity = "very-common" | "common" | "rare" | "very-rare" | "ultimate"
export type { ShopKey, VisualShopKey } from "@/lib/shop-keys"
export { isShopKey, visualShopKey } from "@/lib/shop-keys"
import type { ShopKey } from "@/lib/shop-keys"
export type ShopSize = "Minuscule" | "Petit" | "Moyen" | "Grand" | "Géant"
export type CityKey = "bourg" | "village" | "small-city" | "medium-city" | "large-city" | "capital"

export type ReusablePageOption = { id: string; name: string }

export type ShopGeneratorItem = {
  id: string
  name: string
  description: string
  effect: string
  /** Mise en forme d'origine de l'index des objets (couleurs, gras, liens). */
  nameHtml: string
  descriptionHtml: string
  effectHtml: string
  type: string
  subtype: string
  /** Le genre de l'item (colonne « Genre » : Arme, Équipement, Objet…). */
  genre?: string
  price: string
  icon: string
  /** L'index d'où vient la trouvaille (« creatures »…) ; absent : l'Index des items. */
  source?: string
  /**
   * Où on le trouve, et à quelle rareté. `exact` : lu dans la colonne « Rareté et emplacements »,
   * le lieu est le nom d'un magasin ou d'un environnement de l'Index des lieux (sinon : les
   * anciennes colonnes, reconnues par les « Emplacements » des magasins).
   */
  locations: Array<{ place: string; rarity: string; exact?: boolean }>
  /** « Nombre max » de l'Index des items : les exemplaires mis en vente au tirage. */
  maxQuantity?: number
} & ObjectCombatFields

/** `quantity` : les exemplaires en vente (absent : le « Nombre max » de l'item, sinon 1). */
export type GeneratedShopItem = ShopGeneratorItem & { rarity: ShopRarity; quantity?: number }

export type GeneratedShop = {
  id: string
  key: ShopKey
  name: string
  size: ShopSize
  cityKey: CityKey
  cityName: string
  items: GeneratedShopItem[]
}

export type SavedShopRecord = GeneratedShop & {
  pageLinked: string
  inCampaign: boolean
  npcId: string
  createdAt: string
  updatedAt: string
  /** Ce que les joueurs y ont acheté, du plus ancien au plus récent. */
  sales?: ShopSale[]
}

export type CampaignNpcRecord = {
  id: string
  pageLinked: string
  name: string
  /** « Titre » : comte, capitaine, grand prêtre… */
  title: string
  /** « Classe / métier » dans la feuille, « Fonction / classe / métier » à l'écran. */
  occupation: string
  /** Un nom de l'Index des peuples. */
  people: string
  portrait: string
  /** Vie actuelle : n'a de sens que pour un PNJ de campagne. */
  currentHp: number
  /** « Vitalité » dans les caractéristiques. */
  totalHp: number
  /** « Vitesse » dans les caractéristiques (colonne « Rapidité »). */
  speed: number
  constitution: number
  strength: number
  dexterity: number
  intelligence: number
  wisdom: number
  charisma: number
  playerNotes: string
  gmNotes: string
  inCampaign: boolean
  /** « Dans le groupe joueur » : le PNJ voyage avec le groupe, les joueurs le voient. */
  inPlayerGroup: boolean
  /** « Histoire / Lore » : la note de fond, comme celle des créatures. */
  lore: string
  /** Colonne « PNJ important » de la feuille. */
  important: boolean
  /** Noms de sorts séparés par des virgules (« Sorts des classes » ou « Sorts des créatures »). */
  activeSpells?: string
  passiveSpells?: string
  createdByUid: string
  createdAt: string
  updatedAt: string
}

function normalizedHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase()
}

function cell(headers: string[], values: string[], aliases: string[]) {
  const expected = new Set(aliases.map(normalizedHeader))
  const index = headers.findIndex((header) => expected.has(normalizedHeader(header)))
  return index >= 0 ? values[index] || "" : ""
}

/** Le « Nombre max » d'un item, s'il en a un (entier de 1 à 9 999). */
function stackLimit(value: string) {
  const count = Math.floor(Number(value.replace(",", ".").trim()))
  return Number.isFinite(count) && count >= 1 ? { maxQuantity: Math.min(9999, count) } : {}
}

export async function loadShopGeneratorItems() {
  const tables = await objectCatalog()
  return tables.flatMap<ShopGeneratorItem>((table) => {
    // La colonne « Rareté et emplacements » de l'onglet, si elle y est : elle seule dit où se
    // trouve un item ; sinon les anciennes colonnes (principal / secondaire).
    const rarityHeader = columnOfKind(objectTableSpecs(table), "rarity-places")
    const rarityColumn = rarityHeader ? table.headers.indexOf(rarityHeader) : -1
    return table.rows.flatMap((row) => {
    const name = cell(table.headers, row.values, ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]).trim()
    if (!name) return []
    // Lus par le nom des colonnes, jamais par leur position : les onglets ne les rangent pas tous pareil.
    const locations = rarityColumn >= 0
      ? rarityPlacePairs(row.values[rarityColumn] ?? "").filter((pair) => pair.rarity.trim()).map((pair) => ({ ...pair, exact: true }))
      : objectLocationColumns(table.headers)
        .map((columns) => ({ rarity: columns.rarity >= 0 ? row.values[columns.rarity] || "" : "", place: columns.place >= 0 ? row.values[columns.place] || "" : "" }))
        .filter((location) => location.rarity.trim() && location.place.trim())
    if (!locations.length) return []
    return [{
      id: shopObjectId(cell(table.headers, row.values, ["ID", "Identifiant"]), table.fileId, table.sheetId, row.rowNumber),
      name,
      description: cell(table.headers, row.values, ["Description", "Déscription"]),
      effect: cell(table.headers, row.values, ["Effet", "Effets", "Propriété", "Propriete"]),
      nameHtml: cell(table.headers, row.html, ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]),
      descriptionHtml: cell(table.headers, row.html, ["Description", "Déscription"]),
      effectHtml: cell(table.headers, row.html, ["Effet", "Effets", "Propriété", "Propriete"]),
      // Type vide : le Genre (tous les items peuvent vivre dans un même onglet), puis le nom de l'onglet.
      type: cell(table.headers, row.values, ["Type", "Catégorie", "Categorie"]) || cell(table.headers, row.values, ["Genre"]) || table.tabName,
      subtype: cell(table.headers, row.values, ["Sous-type", "Sous type", "Subtype"]),
      genre: cell(table.headers, row.values, ["Genre"]).trim(),
      price: objectIndexPrice(table, row),
      icon: cell(table.headers, row.values, ["Icône", "Icone", "Icon"]),
      locations,
      ...stackLimit(cell(table.headers, row.values, ["Nombre max", "Quantité max", "Quantite max", "Maximum", "Max"])),
      ...objectCombatFields(table, row),
    }]
    })
  })
}
