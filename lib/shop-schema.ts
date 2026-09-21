import { listObjectIndexTables } from "@/lib/google-sheets"

export type ShopRarity = "very-common" | "common" | "rare" | "very-rare" | "ultimate"
export type ShopKey = "market" | "bookshop" | "antique" | "armory" | "black-market" | "alchemist" | "tavern"
export type ShopSize = "Minuscule" | "Petit" | "Moyen" | "Grand" | "Géant"
export type CityKey = "bourg" | "village" | "small-city" | "medium-city" | "large-city" | "capital"

export type ReusablePageOption = { id: string; name: string }

export type ShopGeneratorItem = {
  id: string
  name: string
  description: string
  effect: string
  type: string
  subtype: string
  price: string
  icon: string
  locations: Array<{ place: string; rarity: string }>
}

export type GeneratedShopItem = ShopGeneratorItem & { rarity: ShopRarity }

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
}

export type CampaignNpcRecord = {
  id: string
  pageLinked: string
  name: string
  portrait: string
  currentHp: number
  totalHp: number
  constitution: number
  strength: number
  dexterity: number
  intelligence: number
  wisdom: number
  charisma: number
  playerNotes: string
  gmNotes: string
  inCampaign: boolean
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

export async function loadShopGeneratorItems() {
  const tables = await listObjectIndexTables()
  return tables.flatMap<ShopGeneratorItem>((table) => table.rows.flatMap((row) => {
    const name = cell(table.headers, row.values, ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Equipement", "Ressource", "Livre", "Titre"]).trim()
    if (!name) return []
    const locations = [
      { rarity: row.values[6] || "", place: row.values[7] || "" },
      { rarity: row.values[8] || "", place: row.values[9] || "" },
    ].filter((location) => location.rarity.trim() && location.place.trim())
    if (!locations.length) return []
    return [{
      id: cell(table.headers, row.values, ["ID", "Identifiant"]).trim() || `${table.fileId}-${table.sheetId}-${row.rowNumber}`,
      name,
      description: cell(table.headers, row.values, ["Description", "Déscription"]),
      effect: cell(table.headers, row.values, ["Effet", "Effets", "Propriété", "Propriete"]),
      type: cell(table.headers, row.values, ["Type", "Catégorie", "Categorie"]) || table.tabName,
      subtype: cell(table.headers, row.values, ["Sous-type", "Sous type", "Subtype"]),
      price: cell(table.headers, row.values, ["Prix", "Valeur", "Coût", "Cout"]),
      icon: cell(table.headers, row.values, ["Icône", "Icone", "Icon"]),
      locations,
    }]
  }))
}
