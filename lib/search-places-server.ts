import { searchPlaces } from "@/lib/search-draws"
import { foldText } from "@/lib/shop-types"
import { getWorldIndex } from "@/lib/world-indexes"

/**
 * Les lieux de fouille : les noms de l'onglet « Environnement » de l'Index des lieux (lu dans
 * la copie en mémoire de l'index, sans relecture de Google). Un lieu ajouté, renommé ou
 * supprimé là change la liste ici. Onglet absent, vide ou illisible : la liste d'origine.
 */
export async function loadSearchPlaces(): Promise<string[]> {
  try {
    const data = await getWorldIndex("places")
    const table = data.tables.find((candidate) => ["environnement", "environnements"].includes(foldText(candidate.tabName)))
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
