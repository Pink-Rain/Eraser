import { indexKeyFromChoice, type IndexWithKind } from "@/lib/index-kinds-server"
import { splitListValue } from "@/lib/index-columns"
import { searchPlaces } from "@/lib/search-draws"
import { foldText } from "@/lib/shop-types"
import { ENVIRONMENT_EVENT_HEADERS, ENVIRONMENT_SEARCH_HEADERS, isEnvironmentTab } from "@/lib/world-index-definitions"
import { getWorldIndex } from "@/lib/world-indexes"

/**
 * Les lieux de fouille : les noms de l'onglet « Environnement » de l'Index des lieux (lu dans
 * la copie en mémoire de l'index, sans relecture de Google). Un lieu ajouté, renommé ou
 * supprimé là change la liste ici. Onglet absent, vide ou illisible : la liste d'origine.
 */
export async function loadSearchPlaces(): Promise<string[]> {
  try {
    const data = await getWorldIndex("places")
    const table = data.tables.find((candidate) => isEnvironmentTab(candidate.tabName))
    const column = table ? table.headers.findIndex((header) => foldText(header) === "nom") : -1
    if (!table || column < 0) return [...searchPlaces]
    const names = table.rows.map((row) => (row.values[column] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean)
    const unique = [...new Map(names.map((name) => [foldText(name), name])).values()]
    return unique.length ? unique : [...searchPlaces]
  } catch (error) {
    console.error("SEARCH_PLACES_READ_FAILED", error instanceof Error ? error.message : error)
    return [...searchPlaces]
  }
}

/**
 * Ce qu'on trouve dans chaque environnement (Lieux › Environnement) : les index de sa colonne
 * « Fouille » (en fouillant) et de sa colonne « Événement » (au cours d'un événement), par leur
 * clé. `indexes` : les index qui ont une colonne « Rareté et emplacements » (leurs titres
 * s'écrivent dans ces colonnes). Une case vide ou absente : rien de réglé (la fouille garde
 * alors les items, comme avant).
 */
export type EnvironmentRule = { place: string; search: string[]; events: string[] }

export async function loadEnvironmentRules(indexes: Array<Pick<IndexWithKind, "key" | "title">>): Promise<EnvironmentRule[]> {
  try {
    const data = await getWorldIndex("places")
    const table = data.tables.find((candidate) => isEnvironmentTab(candidate.tabName))
    if (!table) return []
    const at = (names: readonly string[]) => table.headers.findIndex((header) => names.some((name) => foldText(name) === foldText(header)))
    const name = at(["Nom"])
    const search = at(ENVIRONMENT_SEARCH_HEADERS)
    const events = at(ENVIRONMENT_EVENT_HEADERS)
    if (name < 0) return []
    const keys = (value: string) => [...new Set(splitListValue(value.replace(/<[^>]+>/g, " "), [], "-").flatMap((choice) => { const key = indexKeyFromChoice(choice, indexes); return key ? [key] : [] }))]
    return table.rows.flatMap((row) => {
      const place = (row.values[name] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      return place ? [{ place, search: search >= 0 ? keys(row.values[search] ?? "") : [], events: events >= 0 ? keys(row.values[events] ?? "") : [] }] : []
    })
  } catch (error) {
    console.error("ENVIRONMENT_RULES_READ_FAILED", error instanceof Error ? error.message : error)
    return []
  }
}
