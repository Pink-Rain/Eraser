/**
 * Les vues enregistrées d'un index : des lignes choisies (un filtre), dans un ordre (un tri),
 * sous une forme (une présentation), sous un nom. C'est le modèle commun visé par la roadmap
 * « Vues des index » : l'onglet-fenêtre, les versions nommées d'une présentation et le bloc
 * « Vue d'index » d'une page en sont des cas particuliers, relus ici sans rien perdre.
 *
 * - La forme vient de l'onglet (la version à l'étoile de « Modifier › la présentation »,
 *   d'office), d'une autre version de l'onglet, d'un preset, ou de la vue elle-même.
 * - Le filtre reprend les conditions des onglets-fenêtres (lib/index-windows.ts).
 * - Ce que règle une page autour d'une vue (titre, hauteur, nombre de lignes, lignes liées à
 *   la page de ligne, recherche de la page) reste au bloc de page : ce n'est pas la vue.
 *
 * Rien ici n'écrit ni ne lit un stockage : règles pures, pour la page, le serveur et les tests.
 */
import { cleanClick, type ViewBlock, type ViewBlockKind } from "@/lib/custom-pages"
import { cleanPresentation, isPresentationKind, PRESENTATION_VARIANT_PREFIX, type AllPresentationKind, type Presentation } from "@/lib/index-presentations"
import { cleanStats, type StatDefinition } from "@/lib/index-stats"
import { ALL_SOURCES, matchesFilter, parseFilterConditions, type Filter, type IndexWindow } from "@/lib/index-windows"

/** Le genre d'une vue : une présentation, le tableau, les cartes, ou l'onglet stat. */
export type SavedViewKind = AllPresentationKind

/** D'où vient la forme d'une vue. Absente : celle de l'onglet (la version à l'étoile). */
export type SavedViewShape =
  | { from: "variant"; id: string }
  | { from: "preset"; id: string }
  | { from: "own"; layout: Presentation }

export type SavedView = {
  id: string
  /** L'index : une clé d'index du monde (« places », « perso-… ») ou « objects ». */
  index: string
  name: string
  /** Une icône (nom d'icône ou émoji) devant le nom. */
  icon?: string
  /** « * » : tous les onglets de l'index ; sinon l'onglet (ou le tableau d'objets) choisi. */
  source: string
  kind: SavedViewKind
  shape?: SavedViewShape
  /**
   * La carte qui tient lieu de « carte à l'étoile » pour cette vue : celle du genre « cartes », et
   * celle des éléments dessinés avec la carte à l'étoile (kanban, liste…). Absente : l'étoile de l'onglet.
   */
  cardId?: string
  /** Seulement les lignes qui remplissent ces conditions ; absent : toutes. */
  filter?: Filter
  /** L'ordre des lignes ; une présentation peut aussi avoir son propre tri. */
  sort?: { column: string; desc: boolean }
  /** Au clic sur une ligne : sa fiche (d'office), une adresse d'Eraser (« /campagne/{ID} »), ou rien (« - »). */
  click?: string
  /** Onglet stat : les statistiques qu'il gardait avant l'alpha 197, toujours montrées avec celles de l'index. */
  stats?: StatDefinition[]
  position: number
  /** Prévue par Eraser (définie dans le code, jamais écrite) : elle ne se modifie ni ne se supprime. */
  builtin?: boolean
}

export const SAVED_VIEW_LIMITS = { name: 60, icon: 40, source: 200, conditions: 20, perIndex: 60, column: 120, id: 60 } as const

const kinds = new Set<string>(["table", "cards", "list", "kanban", "master-detail", "calendar", "dashboard", "gallery", "timeline", "tree", "codex", "stats"])

