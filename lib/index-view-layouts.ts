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

export type ViewLayoutKind = "table" | "cards" | "list" | "kanban" | "master-detail" | "calendar" | "dashboard" | "gallery" | "timeline" | "tree" | "codex" | "stats"

export type DashboardTileKind = "count" | "sum" | "average" | "min" | "max" | "filled" | "breakdown"
export type DashboardTile = { kind: DashboardTileKind; column?: string; label?: string; /** Couleur de la tuile (#hex). */ color?: string; /** Tuile large (deux places). */ wide?: boolean }

/**
 * L'apparence des éléments d'une vue (Modifier › Liste, Kanban…) : comme l'atelier des
 * cartes, mais pour la vue elle-même. Tout est facultatif : absent, la vue garde son
 * apparence d'avant.
 */
export type ViewLook = {
  /** Espacement des éléments. */
  density?: "compact" | "normal" | "airy"
  /** Éléments encadrés un par un, ou lignes séparées d'un trait. */
  surface?: "boxed" | "plain"
  /** Comment la couleur (« Couleur des lignes selon ») marque un élément. */
  accent?: "border" | "tint" | "dot" | "title" | "none"
  /** Le nom : police et taille. */
  titleFont?: "display" | "sans"
  titleSize?: "sm" | "md" | "lg"
  /** Les colonnes montrées sous le nom. */
  fieldStyle?: "inline" | "labels" | "pills" | "stacked"
  /** L'image à côté du nom. */
  imageShape?: "square" | "rounded" | "circle"
  imageSize?: "sm" | "md" | "lg"
  /** Kanban : colonnes sobres, teintées, ou à en-tête coloré. */
  laneStyle?: "plain" | "tinted" | "header"
  /** Calendrier : grille du mois ou agenda (liste par date) ; style des entrées. */
  calendarMode?: "month" | "agenda"
  entryStyle?: "pill" | "dot" | "bar"
  /** Tableau de bord : tuiles sobres, à liseré de couleur, ou teintées. */
  tileStyle?: "plain" | "accent" | "tinted"
  /** Galerie : le nom posé sur l'image ou dessous. */
  caption?: "overlay" | "below"
  /** Codex : image à côté ou en bannière ; lettrine au premier paragraphe. */
  codexImage?: "side" | "banner"
  dropCap?: boolean
  /** Maître-détail : largeur de la liste. */
  masterWidth?: "narrow" | "normal" | "wide"
  /** Sections : un trait discret (d'office) ou un grand titre centré, comme les familles de classes. */
  sectionStyle?: "bar" | "heading"
}

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
  /** Liste : sur une à cinq colonnes (sur un écran assez large). */
  listColumns?: 1 | 2 | 3 | 4 | 5
  /** Kanban : largeur des colonnes. */
  laneWidth?: "narrow" | "normal" | "wide"
  /** Maître-détail : les colonnes du détail (toutes si vide), douze au plus. */
  detailFields?: string[]
  /** Calendrier : la liste des lignes sans date sous le calendrier. */
  showUndated?: boolean
  /** Tableau de bord : nombre de tuiles par rangée. */
  tileColumns?: 1 | 2 | 3 | 4
  /**
   * Liste, kanban, maître-détail, chronologie : chaque élément dessiné avec une carte de
   * « Modifier › Cartes » (son identifiant, ou « * » pour la carte par défaut de l'onglet) ;
   * absent : le nom et les colonnes choisies, comme avant.
   */
  itemCard?: string
  /** Arborescence : la colonne qui nomme la ligne parente (« Pays » d'une ville, « Région »…). */
  parentColumn?: string
  /** Galerie : forme et taille des images, légende au survol seulement. */
  galleryShape?: "square" | "portrait" | "landscape"
  gallerySize?: "sm" | "md" | "lg"
  captionOnHover?: boolean
  /** Chronologie : éléments des deux côtés de la ligne du temps, ou tous à droite. */
  timelineSide?: "alternate" | "right"
  /** Codex : le sommaire à côté des fiches. */
  showToc?: boolean
  /** L'apparence des éléments (Modifier › la vue › Apparence). */
  look?: ViewLook
}

