/**
 * La présentation d'un onglet-fenêtre : ses lignes en tableau, en cartes, en liste compacte
 * ou repliable, rangées en sections, en kanban, en maître-détail, en calendrier ou en
 * tableau de bord. Elle s'enregistre avec la vue (classeur « Eraser · Réglages des index »),
 * dans « Modifier » de l'index ; le créateur de pages ne fait que l'afficher et la régler.
 * Règles pures : la page, le serveur et les tests s'en servent.
 *
 * L'onglet stat (« stats ») est une vue comme les autres : ses statistiques tiennent dans
 * la même case « Présentation (JSON) », sans nouvelle colonne ni nouvelle feuille.
 */
import { cellNumber, cellParts, cleanStats, type StatDefinition } from "@/lib/index-stats"

export { cellNumber }

export type ViewLayoutKind = "table" | "cards" | "list" | "kanban" | "master-detail" | "calendar" | "dashboard" | "stats"

export type DashboardTileKind = "count" | "sum" | "average" | "min" | "max" | "filled" | "breakdown"
export type DashboardTile = { kind: DashboardTileKind; column?: string; label?: string }

export type ViewLayout = {
  kind: ViewLayoutKind
  /** Liste, cartes, maître-détail : les lignes rangées en sections, une par valeur de cette colonne. */
  groupBy?: string
  /** Les sections (ou les lignes d'une liste) se replient ; `collapsed` : repliées à l'ouverture. */
  collapsible?: boolean
  collapsed?: boolean
  /** Liste : une ligne par élément, sans retour à la ligne. */
  compact?: boolean
  /** Les colonnes montrées sous le nom (liste, kanban, maître-détail) : quatre au plus. */
  fields?: string[]
  /** Kanban : la colonne dont chaque valeur fait une colonne du tableau ; glisser une carte change la case. */
  kanbanColumn?: string
  /** Calendrier : la colonne de la date et le calendrier (Index des calendriers, ou « Calendrier réel »). */
  dateColumn?: string
  calendar?: string
  /** Tableau de bord : ses tuiles. */
  tiles?: DashboardTile[]
  /** Onglet stat : ses statistiques (phrase à trous), 24 au plus. */
  stats?: StatDefinition[]
  /** Toutes : l'ordre des lignes (une colonne, croissant ou décroissant). */
  sortBy?: string
  sortDesc?: boolean
  /** Une colonne liste dont la couleur du choix marque chaque ligne (liseré). */
  colorBy?: string
  /** Une colonne d'image (portrait, icône) montrée à côté du nom. */
  imageColumn?: string
  /** Sections et kanban : sans la section (ou colonne) « Sans valeur ». */
  hideEmpty?: boolean
  /** Sections : sans le nombre de lignes. */
  hideCounts?: boolean
  /** Liste : sur une, deux ou trois colonnes. */
  listColumns?: 1 | 2 | 3
  /** Kanban : largeur des colonnes. */
  laneWidth?: "narrow" | "normal" | "wide"
  /** Maître-détail : les colonnes du détail (toutes si vide), douze au plus. */
  detailFields?: string[]
  /** Calendrier : la liste des lignes sans date sous le calendrier. */
  showUndated?: boolean
  /** Tableau de bord : nombre de tuiles par rangée. */
  tileColumns?: 1 | 2 | 3 | 4
}

/** Une case de Google Sheets en tient 50 000 : la présentation d'une vue reste bien en deçà. */
export const MAX_VIEW_LAYOUT_JSON = 40_000

export function viewLayoutTooLarge(layout: ViewLayout | undefined) {
  return Boolean(layout) && JSON.stringify(layout).length > MAX_VIEW_LAYOUT_JSON
}

export const viewLayoutKinds: Array<{ value: ViewLayoutKind; label: string; hint: string }> = [
  { value: "table", label: "Tableau", hint: "Les lignes et toutes leurs colonnes." },
  { value: "cards", label: "Cartes", hint: "Les cartes réglées dans « Modifier › Cartes »." },
  { value: "list", label: "Liste", hint: "Compacte ou repliable, rangée en sections si tu veux." },
  { value: "kanban", label: "Kanban", hint: "Une colonne par valeur ; glisser une carte change sa case." },
  { value: "master-detail", label: "Maître-détail", hint: "La liste d’un côté, la ligne choisie de l’autre." },
  { value: "calendar", label: "Calendrier", hint: "Les lignes placées à leur date, dans un calendrier du monde." },
  { value: "dashboard", label: "Tableau de bord", hint: "Des chiffres et des répartitions." },
]