const text = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
const cleanId = (value: unknown) => (typeof value === "string" ? value : "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, SAVED_VIEW_LIMITS.id)

/** Un filtre lu (conditions illisibles écartées) ; aucune condition : pas de filtre. */
export function cleanFilter(value: unknown): Filter | undefined {
  if (!value || typeof value !== "object") return undefined
  const raw = value as Record<string, unknown>
  const conditions = Array.isArray(raw.conditions) ? parseFilterConditions(JSON.stringify(raw.conditions)).slice(0, SAVED_VIEW_LIMITS.conditions) : []
  return conditions.length ? { match: raw.match === "une" ? "une" : "toutes", conditions } : undefined
}

function cleanShape(value: unknown, kind: SavedViewKind): SavedViewShape | undefined {
  if (!value || typeof value !== "object") return undefined
  const raw = value as Record<string, unknown>
  if (raw.from === "own") {
    // Une forme propre : seulement pour une présentation (le tableau et les cartes n'en ont pas).
    const layout = cleanPresentation(raw.layout)
    return layout && isPresentationKind(layout.kind) && layout.kind === kind ? { from: "own", layout } : undefined
  }
  if (raw.from === "variant" || raw.from === "preset") {
    const id = text(raw.id, 80)
    return id ? { from: raw.from, id } : undefined
  }
  return undefined
}

/** Une vue lue (JSON du serveur ou envoyée par un éditeur), bornée et nettoyée ; `null` si illisible. */
export function cleanSavedView(input: unknown): SavedView | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const id = cleanId(raw.id)
  const index = text(raw.index, 90)
  const kind = typeof raw.kind === "string" && kinds.has(raw.kind) ? raw.kind as SavedViewKind : null
  if (!id || !index || !kind) return null
  const view: SavedView = {
    id,
    index,
    name: text(raw.name, SAVED_VIEW_LIMITS.name) || "Vue",
    source: text(raw.source, SAVED_VIEW_LIMITS.source) || ALL_SOURCES,
    kind,
    position: typeof raw.position === "number" && Number.isFinite(raw.position) ? Math.max(0, Math.round(raw.position)) : 0,
  }
  const icon = text(raw.icon, SAVED_VIEW_LIMITS.icon)
  if (icon) view.icon = icon
  const shape = kind === "stats" ? undefined : cleanShape(raw.shape, kind)
  if (shape) view.shape = shape
  const cardId = kind === "stats" ? "" : text(raw.cardId, 60)
  if (cardId) view.cardId = cardId
  const filter = cleanFilter(raw.filter)
  if (filter) view.filter = filter
  const sortRaw = raw.sort && typeof raw.sort === "object" ? raw.sort as Record<string, unknown> : null
  const sortColumn = text(sortRaw?.column, SAVED_VIEW_LIMITS.column)
  if (sortColumn) view.sort = { column: sortColumn, desc: sortRaw?.desc === true }
  const click = cleanClick(raw.click)
  if (click) view.click = click
  const stats = kind === "stats" ? cleanStats(raw.stats) : []
  if (stats.length) view.stats = stats
  if (raw.builtin === true) view.builtin = true
  return view
}

/** Les vues d'un index lues : une vue illisible ou en double est écartée, l'ordre suit `position`. */
export function parseSavedViews(input: unknown): SavedView[] {
  const seen = new Set<string>()
  return (Array.isArray(input) ? input : [])
    .map(cleanSavedView)
    .filter((view): view is SavedView => Boolean(view) && !seen.has(view!.id) && Boolean(seen.add(view!.id)))
    .sort((left, right) => left.position - right.position)
    .slice(0, SAVED_VIEW_LIMITS.perIndex)
}

/** Une ligne entre-t-elle dans la vue ? `cell` donne la valeur d'une colonne de la ligne. */
export function matchesSavedView(view: Pick<SavedView, "filter">, cell: (column: string) => string) {
  return view.filter ? matchesFilter(view.filter, cell) : true
}

// ---------------------------------------------------------------------------
// Les anciens réglages, relus comme des vues (et rendus tels quels)
// ---------------------------------------------------------------------------

/**
 * Un onglet-fenêtre : une vue en tableau filtré, ou l'onglet stat. Même identifiant, pour que
 * les liens et les choix d'onglet déjà enregistrés continuent de la retrouver.
 */
