/**
 * Les index qui ont une colonne d'un type donné (« Rareté et emplacements »…), et où : la
 * « Liste d'index » s'en sert pour ses choix, les magasins, les fouilles et les événements pour
 * savoir où lire. Un index qui gagne une telle colonne y entre de lui-même.
 *
 * Lus d'après les copies gardées des index (`getWorldIndexQuick`, dont l'Index des items) :
 * pas de lecture Google de plus quand elles sont là. Jamais de classeur créé : un index du monde
 * pas encore relié dans le Drive est sauté. Le résultat est gardé cinq minutes.
 */
import { listCustomIndexes } from "@/lib/custom-indexes"
import { onForgetGoogleData } from "@/lib/data-refresh"
import { resolveJdrSheet, type ObjectIndexTable } from "@/lib/google-sheets"
import { objectCatalog } from "@/lib/object-catalog"
import { choiceKey, foldName, normalizeSpec, objectColumnSpec, type IndexColumnKind, type IndexColumnSpec } from "@/lib/index-columns"
import { OBJECT_REFERENCE_INDEX } from "@/lib/index-references"
import type { JdrSheetKey } from "@/lib/jdr-sheets"
import { isEntityWorldIndexKey, worldIndexDefinitions, type WorldIndexKey } from "@/lib/world-index-definitions"
import { getWorldIndexQuick, type WorldIndexData } from "@/lib/world-indexes"

/** Un index qui a au moins une colonne du type cherché : ses onglets, et la colonne dans chacun. */
export type IndexWithKind = { key: string; title: string; tabs: Array<{ tab: string; column: string }> }

/** Le titre de l'Index des objets, tel que l'écrivent les colonnes (« Items »). */
export const OBJECTS_TITLE = "Items"

/** Les colonnes d'un tableau d'objets, avec leur type (celui d'Eraser, puis celui réglé dans « Modifier »). */
export function objectTableSpecs(table: Pick<ObjectIndexTable, "headers" | "columnSpecs">): Array<{ header: string; spec: IndexColumnSpec }> {
  return table.headers.filter((header) => header.trim()).map((header) => ({ header, spec: normalizeSpec({ ...objectColumnSpec(header, table.headers), ...(table.columnSpecs?.[foldName(header)] ?? {}) }) }))
}

/** La première colonne de ce type dans une liste de colonnes typées, ou `null`. */
export function columnOfKind(columns: Array<{ header: string; spec: IndexColumnSpec }>, kind: IndexColumnKind) {
  return columns.find((column) => column.spec.kind === kind)?.header ?? null
}

/** Les index du monde à parcourir : ceux d'Eraser déjà reliés (pas les entités) et les index créés. */
async function worldKeys() {
  const builtin = await Promise.all(Object.keys(worldIndexDefinitions).filter((key) => !isEntityWorldIndexKey(key)).map(async (key) => (await resolveJdrSheet(key as JdrSheetKey).catch(() => null)) ? key as WorldIndexKey : null))
  const custom = (await listCustomIndexes().catch(() => [])).map((entry) => entry.key as WorldIndexKey)
  return [...builtin.filter((key): key is WorldIndexKey => Boolean(key)), ...custom]
}

/**
 * Les index du monde lus (trois à la fois : le quota Google est commun à toute la table).
 * `failed` : un index n'a pas pu être lu (le recensement est incomplet).
 */
export async function readWorldIndexes(): Promise<WorldIndexData[] & { failed?: boolean }> {
  const keys = await worldKeys()
  const out: WorldIndexData[] & { failed?: boolean } = []
  for (let start = 0; start < keys.length; start += 3) {
    const batch = await Promise.all(keys.slice(start, start + 3).map((key) => getWorldIndexQuick(key).catch((error) => {
      console.error("INDEX_KINDS_READ_FAILED", key, error instanceof Error ? error.message : error)
      out.failed = true
      return null
    })))
    for (const data of batch) if (data) out.push(data)
  }
  return out
}

const cache = new Map<IndexColumnKind, { at: number; promise: Promise<IndexWithKind[]>; partial?: boolean }>()
const CACHE_MS = 5 * 60_000
/** Un recensement incomplet (un index illisible un instant) n'est gardé que le temps de réessayer. */
const PARTIAL_CACHE_MS = 20_000

/** Les index qui ont une colonne de ce type : l'Index des objets d'abord, puis les autres par titre. */
export function indexesWithColumnKind(kind: IndexColumnKind, options: { fresh?: boolean } = {}): Promise<IndexWithKind[]> {
  const known = cache.get(kind)
  if (!options.fresh && known && Date.now() - known.at < (known.partial ? PARTIAL_CACHE_MS : CACHE_MS)) return known.promise
  const entry: { at: number; promise: Promise<IndexWithKind[]>; partial?: boolean } = { at: Date.now(), promise: Promise.resolve([]) }
  let objectsFailed = false
  const promise = (async () => {
    const [objects, worlds] = await Promise.all([
      objectCatalog().catch(() => { objectsFailed = true; return [] as ObjectIndexTable[] }),
      readWorldIndexes(),
    ])
    const out: IndexWithKind[] = []
    if (worlds.failed || objectsFailed) entry.partial = true
    const objectTabs = objects.flatMap((table) => { const column = columnOfKind(objectTableSpecs(table), kind); return column ? [{ tab: table.tabName, column }] : [] })
    if (objectTabs.length) out.push({ key: OBJECT_REFERENCE_INDEX, title: OBJECTS_TITLE, tabs: objectTabs })
    const others: IndexWithKind[] = []
    for (const data of worlds) {
      const tabs = data.tables.flatMap((table) => { const column = columnOfKind(data.columns[table.tabName] ?? [], kind); return column ? [{ tab: table.tabName, column }] : [] })
      if (tabs.length) others.push({ key: data.definition.key, title: data.definition.title, tabs })
    }
    others.sort((left, right) => left.title.localeCompare(right.title, "fr"))
    return [...out, ...others]
  })()
  entry.promise = promise
  cache.set(kind, entry)
  promise.catch(() => { if (cache.get(kind)?.promise === promise) cache.delete(kind) })
  return promise
}

/** Oublie le recensement (un index vient de changer de colonnes, « Actualiser »). */
export function forgetIndexKinds() {
  cache.clear()
}
onForgetGoogleData(forgetIndexKinds)

/**
 * L'index désigné par un mot d'une case « Liste d'index » : son titre (« Créatures »), sa clé
 * (« creatures »), ou « Items » / « Objets » pour l'Index des objets. `null` : inconnu.
 */
export function indexKeyFromChoice(choice: string, indexes: Array<Pick<IndexWithKind, "key" | "title">>) {
  const key = choiceKey(choice)
  if (!key) return null
  if (["item", "objet", "index des objet", "index des item"].includes(key)) return OBJECT_REFERENCE_INDEX
  return indexes.find((index) => choiceKey(index.title) === key || choiceKey(index.key) === key || choiceKey(`index des ${index.title}`) === key)?.key ?? null
}