export const dashboardTileKinds: Array<{ value: DashboardTileKind; label: string; needsColumn: boolean }> = [
  { value: "count", label: "Nombre de lignes", needsColumn: false },
  { value: "sum", label: "Somme d’une colonne", needsColumn: true },
  { value: "average", label: "Moyenne d’une colonne", needsColumn: true },
  { value: "min", label: "Plus petite valeur", needsColumn: true },
  { value: "max", label: "Plus grande valeur", needsColumn: true },
  { value: "filled", label: "Lignes remplies dans une colonne", needsColumn: true },
  { value: "breakdown", label: "Répartition par valeur", needsColumn: true },
]

// « stats » n'est pas proposée parmi les présentations d'un onglet-fenêtre : c'est l'onglet stat.
const kinds = new Set<string>([...viewLayoutKinds.map((kind) => kind.value), "stats"])
const tileKinds = new Set<string>(dashboardTileKinds.map((kind) => kind.value))
const text = (value: unknown, max = 120) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""

/** Une présentation propre (champs connus, longueurs bornées) ; `undefined` pour le tableau simple. */
export function cleanViewLayout(value: unknown): ViewLayout | undefined {
  if (!value || typeof value !== "object") return undefined
  const raw = value as Record<string, unknown>
  if (!kinds.has(String(raw.kind))) return undefined
  if (raw.kind === "stats") {
    const stats = cleanStats(raw.stats)
    return stats.length ? { kind: "stats", stats } : { kind: "stats" }
  }
  const layout: ViewLayout = { kind: raw.kind as ViewLayoutKind }
  if (text(raw.groupBy)) layout.groupBy = text(raw.groupBy)
  if (raw.collapsible === true) layout.collapsible = true
  if (raw.collapsed === true) layout.collapsed = true
  if (raw.compact === true) layout.compact = true
  const fields = Array.isArray(raw.fields) ? raw.fields.map((field) => text(field)).filter(Boolean).slice(0, 4) : []
  if (fields.length) layout.fields = fields
  if (text(raw.kanbanColumn)) layout.kanbanColumn = text(raw.kanbanColumn)
  if (text(raw.dateColumn)) layout.dateColumn = text(raw.dateColumn)
  if (text(raw.calendar)) layout.calendar = text(raw.calendar)
  const tiles = Array.isArray(raw.tiles) ? raw.tiles.flatMap((tile): DashboardTile[] => {
    if (!tile || typeof tile !== "object") return []
    const entry = tile as Record<string, unknown>
    if (!tileKinds.has(String(entry.kind))) return []
    return [{ kind: entry.kind as DashboardTileKind, ...(text(entry.column) ? { column: text(entry.column) } : {}), ...(text(entry.label, 60) ? { label: text(entry.label, 60) } : {}) }]
  }).slice(0, 12) : []
  if (tiles.length) layout.tiles = tiles
  if (text(raw.sortBy)) layout.sortBy = text(raw.sortBy)
  if (raw.sortDesc === true) layout.sortDesc = true
  if (text(raw.colorBy)) layout.colorBy = text(raw.colorBy)
  if (text(raw.imageColumn)) layout.imageColumn = text(raw.imageColumn)
  if (raw.hideEmpty === true) layout.hideEmpty = true
  if (raw.hideCounts === true) layout.hideCounts = true
  if (raw.listColumns === 2 || raw.listColumns === 3) layout.listColumns = raw.listColumns
  if (raw.laneWidth === "narrow" || raw.laneWidth === "wide") layout.laneWidth = raw.laneWidth
  const detailFields = Array.isArray(raw.detailFields) ? raw.detailFields.map((field) => text(field)).filter(Boolean).slice(0, 12) : []
  if (detailFields.length) layout.detailFields = detailFields
  if (raw.showUndated === true) layout.showUndated = true
  if (raw.tileColumns === 1 || raw.tileColumns === 2 || raw.tileColumns === 4) layout.tileColumns = raw.tileColumns
  return layout.kind === "table" && !layout.groupBy ? undefined : layout
}

