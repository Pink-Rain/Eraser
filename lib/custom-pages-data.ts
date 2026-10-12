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
import { fitLayoutToColumns, isPresentationKind, presentationFor, sortLayoutRows, type TabPresentations, type ViewLayout } from "@/lib/index-view-layouts"
import { activeWhere, type ViewBlockKind, type ViewWhere } from "@/lib/custom-pages"
import { matchesView, type IndexView } from "@/lib/index-views"

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
  /** Une statistique, ou (« toutes les épinglées ») celles de l'onglet stat de l'index. */
  stats: StatDefinition[]
  groups: StatColumnGroup[]
  columns: string[]
  tabs: string[]
  rows: Array<BlockRow & { tab: string }>
  options: Record<string, Array<{ value: string; color?: string }>>
  separators: Record<string, string>
}

export type BlockDataOptions = {
  /** Le lecteur est un joueur : colonnes privées retirées, lignes sans lien vers l'index. */
  player: boolean
  hiddenForPlayers?: (column: string) => boolean
  /** La page de ligne d'une ligne (modèle publié pour son index) : le lien de la ligne, pour tous les lecteurs. */
  rowPageOf?: (index: string, tab: string, id: string) => string | undefined
}

const MAX_ROWS = 500

export function columnSpecIn(source: IndexSource, tab: string, header: string): IndexColumnSpec {
  return source.columns[tab]?.find((column) => foldName(column.header) === foldName(header))?.spec ?? { kind: "rich" }
}

