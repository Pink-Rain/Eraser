/**
 * Les index du monde, pour la partie serveur d'une extension (API 4, `eraser.indexes`) : leurs
 * onglets et colonnes, puis les valeurs d'un index. Eraser lit Google Sheets (ses copies gardées en
 * mémoire, `getWorldIndexQuick`) ; l'extension n'y accède jamais elle-même. Elle choisit ensuite ce
 * qu'elle en montre à ses pages : un joueur, qui n'ouvre pas les index, voit ainsi la colonne dont
 * l'atelier a besoin (Nutrition d'un ingrédient), et rien d'autre.
 *
 * Jamais les index d'entités (personnages, campagnes, PNJ, classes, sorts) : propriétaires,
 * liens et données des joueurs n'en sortent pas par ce chemin.
 */
import { worldKeys } from "@/lib/index-kinds-server"
import { OBJECTS_INDEX_KEY, isEntityWorldIndexKey, type WorldIndexKey } from "@/lib/world-index-definitions"
import { getWorldIndexQuick, knownWorldIndexKey, type WorldIndexData } from "@/lib/world-indexes"

export type ExtensionIndexSummary = { key: string; title: string; tabs: Array<{ name: string; columns: string[] }> }
export type ExtensionIndexContent = { key: string; title: string; tabs: Array<{ name: string; headers: string[]; rows: string[][] }> }

const titleOf = (data: WorldIndexData) => data.key === OBJECTS_INDEX_KEY ? "Index des items" : data.definition.title

const shown = (data: WorldIndexData) => data.tables.map((table) => ({ table, headers: table.headers.map((header) => header.trim()) }))

/** Les index lisibles : l'Index des items d'abord, puis ceux du monde, par titre. */
export async function extensionIndexList(): Promise<ExtensionIndexSummary[]> {
  const keys: WorldIndexKey[] = [OBJECTS_INDEX_KEY, ...(await worldKeys())]
  const out: ExtensionIndexSummary[] = []
  // Trois à la fois : le quota Google est commun à toute la table.
  for (let start = 0; start < keys.length; start += 3) {
    const batch = await Promise.all(keys.slice(start, start + 3).map((key) => getWorldIndexQuick(key).catch(() => null)))
    for (const data of batch) {
      if (!data) continue
      out.push({ key: data.key, title: titleOf(data), tabs: shown(data).map(({ table, headers }) => ({ name: table.tabName, columns: headers.filter(Boolean) })) })
    }
  }
  const [objects, ...others] = out
  return objects?.key === OBJECTS_INDEX_KEY ? [objects, ...others.sort((a, b) => a.title.localeCompare(b.title, "fr"))] : out.sort((a, b) => a.title.localeCompare(b.title, "fr"))
}

/** Les valeurs (texte) d'un index, onglet par onglet ; `null` pour un index inconnu ou d'entités. */
export async function extensionIndexRead(key: string): Promise<ExtensionIndexContent | null> {
  const known = await knownWorldIndexKey(key).catch(() => null)
  if (!known || isEntityWorldIndexKey(known)) return null
  const data = await getWorldIndexQuick(known)
  return {
    key: data.key,
    title: titleOf(data),
    tabs: shown(data).map(({ table, headers }) => ({
      name: table.tabName,
      headers,
      rows: table.rows.filter((row) => row.values.some((value) => String(value ?? "").trim())).map((row) => headers.map((_, index) => String(row.values[index] ?? ""))),
    })),
  }
}
