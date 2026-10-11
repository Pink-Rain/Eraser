/**
 * Les données des blocs Vue d'index et Stat épinglée d'une page du créateur de pages,
 * préparées sur le serveur : un joueur n'a pas accès aux routes des index, la page lui
 * envoie seulement ce que le bloc montre. Les colonnes masquées de l'index (et, pour un
 * joueur, les colonnes privées d'une entité : notes MJ d'un PNJ…) ne partent jamais.
 *
 * Règles pures : la route /api/pages/block-data et les tests s'en servent.
 */
import { tabCardsOf, type TabCards } from "@/lib/index-cards"
import { foldName, isComputedSpec, isIdHeader, isRichSpec, type IndexColumnSpec } from "@/lib/index-columns"
import type { StatColumnGroup, StatDefinition } from "@/lib/index-stats"
import { fitLayoutToColumns, isPresentationKind, presentationFor, type TabPresentations, type ViewLayout } from "@/lib/index-view-layouts"
import type { ViewBlockKind } from "@/lib/custom-pages"

/** Un index tel que le serveur le lit (un sous-ensemble de WorldIndexData). */
export type IndexSource = {
  key: string
  title: string
  path: string
  /** Index d'entités : la page d'une ligne (« /personnage/{id} »). */
  nameHref?: string
  /** Index d'entités : la colonne du nom (« Nom personnage »). */
  nameHeader?: string
  tables: Array<{ tabName: string; headers: string[]; rows: Array<{ values: string[]; html: string[] }> }>
  columns: Record<string, Array<{ header: string; spec: IndexColumnSpec }>>
}

export type BlockRow = { key: string; name: string; href?: string; cells: string[] }

export type ViewBlockData = {
  kind: "view"
  index: string
  title: string
  tab: string
  view: ViewBlockKind
  headers: string[]
  specs: Record<string, IndexColumnSpec>
  rows: BlockRow[]
  total: number
  layout?: ViewLayout
  cards?: TabCards
}

export type StatBlockData = {
  kind: "stat"
  index: string
  title: string
  stat: StatDefinition
  groups: StatColumnGroup[]
  columns: string[]
  tabs: string[]
  rows: Array<BlockRow & { tab: string }>
  options: Record<string, Array<{ value: string; color?: string }>>
  separators: Record<string, string>
}

export type BlockDataOptions = {
  /** Le lecteur est un joueur : colonnes privées retirées, lignes sans lien. */
  player: boolean
  hiddenForPlayers?: (column: string) => boolean
}

const MAX_ROWS = 500

function specIn(source: IndexSource, tab: string, header: string): IndexColumnSpec {
  return source.columns[tab]?.find((column) => foldName(column.header) === foldName(header))?.spec ?? { kind: "rich" }
}

/** Les colonnes qu'un bloc montre : ni identifiant, ni colonne masquée, ni formule (calculée dans l'index), ni colonne privée. */
function shownHeaders(source: IndexSource, table: IndexSource["tables"][number], options: BlockDataOptions) {
  return table.headers.filter((header) => {
    if (!header.trim() || isIdHeader(header)) return false
    const spec = specIn(source, table.tabName, header)
    if (spec.hidden || spec.kind === "archived" || isComputedSpec(spec)) return false
    return !(options.player && options.hiddenForPlayers?.(header))
  })
}

function nameColumn(headers: string[], specOf: (header: string) => IndexColumnSpec) {
  const named = headers.findIndex((header) => ["nom", "nom du pnj", "nom personnage", "nom de la campagne", "nom de la classe"].includes(foldName(header)))
  return named >= 0 ? named : headers.findIndex((header) => specOf(header).rowLabel)
}

function plain(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
}

function rowsOf(source: IndexSource, table: IndexSource["tables"][number], headers: string[], options: BlockDataOptions) {
  const at = headers.map((header) => table.headers.findIndex((candidate) => foldName(candidate) === foldName(header)))
  const rich = headers.map((header) => isRichSpec(specIn(source, table.tabName, header)))
  const id = table.headers.findIndex(isIdHeader)
  const named = source.nameHeader ? table.headers.findIndex((header) => foldName(header) === foldName(source.nameHeader!)) : -1
  const name = named >= 0 ? named : nameColumn(table.headers, (header) => specIn(source, table.tabName, header))
  return table.rows.flatMap((row, position): BlockRow[] => {
    const cells = at.map((column, index) => column < 0 ? "" : (rich[index] ? row.html[column] : row.values[column]) ?? "")
    if (!cells.some((cell) => cell.trim())) return []
    const rowId = id >= 0 ? plain(row.values[id] ?? "") : ""
    const label = name >= 0 ? plain(row.values[name] ?? "") : ""
    // Un joueur lit la ligne sans l'ouvrir : les pages des index ne lui sont pas ouvertes.
    const href = options.player || !rowId ? undefined : source.nameHref ? source.nameHref.replace("{id}", encodeURIComponent(rowId)) : `${source.path}?ligne=${encodeURIComponent(rowId)}`
    return [{ key: `${table.tabName}|${rowId || position}`, name: label, ...(href ? { href } : {}), cells }]
  })
}