/** Les colonnes qu'un bloc montre : ni identifiant, ni colonne masquée, ni formule (calculée dans l'index), ni colonne privée. */
export function shownColumns(source: IndexSource, table: IndexSource["tables"][number], options: BlockDataOptions) {
  return table.headers.filter((header) => {
    if (!header.trim() || isIdHeader(header)) return false
    const spec = columnSpecIn(source, table.tabName, header)
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
  const rich = headers.map((header) => isRichSpec(columnSpecIn(source, table.tabName, header)))
  const id = table.headers.findIndex(isIdHeader)
  const named = source.nameHeader ? table.headers.findIndex((header) => foldName(header) === foldName(source.nameHeader!)) : -1
  const name = named >= 0 ? named : nameColumn(table.headers, (header) => columnSpecIn(source, table.tabName, header))
  return table.rows.flatMap((row, position): BlockRow[] => {
    const cells = at.map((column, index) => column < 0 ? "" : (rich[index] ? row.html[column] : row.values[column]) ?? "")
    if (!cells.some((cell) => cell.trim())) return []
    const rowId = id >= 0 ? plain(row.values[id] ?? "") : ""
    const label = name >= 0 ? plain(row.values[name] ?? "") : ""
    // La page de la ligne (un modèle existe) pour tous ; sinon sa fiche dans l'index, pour les MJ
    // et admins seulement : un joueur lit la ligne sans l'ouvrir.
    const rowPage = rowId ? options.rowPageOf?.(source.key, table.tabName, rowId) : undefined
    const href = rowPage ?? (options.player || !rowId ? undefined : source.nameHref ? source.nameHref.replace("{id}", encodeURIComponent(rowId)) : `${source.path}?ligne=${encodeURIComponent(rowId)}`)
    return [{ key: `${table.tabName}|${rowId || position}`, name: label, ...(href ? { href } : {}), cells }]
  })
}

/** La case cite-t-elle la ligne : son nom dans la liste, ou une référence « { » vers elle ? */
export function cellCitesRow(cell: string, separator: string | undefined, target: { index: string; id: string; name: string }) {
  if (cell.includes(`/reference/${encodeURIComponent(target.index)}/${encodeURIComponent(target.id)}`)) return true
  const wanted = foldName(target.name)
  if (!wanted) return false
  const parts = plain(cell).split(/\s*[,;|]\s*/).flatMap((part) => separator?.trim() ? part.split(separator.trim()).map((piece) => piece.trim()) : [part])
  return parts.some((part) => foldName(part) === wanted)
}

/** Le tableau d'un onglet, retrouvé par son nom (sans tenir compte des accents ni de la casse). */
export function findTable(source: IndexSource, tab: string) {
  return source.tables.find((table) => foldName(table.tabName) === foldName(tab)) ?? null
}

/** Ce qu'un bloc Vue demande : l'onglet, sa présentation et ce qui choisit ses lignes. */
export type ViewBlockInput = {
  tab: string
  kind: ViewBlockKind
  limit: number
  /** Page de ligne : seulement les lignes dont cette colonne cite la ligne de la page. */
  match?: { column: string; index: string; id: string; name: string }
  /** La forme propre au bloc. */
  layout?: ViewLayout
  /** La forme d'un preset de vue choisi pour le bloc (déjà retrouvé). */
  preset?: ViewLayout | null
  /** Ancien réglage : une vue enregistrée de l'index (onglet-fenêtre). */
  view?: Pick<IndexView, "match" | "conditions" | "layout"> | null
  /** Les cartes : laquelle montrer. */
  cardId?: string
  where?: ViewWhere
  sort?: { column: string; desc: boolean }
}

/** Les données d'un bloc Vue : l'onglet, sa vue réglée dans l'index (ou ses cartes), ses lignes. */
export function viewBlockData(source: IndexSource, input: ViewBlockInput, settings: { presentations: Record<string, TabPresentations>; cards: Record<string, TabCards> }, options: BlockDataOptions): ViewBlockData | null {
  const found = findTable(source, input.tab)
  if (!found) return null
  // Les conditions (celles du bloc, et celles d'une ancienne vue enregistrée) se lisent sur toutes
  // les colonnes, masquées comprises : un joueur reçoit les mêmes lignes qu'un MJ, sans les colonnes cachées.
  const cellOf = (row: IndexSource["tables"][number]["rows"][number], header: string) => { const at = found.headers.findIndex((candidate) => foldName(candidate) === foldName(header)); return at >= 0 ? row.values[at] ?? "" : "" }
  const filters = [input.view, activeWhere(input.where)].filter((item): item is Pick<IndexView, "match" | "conditions"> => Boolean(item?.conditions.length))
  let rows = filters.length ? found.rows.filter((row) => filters.every((filter) => matchesView(filter, (header) => cellOf(row, header)))) : found.rows
  if (input.sort?.column) rows = sortLayoutRows(rows, { sortBy: input.sort.column, sortDesc: input.sort.desc }, cellOf)
  const table = { ...found, rows }
  const headers = shownColumns(source, table, options)
  let all = rowsOf(source, table, headers, options)
  // Page de ligne : seulement les lignes dont la colonne choisie cite la ligne de la page.
  if (input.match) {
    const at = headers.findIndex((header) => foldName(header) === foldName(input.match!.column))
    const separator = at >= 0 ? columnSpecIn(source, table.tabName, headers[at]).listSeparator : undefined
    all = at < 0 ? [] : all.filter((row) => cellCitesRow(row.cells[at] ?? "", separator, input.match!))
  }
  const limit = input.limit > 0 ? Math.min(input.limit, MAX_ROWS) : MAX_ROWS
  const specs = Object.fromEntries(headers.map((header) => [header, columnSpecIn(source, table.tabName, header)]))
  const base: ViewBlockData = { kind: "view", index: source.key, title: source.title, tab: table.tabName, view: input.kind, headers, specs, rows: all.slice(0, limit), total: all.length }
  const cards = () => {
    const entry = tabCardsOf(settings.cards, source.key, table.tabName)
    return input.cardId && entry.cards.some((card) => card.id === input.cardId) ? { ...entry, defaultId: input.cardId } : entry
  }
  if (input.kind === "cards") return { ...base, cards: cards() }
  // La forme : celle réglée pour la page, sinon le preset choisi, sinon celle de l'ancienne vue
  // enregistrée, sinon celle de l'onglet (ou la présentation par défaut). Les colonnes que le
  // lecteur ne voit pas en sont retirées.
  const same = (layout?: ViewLayout | null) => layout && isPresentationKind(layout.kind) && layout.kind === input.kind ? layout : null
  const chosen = input.layout && isPresentationKind(input.layout.kind) ? input.layout
    : same(input.preset) ?? same(input.view?.layout)
    ?? (isPresentationKind(input.kind) ? presentationFor(settings.presentations, table.tabName, input.kind) : null)
  if (chosen) {
    const layout = fitLayoutToColumns(chosen, headers)
    return { ...base, view: layout.kind as ViewBlockKind, layout, ...(layout.itemCard ? { cards: cards() } : {}) }
  }
  return base
}

/** La colonne virtuelle des statistiques : l'onglet d'où vient une ligne. */
export const STAT_TAB_COLUMN = "Onglet"

/** Le choix « toutes les statistiques épinglées » d'un bloc Stat. */
export const ALL_PINNED_STATS = "*"

/** Les données d'un bloc Stat : la statistique enregistrée (ou toutes les épinglées) et les lignes de tous les onglets. */
export function statBlockData(source: IndexSource, record: { stats: StatDefinition[]; groups: StatColumnGroup[] }, statId: string, options: BlockDataOptions): StatBlockData | null {
  const stats: StatDefinition[] = statId === ALL_PINNED_STATS ? record.stats.filter((item) => item.pinned) : record.stats.filter((item) => item.id === statId).map((item) => ({ ...item, pinned: true as const }))
  if (!stats.length && statId !== ALL_PINNED_STATS) return null
  const columns: string[] = []
  const seen = new Set<string>()
  const owner = new Map<string, string>()
  for (const table of source.tables) for (const header of shownColumns(source, table, options)) {
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
    const spec = columnSpecIn(source, tab, column)
    if (spec.options?.length) options_[column] = spec.options.map((option) => ({ value: option.value, ...(option.color ? { color: option.color } : {}) }))
    if (spec.multiple && spec.listSeparator) separators[column] = spec.listSeparator
  }
  return { kind: "stat", index: source.key, title: source.title, stats, groups: record.groups, columns, tabs: source.tables.map((table) => table.tabName), rows, options: options_, separators }
}

/** Les vues qu'un onglet propose à un bloc Vue : tableau, cartes, et celles réglées dans « Modifier › Vues ». */
/** Les présentations déjà réglées pour un onglet dans l'index (les autres prennent leur forme par défaut). */
export function viewKindsOf(presentations: Record<string, TabPresentations>, tab: string): ViewBlockKind[] {
  const entry = Object.entries(presentations).find(([name]) => foldName(name) === foldName(tab))?.[1] ?? {}
  return Object.keys(entry).filter(isPresentationKind) as ViewBlockKind[]
}
