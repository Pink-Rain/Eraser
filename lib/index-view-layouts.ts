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

export type DashboardTileKind = "count" | "sum" | "average" | "breakdown"
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
  const numbers = rows.map((row) => cellNumber(valueOf(row, tile.column!))).filter((number): number is number => number !== null)
  const sum = numbers.reduce((total, number) => total + number, 0)
  return { number: tile.kind === "sum" ? sum : numbers.length ? sum / numbers.length : 0, breakdown: [] }
}
