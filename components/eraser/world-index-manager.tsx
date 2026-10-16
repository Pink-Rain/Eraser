"use client"

import dynamic from "next/dynamic"
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRememberedSearch } from "@/hooks/use-remembered-search"
import { usePathname, useRouter } from "next/navigation"
import { ArrowRightLeft, BookmarkPlus, CircleHelp, FileText, Filter, LoaderCircle, Pencil, Plus, RefreshCw, Search, Settings2, SpellCheck, Trash2 } from "lucide-react"

import { FullscreenButton, SheetsLinkButton, ToolbarIconButton, useFullscreenPanel } from "@/components/eraser/index-toolbar"
import { chooseCampaign, copyToClipboard, DrawRowButton, rowCard, sendToCampaignChat, useChoiceDialog, useIndexNotices } from "@/components/eraser/index-action-ui"
import { announceWorldIndexChange, onWorldIndexChange } from "@/lib/world-index-events"
import { builtinWindowsFor, windowAddDefaults } from "@/lib/index-window-defaults"
import { forgetWorldIndexData, indexGridColumn, IndexEntryForm, loadWorldIndexData, RankedLinksCell, type IndexFieldProps, type IndexFormField, type LoadedWorldIndex } from "@/components/eraser/index-cells"
import { createRowEngine } from "@/components/eraser/index-row-engine"
import { IndexRowForm, IndexRowSheet } from "@/components/eraser/index-row-sheet"
import { RowPageLink, rowPageFor } from "@/components/eraser/row-page-link"
import { useRolesOf } from "@/components/eraser/view-roles"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OwnerSelector } from "@/components/eraser/owner-selector"
import type { EditorMode } from "@/components/eraser/index-editor"
import { SavedViewDialog, savedViewMark, useIndexSettings } from "@/components/eraser/index-windows"
import { IndexPresentation } from "@/components/eraser/index-presentation"
import { IndexStats, TAB_PSEUDO } from "@/components/eraser/index-stats"
import type { StatColumnGroup, StatDefinition } from "@/lib/index-stats"
import { builtinPresentationPresets, DEFAULT_ITEM_CARD, groupRowsBy, type Presentation } from "@/lib/index-presentations"
import { filterFromGridFilters, matchesSavedView, resolveSavedViewPresentation, savedViewFromWindow, windowFromSavedView, type SavedView } from "@/lib/index-saved-views"
import { CardActionsContext, IndexCard, IndexCardGrid, IndexDisplayControls, NoCardsYet, isCardChoice, isIndexDisplay, roleRowOf, type CardActions, type CardRowSource, type IndexDisplay } from "@/components/eraser/index-card"
import { pickCard, tabCardsOf } from "@/lib/index-cards"
import { ALL_SOURCES, windowIdOfSelectKey, windowSelectKey, type FilterCondition } from "@/lib/index-windows"
import { DEFAULT_FORM_ID, layoutPlaces } from "@/lib/index-layouts"
import { automaticLayoutFor, tabFormOrBuiltin, tabLayoutOrBuiltin } from "@/lib/index-layout-defaults"
import { IndexFormView } from "@/components/eraser/index-form-view"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { isGridFilters, type GridFilters } from "@/components/eraser/sheet-grid-filter"
import { ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from "@/components/ui/context-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { IN_PLACE_ATTRIBUTE, replaceAppUrl, URL_CHANGE_EVENT } from "@/components/eraser/app-tabs"
import { IndexTabPicker, useIndexTabParam } from "@/components/eraser/index-tab-picker"
import { runActionButton, type ActionRuntime } from "@/lib/index-actions"
import { choiceCorrection, computeRollup, isIdHeader, isComputedSpec, isRichSpec, isSheetSpec, normalizeSpec, type ActionButton, type IndexColumnSpec } from "@/lib/index-columns"
import { unpackTableRows } from "@/lib/index-rows-wire"
import { columnFormulaValue, numericCellValue } from "@/lib/index-formula"
import { cryptoRandom, drawRandom, drawText, type RandomCandidateRow } from "@/lib/index-random"
import { indexSortKey, sortByIndexKey } from "@/lib/index-sort"
import { shownReferenceText } from "@/components/eraser/reference-store"
import type { IndexEditorModel, SchemaOperation } from "@/lib/index-schema-shared"
import {
  foldName,
  isBuiltinWorldIndexKey,
  isLongColumn,
  isNameColumn,
  labelColumnIndex,
  nameColumnIndex,
  linkEndCovers,
  splitNames,
  worldColumnSpec,
  worldIndexDefinitions,
  type WorldIndexDefinition,
  type WorldIndexKey,
} from "@/lib/world-index-definitions"
import type { WorldIndexData, WorldIndexRow, WorldIndexRowRef, WorldIndexTable } from "@/lib/world-indexes"
import { ReferenceScopeProvider } from "@/components/eraser/reference-menu"

// Les fenêtres (« Modifier », guide, fiche d'une créature) ne sont chargées qu'à leur ouverture : la page s'affiche plus vite.
const IndexEditor = dynamic(() => import("@/components/eraser/index-editor").then((module) => module.IndexEditor), { ssr: false })
const IndexGuide = dynamic(() => import("@/components/eraser/index-guide").then((module) => module.IndexGuide), { ssr: false })


/** Personnages et campagnes : leur propriétaire et leurs liens, calculés par Eraser. */
const OWNER_COLUMN = "__proprietaire"
const LINKS_COLUMN = "__liens"

/** Le choix « Tout » de la liste des onglets : toutes les lignes de l'index ensemble. */
const ALL_TABS = "*"
/** Colonne propre à la vue « Tout » : l'onglet de chaque ligne, qu'on peut changer. */
const TAB_COLUMN = "__onglet"
/** Un onglet de rangement dans la liste des onglets : « rangement:Rune ». */
const SORT_PREFIX = "rangement:"

/**
 * Un onglet de rangement : une valeur d'une colonne « Rangement en onglets ». Il montre
 * les lignes qui portent cette valeur, sans les sortir de leur onglet ; un vrai onglet du
 * même nom (lignes rangées par une version d'avant) y est réuni, rien n'est caché.
 */
type SortTab = { value: string; columns: string[]; count: number }

function columnWidthFor(header: string, fallback?: number) {
  if (fallback) return fallback
  if (isLongColumn(header)) return 380
  return isNameColumn(header) ? 220 : 170
}


/** Les cellules de liste mal orthographiées (« Aggressif »), que « Corriger » réécrit. */
function countCorrections(tables: WorldIndexTable[], specOf: (tab: string, header: string) => IndexColumnSpec) {
  return tables.reduce((total, table) => total + table.headers.reduce((sum, header, column) => {
    const spec = specOf(table.tabName, header)
    if (spec.kind !== "choice" || !spec.options) return sum
    return sum + table.rows.filter((row) => choiceCorrection(row.values[column] ?? "", spec.options!)).length
  }, 0), 0)
}

/** La colonne « Nom » d'un tableau (« Titre » pour le vocabulaire) : c'est par elle que les relations retrouvent une ligne. */
function nameColumnOf(headers: string[]) {
  return nameColumnIndex(headers)
}

function isValidSort(value: unknown): value is SheetGridSort {
  if (value === null) return true
  if (!value || typeof value !== "object") return false
  const candidate = value as { column?: unknown; direction?: unknown }
  return typeof candidate.column === "string" && (candidate.direction === "asc" || candidate.direction === "desc")
}

/** Une ligne est désignée par son onglet et son numéro : la vue « Tout » en mélange plusieurs. */
function rowKeyOf(tabName: string, rowNumber: number) {
  return `${tabName}::${rowNumber}`
}

/**
 * Ce que le serveur reçoit pour désigner une ligne : son onglet, son numéro (un simple indice,
 * d'autres ont pu ajouter ou retirer des lignes), son identifiant et son nom.
 */
type RowTarget = WorldIndexRowRef & { tabName: string }

/** Ce que fait une écriture lancée par un bouton : sa ligne, ce qu'il a vu de la case, et l'erreur renvoyée plutôt qu'affichée. */
type CommitOptions = { row?: RowTarget; previous?: string; rethrow?: boolean }

function parseRowKey(key: string) {
  const separator = key.lastIndexOf("::")
  return { tabName: key.slice(0, separator), rowNumber: Number(key.slice(separator + 2)) }
}

function columnIndexOf(table: WorldIndexTable, header: string) {
  return table.headers.findIndex((candidate) => foldName(candidate) === foldName(header))
}

/** La définition de repli d'un index qui n'a pas pu être chargé. */
function fallbackDefinition(indexKey: WorldIndexKey): WorldIndexDefinition {
  return isBuiltinWorldIndexKey(indexKey) ? worldIndexDefinitions[indexKey] : { key: indexKey, sheetName: indexKey, title: indexKey, path: `/ressources/index/${indexKey}`, tabs: [], custom: true }
}

/** Une ligne de la vue intégrée, telle que la page qui l'accueille la voit. */
export type IndexEmbedRow = { rowKey: string; id: string; name: string; cell: (header: string) => string }

/**
 * Le moteur d'un index affiché dans une autre page (les Actifs du créateur de classe) :
 * mêmes cartes, onglets-fenêtres, « Modifier », tri, fiche et colonnes calculées que la page
 * de l'index, mais sur les lignes que la page choisit, sans sélecteur d'onglets ni adresse
 * réécrite. La page peut ajouter ses colonnes, son menu de ligne et son « Ajouter ».
 */
export type IndexEmbed = {
  /** Distingue les réglages gardés sur ce poste (tri, tableau ou cartes, largeurs). */
  id: string
  /** Le nom de la vue, premier choix quand l'index a des onglets-fenêtres (« Actifs »). */
  label: string
  /** Les lignes montrées, lues dans leurs cases. */
  rowFilter: (cell: (header: string) => string) => boolean
  /** La recherche tapée dans la page qui l'accueille : la vue n'a alors pas la sienne. */
  query?: string
  /** Colonnes de l'index cachées dans cette vue (Distance et Charges hors des actifs). */
  hiddenColumns?: string[]
  /** Colonnes propres à la page, placées après `after` (sinon à la fin), et aussi dans la fiche. */
  extraColumns?: Array<{ key: string; label: string; width: number; after?: string; render: (row: IndexEmbedRow, compact: boolean) => ReactNode }>
  rowMenuExtras?: (row: IndexEmbedRow) => ReactNode
  /** « Ajouter » : la page s'en charge (le formulaire d'un nouveau sort). */
  onAdd?: () => void
  addLabel?: string
  /** Ce que reçoit une ligne ajoutée dans le tableau (le Type des passifs). */
  addDefaults?: Record<string, string>
}

/** Les rangs d'un sort dans une classe : commun (0), puis 1 à 20. */
const CLASS_RANKS = Array.from({ length: 21 }, (_, rank) => rank)

type WorldIndexManagerProps = { indexKey: WorldIndexKey; initialData: WorldIndexData | null; initialError: string; embed?: IndexEmbed }

/**
 * Les pages d'index rendent ce composant au même endroit de l'arbre : sans clé,
 * React le réutiliserait d'une page à l'autre et garderait l'état de la première
 * visitée (ses données, son onglet, son tri). La clé repart de zéro à chaque index.
 */
export function WorldIndexManager(props: WorldIndexManagerProps) {
  return <WorldIndexView key={props.embed ? `${props.indexKey}:${props.embed.id}` : props.indexKey} {...props} />
}

/** Un index intégré dans une autre page : il charge ses données lui-même. */
export function EmbeddedWorldIndex({ indexKey, embed }: { indexKey: WorldIndexKey; embed: IndexEmbed }) {
  const [state, setState] = useState<{ data: WorldIndexData | null; error: string } | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/resources/world-indexes?key=${encodeURIComponent(indexKey)}`, { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, payload: (await response.json().catch(() => ({}))) as { data?: WorldIndexData; error?: string } }))
      .then(({ ok, payload }) => { if (alive) setState({ data: ok ? payload.data ?? null : null, error: ok ? "" : payload.error || "Cet index n’a pas pu être lu dans Google Sheets." }) })
      .catch(() => { if (alive) setState({ data: null, error: "Eraser n’a pas pu joindre son serveur local : actualise dans un instant." }) })
    return () => { alive = false }
  }, [indexKey])
  if (!state) return <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed text-sm text-muted-foreground"><span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Chargement de l’index…</span></div>
  return <WorldIndexManager indexKey={indexKey} initialData={state.data} initialError={state.error} embed={embed} />
}

/**
 * Tableur d'un index du monde (créatures, lieux, religions, peuples, langues), branché
 * sur son classeur Google Sheets. Les colonnes liées d'un index à l'autre se complètent
 * côté serveur ; le tableau se recharge quand un lien a touché l'index affiché.
 */
function WorldIndexView({ indexKey, initialData, initialError, embed }: WorldIndexManagerProps) {
  // Les lignes arrivent allégées (lib/index-rows-wire.ts) : rétablies une fois, ici.
  const [data, setData] = useState(() => initialData ? { ...initialData, tables: initialData.tables.map(unpackTableRows) } : initialData)
  const definition = useMemo(() => data?.definition ?? fallbackDefinition(indexKey), [data, indexKey])
  // Plusieurs onglets : la liste s'ouvre sur « Tout ».
  // L'onglet affiché est dans l'adresse (`?onglet=`) : chaque onglet de l'application a le sien.
  // Intégré dans une autre page : son premier onglet (ou un onglet-fenêtre), sans toucher à l'adresse.
  const pathname = usePathname()
  const [urlTab, setUrlTab, tabHref] = useIndexTabParam(pathname, `eraser:world-index:${indexKey}:view`, ALL_TABS)
  const [embedTab, setEmbedTab] = useState("")
  const tabName = embed ? embedTab || (data?.tables[0]?.tabName ?? "") : urlTab
  const setTabName = embed ? setEmbedTab : setUrlTab
  // Les réglages de ce poste (tri, tableau ou cartes) : propres à chaque vue intégrée.
  const storeKey = embed ? `${indexKey}:${embed.id}` : indexKey
  const [pending, setPending] = useState("")
  const [error, setError] = useState(initialError)
  const [saving, setSaving] = useState(0)
  // Cette vue, pour reconnaître ses propres annonces de changement.
  const [origin] = useState(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
  const relatedRef = useRef<Record<string, LoadedWorldIndex | null>>({})
  const [creating, setCreating] = useState(false)
  const [creatingTab, setCreatingTab] = useState(definition.tabs[0]?.name ?? "")
  const [editor, setEditor] = useState<IndexEditorModel | null>(null)
  const [editorError, setEditorError] = useState("")
  const [version, setVersion] = useState(0)
  // Les lignes réécrites depuis leur fiche : le tableau (ou les cartes) les redessine aussitôt.
  const [rowVersions, setRowVersions] = useState<Record<string, number>>({})
  // Gardée pour cette page : changer d'onglet d'Eraser puis revenir la retrouve.
  const [ownQuery, setQuery] = useRememberedSearch()
  const query = embed?.query ?? ownQuery
  const [details, setDetails] = useState<string | null>(null)
  const [sheetForm, setSheetForm] = useState<{ row: string; form: string } | null>(null)
  // « Montrer une carte » (bouton d'une carte) : la ligne dessinée avec une autre carte, dans une fenêtre.
  const [cardPeek, setCardPeek] = useState<{ row: string; card: string } | null>(null)
  const [sort, setSort] = usePersistentState<SheetGridSort>(`eraser:world-index:${storeKey}:sort`, null, isValidSort)
  const localEdits = useRef<Record<string, string>>({})
  // Pour chaque saisie : ses écritures encore en route, et le numéro de requête atteint quand
  // la dernière a abouti. Une relecture demandée avant ne la contient peut-être pas encore.
  const editsInFlight = useRef<Record<string, number>>({})
  const editsSettledAt = useRef<Record<string, number>>({})
  const engineRef = useRef<ReturnType<typeof createRowEngine> | null>(null)
  const router = useRouter()
  const { notify, view: noticesView } = useIndexNotices()
  const { ask, view: choiceView } = useChoiceDialog()
  // Le hasard des formules reste le même jusqu'à « Actualiser ».
  const [seed, setSeed] = useState(() => `${indexKey}:${Date.now()}`)
  const [sheetError, setSheetError] = useState("")
  const [statSheetRows, setStatSheetRows] = useState<string[] | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  // Un lien « ?q=… » (bouton « Ouvrir la ligne liée ») ouvre l'index filtré sur ce nom.
  useEffect(() => {
    if (embed) return
    const initial = new URLSearchParams(window.location.search).get("q")
    // L'adresse n'est connue qu'une fois la page affichée : la lire au rendu ferait différer le serveur et le navigateur.
    if (initial) setQuery(initial)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- lue une fois, à l'ouverture de la page
  }, [setQuery])

  const tables = useMemo(() => data?.tables ?? [], [data])
  // Les onglets-fenêtres : des onglets sans données propres, qui réaffichent des lignes existantes.
  const settings = useIndexSettings(indexKey)
  // Tableau ou cartes, et la carte choisie : retenus pour cet index, sur ce poste.
  const [display, setDisplay] = usePersistentState<IndexDisplay>(`eraser:world-index:${storeKey}:display`, "table", isIndexDisplay)
  const [cardChoice, setCardChoice] = usePersistentState<string>(`eraser:world-index:${storeKey}:card`, "", isCardChoice)
  // « Modifier » s'ouvre sur les colonnes, ou sur les cartes depuis la vue en cartes.
  const [editorMode, setEditorMode] = useState<EditorMode>("columns")
  // Le dialogue des vues : nouvelle (vide, ou pré-remplie par « Enregistrer comme vue »), ou celle choisie.
  const [viewDialog, setViewDialog] = useState<{ mode: "new" | "edit"; draft?: Partial<SavedView>; notice?: string } | null>(null)
  // Les vues de l'index : celles prévues par Eraser (Actifs, Passifs, Bonus des sorts), puis les vues
  // enregistrées (serveur partagé, et onglets-fenêtres de la feuille pas encore repris). Serveur
  // partagé injoignable : les onglets-fenêtres seuls, et un avertissement, jamais un repli silencieux.
  // Une vue intégrée (Création de classe) est déjà limitée à ses sorts : seulement les siennes.
  const ownViews = useMemo(() => settings.savedViewsUnavailable ? settings.views.map(savedViewFromWindow) : settings.savedViews, [settings.savedViews, settings.savedViewsUnavailable, settings.views])
  const views = useMemo(() => [...(embed ? [] : builtinWindowsFor(indexKey).map(savedViewFromWindow)), ...ownViews], [embed, indexKey, ownViews])
  const activeView = useMemo(() => { const id = windowIdOfSelectKey(tabName); return id ? views.find((view) => view.id === id) ?? null : null }, [tabName, views])
  // Les onglets de rangement : une par valeur des colonnes « Rangement en onglets ».
  const sortTabs = useMemo(() => {
    const found = new Map<string, SortTab>()
    for (const owner of tables) {
      for (const column of data?.columns[owner.tabName] ?? []) {
        if (column.spec.kind !== "tab-sort") continue
        const at = columnIndexOf(owner, column.header)
        if (at < 0) continue
        for (const row of owner.rows) {
          const value = (row.values[at] ?? "").replace(/<[^>]+>/g, "").trim()
          if (!value || foldName(value) === foldName(owner.tabName)) continue
          const entry = found.get(foldName(value)) ?? { value, columns: [], count: 0 }
          if (!entry.columns.some((header) => foldName(header) === foldName(column.header))) entry.columns.push(column.header)
          entry.count += 1
          found.set(foldName(value), entry)
        }
      }
    }
    // Un vrai onglet du même nom (rangement d'avant) : ses lignes comptent aussi.
    for (const entry of found.values()) entry.count += tables.find((candidate) => foldName(candidate.tabName) === foldName(entry.value))?.rows.length ?? 0
    return [...found.values()].sort((left, right) => left.value.localeCompare(right.value, "fr"))
  }, [data, tables])
  const activeSort = useMemo(() => activeView || !tabName.startsWith(SORT_PREFIX) ? null : sortTabs.find((entry) => foldName(entry.value) === foldName(tabName.slice(SORT_PREFIX.length))) ?? null, [activeView, sortTabs, tabName])
  const absorbed = useMemo(() => new Set(sortTabs.map((entry) => foldName(entry.value))), [sortTabs])
  const selectedTable = activeView || activeSort ? undefined : tables.find((candidate) => candidate.tabName === tabName)
  // « Tout » n'a de sens que si les onglets ont les mêmes colonnes : les lieux, pas les religions.
  // Un vrai onglet nommé comme une valeur de rangement se fond dans l'onglet de rangement : il ne compte pas ici.
  const visibleTables = useMemo(() => {
    const kept = tables.filter((candidate) => !absorbed.has(foldName(candidate.tabName)))
    return kept.length ? kept : tables
  }, [absorbed, tables])
  const signatureOf = useCallback((tab: string) => (data?.columns[tab] ?? []).map((column) => foldName(column.header)).sort().join("|"), [data])
  const canShowAll = useMemo(() => visibleTables.length > 1 && visibleTables.every((candidate) => signatureOf(candidate.tabName) === signatureOf(visibleTables[0].tabName)), [signatureOf, visibleTables])
  const allTables = useMemo(() => canShowAll ? tables.filter((candidate) => signatureOf(candidate.tabName) === signatureOf(visibleTables[0].tabName)) : [], [canShowAll, signatureOf, tables, visibleTables])
  const showAll = !activeView && !activeSort && canShowAll && tables.length > 1 && !selectedTable
  const viewTables = useMemo(() => {
    if (activeSort) {
      // Les onglets qui ont la colonne de rangement, et le vrai onglet du même nom s'il existe.
      const owners = tables.filter((candidate) => foldName(candidate.tabName) === foldName(activeSort.value) || activeSort.columns.some((header) => columnIndexOf(candidate, header) >= 0))
      return owners.length ? owners : tables.slice(0, 1)
    }
    if (activeView) {
      const source = activeView.source === ALL_SOURCES ? tables : tables.filter((candidate) => candidate.tabName === activeView.source)
      return source.length ? source : tables.slice(0, 1)
    }
    return showAll ? allTables : selectedTable ? [selectedTable] : visibleTables.slice(0, 1)
  }, [activeSort, activeView, allTables, selectedTable, showAll, tables, visibleTables])
  // Plusieurs onglets à la fois (« Tout » ou une fenêtre sur tout l'index) : la colonne Onglet dit d'où vient la ligne.
  const spanning = showAll || Boolean((activeView || activeSort) && viewTables.length > 1)
  // Le premier tableau affiché donne les colonnes : les onglets d'un même index ont les mêmes.
  const table: WorldIndexTable | null = viewTables[0] ?? null
  // La grille de ce qui est affiché (largeurs, filtres et tri de chacun, gardés sur ce poste) : sa
  // clé, et ses filtres, que « Enregistrer comme vue » reprend.
  const gridKey = `eraser:world-index:grid:${storeKey}:${activeView ? `fenetre:${activeView.id}` : activeSort ? `rangement:${foldName(activeSort.value)}` : showAll ? "tout" : table?.tabName ?? ""}`
  const [gridFilters] = usePersistentState<GridFilters>(`${gridKey}:filters`, {}, isGridFilters)
  const tabDefinition = useMemo(() => definition.tabs.find((tab) => tab.name === table?.tabName) ?? definition.tabs[0] ?? { name: "", itemLabel: "une ligne", headers: [], widths: [], idPrefix: "IDX" }, [definition, table])
  // Le type de chaque colonne, par onglet et en-tête : celui du schéma envoyé par le
  // serveur (colonnes renommées, types choisis dans « Modifier »), sinon le type par défaut.
  const specOf = useCallback((tab: string, header: string) => data?.columns[tab]?.find((column) => foldName(column.header) === foldName(header))?.spec ?? worldColumnSpec(indexKey, tab, header), [data, indexKey])
  const links = useMemo(() => data?.links ?? [], [data])
  const tableByName = useMemo(() => new Map(tables.map((candidate) => [candidate.tabName, candidate])), [tables])
  // Un index d'entités : le nom mène à la page de la ligne, « Ajouter » à sa page de création.
  const entity = definition.entity
  /**
   * La colonne du nom d'une ligne de cet index : celle que l'index d'entités désigne (« Rang »
   * des bonus de rang), sinon « Nom » ; dans un onglet sans Nom, celle réglée « Nomme la ligne ».
   */
  const ownNameColumn = useCallback((headers: string[], tabName?: string) => {
    const own = entity?.nameHeader ? headers.findIndex((header) => foldName(header) === foldName(entity.nameHeader)) : -1
    if (own >= 0) return own
    const name = nameColumnOf(headers)
    return name >= 0 || !tabName ? name : headers.findIndex((header) => specOf(tabName, header)?.rowLabel)
  }, [entity, specOf])

  const locate = useCallback((rowKey: string): { table: WorldIndexTable; row: WorldIndexRow } | null => {
    const { tabName: rowTab, rowNumber } = parseRowKey(rowKey)
    const owner = tableByName.get(rowTab)
    const row = owner?.rows.find((candidate) => candidate.rowNumber === rowNumber)
    return owner && row ? { table: owner, row } : null
  }, [tableByName])

  /**
   * Données fraîches du serveur. Remonter les cellules pendant la frappe renverrait le
   * curseur au début : si une cellule a le focus, on attend qu'elle le perde.
   */
  // Les réponses peuvent revenir dans le désordre : seule la plus récente s'affiche,
  // une réponse plus ancienne ramènerait l'état d'avant.
  const requestSeq = useRef(0)
  const appliedSeq = useRef(0)
  const applyData = useCallback((next: WorldIndexData, seq: number) => {
    if (seq < appliedSeq.current) return
    appliedSeq.current = seq
    const remount = () => {
      if (seq < appliedSeq.current) return
      // Une saisie encore en route, ou enregistrée après le départ de cette relecture, reste
      // affichée : la relecture plus ancienne la remettait à l'ancienne valeur, et la
      // modification suivante était refusée comme « changée entre-temps ».
      const kept: Record<string, string> = {}
      for (const [key, value] of Object.entries(localEdits.current)) {
        if ((editsInFlight.current[key] ?? 0) > 0 || (editsSettledAt.current[key] ?? -1) >= seq) kept[key] = value
        else delete editsSettledAt.current[key]
      }
      localEdits.current = kept
      setData(next)
      setVersion((current) => current + 1)
    }
    const active = document.activeElement
    if (active instanceof HTMLElement && active.isContentEditable) active.addEventListener("blur", () => window.setTimeout(remount, 0), { once: true })
    else remount()
  }, [])

  /** Le texte d'une case tel qu'il est dans Sheets (ou tel qu'il vient d'être tapé). */
  const rawOf = useCallback((rowKey: string, columnKey: string) => {
    const local = localEdits.current[`${rowKey}:${columnKey}`]
    if (local !== undefined) return local
    const found = locate(rowKey)
    if (!found) return ""
    if (columnKey === TAB_COLUMN) return found.table.tabName
    const index = columnIndexOf(found.table, columnKey)
    if (index < 0) return ""
    return isRichSpec(specOf(found.table.tabName, columnKey)) ? found.row.html[index] ?? "" : found.row.values[index] ?? ""
  }, [locate, specOf])

  const post = useCallback(async (body: Record<string, unknown> & { tabName: string }) => {
    const seq = ++requestSeq.current
    const response = await fetch("/api/resources/world-indexes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: indexKey, ...body }),
    }).catch(() => { throw new Error("Eraser n’a pas pu joindre son serveur local (il redémarre peut-être) : rien n’a été enregistré. Recommence dans un instant.") })
    const payload = (await response.json().catch(() => ({}))) as { data?: WorldIndexData; changed?: string[]; error?: string; warning?: string }
    if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
    // Les autres vues (onglet « États » ailleurs, listes liées, fiches) relisent aussitôt.
    announceWorldIndexChange([indexKey, ...(payload.changed ?? [])], origin)
    return { ...payload, seq }
  }, [indexKey, origin])


  /** La ligne telle que la page la voit, pour le serveur : il la retrouve par son identifiant (ou son nom). */
  const rowTargetOf = useCallback((rowKey: string): RowTarget | null => {
    const found = locate(rowKey)
    if (!found) return null
    const label = labelColumnIndex(found.table.headers)
    const idColumn = columnIndexOf(found.table, "ID")
    const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
    // Un identifiant que la page voit sur deux lignes (une ligne copiée dans Sheets) ne dit pas
    // laquelle : la ligne est alors reconnue par son nom à son numéro.
    const shared = Boolean(id) && idColumn >= 0 && found.table.rows.filter((row) => (row.values[idColumn] ?? "").trim() === id).length > 1
    return {
      tabName: found.table.tabName,
      rowNumber: found.row.rowNumber,
      id: shared ? "" : id,
      name: label >= 0 ? rawOf(rowKey, found.table.headers[label]) : "",
    }
  }, [locate, rawOf])

  const commitCell = useCallback(async (rowKey: string, columnKey: string, value: string, options: CommitOptions = {}) => {
    const found = locate(rowKey)
    const column = found ? columnIndexOf(found.table, columnKey) : -1
    const target = options.row ?? rowTargetOf(rowKey)
    if (!found || column < 0 || !target) {
      if (options.rethrow) throw new Error(`La colonne « ${columnKey} » n’existe pas dans cet onglet.`)
      return
    }
    // Ce que la page montrait dans la case : le serveur refuse d'écrire si elle a changé entre-temps.
    const previous = options.previous ?? rawOf(rowKey, columnKey)
    // Rangement en onglets : la valeur est écrite comme une autre ; la ligne reste dans son
    // onglet et apparaît aussi dans l'onglet de rangement qui porte cette valeur.
    const editKey = `${rowKey}:${columnKey}`
    localEdits.current[editKey] = value
    editsInFlight.current[editKey] = (editsInFlight.current[editKey] ?? 0) + 1
    engineRef.current?.invalidate()
    setSaving((current) => current + 1)
    let saved = false
    try {
      const payload = await post({ action: "update-cell", tabName: target.tabName, rowNumber: target.rowNumber, rowId: target.id, rowName: target.name, column, header: found.table.headers[column], html: value, previous })
      setError(payload.warning ?? "")
      saved = true
      editsInFlight.current[editKey] -= 1
      editsSettledAt.current[editKey] = requestSeq.current
      if (payload.data) applyData(payload.data, payload.seq)
      // Une valeur de rangement fait naître (ou disparaître) son onglet : l'index gardé ici
      // reçoit la valeur tout de suite, sans attendre une relecture.
      else if (specOf(found.table.tabName, columnKey).kind === "tab-sort") {
        const text = value.replace(/<[^>]+>/g, "").trim()
        setData((current) => current && {
          ...current,
          tables: current.tables.map((owner) => owner.tabName !== found.table.tabName ? owner : {
            ...owner,
            rows: owner.rows.map((row) => row.rowNumber !== found.row.rowNumber ? row : {
              ...row,
              // Une ligne de Sheets s'arrête à sa dernière case remplie : on l'allonge au besoin.
              values: Array.from({ length: Math.max(row.values.length, column + 1) }, (_, index) => index === column ? text : row.values[index] ?? ""),
              html: Array.from({ length: Math.max(row.html.length, column + 1) }, (_, index) => index === column ? value : row.html[index] ?? ""),
            }),
          }),
        })
      }
    } catch (reason) {
      if (!saved) {
        editsInFlight.current[editKey] -= 1
        // Refusée : la page ne la tient plus pour la valeur de Sheets. La suivante dira avoir vu
        // la vraie valeur, et ne sera pas refusée à son tour comme « changée entre-temps ».
        // (Le texte tapé reste dans la case, ou dans la fiche, pour être repris.)
        if (localEdits.current[editKey] === value) delete localEdits.current[editKey]
        engineRef.current?.invalidate()
      }
      // Un bouton (ou la fiche) s'arrête à la première écriture refusée et affiche lui-même pourquoi.
      if (options.rethrow) throw reason
      setError(reason instanceof Error ? reason.message : "Cette cellule n’a pas pu être enregistrée.")
    } finally {
      setSaving((current) => current - 1)
    }
  }, [applyData, locate, post, rawOf, rowTargetOf, specOf])

  /**
   * Une action sur des lignes, onglet par onglet : la vue « Tout » peut en mêler plusieurs.
   * Chaque ligne est désignée par son identifiant (et son nom), pas seulement par son numéro.
   * `rethrow` : un bouton s'arrête à la première étape refusée et affiche lui-même l'erreur.
   */
  async function mutateRows(action: string, targets: RowTarget[], label: string, extra: Record<string, unknown> = {}, options: { rethrow?: boolean } = {}) {
    setPending(label); setError("")
    try {
      const byTab = new Map<string, RowTarget[]>()
      for (const target of targets) byTab.set(target.tabName, [...byTab.get(target.tabName) ?? [], target])
      for (const [rowTab, rows] of byTab) {
        const payload = await post({ action, tabName: rowTab, rowNumbers: rows.map((row) => row.rowNumber), rows: rows.map(({ rowNumber, id, name }) => ({ rowNumber, id, name })), ...extra })
        if (payload.data) applyData(payload.data, payload.seq)
      }
    } catch (reason) {
      if (options.rethrow) throw reason
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.")
    } finally {
      setPending("")
    }
  }

  function mutate(action: string, rowKeys: string[], label: string, extra: Record<string, unknown> = {}) {
    return mutateRows(action, rowKeys.flatMap((key) => { const target = rowTargetOf(key); return target ? [target] : [] }), label, extra)
  }

  /** Ajoute une ligne ; `rethrow` : l'erreur est aussi renvoyée (la ligne fantôme garde alors le nom tapé). */
  async function addRow(targetTab: string, values: string[], headers: string[], rethrow = false) {
    setPending("add"); setError("")
    try {
      // Les colonnes que suivent les valeurs : le serveur les range par nom.
      const payload = await post({ action: "add", tabName: targetTab, values: withAddDefaults(headers, values), headers })
      if (payload.data) applyData(payload.data, payload.seq)
      setCreating(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.")
      if (rethrow) throw reason
    } finally {
      setPending("")
    }
  }

  async function refresh() {
    setPending("refresh"); setError("")
    const seq = ++requestSeq.current
    // Le serveur local injoignable (il redémarre) : le tableau ne reste pas bloqué sur « Actualiser ».
    const response = await fetch(`/api/resources/world-indexes?key=${indexKey}&refresh=1`, { cache: "no-store" }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { data?: WorldIndexData; error?: string }
    setPending("")
    if (!response?.ok || !payload.data) return setError(payload.error || "Actualisation impossible : Eraser n’a pas pu relire Google Sheets. Réessaie dans un instant.")
    // Les formules au hasard (ALEA, DES…) sont retirées à chaque actualisation.
    setSeed(`${indexKey}:${Date.now()}`)
    applyData(payload.data, seq)
    announceWorldIndexChange([indexKey], origin)
  }

  // Le sélecteur de propriétaire relit le tableau une fois l'attribution enregistrée.
  const refreshRef = useRef<() => Promise<void>>(async () => undefined)
  useLayoutEffect(() => { refreshRef.current = refresh })

  // Déplacer une ligne n'a de sens qu'entre onglets aux mêmes colonnes (les lieux).
  const moveTargetsOf = useCallback((fromTab: string) => {
    const signature = (headers: string[]) => [...headers].map(foldName).sort().join("|")
    const from = definition.tabs.find((tab) => tab.name === fromTab)
    if (!from) return []
    return definition.tabs.filter((tab) => tab.name !== fromTab && signature(tab.headers) === signature(from.headers)).map((tab) => tab.name)
  }, [definition])

  const busy = Boolean(pending)
  const fullscreen = useFullscreenPanel()

  /** Le nom d'une ligne, quelle que soit sa colonne (« Nom », « Nom du PNJ »…). */
  const nameOf = useCallback((rowKey: string) => {
    const found = locate(rowKey)
    const column = found ? ownNameColumn(found.table.headers, found.table.tabName) : -1
    return found && column >= 0 ? rawOf(rowKey, found.table.headers[column]).replace(/<[^>]+>/g, "") : ""
  }, [locate, ownNameColumn, rawOf])

  /** Une ligne telle que la page qui accueille la vue intégrée la voit. */
  const embedRow = useCallback((rowKey: string): IndexEmbedRow => ({
    rowKey,
    id: rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim(),
    name: nameOf(rowKey),
    cell: (header) => rawOf(rowKey, header),
  }), [nameOf, rawOf])

  /**
   * Sorts des classes : « Classes et rangs », une pastille par classe avec son rang. Chaque
   * changement part seul (`set-class-rank`), vérifié par le serveur : trois sorts par rang au
   * plus, et le rang que la page voyait doit être encore celui de la feuille. La pastille
   * change tout de suite ; un refus la remet comme avant.
   */
  const classRanks = data?.classRanks
  const [rankDrafts, setRankDrafts] = useState<Record<string, Record<string, number | null>>>({})
  const rankHeaders = useMemo(() => new Set(Object.values(classRanks?.headers ?? {}).flat().map(foldName)), [classRanks])
  const classRankColumn = useMemo((): NonNullable<IndexEmbed["extraColumns"]>[number] | null => {
    if (!classRanks) return null
    const linksOf = (id: string): Record<string, number | null> => ({ ...classRanks.rows[id], ...rankDrafts[id] })
    const countAt = (classId: string, rank: number, exceptId: string) => Object.keys({ ...classRanks.rows, ...rankDrafts }).filter((id) => id !== exceptId && linksOf(id)[classId] === rank).length
    const save = async (row: IndexEmbedRow, next: Record<string, number | null>) => {
      const before = linksOf(row.id)
      const changes = [...new Set([...Object.keys(before), ...Object.keys(next)])].filter((classId) => (before[classId] ?? null) !== (next[classId] ?? null))
      if (!changes.length) return
      const tabName = parseRowKey(row.rowKey).tabName
      setRankDrafts((current) => ({ ...current, [row.id]: { ...current[row.id], ...Object.fromEntries(changes.map((classId) => [classId, next[classId] ?? null])) } }))
      setSaving((count) => count + 1); setError("")
      try {
        for (const classId of changes) {
          // Le rang que la pastille montrait : deux changements rapides partent dans l'ordre, chacun sur le précédent.
          const payload = await post({ action: "set-class-rank", tabName, rowId: row.id, classId, rank: next[classId] ?? null, originalRank: before[classId] ?? null })
          if (payload.data) applyData(payload.data, payload.seq)
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Ce rang n’a pas pu être enregistré.")
      } finally {
        // La feuille relue fait foi : ce qui a été enregistré y est, un refus y est absent. Seuls
        // les changements de cet appel sont oubliés, s'ils n'ont pas été remplacés entre-temps.
        setRankDrafts((current) => {
          const own = { ...current[row.id] }
          for (const classId of changes) if (own[classId] === (next[classId] ?? null)) delete own[classId]
          const copy = { ...current }
          if (Object.keys(own).length) copy[row.id] = own; else delete copy[row.id]
          return copy
        })
        setSaving((count) => Math.max(0, count - 1))
      }
    }
    return {
      key: "__class-ranks",
      label: "Classes et rangs",
      width: 280,
      after: "Compétences",
      render: (row, compact) => classRanks.error
        ? <span className="px-2 text-xs text-muted-foreground" title={classRanks.error}>Classes illisibles</span>
        : row.id
        ? <RankedLinksCell
          links={linksOf(row.id)}
          options={classRanks.options}
          ranks={CLASS_RANKS}
          rankLabel={(rank) => rank === 0 ? "Commun" : `Rang ${rank}`}
          rankShort={(rank) => rank === 0 ? "C" : `R${rank}`}
          isFull={(classId, rank) => countAt(classId, rank, row.id) >= classRanks.perRankLimit}
          addLabel="Classe"
          fullLabel={`rang plein (${classRanks.perRankLimit} sorts)`}
          compact={compact}
          onChange={(next) => void save(row, next)}
        />
        : <span className="px-2 text-xs text-muted-foreground" title="Le sort reçoit son identifiant à son premier enregistrement.">—</span>,
    }
  }, [applyData, classRanks, post, rankDrafts])
  // Les colonnes ajoutées au tableau et à la fiche : « Classes et rangs », puis celles de la page qui accueille la vue.
  const pageColumns = useMemo(() => [...(classRankColumn ? [classRankColumn] : []), ...(embed?.extraColumns ?? [])], [classRankColumn, embed])

  /** La ligne citable d'un élément de vue : son survol au passage de la souris. */
  const rowRefOf = useCallback((rowKey: string) => {
    const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
    return id ? { index: indexKey, id } : null
  }, [indexKey, rawOf])
  /** Ouvre une ligne : sa page (personnage, campagne, classe) ou sa fiche. */
  const openRow = useCallback((rowKey: string) => {
    const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
    if (entity?.nameHref && id) router.push(entity.nameHref.replace("{id}", encodeURIComponent(id)))
    else setDetails(rowKey)
  }, [entity, rawOf, router])
  /**
   * Le portrait d'un personnage ou d'un PNJ, la bannière d'une campagne : importés comme
   * depuis la fiche, la page du PNJ ou le tableau de bord (même adresse, même stockage),
   * pas comme une image d'index.
   */
  const entityImage = useMemo(() => {
    if (indexKey === "npcs") return {
      header: "portrait",
      upload: async (file: File, rowKey: string, columnKey: string) => {
        const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
        if (!id) throw new Error("Cette ligne n’a pas encore d’identifiant.")
        const form = new FormData()
        form.append("portrait", file)
        const response = await fetch(`/api/npcs/${encodeURIComponent(id)}`, { method: "PATCH", body: form })
        const payload = await response.json().catch(() => ({})) as { npc?: { portrait?: string }; error?: string }
        if (!response.ok || !payload.npc?.portrait) throw new Error(payload.error || "Le portrait n’a pas pu être importé.")
        // La page du PNJ vient d'écrire cette adresse dans la case : la page la tient pour vue.
        const written = payload.npc.portrait
        localEdits.current[`${rowKey}:${columnKey}`] = written
        editsSettledAt.current[`${rowKey}:${columnKey}`] = requestSeq.current
        // La même adresse qu'avant : `?v=` fait voir la nouvelle image tout de suite.
        return `${written}${written.includes("?") ? "&" : "?"}v=${Date.now()}`
      },
    }
    if (indexKey !== "characters" && indexKey !== "campaigns") return null
    const characters = indexKey === "characters"
    return {
      header: characters ? "portrait" : "banniere",
      upload: async (file: File, rowKey: string, columnKey: string) => {
        const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
        if (!id) throw new Error("Cette ligne n’a pas encore d’identifiant.")
        const form = new FormData()
        if (characters) { form.append("portrait", file); form.append("changes", "[]") } else form.append("banner", file)
        const response = await fetch(`/api/${characters ? "characters" : "campaigns"}/${encodeURIComponent(id)}`, { method: "PATCH", body: form })
        const payload = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(payload.error || "L’image n’a pas pu être importée.")
        // La fiche (ou la campagne) vient d'écrire cette adresse dans la case : la page la tient
        // pour la valeur vue, sinon l'écriture suivante de la case serait refusée (« modifiée
        // entre-temps »).
        const written = `/api/${characters ? "characters/portrait" : "campaigns/banner"}/${encodeURIComponent(id)}`
        localEdits.current[`${rowKey}:${columnKey}`] = written
        editsSettledAt.current[`${rowKey}:${columnKey}`] = requestSeq.current
        // La même adresse qu'avant : `?v=` fait voir la nouvelle image tout de suite.
        return `${written}?v=${Date.now()}`
      },
    }
  }, [indexKey, rawOf])

  /** L'adresse d'une ligne : sa page, ou l'index ouvert sur sa fiche (`?ligne=ID`). */
  const rowHref = useCallback((rowKey: string) => {
    const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
    if (!id) return undefined
    if (entity?.nameHref) return entity.nameHref.replace("{id}", encodeURIComponent(id))
    // Intégré dans une autre page (Création de classe) : la ligne s'ouvre dans sa fiche, ici.
    if (embed) return undefined
    return `${pathname}?ligne=${encodeURIComponent(id)}`
  }, [embed, entity, pathname, rawOf])
  // « ?ligne=ID » (clic droit sur un nom › nouvel onglet, fenêtre ou ici) ouvre la fiche de la ligne ;
  // « ?fiche=Nom » aussi, par son nom (le bouton « Ouvrir une ligne d'un autre index » d'une carte),
  // avec « &formulaire=… » pour l'ouvrir dans un autre formulaire de son onglet.
  const [wantedRow, setWantedRow] = useState<string | null>(null)
  useEffect(() => {
    if (embed) return
    const read = () => { const params = new URLSearchParams(window.location.search); setWantedRow(params.get("ligne") ?? (params.get("fiche") ? `nom:${params.get("fiche")}` : null)) }
    const timer = window.setTimeout(read, 0)
    window.addEventListener(URL_CHANGE_EVENT, read)
    window.addEventListener("popstate", read)
    return () => { window.clearTimeout(timer); window.removeEventListener(URL_CHANGE_EVENT, read); window.removeEventListener("popstate", read) }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- une vue intégrée le reste pour toute sa vie
  }, [])
  useEffect(() => {
    if (!wantedRow || !tables.length) return
    const byName = wantedRow.startsWith("nom:") ? foldName(wantedRow.slice(4)) : ""
    const found = tables.flatMap((candidate) => {
      const column = byName ? labelColumnIndex(candidate.headers) : candidate.headers.findIndex((header) => foldName(header) === "id")
      const row = column < 0 ? undefined : candidate.rows.find((item) => byName ? foldName((item.values[column] ?? "").replace(/<[^>]+>/g, "")) === byName : (item.values[column] ?? "").replace(/<[^>]+>/g, "").trim() === wantedRow)
      return row ? [rowKeyOf(candidate.tabName, row.rowNumber)] : []
    })[0]
    if (!found) return
    // Lue une fois : fermer la fiche ne la rouvre pas, l'adresse redevient celle de l'index.
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href)
      const form = url.searchParams.get("formulaire")
      for (const key of ["ligne", "fiche", "formulaire"]) url.searchParams.delete(key)
      replaceAppUrl(url.pathname + url.search, { record: false })
      setWantedRow(null)
      setSheetForm(form && form !== DEFAULT_FORM_ID ? { row: found, form } : null)
      setDetails(found)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [tables, wantedRow])
  const embedAdd = embed?.onAdd
  const startAdding = useCallback(() => {
    if (embedAdd) embedAdd()
    else if (entity?.addHref) router.push(entity.addHref)
    // Les bonus de rang : le rang suivant s'ajoute tout seul, sans formulaire.
    else if (entity?.nextRow && table) void (async () => {
      setPending("add"); setError("")
      try {
        const payload = await post({ action: "add-next", tabName: table.tabName })
        if (payload.data) applyData(payload.data, payload.seq)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "La ligne suivante n’a pas pu être ajoutée.")
      } finally {
        setPending("")
      }
    })()
    else setCreating(true)
  }, [applyData, embedAdd, entity, post, router, table])
  /** Une ligne ajoutée depuis la vue intégrée reçoit ce que la page impose (le Type des passifs). */
  // Depuis un onglet-fenêtre prévu par Eraser (Passifs, Bonus), la ligne reçoit son Type : elle y reste.
  const withAddDefaults = useCallback((headers: string[], values: string[]) => headers.map((header, index) => values[index] || (Object.entries(embed?.addDefaults ?? windowAddDefaults(activeView ? windowFromSavedView(activeView) : null)).find(([key]) => foldName(key) === foldName(header))?.[1] ?? "")), [activeView, embed])

  // Toutes les colonnes sont dans la liste : la grille cache les masquées (et les
  // « Formulaire seulement », comme celles de la fiche des créatures) et les montre d'un clic.
  const hiddenInEmbed = useMemo(() => new Set((embed?.hiddenColumns ?? []).map(foldName)), [embed])
  const visible = useMemo(() => table ? (data?.columns[table.tabName] ?? []).filter((column) => column.spec.kind !== "archived" && !hiddenInEmbed.has(foldName(column.header))).map((column) => column.header) : [], [data, hiddenInEmbed, table])

  // Recherche, Agrégat, formules et tirages lisent d'autres index : chargés une fois pour la page.
  const [related, setRelated] = useState<Record<string, LoadedWorldIndex | null>>({})
  useEffect(() => { relatedRef.current = related }, [related])
  /**
   * Un autre onglet ou une autre fenêtre a modifié cet index (ou un index qu'il lit) : on
   * relit la copie du serveur, déjà à jour, sans attendre « Actualiser ». Pendant un
   * enregistrement d'ici, on attend qu'il soit fini pour ne pas effacer la saisie.
   */
  const savingRef = useRef(0)
  useEffect(() => { savingRef.current = saving }, [saving])
  // Une fiche ouverte vise sa ligne par sa place : relire pendant ce temps (une ligne supprimée
  // au-dessus, ailleurs) lui ferait montrer, puis viser, la ligne voisine. On relit à sa fermeture.
  const detailsRef = useRef<string | null>(null)
  useEffect(() => { detailsRef.current = details }, [details])
  useEffect(() => {
    let timer = 0
    let alive = true
    const reload = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(async () => {
        if (savingRef.current > 0 || detailsRef.current !== null) return reload()
        const seq = ++requestSeq.current
        const response = await fetch(`/api/resources/world-indexes?key=${indexKey}`, { cache: "no-store" }).catch(() => null)
        const payload = (await response?.json().catch(() => ({})) ?? {}) as { data?: WorldIndexData }
        if (alive && response?.ok && payload.data) applyData(payload.data, seq)
      }, 250)
    }
    const stop = onWorldIndexChange((keys, from) => {
      if (from !== origin && keys.includes(indexKey)) reload()
      for (const key of keys) if (key !== indexKey && key in relatedRef.current) void loadWorldIndexData(key as WorldIndexKey).then((loaded) => { if (alive) setRelated((current) => ({ ...current, [key]: loaded })) })
    })
    return () => { alive = false; window.clearTimeout(timer); stop() }
  }, [applyData, indexKey, origin])
  const relationOf = useCallback((tab: string, via: string): { index: WorldIndexKey; tabs: string[] | null } | null => {
    const spec = specOf(tab, via)
    if (spec.kind === "linked-choice" && spec.source) return { index: spec.source.index, tabs: null }
    if (spec.kind !== "linked") return null
    const pair = links.find(([left, right]) => [left, right].some((end) => linkEndCovers(end, indexKey, tab) && foldName(end.column) === foldName(via)))
    if (!pair) return null
    const other = linkEndCovers(pair[0], indexKey, tab) && foldName(pair[0].column) === foldName(via) ? pair[1] : pair[0]
    return { index: other.index, tabs: other.tab === "*" ? null : [other.tab] }
  }, [indexKey, links, specOf])
  const relatedKeys = useMemo(() => {
    const keys = new Set<WorldIndexKey>()
    for (const [tab, list] of Object.entries(data?.columns ?? {})) for (const column of list) {
      const spec = normalizeSpec(column.spec)
      const vias = [spec.lookup?.via, spec.rollup?.via]
      // Une formule peut suivre n'importe quelle relation (RECHERCHE, NB.RELIES).
      if (spec.kind === "formula") vias.push(...(data?.columns[tab] ?? []).filter((other) => other.spec.kind === "linked" || other.spec.kind === "linked-choice").map((other) => other.header))
      for (const via of vias) {
        if (!via) continue
        const relation = relationOf(tab, via)
        if (relation && relation.index !== indexKey) keys.add(relation.index)
      }
      if (spec.kind === "random" && spec.random?.source === "index" && spec.random.index && spec.random.index.index !== "self" && spec.random.index.index !== indexKey) keys.add(spec.random.index.index)
    }
    return [...keys].sort()
  }, [data, indexKey, relationOf])
  useEffect(() => {
    let cancelled = false
    for (const key of relatedKeys) void loadWorldIndexData(key).then((loaded) => { if (!cancelled) setRelated((current) => ({ ...current, [key]: loaded })) })
    return () => { cancelled = true }
  }, [relatedKeys])

  /** Les lignes reliées à une ligne par une relation (colonne liée ↔ ou liste liée). */
  const relatedRows = useCallback((rowKey: string, via: string) => {
    const found = locate(rowKey)
    if (!found) return undefined
    const relation = relationOf(found.table.tabName, via)
    const viaColumn = columnIndexOf(found.table, via)
    if (!relation || viaColumn < 0) return undefined
    const names = new Set(splitNames(rawOf(rowKey, via).replace(/<[^>]+>/g, " ")).map(foldName))
    const source = relation.index === indexKey ? { tables: tables as LoadedWorldIndex["tables"], columns: data?.columns } : related[relation.index]
    if (!source) return { rows: [] as Array<{ tabName: string; headers: string[]; values: string[] }>, columns: undefined }
    const rows: Array<{ tabName: string; headers: string[]; values: string[] }> = []
    for (const target of source.tables) {
      if (relation.tabs && !relation.tabs.includes(target.tabName)) continue
      const nameColumn = nameColumnOf(target.headers)
      if (nameColumn < 0) continue
      for (const row of target.rows) if (names.has(foldName(row.values[nameColumn] ?? ""))) rows.push({ tabName: target.tabName, headers: target.headers, values: row.values })
    }
    return { rows, columns: source.columns }
  }, [data, indexKey, locate, rawOf, related, relationOf, tables])

  const computed = useCallback((rowKey: string, _columnKey: string, spec: IndexColumnSpec): string[] => {
    const via = spec.lookup?.via ?? spec.rollup?.via
    if (!via) return []
    const found = relatedRows(rowKey, via)
    if (!found) return []
    const field = spec.kind === "lookup" ? spec.lookup?.field : spec.rollup?.field
    const values: string[] = []
    let fieldSpec: IndexColumnSpec | undefined
    for (const row of found.rows) {
      const fieldColumn = field ? row.headers.findIndex((header) => foldName(header) === foldName(field)) : -1
      fieldSpec ??= field ? found.columns?.[row.tabName]?.find((column) => foldName(column.header) === foldName(field))?.spec : undefined
      if (fieldColumn >= 0) values.push(row.values[fieldColumn] ?? "")
    }
    if (spec.kind === "lookup") return values.flatMap((value) => splitNames(value)).filter(Boolean)
    const result = computeRollup(spec.rollup?.fn ?? "count", found.rows.length, values, spec.number ?? fieldSpec?.number ?? {})
    return result ? [result] : []
  }, [relatedRows])

  // Le moteur de la ligne : ce que voit une formule, les jauges, les conditions des boutons.
  // Comme les cellules, il ne lit les modifications en cours (une référence) qu'une fois appelé.
  /* eslint-disable react-hooks/refs -- les fonctions du moteur ne lisent la référence qu'à l'appel, jamais pendant sa création */
  const engine = useMemo(() => createRowEngine({
    specOf: (rowKey, header) => {
      const found = locate(rowKey)
      if (!found || !(data?.columns[found.table.tabName] ?? []).some((column) => foldName(column.header) === foldName(header))) return undefined
      return specOf(found.table.tabName, header)
    },
    raw: rawOf,
    rowInfo: (rowKey) => { const found = locate(rowKey); return found ? { tabName: found.table.tabName, rowNumber: found.row.rowNumber } : null },
    related: (rowKey, via, field) => {
      const found = relatedRows(rowKey, via)
      if (!found) return undefined
      return found.rows.map((row) => { const column = row.headers.findIndex((header) => foldName(header) === foldName(field)); return column >= 0 ? row.values[column] ?? "" : "" })
    },
    relatedCount: (rowKey, via) => relatedRows(rowKey, via)?.rows.length,
    computed: (rowKey, spec) => computed(rowKey, "", spec),
    seed,
  }), [computed, data, locate, rawOf, relatedRows, seed, specOf])
  /* eslint-enable react-hooks/refs */
  useLayoutEffect(() => { engineRef.current = engine })

  /** Propriétaire et liens d'une ligne de personnage ou de campagne (par son identifiant). */
  const extras = data?.extras
  const extrasOf = useCallback((rowKey: string) => {
    const found = locate(rowKey)
    const column = found ? columnIndexOf(found.table, "ID") : -1
    return found && column >= 0 ? extras?.rows[(found.row.values[column] ?? "").trim()] : undefined
  }, [extras, locate])
  const extraText = useCallback((rowKey: string, columnKey: string) => {
    const row = extrasOf(rowKey)
    if (columnKey === OWNER_COLUMN) return row ? (extras?.canAssign && row.ownerDetail ? `${row.ownerName} · ${row.ownerDetail}` : row.ownerName) : ""
    return row?.links.map((link) => link.label).join(", ") ?? ""
  }, [extras, extrasOf])

  /** Ce qu'affiche une case : la valeur de Sheets, ou le résultat d'une colonne calculée (tri, recherche, copie). */
  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    if (columnKey === OWNER_COLUMN || columnKey === LINKS_COLUMN) return extraText(rowKey, columnKey)
    const found = locate(rowKey)
    if (found && columnKey !== TAB_COLUMN) {
      const spec = specOf(found.table.tabName, columnKey)
      if (isComputedSpec(spec) && spec.kind !== "auto-links" && spec.kind !== "actions") return engine.computedText(rowKey, columnKey, spec) ?? ""
    }
    return rawOf(rowKey, columnKey)
  }, [engine, extraText, locate, rawOf, specOf])

  /** Les lignes d'un index, pour un tirage « ligne d'un index ». */
  const rowsOf = useCallback((index: string, tab: string): RandomCandidateRow[] | undefined => {
    const self = index === "self" || index === indexKey
    const source = self ? { tables: tables as LoadedWorldIndex["tables"], columns: data?.columns } : related[index]
    if (!source) {
      if (!self) void loadWorldIndexData(index as WorldIndexKey).then((loaded) => setRelated((current) => ({ ...current, [index]: loaded })))
      return undefined
    }
    return source.tables.filter((target) => tab === "*" || !tab || target.tabName === tab).flatMap((target) => {
      const nameColumn = nameColumnOf(target.headers)
      const columnOf = (header: string) => target.headers.findIndex((candidate) => foldName(candidate) === foldName(header))
      const specFor = (header: string) => source.columns?.[target.tabName]?.find((column) => foldName(column.header) === foldName(header))?.spec
      return target.rows.map((row): RandomCandidateRow => ({
        name: nameColumn >= 0 ? row.values[nameColumn] ?? "" : "",
        cell: (header) => { const column = columnOf(header); return column >= 0 ? row.values[column] ?? "" : "" },
        formula: { column: (name) => { const column = columnOf(name); return column < 0 ? undefined : columnFormulaValue(row.values[column] ?? "", specFor(name)) } },
      }))
    })
  }, [data, indexKey, related, tables])

  /** Un tirage d'une colonne Aléatoire, écrit dans la case. `force` : même si elle est figée. */
  const drawCell = useCallback(async (rowKey: string, header: string, spec: IndexColumnSpec, force = false, commit: CommitOptions = {}) => {
    const settings = normalizeSpec(spec).random
    if (!settings) return null
    if (!force && settings.mode === "fixed" && rawOf(rowKey, header).trim()) return null
    const draw = drawRandom(settings, { random: cryptoRandom, row: engine.context(rowKey), rowsOf })
    if (draw.error) { notify(`${header} : ${draw.error}`, "error"); return null }
    const text = drawText(draw)
    await commitCell(rowKey, header, text, commit)
    if (draw.detail) notify(`${header} : ${text} (${draw.detail})`)
    return text
  }, [commitCell, engine, notify, rawOf, rowsOf])

  /**
   * « Ouvrir la page » d'une ligne : la page d'un personnage ou d'une campagne, sinon celle d'un
   * modèle de page de ligne (Créateur de pages), sinon sa fiche, ici.
   */
  const openRowPage = useCallback((rowKey: string) => {
    const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
    if (entity?.nameHref && id) { if (!embed) router.push(entity.nameHref.replace("{id}", encodeURIComponent(id))); else openRow(rowKey); return }
    const tab = parseRowKey(rowKey).tabName
    void rowPageFor(indexKey, tab, id).then((href) => { if (href) router.push(href); else setDetails(rowKey) })
  }, [embed, entity, indexKey, openRow, rawOf, router])
  /** Un formulaire de l'onglet ouvert ici sur la ligne, dans la fiche (« principal » : l'étoilé). */
  const openRowForm = useCallback((rowKey: string, form: string) => {
    setSheetForm(form && form !== DEFAULT_FORM_ID ? { row: rowKey, form } : null)
    setDetails(rowKey)
  }, [])

  // Les boutons d'une ligne : ce qu'ils peuvent toucher dans un index du monde.
  const mutateRef = useRef<(action: string, rowKeys: string[], label: string, extra?: Record<string, unknown>) => Promise<void>>(async () => undefined)
  const mutateRowsRef = useRef<(action: string, targets: RowTarget[], label: string, extra?: Record<string, unknown>, options?: { rethrow?: boolean }) => Promise<void>>(async () => undefined)
  const pathOf = useCallback((index: string) => isBuiltinWorldIndexKey(index) ? worldIndexDefinitions[index].path : `/ressources/index/${index}`, [])
  const runtimeFor = useCallback((rowKey: string): ActionRuntime => {
    const found = locate(rowKey)
    const tab = found?.table.tabName ?? ""
    const sheetFields = (data?.columns[tab] ?? []).filter((column) => isSheetSpec(column.spec) && !["id", "actions"].includes(column.spec.kind))
    // La ligne du clic, désignée à chaque étape par son identifiant : une étape (copie, lien,
    // relecture) peut changer les numéros de ligne, le serveur la retrouve par lui.
    const target = rowTargetOf(rowKey)
    const targets = target ? [target] : []
    // Ce que les étapes précédentes ont écrit : la suivante part de là, même si la page n'a pas encore relu.
    const written = new Map<string, string>()
    const cell = (header: string) => written.get(foldName(header)) ?? rawOf(rowKey, header)
    const wrote = (header: string, value: string) => {
      written.set(foldName(header), value)
      // Une ligne sans identifiant est reconnue par son nom : le nouveau, s'il vient d'être écrit.
      if (target && found && foldName(found.table.headers[labelColumnIndex(found.table.headers)] ?? "") === foldName(header)) target.name = value
    }
    return {
      row: () => engine.context(rowKey),
      cell,
      specOf: (header) => (data?.columns[tab] ?? []).some((column) => foldName(column.header) === foldName(header)) ? specOf(tab, header) : undefined,
      setCell: async (header, value) => {
        if (!found || !target || columnIndexOf(found.table, header) < 0) throw new Error(`La colonne « ${header} » n’existe pas dans cet onglet.`)
        await commitCell(rowKey, header, value, { row: target, previous: cell(header), rethrow: true })
        wrote(header, value)
      },
      confirm: async (message) => window.confirm(message),
      notify,
      openUrl: (url) => { window.open(url, "_blank", "noopener,noreferrer") },
      navigate: (href) => router.push(href),
      openSheet: () => setDetails(rowKey),
      linkedHref: (header) => {
        const relation = found ? relationOf(tab, header) : null
        const [first] = splitNames(rawOf(rowKey, header).replace(/<[^>]+>/g, " "))
        return relation && first ? `${pathOf(relation.index)}?q=${encodeURIComponent(first)}` : undefined
      },
      indexHref: (index) => index ? pathOf(index) : undefined,
      roll: async (header) => {
        if (!target) throw new Error("Cette ligne n’existe plus : actualise le tableau.")
        const text = await drawCell(rowKey, header, specOf(tab, header), true, { row: target, previous: cell(header), rethrow: true })
        if (text !== null) wrote(header, text)
        return text
      },
      duplicate: () => mutateRowsRef.current("duplicate", targets, "duplicate", {}, { rethrow: true }),
      remove: () => mutateRowsRef.current("delete", targets, "delete", {}, { rethrow: true }),
      move: (toTab) => mutateRowsRef.current("move", targets, "move", { toTab }, { rethrow: true }),
      // « Envoyer dans un autre onglet » : les onglets aux mêmes colonnes, choisis au clic.
      moveAsk: async () => {
        const choices = moveTargetsOf(tab)
        if (!choices.length) throw new Error("Aucun autre onglet n’a les mêmes colonnes : la ligne ne peut aller nulle part.")
        const toTab = await ask(`Envoyer « ${nameOf(rowKey)} » dans…`, choices.map((name) => ({ value: name, label: name })))
        if (toTab) await mutateRowsRef.current("move", targets, "move", { toTab }, { rethrow: true })
      },
      create: async (index, targetTab, values) => {
        const source = index === indexKey ? { tables: tables as LoadedWorldIndex["tables"] } : await loadWorldIndexData(index as WorldIndexKey)
        const table = source?.tables.find((candidate) => !targetTab || candidate.tabName === targetTab) ?? source?.tables[0]
        if (!table) throw new Error("Cet index ou cet onglet est introuvable.")
        const row = table.headers.map((header) => Object.entries(values).find(([key]) => foldName(key) === foldName(header))?.[1] ?? "")
        const response = await fetch("/api/resources/world-indexes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: index, action: "add", tabName: table.tabName, values: row, headers: table.headers }) })
        const payload = (await response.json().catch(() => ({}))) as { data?: WorldIndexData; error?: string }
        if (!response.ok) throw new Error(payload.error || "La ligne n’a pas pu être créée.")
        forgetWorldIndexData(index as WorldIndexKey)
        if (index === indexKey && payload.data) applyData(payload.data, ++requestSeq.current)
        announceWorldIndexChange([index], index === indexKey ? origin : "")
        const name = row[nameColumnOf(table.headers)] ?? ""
        return { href: `${pathOf(index)}${name ? `?q=${encodeURIComponent(name)}` : ""}` }
      },
      copy: copyToClipboard,
      card: () => rowCard(nameOf(rowKey) || "Sans nom", sheetFields.filter((column) => !isComputedSpec(column.spec) || column.spec.kind === "formula").map((column) => {
        const text = valueOf(rowKey, column.header).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        return { label: column.header, text }
      }).filter((field) => { const found = locate(rowKey); return found ? foldName(field.label) !== foldName(found.table.headers[ownNameColumn(found.table.headers)] ?? "") : !isNameColumn(field.label) })),
      chat: async (message, audience) => {
        const campaign = await chooseCampaign(ask, "chat")
        if (!campaign) throw new Error("Aucune campagne choisie : le message n’est pas parti.")
        await sendToCampaignChat(campaign, message, audience)
      },
      openForm: (form) => openRowForm(rowKey, form),
      openPage: () => openRowPage(rowKey),
      // Une ligne d'un autre index, par son nom : sa fiche s'ouvre dans son index (« ?fiche= ») ; dans celui-ci, ici.
      openRow: async (index, name, form) => {
        if (index === indexKey) {
          const wanted = foldName(name)
          const match = tables.flatMap((owner) => owner.rows.filter((row) => foldName((row.values[labelColumnIndex(owner.headers)] ?? "").replace(/<[^>]+>/g, "")) === wanted).map((row) => rowKeyOf(owner.tabName, row.rowNumber)))[0]
          if (!match) throw new Error(`« ${name} » n’est pas dans cet index.`)
          openRowForm(match, form ?? DEFAULT_FORM_ID)
          return
        }
        router.push(`${pathOf(index)}?fiche=${encodeURIComponent(name)}${form ? `&formulaire=${encodeURIComponent(form)}` : ""}`)
      },
      showCard: (card) => setCardPeek({ row: rowKey, card }),
      // Une ligne au hasard : dans cet index (l'onglet choisi, sinon celui de la ligne), sinon dans un autre, ouverte dans sa fiche.
      randomRow: async (index, wantedTab, form) => {
        const pick = <T,>(list: T[]) => list[Math.floor(cryptoRandom() * list.length)]
        if (!index || index === indexKey) {
          const owner = tables.find((candidate) => candidate.tabName === (wantedTab || tab)) ?? tables[0]
          const rows = (owner?.rows ?? []).filter((row) => (row.values[labelColumnIndex(owner!.headers)] ?? "").trim())
          if (!owner || !rows.length) throw new Error("Aucune ligne à tirer dans cet onglet.")
          openRowForm(rowKeyOf(owner.tabName, pick(rows).rowNumber), form ?? DEFAULT_FORM_ID)
          return
        }
        const source = await loadWorldIndexData(index as WorldIndexKey)
        const owner = source?.tables.find((candidate) => !wantedTab || candidate.tabName === wantedTab) ?? source?.tables[0]
        const names = (owner?.rows ?? []).map((row) => (row.values[labelColumnIndex(owner!.headers)] ?? "").replace(/<[^>]+>/g, "").trim()).filter(Boolean)
        if (!names.length) throw new Error("Aucune ligne à tirer dans cet index.")
        router.push(`${pathOf(index)}?fiche=${encodeURIComponent(pick(names))}${form ? `&formulaire=${encodeURIComponent(form)}` : ""}`)
      },
    }
  }, [applyData, ask, commitCell, origin, data, drawCell, engine, indexKey, locate, moveTargetsOf, nameOf, notify, openRowForm, openRowPage, ownNameColumn, pathOf, rawOf, relationOf, router, rowTargetOf, specOf, tables, valueOf])

  const runButton = useCallback(async (rowKey: string, button: ActionButton) => { await runActionButton(button, runtimeFor(rowKey)) }, [runtimeFor])
  // Les cartes de l'index : leurs boutons (rôles, condition, étapes) et leur clic (un formulaire ici, la page).
  const rolesOf = useRolesOf()
  const cardActions = useMemo<CardActions>(() => ({
    run: (rowKey, button) => void runButton(rowKey, button),
    visible: (rowKey, button) => engine.buttonVisible(rowKey, button),
    rolesOf: (rowKey) => rolesOf(roleRowOf(nameOf(rowKey).replace(/<[^>]+>/g, "").trim(), locate(rowKey)?.table.headers ?? [], (header) => rawOf(rowKey, header))),
    openForm: openRowForm,
    openPage: openRowPage,
  }), [engine, locate, nameOf, openRowForm, openRowPage, rawOf, rolesOf, runButton])

  /* eslint-disable react-hooks/refs -- les cellules ne lisent ces valeurs qu'en se dessinant, comme avant : indexGridColumn ne fait que les ranger dans la colonne */
  const columns = useMemo<SheetGridColumn[]>(() => {
    if (!table) return []
    const list: SheetGridColumn[] = visible.map((header) => indexGridColumn(
      header,
      header,
      specOf(table.tabName, header),
      columnWidthFor(header, tabDefinition.widths[tabDefinition.headers.findIndex((candidate) => foldName(candidate) === foldName(header))]),
      {
        valueOf,
        commit: (rowKey, columnKey, value) => void commitCell(rowKey, columnKey, value),
        disabled: busy,
        openForm: openRow,
        tabHrefOf: rowHref,
        computed,
        formula: (rowKey, columnKey, spec) => engine.formula(rowKey, columnKey, spec),
        gaugeMax: (rowKey, spec) => engine.gaugeMax(rowKey, spec),
        draw: async (rowKey, columnKey, spec) => { await drawCell(rowKey, columnKey, spec) },
        buttonVisible: (rowKey, button) => engine.buttonVisible(rowKey, button),
        runButton,
        tabNames: sortTabs.map((entry) => entry.value),
        rowValue: valueOf,
      },
      entityImage && foldName(header) === entityImage.header ? { upload: (file: File, _previous: string, rowKey: string) => entityImage.upload(file, rowKey, header) } : {},
    ))
    // Les colonnes propres à la page qui accueille la vue (« Classes et rangs »).
    for (const extra of pageColumns) {
      const at = extra.after ? list.findIndex((column) => foldName(column.key) === foldName(extra.after!)) : -1
      list.splice(at >= 0 ? at + 1 : list.length, 0, { key: extra.key, label: extra.label, width: extra.width, custom: true, sortable: false })
    }
    if (extras) {
      // Après le nom : le propriétaire (qu'un administrateur réattribue) et les liens.
      const context = { valueOf, commit: () => undefined, autoLinks: (rowKey: string) => extrasOf(rowKey)?.links ?? [] }
      const owner = indexGridColumn(OWNER_COLUMN, "Propriétaire", { kind: "auto-links" }, extras.canAssign ? 300 : 240, context, {
        sortable: true,
        control: (rowKey: string) => {
          const row = extrasOf(rowKey)
          const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
          if (!row) return <span className="px-2 text-xs text-muted-foreground">—</span>
          if (row.trashed && entity?.trashKind) return <TrashedRowActions kind={entity.trashKind} id={id} ownerName={row.ownerName} ask={ask} onDone={(message) => { notify(message); void refreshRef.current() }} />
          // Mettre à la corbeille, à côté du propriétaire : la ligne reste visible (marquée) pour un administrateur.
          const trash = entity?.trashKind ? <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => void mutateRef.current("delete", [rowKey], "delete")} className="self-start text-muted-foreground hover:text-destructive" title="Mettre à la corbeille"><Trash2 />Corbeille</Button> : null
          if (!extras.canAssign || !entity?.trashKind) return <div className="flex flex-col gap-1 px-2 py-1"><span className="text-sm text-muted-foreground">{row.ownerName}</span>{trash}</div>
          return <div className="flex flex-col"><OwnerSelector key={row.ownerUid} kind={entity.trashKind} itemId={id} ownerUids={row.ownerUids} accounts={extras.accounts} onSaved={() => void refreshRef.current()} />{trash}</div>
        },
      })
      const links = indexGridColumn(LINKS_COLUMN, extras.linksLabel, { kind: "auto-links" }, 300, context, { sortable: true })
      const at = Math.max(0, list.findIndex((column) => isNameColumn(column.key))) + 1
      list.splice(at, 0, owner, links)
    }
    return list
  }, [ask, busy, commitCell, computed, drawCell, engine, entity, entityImage, extras, extrasOf, notify, openRow, pageColumns, rawOf, rowHref, runButton, sortTabs, specOf, tabDefinition, table, valueOf, visible])
  /* eslint-enable react-hooks/refs */

  const corrections = useMemo(() => countCorrections(tables, specOf), [specOf, tables])

  async function correct() {
    if (!table) return
    setPending("correct"); setError("")
    try {
      const payload = await post({ action: "normalize-choices", tabName: table.tabName })
      if (payload.data) applyData(payload.data, payload.seq)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Correction impossible.")
    }
    setPending("")
  }

  // La recherche suit la frappe sans la ralentir : le tableau se filtre juste après, et le
  // texte cherché de chaque ligne n'est préparé qu'une fois par lecture de l'index.
  const deferredQuery = useDeferredValue(query)
  const haystacks = useMemo(() => new Map(viewTables.flatMap((owner) => owner.rows.map((row) => [row, row.values.map(foldName).join("\n")] as const))), [viewTables])
  // L'ordre des lignes : en tableau, le tri de chacun (en-têtes), sinon celui de la vue ; sous une
  // autre forme (cartes d'une vue, liste, kanban…), celui de la vue.
  const rowSort = useMemo((): SheetGridSort => {
    const own: SheetGridSort = activeView?.sort ? { column: activeView.sort.column, direction: activeView.sort.desc ? "desc" : "asc" } : null
    if (activeView && activeView.kind !== "table") return own
    return sort ?? own
  }, [activeView, sort])
  const displayedRows = useMemo(() => {
    const folded = foldName(deferredQuery)
    const rows = viewTables.flatMap((owner) => owner.rows
      .filter((row) => !activeView || matchesSavedView(activeView, (header) => { const column = columnIndexOf(owner, header); return column >= 0 ? row.values[column] ?? "" : "" }))
      // Vue intégrée : seulement les lignes que la page a choisies (onglets-fenêtres compris).
      .filter((row) => !embed || embed.rowFilter((header) => { const column = columnIndexOf(owner, header); return column >= 0 ? row.values[column] ?? "" : "" }))
      // Un onglet de rangement : les lignes qui portent sa valeur (et celles du vrai onglet du même nom).
      .filter((row) => !activeSort || foldName(owner.tabName) === foldName(activeSort.value) || activeSort.columns.some((header) => { const column = columnIndexOf(owner, header); return column >= 0 && foldName((row.values[column] ?? "").replace(/<[^>]+>/g, "")) === foldName(activeSort.value) }))
      .filter((row) => !folded || (haystacks.get(row) ?? "").includes(folded) || (extras && [OWNER_COLUMN, LINKS_COLUMN].some((key) => foldName(extraText(rowKeyOf(owner.tabName, row.rowNumber), key)).includes(folded))))
      .map((row) => ({ key: rowKeyOf(owner.tabName, row.rowNumber), rowNumber: row.rowNumber, tabName: owner.tabName })))
    if (!rowSort) return rows.map(({ key, rowNumber }) => ({ key, rowNumber }))
    // Le tri lit ce que montre la case (résultat d'une formule, choix bien écrit, nom actuel
    // d'une référence, valeur d'un nombre), pas le texte brut de Sheets. Vides en bas.
    const extra = rowSort.column === OWNER_COLUMN || rowSort.column === LINKS_COLUMN || rowSort.column === TAB_COLUMN
    // eslint-disable-next-line react-hooks/refs -- le tri lit les cases comme le tableau les montre, saisie en cours comprise
    const sorted = sortByIndexKey(rows, (row) => indexSortKey(
      valueOf(row.key, rowSort.column),
      extra ? undefined : specOf(row.tabName, rowSort.column),
      { resolveReference: shownReferenceText },
    ), rowSort.direction === "asc" ? 1 : -1)
    return sorted.map(({ key, rowNumber }) => ({ key, rowNumber }))
  }, [activeSort, activeView, deferredQuery, embed, extraText, extras, haystacks, rowSort, specOf, valueOf, viewTables])

  // La colonne « Onglet » de la vue « Tout ». Stable : les lignes ne se redessinent pas pour rien.
  const moveRow = useRef(mutate)
  useLayoutEffect(() => { moveRow.current = mutate; mutateRef.current = mutate; mutateRowsRef.current = mutateRows })
  const renderTabCell = useCallback((rowKey: string, columnKey: string) => {
    const extra = pageColumns.find((column) => column.key === columnKey)
    if (extra) return extra.render(embedRow(rowKey), true)
    const { tabName: rowTab } = parseRowKey(rowKey)
    return <Select value={rowTab} onValueChange={(target) => { if (target !== rowTab) void moveRow.current("move", [rowKey], "move", { toTab: target }) }} disabled={busy}>
      <SelectTrigger size="sm" aria-label="Onglet" title="Changer d’onglet" className="h-8 w-full border-transparent bg-transparent px-2 text-muted-foreground shadow-none hover:border-input dark:bg-transparent"><SelectValue /></SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={rowTab}>{rowTab}</SelectItem>
        {moveTargetsOf(rowTab).map((target) => <SelectItem key={target} value={target}>{target}</SelectItem>)}
      </SelectContent>
    </Select>
  }, [busy, embedRow, moveTargetsOf, pageColumns])

  const detailsFound = details !== null ? locate(details) : null

  // La vue en cartes : la carte de l'onglet affiché ; dans « Tout », chaque ligne prend celle de son onglet.
  const tabCards = table ? tabCardsOf(settings.cards, indexKey, table.tabName) : null
  // La carte montrée : celle de la vue (genre cartes ou présentation), sinon celle choisie sur ce poste.
  const viewCardChoice = activeView && activeView.kind !== "table" && activeView.cardId ? activeView.cardId : cardChoice
  const shownCard = tabCards ? pickCard(tabCards, viewCardChoice) : null
  const cardOf = useCallback((rowKey: string) => {
    const entry = tabCardsOf(settings.cards, indexKey, parseRowKey(rowKey).tabName)
    return pickCard(entry, viewCardChoice) ?? shownCard!
  }, [viewCardChoice, indexKey, settings.cards, shownCard])
  // « Enregistrer comme vue » : ce que montre l'index (onglet, filtre de la vue ou de l'onglet de
  // rangement, affichage, carte), avec le tri et les filtres de chacun du tableau, pour tout le monde.
  // Ce qu'une vue ne sait pas dire est annoncé dans le dialogue, jamais perdu en silence.
  const saveHereAsView = useCallback(() => {
    if (!table) return
    const grid = filterFromGridFilters(gridFilters, (key) => key.startsWith("__") ? undefined : key)
    const skipped = [...grid.skipped]
    // Un onglet prévu par Eraser filtre par catégorie de sort : une vue enregistrée ne sait pas le dire.
    if (activeView?.builtin) skipped.push(`la catégorie de « ${activeView.name} »`)
    let match: "toutes" | "une" = activeView?.filter?.match ?? "toutes"
    let conditions: FilterCondition[] = [
      ...(activeView && !activeView.builtin ? activeView.filter?.conditions ?? [] : []),
      ...(activeSort?.columns[0] ? [{ column: activeSort.columns[0], operator: "est" as const, value: activeSort.value }] : []),
    ]
    if (grid.filter) {
      if (match === "une" && conditions.length > 1) skipped.push("tes filtres du tableau (la vue demande « au moins une condition »)")
      else { conditions = [...conditions, ...grid.filter.conditions]; match = "toutes" }
    }
    const kind = activeView && activeView.kind !== "table" ? activeView.kind : display === "cards" ? "cards" : "table"
    const gridSort = sort && !sort.column.startsWith("__") ? { column: sort.column, desc: sort.direction === "desc" } : undefined
    if (sort && !gridSort) skipped.push("le tri par une colonne propre à la page")
    const draft: Partial<SavedView> = {
      name: activeView ? `${activeView.name} (copie)` : activeSort ? activeSort.value : showAll ? definition.title : table.tabName,
      source: activeView ? activeView.source : activeSort || showAll ? ALL_SOURCES : table.tabName,
      kind,
      ...(activeView?.shape ? { shape: activeView.shape } : {}),
      ...(kind === "cards" && viewCardChoice ? { cardId: viewCardChoice } : {}),
      ...(conditions.length ? { filter: { match, conditions: conditions.slice(0, 20) } } : {}),
      ...(gridSort ? { sort: gridSort } : activeView?.sort ? { sort: activeView.sort } : {}),
    }
    setViewDialog({ mode: "new", draft, notice: skipped.length ? `Pas repris dans la vue : ${skipped.join(", ")}.` : undefined })
  }, [activeSort, activeView, definition.title, display, gridFilters, showAll, sort, table, viewCardChoice])
  const cardRow = useCallback((rowKey: string): CardRowSource => ({
    key: rowKey,
    value: (header) => valueOf(rowKey, header),
    spec: (header) => { const found = locate(rowKey); return found ? specOf(found.table.tabName, header) : undefined },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- une ligne réécrite depuis sa fiche redessine ses cartes
  }), [locate, specOf, valueOf, rowVersions])
  // Une ligne dessinée avec une carte de son onglet, dans une vue qui le demande (liste, kanban…).
  const renderViewCard = useCallback((rowKey: string, cardId: string) => {
    const card = pickCard(tabCardsOf(settings.cards, indexKey, parseRowKey(rowKey).tabName), cardId === DEFAULT_ITEM_CARD ? null : cardId)
    return card ? <IndexCard card={card} row={cardRow(rowKey)} onOpen={() => openRow(rowKey)} href={rowHref(rowKey)} /> : null
  }, [cardRow, indexKey, openRow, rowHref, settings.cards])
  // Une ligne dessinée avec un formulaire de son onglet, en lecture (l'élément « formulaire » d'une vue, le détail d'un maître-détail).
  const renderViewForm = useCallback((rowKey: string, formId: string) => {
    const found = locate(rowKey)
    if (!found) return null
    const tab = found.table.tabName
    const columns = (data?.columns[tab] ?? []).filter((column) => !isIdHeader(column.header))
    const layout = tabFormOrBuiltin(settings.layouts, indexKey, tab, formId) ?? automaticLayoutFor("form", columns)
    const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
    return <IndexFormView layout={layout} columns={columns} valueOf={(header) => rawOf(rowKey, header)} row={id ? { index: indexKey, id, tab } : undefined} />
  }, [data, indexKey, locate, rawOf, settings.layouts])
  const layoutHeaders = useMemo(() => (table?.headers ?? []).filter((header) => header.trim() && !isIdHeader(header) && specOf(table!.tabName, header).kind !== "archived"), [specOf, table])
  // La forme de la vue choisie : l'onglet stat, les cartes, ou sa présentation (liste, kanban…),
  // choisie comme le fait le serveur des pages pour un bloc (la sienne, la version, le preset,
  // sinon celle de l'onglet). Le tableau n'en a pas.
  const presentationPresets = useMemo(() => [...builtinPresentationPresets, ...settings.viewPresets], [settings.viewPresets])
  const viewLayout = useMemo((): Presentation | null => {
    if (!activeView || activeView.kind === "table") return null
    if (activeView.kind === "stats" || activeView.kind === "cards") return { kind: activeView.kind }
    return table ? resolveSavedViewPresentation(activeView, { tab: table.tabName, headers: layoutHeaders, presentations: settings.presentations, presets: presentationPresets }) : null
  }, [activeView, layoutHeaders, presentationPresets, settings.presentations, table])
  const layoutNameOf = useCallback((rowKey: string) => nameOf(rowKey).replace(/<[^>]+>/g, "").trim(), [nameOf])
  // Cartes rangées en sections : les lignes de chaque valeur de la colonne choisie.
  const cardGroups = useMemo(() => {
    const groupBy = viewLayout?.kind === "cards" ? viewLayout.groupBy : undefined
    // eslint-disable-next-line react-hooks/refs -- les sections lisent les cases comme le tableau les montre
    return groupBy ? groupRowsBy(displayedRows, (row) => valueOf(row.key, groupBy)) : null
  }, [displayedRows, valueOf, viewLayout])
  const layoutOptionsOf = useCallback((header: string) => (table ? specOf(table.tabName, header).options ?? [] : []).map((option) => ({ value: option.value, color: option.color })), [specOf, table])
  // Les statistiques de l'index (Modifier › Stats) portent sur tous ses onglets de données (la
  // phrase choisit l'onglet). Un onglet stat ne fait que montrer les épinglées.
  const statsView = viewLayout?.kind === "stats" ? activeView : null
  const statTabs = useMemo(() => tables.map((owner) => owner.tabName), [tables])
  const statRowKeys = useMemo(() => tables.flatMap((owner) => owner.rows.map((row) => rowKeyOf(owner.tabName, row.rowNumber))), [tables])
  // Un onglet stat calcule sur les lignes que trouve la recherche (toutes sans recherche).
  const statSearchRows = useMemo(() => {
    const folded = foldName(deferredQuery)
    if (!folded) return statRowKeys
    return tables.flatMap((owner) => owner.rows.filter((row) => row.values.map(foldName).join("\n").includes(folded)).map((row) => rowKeyOf(owner.tabName, row.rowNumber)))
  }, [deferredQuery, statRowKeys, tables])
  const statHeaders = useMemo(() => {
    const seen = new Map<string, string>()
    for (const owner of tables) for (const header of owner.headers) {
      if (!header.trim() || isIdHeader(header) || seen.has(foldName(header)) || specOf(owner.tabName, header).kind === "archived") continue
      seen.set(foldName(header), header)
    }
    // Plusieurs onglets : la colonne virtuelle « Onglet » (sauf si une vraie colonne porte ce nom).
    if (tables.length > 1 && !seen.has(foldName(TAB_PSEUDO))) seen.set(foldName(TAB_PSEUDO), TAB_PSEUDO)
    return [...seen.values()]
  }, [specOf, tables])
  const statValueOf = useCallback((rowKey: string, column: string) => column === TAB_PSEUDO && !locate(rowKey)?.table.headers.some((header) => foldName(header) === foldName(TAB_PSEUDO)) ? parseRowKey(rowKey).tabName : valueOf(rowKey, column), [locate, valueOf])
  const statTabOf = useCallback((rowKey: string) => parseRowKey(rowKey).tabName, [])
  const statOptionsOf = useCallback((header: string) => {
    const owner = tables.find((candidate) => candidate.headers.some((name) => foldName(name) === foldName(header)))
    return (owner ? specOf(owner.tabName, header).options ?? [] : []).map((option) => ({ value: option.value, color: option.color }))
  }, [specOf, tables])
  // « Forêt - Ville » : une liste à choix multiple séparée par un tiret compte chaque lieu à part.
  const statSeparatorOf = useCallback((header: string) => {
    const owner = tables.find((candidate) => candidate.headers.some((name) => foldName(name) === foldName(header)))
    const spec = owner ? specOf(owner.tabName, header) : null
    return spec?.multiple ? spec.listSeparator : undefined
  }, [specOf, tables])
  // Les statistiques de l'index, et celles qu'un onglet stat de l'alpha 197 gardait encore.
  const indexStats = useMemo(() => {
    const seen = new Set<string>()
    return [...settings.stats, ...views.flatMap((view) => view.stats ?? []), ...settings.views.flatMap((view) => view.layout?.kind === "stats" ? view.layout.stats ?? [] : [])].filter((stat) => !seen.has(stat.id) && Boolean(seen.add(stat.id)))
  }, [settings.stats, settings.views, views])
  const saveStats = useCallback(async (stats: StatDefinition[], groups?: StatColumnGroup[]) => { await settings.saveStats(stats, groups) }, [settings])
  // « {Prix} » écrit dans une case de cet index : le menu « { » propose les colonnes de la ligne.
  const referenceTab = detailsFound?.table.tabName ?? table?.tabName
  const referenceScope = { index: indexKey, tab: referenceTab }
  const formTable = spanning ? tableByName.get(creatingTab) ?? table : table
  const formDefinition = definition.tabs.find((tab) => tab.name === formTable?.tabName) ?? tabDefinition
  // Le formulaire d'ajout montre les colonnes du formulaire (« Tableau et formulaire »,
  // « Formulaire seulement »), sauf l'identifiant (généré) et les colonnes calculées.
  const formFields: IndexFormField[] = formTable ? (data?.columns[formTable.tabName] ?? [])
    .flatMap(({ header, spec }) => {
      if (!(isSheetSpec(spec) || layoutPlaces(tabLayoutOrBuiltin(settings.layouts, indexKey, formTable.tabName, "form"), header)) || ["id", "lookup", "rollup", "formula", "actions", "random", "auto-links", "ranked-links", "tab"].includes(spec.kind)) return []
      // Les colonnes de rang des classes ne se remplissent que par « Classes et rangs ».
      if (rankHeaders.has(foldName(header))) return []
      return [{ key: header, label: header, spec, long: isLongColumn(header) }]
    }) : []

  // « Ajouter » au bas du tableau : la ligne naît dans le tableau, son nom tapé dans sa case.
  // Depuis un onglet de rangement, elle reçoit sa valeur (elle y apparaît aussitôt).
  const nameHeader = table ? table.headers[ownNameColumn(table.headers)] : undefined
  const appendNamed = formTable && nameHeader && ownNameColumn(formTable.headers) >= 0 ? {
    nameColumn: nameHeader,
    placeholder: `Nom (${formDefinition.itemLabel})…`,
    add: (name: string) => addRow(formTable.tabName, formTable.headers.map((header, index) => index === ownNameColumn(formTable.headers) ? name : activeSort && activeSort.columns.some((column) => foldName(column) === foldName(header)) ? activeSort.value : ""), formTable.headers, true),
  } : undefined

  /** Le texte enregistré d'une case (la fiche relit la ligne telle que Sheets l'a renvoyée). */
  const savedCell = (found: { table: WorldIndexTable; row: WorldIndexRow }, header: string) => {
    const column = columnIndexOf(found.table, header)
    if (column < 0) return ""
    return isRichSpec(specOf(found.table.tabName, header)) ? found.row.html[column] ?? "" : found.row.values[column] ?? ""
  }

  // La fiche d'une ligne : tous ses champs du formulaire, rangés par sa mise en page.
  // Une colonne hors fiche (ancien « Tableau seulement ») y vient quand sa mise en page la place.
  // Un bouton « Ouvrir un formulaire » de la fiche y montre ce formulaire (pour cette ligne seulement).
  const sheetFormId = sheetForm && sheetForm.row === details ? sheetForm.form : null
  const sheetLayout = detailsFound ? (sheetFormId ? tabFormOrBuiltin(settings.layouts, indexKey, detailsFound.table.tabName, sheetFormId) : null) ?? tabLayoutOrBuiltin(settings.layouts, indexKey, detailsFound.table.tabName, "form") : null
  /* eslint-disable react-hooks/refs -- la fiche lit les cases comme le tableau les montre, saisies enregistrées comprises */
  const sheetFields = detailsFound ? (data?.columns[detailsFound.table.tabName] ?? [])
    .filter((column) => (isSheetSpec(column.spec) || layoutPlaces(sheetLayout, column.header)) && !["auto-links", "ranked-links", "tab"].includes(column.spec.kind) && !rankHeaders.has(foldName(column.header)))
    .map((column) => ({ key: column.header, label: column.header, spec: column.spec, value: details === null ? savedCell(detailsFound, column.header) : rawOf(details, column.header), long: isLongColumn(column.header) }))
    // Les colonnes propres à la page qui accueille la vue, dessinées par elle.
    .concat(pageColumns.map((extra) => ({ key: `__embed:${extra.key}`, label: extra.label, spec: { kind: "ranked-links" } as IndexColumnSpec, value: "", long: true }))) : []
  /* eslint-enable react-hooks/refs */
  const sheetRow = (header: string): IndexFieldProps["row"] => details === null ? undefined : {
    ...(entityImage && foldName(header) === entityImage.header ? { upload: (file: File) => entityImage.upload(file, details, header) } : {}),
    formula: (spec) => engine.formula(details, header, spec),
    computed: (spec) => computed(details, header, spec),
    gaugeMax: (spec) => engine.gaugeMax(details, spec),
    draw: async (spec) => { await drawCell(details, header, spec) },
    buttonVisible: (button) => engine.buttonVisible(details, button),
    runButton: (button) => runButton(details, button),
    tabNames: sortTabs.map((entry) => entry.value),
    name: detailsFound ? savedCell(detailsFound, detailsFound.table.headers[ownNameColumn(detailsFound.table.headers, detailsFound.table.tabName)] ?? "").replace(/<[^>]+>/g, "") : undefined,
  }


  /** Les champs d'une ligne, enregistrés d'eux-mêmes par sa fiche (la ligne est donnée : on a pu passer à une autre). */
  async function saveSheet(rowKey: string, changes: Record<string, string>) {
    setSheetError("")
    // La ligne de la fiche, désignée par son identifiant pour chacun de ses champs.
    const target = rowTargetOf(rowKey)
    const found = locate(rowKey)
    const label = found ? found.table.headers[labelColumnIndex(found.table.headers)] ?? "" : ""
    try {
      // Champ par champ, comme dans le tableau : un nom renommé ou une colonne liée gardent leurs
      // effets. Le premier champ refusé (changé ailleurs entre-temps) arrête la suite.
      for (const [header, value] of Object.entries(changes)) {
        await commitCell(rowKey, header, value, { row: target ?? undefined, rethrow: true })
        if (target && foldName(header) === foldName(label)) target.name = value
      }
    } catch (reason) {
      bumpRow(rowKey)
      setSheetError(reason instanceof Error ? reason.message : "La fiche n’a pas pu être enregistrée.")
      // La fiche garde ce qui a été saisi.
      throw reason
    }
    bumpRow(rowKey)
  }

  /**
   * Le détail modifiable d'une vue (« Le détail : modifiable ») : le formulaire choisi de la ligne,
   * ses champs comme dans la fiche, enregistrés d'eux-mêmes ; `locked` : en lecture.
   */
  const renderEditForm = (rowKey: string, formId: string, locked: string[]) => {
    const found = locate(rowKey)
    if (!found) return null
    const tab = found.table.tabName
    const layout = (formId && formId !== DEFAULT_FORM_ID ? tabFormOrBuiltin(settings.layouts, indexKey, tab, formId) : null) ?? tabLayoutOrBuiltin(settings.layouts, indexKey, tab, "form")
    const fields = (data?.columns[tab] ?? [])
      .filter((column) => (isSheetSpec(column.spec) || layoutPlaces(layout, column.header)) && !["auto-links", "ranked-links", "tab"].includes(column.spec.kind) && !rankHeaders.has(foldName(column.header)))
      .map((column) => ({ key: column.header, label: column.header, spec: column.spec, value: rawOf(rowKey, column.header), long: isLongColumn(column.header) }))
    const rowFor = (header: string): IndexFieldProps["row"] => ({
      ...(entityImage && foldName(header) === entityImage.header ? { upload: (file: File) => entityImage.upload(file, rowKey, header) } : {}),
      formula: (spec) => engine.formula(rowKey, header, spec),
      computed: (spec) => computed(rowKey, header, spec),
      gaugeMax: (spec) => engine.gaugeMax(rowKey, spec),
      draw: async (spec) => { await drawCell(rowKey, header, spec) },
      buttonVisible: (button) => engine.buttonVisible(rowKey, button),
      runButton: (button) => runButton(rowKey, button),
      tabNames: sortTabs.map((entry) => entry.value),
      name: nameOf(rowKey).replace(/<[^>]+>/g, ""),
    })
    const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
    return <IndexRowForm key={`${rowKey}:${formId}`} rowKey={rowKey} fields={fields} layout={layout} rowFor={rowFor} onSave={saveSheet} rowRef={{ index: indexKey, id, tab }} inventoryEndpoint={indexKey === "npcs" ? (row) => `/api/npcs/${encodeURIComponent(row.id)}/inventory` : undefined} openForm={(next) => openRowForm(rowKey, next ?? DEFAULT_FORM_ID)} locked={locked} />
  }
  /** Le tableau derrière la fiche montre tout de suite ce qui vient d'y être enregistré. */
  function bumpRow(rowKey: string) {
    setRowVersions((current) => ({ ...current, [rowKey]: (current[rowKey] ?? 0) + 1 }))
  }
  // Précédente, « Aller à… », Suivante : les lignes du tableau, dans l'ordre affiché.
  // Une fiche ouverte depuis « Modifier › Stats » passe d'une ligne concernée à l'autre.
  const sheetNavigation = { rows: statSheetRows ?? displayedRows.map((row) => row.key), labelOf: nameOf, onGo: (rowKey: string) => { setSheetError(""); setDetails(rowKey) } }

  // Colonnes qui peuvent pondérer « Tirer » : les nombres et les jauges.
  const weightColumns = table ? (data?.columns[table.tabName] ?? []).filter((column) => ["number", "gauge", "formula", "rollup"].includes(column.spec.kind)).map((column) => column.header) : []

  async function openEditor(mode: EditorMode = "columns") {
    setEditorMode(mode)
    setPending("editor"); setEditorError("")
    try {
      const response = await fetch(`/api/resources/index-schema?key=${encodeURIComponent(indexKey)}`, { cache: "no-store" })
      const payload = (await response.json().catch(() => ({}))) as { model?: IndexEditorModel; error?: string }
      if (!response.ok || !payload.model) throw new Error(payload.error || "Les colonnes de cet index n’ont pas pu être lues.")
      setEditor(payload.model)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Les colonnes de cet index n’ont pas pu être lues.")
    }
    setPending("")
  }

  /** Met l'index (créé dans Eraser) à la corbeille, puis revient à la page des index. */
  async function deleteIndex() {
    setPending("schema"); setEditorError("")
    const response = await fetch("/api/resources/custom-indexes", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: indexKey }) })
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    setPending("")
    if (!response.ok) return setEditorError(payload.error || "L’index n’a pas pu être mis à la corbeille.")
    setEditor(null)
    router.push("/ressources")
  }

  async function applyEditor(operations: SchemaOperation[]) {
    setPending("schema"); setEditorError("")
    const seq = ++requestSeq.current
    try {
      const response = await fetch("/api/resources/index-schema", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ family: "world", key: indexKey, operations }) })
      const payload = (await response.json().catch(() => ({}))) as { data?: WorldIndexData; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || "Les changements n’ont pas pu être écrits.")
      applyData(payload.data, seq)
      announceWorldIndexChange([indexKey], origin)
      setEditor(null)
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : "Les changements n’ont pas pu être écrits.")
    }
    setPending("")
  }

  const peekFound = cardPeek ? locate(cardPeek.row) : null
  const peekCard = cardPeek && peekFound ? pickCard(tabCardsOf(settings.cards, indexKey, peekFound.table.tabName), cardPeek.card === DEFAULT_ITEM_CARD ? null : cardPeek.card) : null
  return (
    <ReferenceScopeProvider scope={referenceScope}>
    <CardActionsContext.Provider value={cardActions}>
    <section className={`${embed ? "" : "mt-4 "}flex flex-col gap-3`} {...(embed ? {} : { [IN_PLACE_ATTRIBUTE]: pathname })}>
      <div className="flex flex-wrap items-end gap-2">
        {/* Intégrée : la vue de la page, puis les onglets-fenêtres de l'index (combinés à elle). */}
        {embed && ownViews.length > 0 && <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Vue
          <span className="flex items-center gap-1">
            <NativeSelect value={activeView ? windowSelectKey(activeView.id) : ""} onChange={(event) => { setTabName(event.target.value); setCreating(false); setDetails(null) }} disabled={busy} className="h-9 min-w-44 text-foreground">
              <NativeSelectOption value="">{embed.label}</NativeSelectOption>
              {ownViews.map((view) => <NativeSelectOption key={view.id} value={windowSelectKey(view.id)}>{savedViewMark(view.kind)} {view.name}</NativeSelectOption>)}
            </NativeSelect>
            {activeView && !activeView.builtin && <Button type="button" variant="ghost" size="icon" onClick={() => setViewDialog({ mode: "edit" })} title="Modifier cette vue" aria-label="Modifier cette vue"><Pencil /></Button>}
          </span>
        </label>}
        {!embed && (tables.length > 1 || views.length > 0 || sortTabs.length > 0) && <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Onglet
          <span className="flex items-center gap-1">
            <IndexTabPicker
              value={activeView ? windowSelectKey(activeView.id) : activeSort ? `${SORT_PREFIX}${activeSort.value}` : showAll ? ALL_TABS : table?.tabName ?? ""}
              options={[
                ...(canShowAll ? [{ value: ALL_TABS, label: "Tout", detail: String(allTables.reduce((total, candidate) => total + candidate.rows.length, 0)) }] : []),
                // Un vrai onglet qui porte le nom d'une valeur de rangement est réuni à son onglet de rangement.
                ...tables.filter((candidate) => !absorbed.has(foldName(candidate.tabName))).map((candidate) => ({ value: candidate.tabName, label: candidate.tabName, detail: String(candidate.rows.length) })),
                ...sortTabs.map((entry) => ({ value: `${SORT_PREFIX}${entry.value}`, label: entry.value, detail: String(entry.count) })),
                ...views.map((view) => ({ value: windowSelectKey(view.id), label: `${savedViewMark(view.kind)} ${view.name}`, group: "Vues" })),
              ]}
              onChange={(value) => { setTabName(value); setCreating(false); setDetails(null) }}
              hrefOf={tabHref}
              tabLabel={(option) => option.value === ALL_TABS ? definition.title : `${definition.title} · ${option.label.replace(/^[⧉∑▦◈] /, "")}`}
              disabled={busy}
              className="text-foreground"
            />
            {activeView && !activeView.builtin && <Button type="button" variant="ghost" size="icon" onClick={() => setViewDialog({ mode: "edit" })} title="Modifier cette vue" aria-label="Modifier cette vue"><Pencil /></Button>}
          </span>
        </label>}
        {table && embed?.query === undefined && <div className="relative min-w-48 flex-1 sm:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={statsView ? "Rechercher les lignes comptées…" : display === "cards" ? "Rechercher dans les cartes…" : "Rechercher dans le tableau…"} className="pl-9" /></div>}
        {table && !statsView && (!activeView || activeView.kind === "table") && <IndexDisplayControls display={display} onDisplay={setDisplay} cards={tabCards?.cards ?? []} card={shownCard} onPick={setCardChoice} />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {data?.webViewLink && <SheetsLinkButton href={data.webViewLink} />}
          {table && display === "table" && !statsView && (!activeView || activeView.kind === "table") && <FullscreenButton fullscreen={fullscreen.fullscreen} onToggle={fullscreen.toggle} />}
          {corrections > 0 && <Button type="button" variant="outline" onClick={() => void correct()} disabled={busy} title="Réécrit les valeurs de liste mal orthographiées (« Aggressif » → « Agressif »). Les valeurs hors liste ne sont pas touchées.">{pending === "correct" ? <LoaderCircle className="animate-spin" /> : <SpellCheck />}Corriger {corrections} faute{corrections > 1 ? "s" : ""}</Button>}
          <ToolbarIconButton label="Actualiser : relire Google Sheets" onClick={() => void refresh()} disabled={busy}>{pending === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}</ToolbarIconButton>
          {table && !statsView && <DrawRowButton
            rows={displayedRows}
            weightColumns={weightColumns}
            weightOf={(rowKey, header) => { const found = locate(rowKey); return found ? numericCellValue(valueOf(rowKey, header), specOf(found.table.tabName, header)) : null }}
            nameOf={nameOf}
            onOpen={openRow}
            disabled={busy}
            compact
          />}
          {!embed && table && !statsView && <ToolbarIconButton label="Enregistrer comme vue : cet onglet, son affichage, ton tri et tes filtres du tableau, pour tout le monde" onClick={saveHereAsView} disabled={busy}><BookmarkPlus /></ToolbarIconButton>}
          <ToolbarIconButton label="Nouvelle vue : des lignes choisies, dans un ordre, sous une forme (tableau, cartes, liste, kanban…) ou un onglet stat" onClick={() => setViewDialog({ mode: "new" })} disabled={busy || !tables.length}><Filter /></ToolbarIconButton>
          <Button type="button" variant="outline" onClick={() => void openEditor("columns")} disabled={busy} title="Colonnes, types, réglages, onglets, mises en page et cartes de cet index">{pending === "editor" ? <LoaderCircle className="animate-spin" /> : <Settings2 />}Modifier</Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => setGuideOpen(true)} title="Guide des colonnes : types, formules, boutons, aléatoire" aria-label="Guide des colonnes"><CircleHelp /></Button>
          <Button type="button" onClick={startAdding} disabled={!table || busy}><Plus />{embed?.addLabel ?? `Ajouter ${spanning ? definition.itemLabel ?? tabDefinition.itemLabel : tabDefinition.itemLabel}`}</Button>
        </div>
      </div>

      {settings.savedViewsUnavailable && !embed && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">Les vues enregistrées n’ont pas pu être lues sur le serveur partagé d’Eraser : seuls les onglets-fenêtres de la feuille sont montrés, et une vue ne peut pas être enregistrée pour l’instant.</p>}
      {editor && <IndexEditor
        model={editor}
        sampleRows={Object.fromEntries(tables.map((owner) => [owner.tabName, owner.rows.slice(0, 3).map((row) => Object.fromEntries(owner.headers.map((header, index) => [header, row.values[index] ?? ""])))]))}
        open
        pending={pending === "schema"}
        error={editorError}
        onClose={() => { if (pending !== "schema") setEditor(null) }}
        onApply={(operations) => void applyEditor(operations)}
        onDeleteIndex={() => void deleteIndex()}
        layouts={settings.layouts}
        onSaveLayouts={settings.saveLayouts}
        cardsIndex={indexKey}
        cards={settings.cards}
        onSaveCards={settings.saveCards}
        locks={settings.locks}
        onSaveLocks={settings.saveLocks}
        presentations={settings.presentations}
        onSavePresentations={settings.savePresentations}
        viewPresets={settings.viewPresets}
        onSaveViewPreset={settings.saveViewPreset}
        onDeleteViewPreset={settings.deleteViewPreset}
        previewRows={Object.fromEntries(tables.map((owner) => [owner.tabName, owner.rows.slice(0, 40).map((row) => Object.fromEntries(owner.headers.map((header, index) => [header, row.values[index] ?? ""])))]))}
        optionsOf={(tabName, header) => (specOf(tabName, header).options ?? []).map((option) => ({ value: option.value, color: option.color }))}
        stats={indexStats}
        statsPanel={<IndexStats stats={indexStats} groups={settings.statGroups} rows={statRowKeys} columns={statHeaders} tabs={statTabs} valueOf={statValueOf} tabOf={statTabOf} nameOf={layoutNameOf} optionsOf={statOptionsOf} separatorOf={statSeparatorOf} onOpen={(rowKey, list) => { setSheetError(""); setStatSheetRows(list ?? null); setDetails(rowKey) }} canEdit={!busy} onSave={saveStats} />}
        initialMode={editorMode}
        initialTab={table?.tabName}
      />}

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}


      {creating && formTable && <IndexEntryForm
        key={formTable.tabName}
        title={`Ajouter ${formDefinition.itemLabel}`}
        fields={formFields}
        layout={tabLayoutOrBuiltin(settings.layouts, indexKey, formTable.tabName, "form")}
        pending={pending === "add"}
        leading={spanning ? <label className="grid gap-1 text-xs font-semibold">
          Onglet
          <NativeSelect value={formTable.tabName} onChange={(event) => setCreatingTab(event.target.value)} className="w-full">
            {tables.map((candidate) => <NativeSelectOption key={candidate.tabName} value={candidate.tabName}>{candidate.tabName}</NativeSelectOption>)}
          </NativeSelect>
        </label> : undefined}
        onCancel={() => setCreating(false)}
        // Ajouter depuis un onglet de rangement : la ligne reçoit sa valeur (elle y apparaît aussitôt).
        onSave={(values) => void addRow(formTable.tabName, formTable.headers.map((header) => values[header] || (activeSort && activeSort.columns.some((column) => foldName(column) === foldName(header)) ? activeSort.value : "")), formTable.headers)}
      />}

      {table && statsView ? <IndexStats
        key={statsView.id}
        statIds={statsView.statIds}
        stats={indexStats}
        groups={settings.statGroups}
        separatorOf={statSeparatorOf}
        pinnedOnly
        rows={statSearchRows}
        columns={statHeaders}
        tabs={statTabs}
        valueOf={statValueOf}
        tabOf={statTabOf}
        nameOf={layoutNameOf}
        optionsOf={statOptionsOf}
        onOpen={(rowKey, list) => { setSheetError(""); setStatSheetRows(list ?? null); openRow(rowKey) }}
        canEdit={!busy}
        onSave={saveStats}
        onManage={() => void openEditor("stats")}
      /> : table && viewLayout && viewLayout.kind !== "cards" && viewLayout.kind !== "table" ? <IndexPresentation
        layout={viewLayout}
        rows={displayedRows.map((row) => row.key)}
        headers={layoutHeaders}
        nameOf={layoutNameOf}
        valueOf={valueOf}
        optionsOf={layoutOptionsOf}
        specOf={(header) => specOf(table.tabName, header)}
        onOpen={openRow}
        onOpenPage={openRowPage}
        onOpenForm={openRowForm}
        renderEditForm={busy ? undefined : renderEditForm}
        onAdd={busy ? undefined : startAdding}
        onCommit={busy ? undefined : (rowKey, header, value) => void commitCell(rowKey, header, value)}
        renderCard={renderViewCard}
        cardOf={(rowKey, cardId) => pickCard(tabCardsOf(settings.cards, indexKey, parseRowKey(rowKey).tabName), cardId === DEFAULT_ITEM_CARD ? activeView?.cardId ?? null : cardId)}
        renderForm={renderViewForm}
        rowRef={rowRefOf}
        empty={viewTables.some((owner) => owner.rows.length) ? "Aucune ligne ne remplit les conditions de cette vue." : `Cet onglet est vide. Ajoute ${tabDefinition.itemLabel} pour commencer.`}
      /> : table && (display === "cards" || viewLayout?.kind === "cards") ? (shownCard
        ? viewLayout?.groupBy
          // Cartes rangées en sections : une grille par valeur de la colonne choisie.
          ? <div className="space-y-6">{(cardGroups ?? []).map((group) => <section key={group.name || "*"} className="space-y-2">
            <p className="flex items-center justify-between border-b pb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary/80"><span>{group.name || "Sans valeur"}</span><span className="text-muted-foreground">{group.rows.length}</span></p>
            <IndexCardGrid card={shownCard} cardOf={spanning ? cardOf : undefined} rows={group.rows} rowSource={cardRow} onOpen={openRow} hrefOf={rowHref} rowRef={rowRefOf} empty="" />
          </section>)}</div>
          : <IndexCardGrid
          card={shownCard}
          cardOf={spanning ? cardOf : undefined}
          rows={displayedRows}
          rowSource={cardRow}
          onOpen={openRow}
          hrefOf={rowHref}
          rowRef={rowRefOf}
          empty={activeView ? "Aucune ligne ne remplit les conditions de cette vue." : viewTables.some((owner) => owner.rows.length) ? "Aucune ligne ne correspond à la recherche." : `Cet onglet est vide. Ajoute ${tabDefinition.itemLabel} pour commencer.`}
        />
        : <NoCardsYet tabName={table.tabName} onCreate={() => void openEditor("cards")} />
      ) : table ? (
        <SheetGrid
          fullscreen={fullscreen.fullscreen}
          onExitFullscreen={fullscreen.exit}
          layoutKey={gridKey}
          columns={columns}
          rows={displayedRows}
          valueOf={valueOf}
          onCommit={(rowKey, columnKey, value) => void commitCell(rowKey, columnKey, value)}
          renderCustomCell={renderTabCell}
          sort={sort}
          onSort={setSort}
          disabled={busy}
          version={version}
          rowVersions={rowVersions}
          addRowLabel={embed?.addLabel ?? `Ajouter ${spanning ? definition.itemLabel ?? tabDefinition.itemLabel : tabDefinition.itemLabel}`}
          // Personnages, campagnes et classes naissent de leur page et partent à la corbeille :
          // le tableau n'en insère, n'en copie ni n'en supprime aucune ligne.
          rowCommands={entity?.trashKind ? {
            // Personnages et campagnes : dupliquer, et « Supprimer » les met à la corbeille.
            append: startAdding,
            duplicate: (rowKeys) => void mutate("duplicate", rowKeys, "duplicate"),
            remove: (rowKeys) => void mutate("delete", rowKeys, "delete"),
          } : entity && !entity.rowCommands ? { append: startAdding } : {
            append: startAdding,
            appendNamed,
            insertRows: (rowKey, count) => void mutate("insert", [rowKey], "insert", { count }),
            duplicate: (rowKeys) => void mutate("duplicate", rowKeys, "duplicate"),
            remove: (rowKeys) => void mutate("delete", rowKeys, "delete"),
          }}
          rowMenuExtras={(rowKey) => {
            const targets = moveTargetsOf(parseRowKey(rowKey).tabName)
            return <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => setDetails(rowKey)}><FileText className="size-3.5" />Ouvrir la fiche</ContextMenuItem>
              {embed?.rowMenuExtras?.(embedRow(rowKey))}
              {targets.length > 0 && <>
                <ContextMenuSeparator />
                <ContextMenuLabel className="flex items-center gap-1.5"><ArrowRightLeft className="size-3.5" />Déplacer vers</ContextMenuLabel>
                {targets.map((target) => <ContextMenuItem key={target} onSelect={() => void mutate("move", [rowKey], "move", { toTab: target })}>{target}</ContextMenuItem>)}
              </>}
            </>
          }}
          toolbarTrailing={saving > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : null}
          empty={activeView ? "Aucune ligne ne remplit les conditions de cette vue." : viewTables.some((owner) => owner.rows.length) ? "Aucune ligne ne correspond à la recherche." : `Ce tableau est vide. Ajoute ${tabDefinition.itemLabel} pour commencer.`}
        />
      ) : !error ? <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Le classeur « {definition.sheetName} » n’a pas pu être préparé.</div> : null}

      {detailsFound && details !== null && <IndexRowSheet
        open
        rowKey={details}
        title={savedCell(detailsFound, detailsFound.table.headers[ownNameColumn(detailsFound.table.headers, detailsFound.table.tabName)] ?? "").replace(/<[^>]+>/g, "")}
        subtitle={`${definition.title} · ${detailsFound.table.tabName}`}
        fields={sheetFields}
        layout={sheetLayout}
        rowFor={sheetRow}
        renderField={(field) => {
          const extra = field.key.startsWith("__embed:") ? pageColumns.find((column) => `__embed:${column.key}` === field.key) : undefined
          return extra ? <div className="grid content-start gap-1 text-xs font-semibold md:col-span-2">{extra.label}{extra.render(embedRow(details), false)}</div> : undefined
        }}
        error={sheetError}
        footer={<RowPageLink index={indexKey} tab={detailsFound.table.tabName} id={savedCell(detailsFound, "ID").replace(/<[^>]+>/g, "").trim()} />}
        // Les blocs Inventaire et Bouton de la mise en page : la ligne, et l'adresse de son inventaire (celle des PNJ pour l'Index des PNJs).
        rowRef={{ index: indexKey, id: savedCell(detailsFound, "ID").replace(/<[^>]+>/g, "").trim(), tab: detailsFound.table.tabName }}
        inventoryEndpoint={indexKey === "npcs" ? (row) => `/api/npcs/${encodeURIComponent(row.id)}/inventory` : undefined}
        navigation={sheetNavigation}
        onSave={saveSheet}
        openForm={(formId) => setSheetForm(formId && details ? { row: details, form: formId } : null)}
        onClose={() => { setDetails(null); setSheetError(""); setStatSheetRows(null); setSheetForm(null) }}
      />}
      {viewDialog && <SavedViewDialog
        open
        onOpenChange={(open) => { if (!open) setViewDialog(null) }}
        index={indexKey}
        view={viewDialog.mode === "edit" ? activeView : null}
        usedBy={viewDialog.mode === "edit" && activeView ? settings.savedViewPages[activeView.id] : undefined}
        stats={indexStats}
        draft={viewDialog.draft}
        notice={viewDialog.notice}
        sources={[{ value: ALL_SOURCES, label: "Tous les onglets de l’index" }, ...tables.map((candidate) => ({ value: candidate.tabName, label: `L’onglet « ${candidate.tabName} »` }))]}
        columnsOf={(source) => [...new Set((source === ALL_SOURCES ? tables : tables.filter((candidate) => candidate.tabName === source)).flatMap((candidate) => (data?.columns[candidate.tabName] ?? []).map((column) => column.header)).filter((header) => !/^id$/i.test(header)))]}
        tabOf={(source) => source === ALL_SOURCES ? tables[0]?.tabName ?? "" : source}
        presentations={settings.presentations}
        presets={presentationPresets}
        cards={settings.cards}
        cardsIndex={indexKey}
        nextPosition={Math.max(0, ...ownViews.map((view) => view.position + 1))}
        onSave={async (view) => { const saved = await settings.saveSavedView(view); setTabName(windowSelectKey(saved.id)); return saved }}
        onDelete={async (id) => { await settings.removeSavedView(id); setTabName(embed ? "" : ALL_TABS) }}
        allowStats
      />}
      {guideOpen && <IndexGuide open onClose={() => setGuideOpen(false)} />}
      {noticesView}
      {choiceView}
      {/* eslint-disable react-hooks/refs -- la carte lit les cases comme le tableau les montre, saisies enregistrées comprises */}
      {cardPeek && peekCard && <Dialog open onOpenChange={(open) => { if (!open) setCardPeek(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle className="font-display text-xl">{nameOf(cardPeek.row).replace(/<[^>]+>/g, "").trim() || "Sans nom"}</DialogTitle><DialogDescription>{peekCard.name}</DialogDescription></DialogHeader>
          <div className="mx-auto w-full min-w-0" style={{ maxWidth: peekCard.width === "full" && !peekCard.widthRem ? undefined : `${Math.max(16, peekCard.widthRem ?? 22)}rem` }}><IndexCard card={peekCard} row={cardRow(cardPeek.row)} onOpen={() => { setCardPeek(null); openRow(cardPeek.row) }} href={rowHref(cardPeek.row)} /></div>
        </DialogContent>
      </Dialog>}
      {/* eslint-enable react-hooks/refs */}
    </section>
    </CardActionsContext.Provider>
    </ReferenceScopeProvider>
  )
}

/**
 * Une fiche ou une campagne à la corbeille, montrée à un administrateur dans son index pour
 * faire le tri : la restaurer, ou la supprimer pour de bon (sa ligne quitte Google Sheets).
 */
function TrashedRowActions({ kind, id, ownerName, ask, onDone }: {
  kind: "character" | "campaign"
  id: string
  ownerName: string
  ask: (title: string, options: Array<{ value: string; label: string }>, description?: string) => Promise<string | null>
  onDone: (message: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  async function run(method: "PATCH" | "DELETE") {
    if (method === "DELETE") {
      const label = kind === "character" ? "ce personnage" : "cette campagne"
      const answer = await ask(`Supprimer ${label} définitivement ?`, [{ value: "delete", label: "Supprimer définitivement" }, { value: "", label: "Annuler" }], "Sa ligne est retirée de Google Sheets. Cette suppression ne se défait pas depuis Eraser (l’historique des versions de Google Sheets la garde).")
      if (answer !== "delete") return
    }
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/admin/trash", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id }) })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "L’opération a échoué.")
      onDone(method === "PATCH" ? "Restauré." : "Supprimé définitivement.")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L’opération a échoué.")
    } finally {
      setPending(false)
    }
  }
  return <div className="flex min-w-0 flex-col gap-1 px-2 py-1.5">
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">À la corbeille</span>
      <span className="truncate text-xs text-muted-foreground">{ownerName}</span>
    </div>
    <div className="flex flex-wrap gap-1.5">
      <Button type="button" size="xs" variant="outline" disabled={pending} onClick={() => void run("PATCH")}>Restaurer</Button>
      <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={() => void run("DELETE")} className="text-destructive hover:text-destructive">{pending ? <LoaderCircle className="animate-spin" /> : null}Supprimer définitivement</Button>
    </div>
    {error && <p className="text-[11px] text-destructive">{error}</p>}
  </div>
}