export function parseViewLayout(raw: string | undefined) {
  if (!raw?.trim()) return undefined
  try { return cleanViewLayout(JSON.parse(raw)) } catch { return undefined }
}

/** Les sections d'une colonne : une par valeur (une case à plusieurs valeurs va dans chacune), « Sans valeur » à la fin. */
export function groupRowsBy<T>(rows: T[], valueOf: (row: T) => string, order: string[] = []): Array<{ name: string; rows: T[] }> {
  const groups = new Map<string, { name: string; rows: T[] }>()
  for (const row of rows) {
    const values = cellParts(valueOf(row))
    for (const value of values.length ? values : [""]) {
      const key = value.toLocaleLowerCase("fr")
      const group = groups.get(key) ?? { name: value, rows: [] }
      group.rows.push(row)
      groups.set(key, group)
    }
  }
  const rank = new Map(order.map((name, index) => [name.toLocaleLowerCase("fr"), index]))
  return [...groups.values()].sort((left, right) => {
    if (!left.name !== !right.name) return left.name ? -1 : 1
    const leftRank = rank.get(left.name.toLocaleLowerCase("fr")) ?? Number.MAX_SAFE_INTEGER
    const rightRank = rank.get(right.name.toLocaleLowerCase("fr")) ?? Number.MAX_SAFE_INTEGER
    return leftRank - rightRank || left.name.localeCompare(right.name, "fr", { numeric: true })
  })
}

/** La valeur d'une tuile de tableau de bord : un nombre, ou une répartition (les 8 premières valeurs). */
export function dashboardTileValue<T>(tile: DashboardTile, rows: T[], valueOf: (row: T, column: string) => string) {
  if (tile.kind === "count" || !tile.column) return { number: rows.length, breakdown: [] as Array<{ name: string; count: number }> }
  if (tile.kind === "breakdown") {
    const groups = groupRowsBy(rows, (row) => valueOf(row, tile.column!)).map((group) => ({ name: group.name || "Sans valeur", count: group.rows.length }))
    return { number: groups.length, breakdown: groups.sort((left, right) => right.count - left.count).slice(0, 8) }
  }
  if (tile.kind === "filled") return { number: rows.filter((row) => cellParts(valueOf(row, tile.column!)).length > 0).length, breakdown: [] }
  const numbers = rows.map((row) => cellNumber(valueOf(row, tile.column!))).filter((number): number is number => number !== null)
  const sum = numbers.reduce((total, number) => total + number, 0)
  if (tile.kind === "min" || tile.kind === "max") return { number: numbers.length ? (tile.kind === "min" ? Math.min(...numbers) : Math.max(...numbers)) : 0, breakdown: [] }
  return { number: tile.kind === "sum" ? sum : numbers.length ? sum / numbers.length : 0, breakdown: [] }
}

/* ---------- Vues d'un onglet (Modifier › Vues, à côté de Cartes) ---------- */

/** Les vues réglées dans « Modifier », que les onglets-fenêtres affichent. */
export type PresentationKind = Exclude<ViewLayoutKind, "table" | "cards" | "stats">
export const presentationKinds = viewLayoutKinds.filter((kind): kind is (typeof viewLayoutKinds)[number] & { value: PresentationKind } => kind.value !== "table" && kind.value !== "cards")
export const isPresentationKind = (value: unknown): value is PresentationKind => presentationKinds.some((kind) => kind.value === value)

/** Les réglages de chaque présentation d'un onglet (Modifier › Vues), enregistrés dans Eraser. */
export type TabPresentations = Partial<Record<PresentationKind, ViewLayout>>