export function savedViewFromWindow(tabWindow: IndexWindow): SavedView {
  const stats = tabWindow.layout?.kind === "stats"
  // Les conditions telles quelles : celles des onglets prévus par Eraser (« catégorie de sort »)
  // ne se saisissent pas, et `cleanFilter` les écarterait.
  const conditions = tabWindow.conditions.filter((condition) => condition.column.trim())
  const filter: Filter | undefined = conditions.length ? { match: tabWindow.match, conditions } : undefined
  return {
    id: tabWindow.id,
    index: tabWindow.index,
    name: tabWindow.name,
    source: tabWindow.source,
    kind: stats ? "stats" : "table",
    ...(filter ? { filter } : {}),
    ...(stats && tabWindow.layout?.stats?.length ? { stats: tabWindow.layout.stats } : {}),
    position: tabWindow.position,
    ...(tabWindow.builtin ? { builtin: true } : {}),
  }
}

/** Une vue en tableau filtré (ou l'onglet stat) écrite comme un onglet-fenêtre ; `null` pour les autres genres. */
export function windowFromSavedView(view: SavedView): IndexWindow | null {
  if (view.kind !== "table" && view.kind !== "stats") return null
  return {
    id: view.id,
    index: view.index,
    name: view.name,
    source: view.source,
    match: view.filter?.match ?? "toutes",
    conditions: view.filter?.conditions ?? [],
    position: view.position,
    ...(view.builtin ? { builtin: true } : {}),
    ...(view.kind === "stats" ? { layout: { kind: "stats", ...(view.stats?.length ? { stats: view.stats } : {}) } } : {}),
  }
}

/** Une version nommée d'une présentation d'un onglet : une vue sans filtre, qui garde cette version. */
export function savedViewFromVariant(index: string, tab: string, variant: { id: string; name: string; layout: Presentation }, position = 0): SavedView {
  return { id: cleanId(`version-${variant.id}`), index, name: variant.name, source: tab, kind: variant.layout.kind, shape: { from: "variant", id: variant.id }, position }
}

/** Ce qu'un bloc « Vue d'index » dit de la vue qu'il montre (sans ses réglages de page). */
export type BlockViewFields = Pick<ViewBlock, "kind" | "layout" | "presetId" | "cardId" | "where" | "sort" | "click">

/** Un bloc « Vue d'index » d'une page : la vue qu'il montre, propre au bloc. */
export function savedViewFromBlock(block: Pick<ViewBlock, "id" | "index" | "tab" | "heading"> & BlockViewFields): SavedView {
  const shape: SavedViewShape | undefined = block.layout && isPresentationKind(block.layout.kind)
    ? { from: "own", layout: block.layout }
    : block.presetId?.startsWith(PRESENTATION_VARIANT_PREFIX)
      ? { from: "variant", id: block.presetId.slice(PRESENTATION_VARIANT_PREFIX.length) }
      : block.presetId ? { from: "preset", id: block.presetId } : undefined
  return {
    id: cleanId(`bloc-${block.id}`),
    index: block.index,
    name: block.heading || "Vue de la page",
    source: block.tab,
    kind: block.layout?.kind ?? block.kind,
    ...(shape ? { shape } : {}),
    ...(block.cardId ? { cardId: block.cardId } : {}),
    ...(block.where ? { filter: block.where } : {}),
    ...(block.sort ? { sort: block.sort } : {}),
    ...(block.click ? { click: block.click } : {}),
    position: 0,
  }
}

/**
 * Les champs d'un bloc de page qui montrent cette vue : ce que lit déjà le serveur des pages
 * (app/api/pages/block-data/route.ts), donc le même affichage. `null` pour l'onglet stat, qui
 * n'est pas une vue d'index mais un bloc « Statistiques ».
 */
export function blockFieldsFromSavedView(view: SavedView): BlockViewFields | null {
  if (view.kind === "stats") return null
  const fields: BlockViewFields = { kind: view.kind as ViewBlockKind }
  if (view.shape?.from === "own") fields.layout = view.shape.layout
  else if (view.shape?.from === "variant") fields.presetId = `${PRESENTATION_VARIANT_PREFIX}${view.shape.id}`
  else if (view.shape?.from === "preset") fields.presetId = view.shape.id
  if (view.cardId) fields.cardId = view.cardId
  if (view.filter) fields.where = view.filter
  if (view.sort) fields.sort = view.sort
  if (view.click) fields.click = view.click
  return fields
}