/** Le tableau d'un onglet, retrouvé par son nom (sans tenir compte des accents ni de la casse). */
export function findTable(source: IndexSource, tab: string) {
  return source.tables.find((table) => foldName(table.tabName) === foldName(tab)) ?? null
}

/** Les données d'un bloc Vue : l'onglet, sa vue réglée dans l'index (ou ses cartes), ses lignes. */
export function viewBlockData(source: IndexSource, input: { tab: string; kind: ViewBlockKind; limit: number }, settings: { presentations: Record<string, TabPresentations>; cards: Record<string, TabCards> }, options: BlockDataOptions): ViewBlockData | null {
  const table = findTable(source, input.tab)
  if (!table) return null
  const headers = shownHeaders(source, table, options)
  const all = rowsOf(source, table, headers, options)
  const limit = input.limit > 0 ? Math.min(input.limit, MAX_ROWS) : MAX_ROWS
  const specs = Object.fromEntries(headers.map((header) => [header, specIn(source, table.tabName, header)]))
  const base: ViewBlockData = { kind: "view", index: source.key, title: source.title, tab: table.tabName, view: input.kind, headers, specs, rows: all.slice(0, limit), total: all.length }
  if (input.kind === "cards") return { ...base, cards: tabCardsOf(settings.cards, source.key, table.tabName) }
  if (isPresentationKind(input.kind)) {
    // La forme de la vue reste celle de l'index ; les colonnes que le lecteur ne voit pas en sont retirées.
    const layout = fitLayoutToColumns(presentationFor(settings.presentations, table.tabName, input.kind), headers)
    return { ...base, layout, ...(layout.itemCard ? { cards: tabCardsOf(settings.cards, source.key, table.tabName) } : {}) }
  }
  return base
}

/** La colonne virtuelle des statistiques : l'onglet d'où vient une ligne. */
export const STAT_TAB_COLUMN = "Onglet"

/** Les données d'un bloc Stat : la statistique enregistrée et les lignes de tous les onglets. */
export function statBlockData(source: IndexSource, record: { stats: StatDefinition[]; groups: StatColumnGroup[] }, statId: string, options: BlockDataOptions): StatBlockData | null {
  const stat = record.stats.find((item) => item.id === statId)
  if (!stat) return null
  const columns: string[] = []
  const seen = new Set<string>()
  const owner = new Map<string, string>()
  for (const table of source.tables) for (const header of shownHeaders(source, table, options)) {
    if (seen.has(foldName(header))) continue
    seen.add(foldName(header))
    owner.set(header, table.tabName)
    columns.push(header)
  }
  const pseudo = source.tables.length > 1 && !seen.has(foldName(STAT_TAB_COLUMN))
  if (pseudo) columns.push(STAT_TAB_COLUMN)
  const rows = source.tables.flatMap((table) => rowsOf(source, table, columns.filter((column) => !(pseudo && column === STAT_TAB_COLUMN)), options)
    .map((row) => ({ ...row, tab: table.tabName, cells: pseudo ? [...row.cells, table.tabName] : row.cells })))
  const options_: StatBlockData["options"] = {}
  const separators: StatBlockData["separators"] = {}
  for (const column of columns) {
    const tab = owner.get(column)
    if (!tab) continue
    const spec = specIn(source, tab, column)
    if (spec.options?.length) options_[column] = spec.options.map((option) => ({ value: option.value, ...(option.color ? { color: option.color } : {}) }))
    if (spec.multiple && spec.listSeparator) separators[column] = spec.listSeparator
  }
  return { kind: "stat", index: source.key, title: source.title, stat: { ...stat, pinned: true }, groups: record.groups, columns, tabs: source.tables.map((table) => table.tabName), rows, options: options_, separators }
}

/** Les vues qu'un onglet propose à un bloc Vue : tableau, cartes, et celles réglées dans « Modifier › Vues ». */
export function viewKindsOf(presentations: Record<string, TabPresentations>, tab: string): ViewBlockKind[] {
  const entry = Object.entries(presentations).find(([name]) => foldName(name) === foldName(tab))?.[1] ?? {}
  return ["table", "cards", ...Object.keys(entry).filter(isPresentationKind)] as ViewBlockKind[]
}
