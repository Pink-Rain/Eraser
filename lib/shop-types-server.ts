import { objectLocationColumns } from "@/lib/object-combat"
import type { ShopGeneratorItem } from "@/lib/shop-schema"
import {
  builtinShopTypes, cityChanceHeader, cityKeys, findLabels, foldText, mergeShopTypes, SHOP_TYPE_HEADERS, shopTypeColumns,
  shopTypeFromRow, shopTypeRowFields, type ShopTypeDefinition,
} from "@/lib/shop-types"
import { worldIndexDefinitions } from "@/lib/world-index-definitions"
import { addWorldIndexRow, applyWorldSchemaOperations, getWorldIndex, knownWorldIndexKey } from "@/lib/world-indexes"
import type { WorldIndexTable } from "@/lib/world-indexes"
import type { WorldIndexKey } from "@/lib/world-index-definitions"

/** L'onglet de l'Index des lieux qui décrit les types de magasin. */
export const SHOP_TYPE_TAB = "Magasin"
const isShopTypeTab = (name: string) => ["magasin", "magasins", "types de magasin", "types de magasins"].includes(foldText(name))

function plain(value: string | undefined) {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

/** « Créatures » → « creatures » : un index prévu par Eraser, par son titre ou sa clé. */
function findKeyOf(label: string) {
  const folded = foldText(label)
  const builtin = Object.entries(findLabels).find(([key, value]) => foldText(value) === folded || key === folded)?.[0]
  if (builtin) return builtin
  return Object.values(worldIndexDefinitions).find((definition) => foldText(definition.title) === folded || foldText(definition.sheetName) === folded || definition.key === folded)?.key ?? null
}

export type ShopTypeCatalog = {
  types: ShopTypeDefinition[]
  /** L'onglet trouvé dans l'Index des lieux ; vide : les types d'Eraser seuls. */
  tab: string
  /** Colonnes ou types d'Eraser absents de l'onglet (« Préparer l'onglet » les ajoute). */
  missingColumns: string[]
  missingTypes: string[]
  error: string
}

export function shopTypesFromTable(table: Pick<WorldIndexTable, "headers" | "rows"> | undefined) {
  if (!table) return []
  return table.rows.flatMap((row) => {
    const cells = Object.fromEntries(table.headers.map((header, index) => [header.trim(), plain(row.values[index])]))
    return shopTypeFromRow(cells, findKeyOf) ?? []
  })
}

/**
 * Le catalogue des types de magasin : l'onglet « Magasin » de l'Index des lieux (lu dans la
 * copie en mémoire de l'index, sans relecture de Google), complété par les types d'Eraser.
 * Illisible : les types d'Eraser, avec la raison.
 */
export async function loadShopTypeCatalog(options: { refresh?: boolean } = {}): Promise<ShopTypeCatalog> {
  try {
    const data = await getWorldIndex("places", options)
    const table = data.tables.find((candidate) => isShopTypeTab(candidate.tabName))
    if (!table) return { types: builtinShopTypes, tab: "", missingColumns: [], missingTypes: builtinShopTypes.map((type) => type.name), error: "" }
    const rows = shopTypesFromTable(table)
    const headers = new Set(table.headers.map((header) => foldText(header)))
    const expected = shopTypeColumns().map((column) => column.header)
    return {
      types: mergeShopTypes(rows),
      tab: table.tabName,
      missingColumns: expected.filter((header) => !headers.has(foldText(header))),
      missingTypes: builtinShopTypes.filter((type) => !rows.some((row) => row.key === type.key)).map((type) => type.name),
      error: "",
    }
  } catch (error) {
    console.error("SHOP_TYPES_READ_FAILED", error instanceof Error ? error.message : error)
    return { types: builtinShopTypes, tab: "", missingColumns: [], missingTypes: [], error: "L’onglet Lieux › Magasin n’a pas pu être lu : les types de magasin d’origine sont utilisés." }
  }
}

/**
 * Les trouvailles venues d'autres index que les items (« Créatures »…) : chaque ligne qui a un
 * emplacement et une rareté devient une trouvaille, avec son index d'origine (`source`).
 */
export async function loadShopFinds(types: ShopTypeDefinition[]): Promise<ShopGeneratorItem[]> {
  const keys = [...new Set(types.flatMap((type) => type.finds))].filter((key) => key !== "objects")
  const lists = await Promise.all(keys.map(async (key) => {
    const known = await knownWorldIndexKey(key)
    if (!known) return []
    try {
      const data = await getWorldIndex(known as WorldIndexKey)
      return data.tables.flatMap((table) => findsOfTable(known, table))
    } catch (error) {
      console.error("SHOP_FINDS_READ_FAILED", key, error instanceof Error ? error.message : error)
      return []
    }
  }))
  return lists.flat()
}

function findsOfTable(key: string, table: WorldIndexTable): ShopGeneratorItem[] {
  const column = (...names: string[]) => table.headers.findIndex((header) => names.some((name) => foldText(header) === foldText(name)))
  const at = { name: column("Nom"), id: column("ID"), description: column("Description", "Note", "Histoire / Lore"), type: column("Type"), subtype: column("Sous-type"), price: column("Prix", "Valeur"), icon: column("Icône", "Portrait") }
  const locations = objectLocationColumns(table.headers)
  if (at.name < 0 || !locations.some((entry) => entry.place >= 0 && entry.rarity >= 0)) return []
  return table.rows.flatMap((row) => {
    const name = plain(row.values[at.name])
    const id = at.id >= 0 ? plain(row.values[at.id]) : ""
    if (!name || !id) return []
    const found = locations.map((entry) => ({ place: entry.place >= 0 ? plain(row.values[entry.place]) : "", rarity: entry.rarity >= 0 ? plain(row.values[entry.rarity]) : "" })).filter((entry) => entry.place && entry.rarity)
    if (!found.length) return []
    const text = (index: number) => index >= 0 ? plain(row.values[index]) : ""
    const icon = text(at.icon)
    return [{
      id: `${key}:${id}`,
      name,
      description: text(at.description),
      effect: "",
      nameHtml: "",
      descriptionHtml: at.description >= 0 ? row.html[at.description] ?? "" : "",
      effectHtml: "",
      type: text(at.type) || (worldIndexDefinitions[key as keyof typeof worldIndexDefinitions]?.title ?? key),
      subtype: text(at.subtype),
      price: text(at.price),
      // Un portrait (adresse) sert d'icône ; un texte libre ne s'affiche pas en image.
      icon: /^(https:\/\/|\/api\/)/.test(icon) || [...icon].length <= 2 ? icon : "",
      source: key,
      locations: found,
    }]
  })
}

/**
 * « Préparer l'onglet » (admin) : relit l'Index des lieux sans cache, crée l'onglet s'il
 * manque, ajoute à droite les colonnes absentes et une ligne par type d'Eraser absent. Rien
 * n'est effacé ni déplacé : une case déjà remplie garde sa valeur.
 */
export async function prepareShopTypeTab() {
  const data = await getWorldIndex("places", { refresh: true })
  let table = data.tables.find((candidate) => isShopTypeTab(candidate.tabName))
  const columns = shopTypeColumns()
  if (!table) {
    await applyWorldSchemaOperations("places", [{ op: "add-tab", name: SHOP_TYPE_TAB, columns }])
  } else {
    const existing = new Set(table.headers.map((header) => foldText(header)))
    const missing = columns.filter((column) => !existing.has(foldText(column.header)))
    if (missing.length) await applyWorldSchemaOperations("places", missing.map((column) => ({ op: "add-column" as const, tab: table!.tabName, header: column.header, spec: column.spec })))
  }
  const fresh = await getWorldIndex("places", { refresh: true })
  table = fresh.tables.find((candidate) => isShopTypeTab(candidate.tabName))
  if (!table) throw new Error("WORLD_INDEX_TAB_NOT_FOUND")
  // Un type d'Eraser déjà là sous sa clé ne bouge pas ; une ligne du même nom sans clé est
  // seulement complétée (ses cases vides), sinon une ligne est ajoutée.
  const keyColumn = table.headers.findIndex((header) => foldText(header) === foldText(SHOP_TYPE_HEADERS.key))
  const keyed = new Set(keyColumn < 0 ? [] : table.rows.map((row) => foldText(plain(row.values[keyColumn])).replace(/\s+/g, "-")).filter(Boolean))
  const added: string[] = []
  for (const type of builtinShopTypes) {
    if (keyed.has(type.key)) continue
    const fields: Record<string, string> = { Nom: type.name, ...shopTypeRowFields(type) }
    await addWorldIndexRow("places", table.tabName, table.headers.map((header) => fields[header.trim()] ?? ""), table.headers)
    added.push(type.name)
  }
  return { tab: table.tabName, added }
}

// Pour les tests : les en-têtes attendus, dans l'ordre.
export const shopTypeHeaders = ["Nom", ...shopTypeColumns().map((column) => column.header)]
export { cityChanceHeader, cityKeys, SHOP_TYPE_HEADERS }

/**
 * Ce qu'il faut au générateur : les types (Lieux › Magasin) et tout ce qui peut se vendre,
 * items et trouvailles des autres index. `items` vaut `null` si l'Index des items est illisible.
 */
export async function loadShopGeneratorData() {
  const { loadShopGeneratorItems } = await import("@/lib/shop-schema")
  const [catalog, objects] = await Promise.all([loadShopTypeCatalog(), loadShopGeneratorItems().catch(() => null)])
  const finds = objects ? await loadShopFinds(catalog.types) : []
  return { catalog, items: objects ? [...objects, ...finds] : null }
}

/** L'état de l'onglet pour la page (le bouton « Préparer l'onglet » n'est montré qu'à un admin). */
export function catalogState(catalog: ShopTypeCatalog, isAdmin: boolean) {
  return { tab: catalog.tab, missingColumns: catalog.missingColumns, missingTypes: catalog.missingTypes, error: catalog.error, canPrepare: isAdmin }
}