/** La valeur d'`itemCard` qui veut dire « la carte par défaut de l'onglet ». */
export const DEFAULT_ITEM_CARD = "*"

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
  { value: "gallery", label: "Galerie", hint: "Les images en mosaïque, le nom en légende : portraits, cartes, illustrations." },
  { value: "timeline", label: "Chronologie", hint: "Les lignes le long d’une ligne du temps, rangées par date ou par année." },
  { value: "tree", label: "Arborescence", hint: "Les lignes rangées sous leur parent : Continent › Pays › Ville, Panthéon › Dieu…" },
  { value: "codex", label: "Codex", hint: "Les fiches l’une après l’autre, à lire comme un livre, avec un sommaire." },
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

const lookChoices: { [K in keyof ViewLook]-?: readonly unknown[] } = {
  density: ["compact", "normal", "airy"],
  surface: ["boxed", "plain"],
  accent: ["border", "tint", "dot", "title", "none"],
  titleFont: ["display", "sans"],
  titleSize: ["sm", "md", "lg"],
  fieldStyle: ["inline", "labels", "pills", "stacked"],
  imageShape: ["square", "rounded", "circle"],
  imageSize: ["sm", "md", "lg"],
  laneStyle: ["plain", "tinted", "header"],
  calendarMode: ["month", "agenda"],
  entryStyle: ["pill", "dot", "bar"],
  tileStyle: ["plain", "accent", "tinted"],
  caption: ["overlay", "below"],
  codexImage: ["side", "banner"],
  dropCap: [true],
  masterWidth: ["narrow", "normal", "wide"],
  sectionStyle: ["bar", "heading"],
}

/** L'apparence propre : seulement les choix connus ; `undefined` si rien n'est réglé. */
export function cleanViewLook(value: unknown): ViewLook | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const look: Record<string, unknown> = {}
  for (const [key, allowed] of Object.entries(lookChoices)) if (allowed.includes(raw[key])) look[key] = raw[key]
  return Object.keys(look).length ? look as ViewLook : undefined
}

