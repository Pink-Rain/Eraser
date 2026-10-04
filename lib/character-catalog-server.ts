import {
  builtinCharacterCatalog,
  catalogDescriptionsFromTables,
  catalogFromTables,
  CHARACTERISTICS_TAB,
  SKILLS_TAB,
  type CharacterCatalog,
} from "@/lib/character-catalog"
import { getWorldIndexQuick } from "@/lib/world-indexes"

/**
 * Les caractéristiques et compétences de la fiche, lues dans leur index. Faute
 * d'index (Google injoignable, index vide ou illisible), la liste d'origine : une
 * fiche reste toujours affichable et ses colonnes ne sont jamais réorganisées.
 */
export async function getCharacterCatalog(): Promise<CharacterCatalog> {
  try {
    const data = await getWorldIndexQuick("skills")
    const table = (name: string) => {
      const found = data.tables.find((candidate) => candidate.tabName === name)
      return found ? { headers: found.headers, rows: found.rows.map((row) => row.values) } : null
    }
    const catalog = catalogFromTables(table(CHARACTERISTICS_TAB), table(SKILLS_TAB))
    if (!catalog.characteristics.length && !catalog.skills.length) return builtinCharacterCatalog
    return catalog
  } catch (error) {
    console.error("CHARACTER_CATALOG_UNAVAILABLE", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return builtinCharacterCatalog
  }
}

/** Les descriptions de l'index (colonne « Description »), par clé de fiche et par nom. Vide faute d'index. */
export async function getCharacterCatalogDescriptions(): Promise<Record<string, string>> {
  try {
    const data = await getWorldIndexQuick("skills")
    return catalogDescriptionsFromTables(data.tables.filter((table) => table.tabName === CHARACTERISTICS_TAB || table.tabName === SKILLS_TAB))
  } catch (error) {
    console.error("CHARACTER_CATALOG_DESCRIPTIONS_UNAVAILABLE", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return {}
  }
}