export function parseTabPresentations(input: unknown): TabPresentations | null {
  let value = input
  if (typeof value === "string") {
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const result: TabPresentations = {}
  for (const [key, layout] of Object.entries(value as Record<string, unknown>)) {
    if (!isPresentationKind(key) || !layout || typeof layout !== "object") continue
    const clean = cleanViewLayout({ ...(layout as Record<string, unknown>), kind: key })
    if (clean) result[key] = clean
  }
  return result
}

/** La présentation à montrer : celle réglée pour l'onglet, sinon ses réglages par défaut. */
export function presentationFor(stored: Record<string, TabPresentations> | null | undefined, tab: string, kind: PresentationKind): ViewLayout {
  const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
  const entry = stored ? Object.entries(stored).find(([name]) => fold(name) === fold(tab))?.[1] : undefined
  return entry?.[kind] ?? { kind }
}

/** Les lignes dans l'ordre de la vue (nombres comparés comme des nombres, sinon l'ordre alphabétique). */
export function sortLayoutRows<T>(rows: T[], layout: Pick<ViewLayout, "sortBy" | "sortDesc">, valueOf: (row: T, column: string) => string) {
  if (!layout.sortBy) return rows
  const key = (row: T) => valueOf(row, layout.sortBy!).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const sorted = [...rows].sort((left, right) => {
    const a = key(left), b = key(right)
    if (!a !== !b) return a ? -1 : 1
    const na = cellNumber(a), nb = cellNumber(b)
    const order = na !== null && nb !== null && /^-?\d/.test(a) && /^-?\d/.test(b) ? na - nb : a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" })
    return layout.sortDesc ? -order : order
  })
  return sorted
}

/**
 * Une vue réglée appliquée à un autre onglet ou index : ses colonnes absentes de l'onglet
 * sont retirées (le preset garde le reste : sections repliables, densité, tuiles…).
 */
export function fitLayoutToColumns(layout: ViewLayout, columns: string[]): ViewLayout {
  const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
  const known = new Map(columns.map((column) => [fold(column), column]))
  const one = (value?: string) => value ? known.get(fold(value)) : undefined
  const many = (values?: string[]) => (values ?? []).flatMap((value) => known.get(fold(value)) ?? [])
  const next: ViewLayout = { ...layout, groupBy: one(layout.groupBy), kanbanColumn: one(layout.kanbanColumn), dateColumn: one(layout.dateColumn), sortBy: one(layout.sortBy), colorBy: one(layout.colorBy), imageColumn: one(layout.imageColumn), fields: many(layout.fields), detailFields: many(layout.detailFields), tiles: layout.tiles?.filter((tile) => !tile.column || known.has(fold(tile.column))) }
  return cleanViewLayout(next) ?? { kind: layout.kind }
}

/** Un preset de vue : des réglages nommés, communs à tous les index. */
export type ViewPreset = { id: string; name: string; layout: ViewLayout; builtin?: boolean; updatedAt?: string }

/** Les presets d'Eraser, sans colonne : ils se complètent avec celles de l'onglet. */
export const builtinViewPresets: ViewPreset[] = [
  { id: "eraser:list-compact", name: "Liste compacte", builtin: true, layout: { kind: "list", compact: true } },
  { id: "eraser:list-folding", name: "Liste à lignes dépliables", builtin: true, layout: { kind: "list", collapsible: true } },
  { id: "eraser:list-two", name: "Liste sur deux colonnes", builtin: true, layout: { kind: "list", compact: true, listColumns: 2 } },
  { id: "eraser:list-sections", name: "Sections repliées", builtin: true, layout: { kind: "list", collapsible: true, collapsed: true, hideEmpty: true } },
  { id: "eraser:kanban-narrow", name: "Kanban serré", builtin: true, layout: { kind: "kanban", laneWidth: "narrow", hideEmpty: true } },
  { id: "eraser:kanban-wide", name: "Kanban large", builtin: true, layout: { kind: "kanban", laneWidth: "wide" } },
  { id: "eraser:master-sections", name: "Maître-détail en sections", builtin: true, layout: { kind: "master-detail", collapsible: true } },
  { id: "eraser:calendar-real", name: "Calendrier réel", builtin: true, layout: { kind: "calendar", calendar: "Calendrier réel", showUndated: true } },
  { id: "eraser:dashboard-count", name: "Tableau de bord simple", builtin: true, layout: { kind: "dashboard", tiles: [{ kind: "count" }], tileColumns: 3 } },
]

export function cleanViewPreset(value: unknown): ViewPreset | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const name = text(raw.name, 60)
  const layout = cleanViewLayout(raw.layout)
  if (!name || !layout || !isPresentationKind(layout.kind)) return null
  return { id: text(raw.id, 80) || "", name, layout, ...(text(raw.updatedAt, 40) ? { updatedAt: text(raw.updatedAt, 40) } : {}) }
}