const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)

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
    return [{ kind: entry.kind as DashboardTileKind, ...(text(entry.column) ? { column: text(entry.column) } : {}), ...(text(entry.label, 60) ? { label: text(entry.label, 60) } : {}), ...(isHexColor(entry.color) ? { color: entry.color } : {}), ...(entry.wide === true ? { wide: true } : {}) }]
  }).slice(0, 12) : []
  if (tiles.length) layout.tiles = tiles
  if (text(raw.sortBy)) layout.sortBy = text(raw.sortBy)
  if (raw.sortDesc === true) layout.sortDesc = true
  if (text(raw.colorBy)) layout.colorBy = text(raw.colorBy)
  if (text(raw.imageColumn)) layout.imageColumn = text(raw.imageColumn)
  if (raw.hideEmpty === true) layout.hideEmpty = true
  if (raw.hideCounts === true) layout.hideCounts = true
  if (raw.listColumns === 2 || raw.listColumns === 3 || raw.listColumns === 4 || raw.listColumns === 5) layout.listColumns = raw.listColumns
  if (raw.laneWidth === "narrow" || raw.laneWidth === "wide") layout.laneWidth = raw.laneWidth
  const detailFields = Array.isArray(raw.detailFields) ? raw.detailFields.map((field) => text(field)).filter(Boolean).slice(0, 12) : []
  if (detailFields.length) layout.detailFields = detailFields
  if (raw.showUndated === true) layout.showUndated = true
  if (raw.tileColumns === 1 || raw.tileColumns === 2 || raw.tileColumns === 4) layout.tileColumns = raw.tileColumns
  if (text(raw.itemCard, 80)) layout.itemCard = text(raw.itemCard, 80)
  if (text(raw.parentColumn)) layout.parentColumn = text(raw.parentColumn)
  if (raw.galleryShape === "square" || raw.galleryShape === "portrait" || raw.galleryShape === "landscape") layout.galleryShape = raw.galleryShape
  if (raw.gallerySize === "sm" || raw.gallerySize === "md" || raw.gallerySize === "lg") layout.gallerySize = raw.gallerySize
  if (raw.captionOnHover === true) layout.captionOnHover = true
  if (raw.timelineSide === "alternate" || raw.timelineSide === "right") layout.timelineSide = raw.timelineSide
  if (raw.showToc === true) layout.showToc = true
  const look = cleanViewLook(raw.look)
  if (look) layout.look = look
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
  const next: ViewLayout = { ...layout, groupBy: one(layout.groupBy), kanbanColumn: one(layout.kanbanColumn), dateColumn: one(layout.dateColumn), sortBy: one(layout.sortBy), parentColumn: one(layout.parentColumn), colorBy: one(layout.colorBy), imageColumn: one(layout.imageColumn), fields: many(layout.fields), detailFields: many(layout.detailFields), tiles: layout.tiles?.filter((tile) => !tile.column || known.has(fold(tile.column))) }
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
  { id: "eraser:list-cards", name: "Liste de cartes", builtin: true, layout: { kind: "list", itemCard: DEFAULT_ITEM_CARD, listColumns: 2 } },
  // La page Règles › Classes : une section par famille (Type), cinq cartes de classe par rangée.
  { id: "eraser:classes-par-famille", name: "Classes par famille", builtin: true, layout: { kind: "list", groupBy: "Type", hideEmpty: true, hideCounts: true, itemCard: "eraser-classe-carte", listColumns: 5, look: { sectionStyle: "heading" } } },
  { id: "eraser:cards-by-section", name: "Cartes rangées en grandes sections", builtin: true, layout: { kind: "list", itemCard: DEFAULT_ITEM_CARD, listColumns: 4, hideEmpty: true, hideCounts: true, look: { sectionStyle: "heading" } } },
  { id: "eraser:kanban-cards", name: "Kanban de cartes", builtin: true, layout: { kind: "kanban", itemCard: DEFAULT_ITEM_CARD, hideEmpty: true } },
  { id: "eraser:master-card", name: "Maître-détail avec carte", builtin: true, layout: { kind: "master-detail", itemCard: DEFAULT_ITEM_CARD } },
  { id: "eraser:gallery-portraits", name: "Trombinoscope", builtin: true, layout: { kind: "gallery", galleryShape: "portrait", gallerySize: "md" } },
  { id: "eraser:gallery-wall", name: "Mur d’images", builtin: true, layout: { kind: "gallery", galleryShape: "square", gallerySize: "sm", captionOnHover: true } },
  { id: "eraser:timeline-alternate", name: "Chronique alternée", builtin: true, layout: { kind: "timeline", timelineSide: "alternate" } },
  { id: "eraser:timeline-cards", name: "Chronologie de cartes", builtin: true, layout: { kind: "timeline", timelineSide: "right", itemCard: DEFAULT_ITEM_CARD } },
  { id: "eraser:tree-folded", name: "Arbre replié", builtin: true, layout: { kind: "tree", collapsed: true } },
  { id: "eraser:codex-toc", name: "Codex avec sommaire", builtin: true, layout: { kind: "codex", showToc: true } },
  { id: "eraser:list-bestiary", name: "Bestiaire (portraits ronds, pastilles)", builtin: true, layout: { kind: "list", look: { surface: "boxed", density: "airy", imageShape: "circle", imageSize: "lg", titleSize: "lg", fieldStyle: "pills", accent: "tint" } } },
  { id: "eraser:list-ledger", name: "Registre (lignes fines, libellés)", builtin: true, layout: { kind: "list", look: { surface: "plain", density: "compact", titleFont: "sans", titleSize: "sm", fieldStyle: "labels", accent: "dot" } } },
  { id: "eraser:kanban-headers", name: "Kanban à en-têtes colorés", builtin: true, layout: { kind: "kanban", hideEmpty: true, look: { laneStyle: "header", fieldStyle: "pills", imageShape: "rounded" } } },
  { id: "eraser:kanban-tinted", name: "Kanban teinté", builtin: true, layout: { kind: "kanban", look: { laneStyle: "tinted", surface: "boxed", accent: "border", density: "compact" } } },
  { id: "eraser:calendar-agenda", name: "Agenda", builtin: true, layout: { kind: "calendar", look: { calendarMode: "agenda", entryStyle: "bar" } } },
  { id: "eraser:calendar-dots", name: "Calendrier à pastilles", builtin: true, layout: { kind: "calendar", look: { entryStyle: "dot" } } },
  { id: "eraser:dashboard-tinted", name: "Tableau de bord teinté", builtin: true, layout: { kind: "dashboard", tiles: [{ kind: "count" }], look: { tileStyle: "tinted" } } },
  { id: "eraser:gallery-captions", name: "Galerie légendée", builtin: true, layout: { kind: "gallery", galleryShape: "square", look: { caption: "below", fieldStyle: "pills" } } },
  { id: "eraser:codex-book", name: "Livre illustré", builtin: true, layout: { kind: "codex", showToc: true, look: { codexImage: "banner", dropCap: true } } },
  { id: "eraser:master-wide", name: "Maître-détail, liste large", builtin: true, layout: { kind: "master-detail", look: { masterWidth: "wide", imageShape: "circle", fieldStyle: "stacked" } } },
]

export function cleanViewPreset(value: unknown): ViewPreset | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const name = text(raw.name, 60)
  const layout = cleanViewLayout(raw.layout)
  if (!name || !layout || !isPresentationKind(layout.kind)) return null
  return { id: text(raw.id, 80) || "", name, layout, ...(text(raw.updatedAt, 40) ? { updatedAt: text(raw.updatedAt, 40) } : {}) }
}


/* ---------- Arborescence et chronologie : règles pures ---------- */

export type RowTreeNode<T> = { row: T; depth: number; children: RowTreeNode<T>[] }

/**
 * Les lignes rangées sous leur parent : la case `parentOf` d'une ligne nomme une autre ligne
 * (premier nom de la case, sans tenir compte des accents ni des majuscules). Une ligne dont
 * le parent est inconnu, vide, elle-même ou pris dans une boucle est une racine.
 */
export function rowTree<T>(rows: T[], nameOf: (row: T) => string, parentOf: (row: T) => string): RowTreeNode<T>[] {
  const fold = (value: string) => value.replace(/<[^>]+>/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
  const byName = new Map<string, T>()
  for (const row of rows) { const name = fold(nameOf(row)); if (name && !byName.has(name)) byName.set(name, row) }
  const parent = new Map<T, T>()
  for (const row of rows) {
    const named = cellParts(parentOf(row)).map(fold).find(Boolean)
    const found = named ? byName.get(named) : undefined
    if (found !== undefined && found !== row) parent.set(row, found)
  }
  // Une boucle (A sous B, B sous A) : la première ligne rencontrée redevient une racine.
  for (const row of rows) {
    const seen = new Set<T>([row])
    let current = parent.get(row)
    while (current !== undefined) {
      if (seen.has(current)) { parent.delete(row); break }
      seen.add(current)
      current = parent.get(current)
    }
  }
  const children = new Map<T, T[]>()
  for (const row of rows) { const up = parent.get(row); if (up !== undefined) children.set(up, [...(children.get(up) ?? []), row]) }
  const build = (row: T, depth: number): RowTreeNode<T> => ({ row, depth, children: (children.get(row) ?? []).map((child) => build(child, depth + 1)) })
  return rows.filter((row) => !parent.has(row)).map((row) => build(row, 0))
}

/** Le nombre de lignes sous un nœud (lui non compris). */
export function treeSize<T>(node: RowTreeNode<T>): number {
  return node.children.reduce((sum, child) => sum + 1 + treeSize(child), 0)
}

export type TimelineDate = { year: number; month: number; day: number; /** Seule l'année est connue (« 1023 », « An 1023 »). */ yearOnly?: boolean }

/**
 * Les lignes dans l'ordre du temps : la date lue par `parse` (un calendrier du monde), sinon
 * un nombre seul dans la case, pris comme une année. Les lignes sans date restent à part.
 */
export function timelineEntries<T>(rows: T[], textOf: (row: T) => string, parse: (text: string) => { year: number; month: number; day: number } | null) {
  const dated: Array<{ row: T; date: TimelineDate }> = []
  const undated: T[] = []
  for (const row of rows) {
    const value = textOf(row).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    const date = value ? parse(value) : null
    if (date) { dated.push({ row, date }); continue }
    const year = value ? cellNumber(value) : null
    if (year !== null && Number.isInteger(year)) dated.push({ row, date: { year, month: 0, day: 0, yearOnly: true } })
    else undated.push(row)
  }
  dated.sort((left, right) => left.date.year - right.date.year || left.date.month - right.date.month || left.date.day - right.date.day)
  return { dated, undated }
}
