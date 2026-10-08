"use client"

import dynamic from "next/dynamic"
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRememberedSearch } from "@/hooks/use-remembered-search"
import { usePathname, useRouter } from "next/navigation"
import { ArrowRightLeft, CircleHelp, ExternalLink, FileText, Filter, Link2, LoaderCircle, Pencil, Plus, RefreshCw, Search, Settings2, SpellCheck, Trash2 } from "lucide-react"

import { chooseCampaign, copyToClipboard, DrawRowButton, rowCard, sendToCampaignChat, useChoiceDialog, useIndexNotices } from "@/components/eraser/index-action-ui"
import { announceWorldIndexChange, onWorldIndexChange } from "@/lib/world-index-events"
import { forgetWorldIndexData, indexGridColumn, IndexEntryForm, loadWorldIndexData, type IndexFieldProps, type IndexFormField, type LoadedWorldIndex } from "@/components/eraser/index-cells"
import { createRowEngine } from "@/components/eraser/index-row-engine"
import { IndexRowSheet } from "@/components/eraser/index-row-sheet"
import { OwnerSelector } from "@/components/eraser/owner-selector"
import { IndexViewDialog, useIndexSettings } from "@/components/eraser/index-views"
import { IndexCardGrid, IndexDisplayControls, NoCardsYet, isCardChoice, isIndexDisplay, type CardRowSource, type IndexDisplay } from "@/components/eraser/index-card"
import { pickCard, tabCardsOf } from "@/lib/index-cards"
import { ALL_SOURCES, matchesView, viewIdOfSelectKey, viewSelectKey } from "@/lib/index-views"
import { layoutPlaces, tabLayout } from "@/lib/index-layouts"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from "@/components/ui/context-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { IN_PLACE_ATTRIBUTE, replaceAppUrl, URL_CHANGE_EVENT } from "@/components/eraser/app-tabs"
import { IndexTabPicker, useIndexTabParam } from "@/components/eraser/index-tab-picker"
import { runActionButton, type ActionRuntime } from "@/lib/index-actions"
import { choiceCorrection, columnTypeLabel, computeRollup, isComputedSpec, isGridSpec, isRichSpec, isSheetSpec, normalizeSpec, type ActionButton, type IndexColumnSpec } from "@/lib/index-columns"
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
  type WorldIndexLink,
} from "@/lib/world-index-definitions"
import type { WorldIndexData, WorldIndexRow, WorldIndexRowRef, WorldIndexTable } from "@/lib/world-indexes"
import { ReferenceScopeProvider } from "@/components/eraser/reference-menu"

// Les fenêtres (« Modifier », guide, fiche d'une créature) ne sont chargées qu'à leur ouverture : la page s'affiche plus vite.
const IndexEditor = dynamic(() => import("@/components/eraser/index-editor").then((module) => module.IndexEditor), { ssr: false })
const IndexGuide = dynamic(() => import("@/components/eraser/index-guide").then((module) => module.IndexGuide), { ssr: false })
const CreatureSheetDialog = dynamic(() => import("@/components/eraser/creature-sheet").then((module) => module.CreatureSheetDialog), { ssr: false })


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

/** L'onglet de la vue « Tout » est une colonne comme une autre, de type Onglet. */
const tabSpec: IndexColumnSpec = { kind: "tab" }

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

function titleOf(index: WorldIndexKey) {
  return isBuiltinWorldIndexKey(index) ? worldIndexDefinitions[index].title : "index lié"
}

/** Les phrases qui expliquent, sous le tableau, quelles colonnes se remplissent seules. */
function linkHints(links: WorldIndexLink[], index: WorldIndexKey, tab: string) {
  return links.flatMap(([left, right]) => {
    for (const [end, other] of [[left, right], [right, left]] as const) {
      if (!linkEndCovers(end, index, tab)) continue
      const where = linkEndCovers(other, index, tab) ? "" : other.index === index ? ` (onglet ${other.tab})` : ` (${titleOf(other.index)})`
      return [`« ${end.column} » ↔ « ${other.column} »${where}`]
    }
    return []
  })
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

type WorldIndexManagerProps = { indexKey: WorldIndexKey; initialData: WorldIndexData | null; initialError: string; nameOpensDetails?: boolean; embed?: IndexEmbed }

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
function WorldIndexView({ indexKey, initialData, initialError, nameOpensDetails = false, embed }: WorldIndexManagerProps) {
  const [data, setData] = useState(initialData)
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
  const [editorMode, setEditorMode] = useState<"columns" | "cards">("columns")
  const [viewDialog, setViewDialog] = useState<"new" | "edit" | null>(null)
  const activeView = useMemo(() => { const id = viewIdOfSelectKey(tabName); return id ? settings.views.find((view) => view.id === id) ?? null : null }, [settings.views, tabName])
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
  const tabDefinition = useMemo(() => definition.tabs.find((tab) => tab.name === table?.tabName) ?? definition.tabs[0] ?? { name: "", itemLabel: "une ligne", headers: [], widths: [], idPrefix: "IDX" }, [definition, table])
  // Le type de chaque colonne, par onglet et en-tête : celui du schéma envoyé par le
  // serveur (colonnes renommées, types choisis dans « Modifier »), sinon le type par défaut.
  const specOf = useCallback((tab: string, header: string) => data?.columns[tab]?.find((column) => foldName(column.header) === foldName(header))?.spec ?? worldColumnSpec(indexKey, tab, header), [data, indexKey])
  const links = useMemo(() => data?.links ?? [], [data])
  const tableByName = useMemo(() => new Map(tables.map((candidate) => [candidate.tabName, candidate])), [tables])
  // Un index d'entités : le nom mène à la page de la ligne, « Ajouter » à sa page de création.
  const entity = definition.entity
  /** La colonne du nom d'une ligne de cet index : celle que l'index d'entités désigne (« Rang » des bonus de rang), sinon « Nom ». */
  const ownNameColumn = useCallback((headers: string[]) => {
    const own = entity?.nameHeader ? headers.findIndex((header) => foldName(header) === foldName(entity.nameHeader)) : -1
    return own >= 0 ? own : nameColumnOf(headers)
  }, [entity])

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

  /** Le nom d'une ligne, quelle que soit sa colonne (« Nom », « Nom du PNJ »…). */
  const nameOf = useCallback((rowKey: string) => {
    const found = locate(rowKey)
    const column = found ? ownNameColumn(found.table.headers) : -1
    return found && column >= 0 ? rawOf(rowKey, found.table.headers[column]).replace(/<[^>]+>/g, "") : ""
  }, [locate, ownNameColumn, rawOf])

  /** Une ligne telle que la page qui accueille la vue intégrée la voit. */
  const embedRow = useCallback((rowKey: string): IndexEmbedRow => ({
    rowKey,
    id: rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim(),
    name: nameOf(rowKey),
    cell: (header) => rawOf(rowKey, header),
  }), [nameOf, rawOf])

  /** Ouvre une ligne : sa page (personnage, campagne, classe) ou sa fiche. */
  const openRow = useCallback((rowKey: string) => {
    const id = rawOf(rowKey, "ID").replace(/<[^>]+>/g, "").trim()
    if (entity?.nameHref && id) router.push(entity.nameHref.replace("{id}", encodeURIComponent(id)))
    else setDetails(rowKey)
  }, [entity, rawOf, router])
  /**
   * Le portrait d'un personnage, la bannière d'une campagne : importés comme depuis la
   * fiche ou le tableau de bord (même adresse, même stockage), pas comme une image d'index.
   */
  const entityImage = useMemo(() => {
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
  // « ?ligne=ID » (clic droit sur un nom › nouvel onglet, fenêtre ou ici) ouvre la fiche de la ligne.
  const [wantedRow, setWantedRow] = useState<string | null>(null)
  useEffect(() => {
    if (embed) return
    const read = () => setWantedRow(new URLSearchParams(window.location.search).get("ligne"))
    const timer = window.setTimeout(read, 0)
    window.addEventListener(URL_CHANGE_EVENT, read)
    window.addEventListener("popstate", read)
    return () => { window.clearTimeout(timer); window.removeEventListener(URL_CHANGE_EVENT, read); window.removeEventListener("popstate", read) }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- une vue intégrée le reste pour toute sa vie
  }, [])
  useEffect(() => {
    if (!wantedRow || !tables.length) return
    const found = tables.flatMap((candidate) => {
      const column = candidate.headers.findIndex((header) => foldName(header) === "id")
      const row = column < 0 ? undefined : candidate.rows.find((item) => (item.values[column] ?? "").replace(/<[^>]+>/g, "").trim() === wantedRow)
      return row ? [rowKeyOf(candidate.tabName, row.rowNumber)] : []
    })[0]
    if (!found) return
    // Lue une fois : fermer la fiche ne la rouvre pas, l'adresse redevient celle de l'index.
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href)
      url.searchParams.delete("ligne")
      replaceAppUrl(url.pathname + url.search, { record: false })
      setWantedRow(null)
      setDetails(found)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [tables, wantedRow])
  const embedAdd = embed?.onAdd
  const startAdding = useCallback(() => {
    if (embedAdd) embedAdd()
    else if (entity?.addHref) router.push(entity.addHref)
    else setCreating(true)
  }, [embedAdd, entity, router])
  /** Une ligne ajoutée depuis la vue intégrée reçoit ce que la page impose (le Type des passifs). */
  const withAddDefaults = useCallback((headers: string[], values: string[]) => headers.map((header, index) => values[index] || (Object.entries(embed?.addDefaults ?? {}).find(([key]) => foldName(key) === foldName(header))?.[1] ?? "")), [embed])

  // Les colonnes remplies par la fiche d'une créature restent dans Sheets, hors du tableau.
  // Ailleurs, toutes les colonnes sont dans la liste : la grille cache les masquées (et les
  // anciennes « Formulaire seulement ») et les montre d'un clic.
  const hiddenInEmbed = useMemo(() => new Set((embed?.hiddenColumns ?? []).map(foldName)), [embed])
  const visible = useMemo(() => table ? (data?.columns[table.tabName] ?? []).filter((column) => (nameOpensDetails ? isGridSpec(column.spec) : column.spec.kind !== "archived") && !hiddenInEmbed.has(foldName(column.header))).map((column) => column.header) : [], [data, hiddenInEmbed, nameOpensDetails, table])

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
    }
  }, [applyData, ask, commitCell, origin, data, drawCell, engine, indexKey, locate, nameOf, notify, ownNameColumn, pathOf, rawOf, relationOf, router, rowTargetOf, specOf, tables, valueOf])

  const runButton = useCallback(async (rowKey: string, button: ActionButton) => { await runActionButton(button, runtimeFor(rowKey)) }, [runtimeFor])

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
    if (spanning) list.splice(1, 0, { key: TAB_COLUMN, label: "Onglet", width: 180, custom: true, typeLabel: columnTypeLabel(tabSpec) })
    // Les colonnes propres à la page qui accueille la vue (« Classes et rangs »).
    for (const extra of embed?.extraColumns ?? []) {
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
  }, [ask, busy, commitCell, computed, drawCell, embed, engine, entity, entityImage, extras, extrasOf, notify, openRow, rawOf, rowHref, runButton, sortTabs, spanning, specOf, tabDefinition, table, valueOf, visible])
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
  const displayedRows = useMemo(() => {
    const folded = foldName(deferredQuery)
    const rows = viewTables.flatMap((owner) => owner.rows
      .filter((row) => !activeView || matchesView(activeView, (header) => { const column = columnIndexOf(owner, header); return column >= 0 ? row.values[column] ?? "" : "" }))
      // Vue intégrée : seulement les lignes que la page a choisies (onglets-fenêtres compris).
      .filter((row) => !embed || embed.rowFilter((header) => { const column = columnIndexOf(owner, header); return column >= 0 ? row.values[column] ?? "" : "" }))
      // Un onglet de rangement : les lignes qui portent sa valeur (et celles du vrai onglet du même nom).
      .filter((row) => !activeSort || foldName(owner.tabName) === foldName(activeSort.value) || activeSort.columns.some((header) => { const column = columnIndexOf(owner, header); return column >= 0 && foldName((row.values[column] ?? "").replace(/<[^>]+>/g, "")) === foldName(activeSort.value) }))
      .filter((row) => !folded || (haystacks.get(row) ?? "").includes(folded) || (extras && [OWNER_COLUMN, LINKS_COLUMN].some((key) => foldName(extraText(rowKeyOf(owner.tabName, row.rowNumber), key)).includes(folded))))
      .map((row) => ({ key: rowKeyOf(owner.tabName, row.rowNumber), rowNumber: row.rowNumber, tabName: owner.tabName })))
    if (!sort) return rows.map(({ key, rowNumber }) => ({ key, rowNumber }))
    // Le tri lit ce que montre la case (résultat d'une formule, choix bien écrit, nom actuel
    // d'une référence, valeur d'un nombre), pas le texte brut de Sheets. Vides en bas.
    const extra = sort.column === OWNER_COLUMN || sort.column === LINKS_COLUMN || sort.column === TAB_COLUMN
    // eslint-disable-next-line react-hooks/refs -- le tri lit les cases comme le tableau les montre, saisie en cours comprise
    const sorted = sortByIndexKey(rows, (row) => indexSortKey(
      valueOf(row.key, sort.column),
      extra ? undefined : specOf(row.tabName, sort.column),
      { resolveReference: shownReferenceText },
    ), sort.direction === "asc" ? 1 : -1)
    return sorted.map(({ key, rowNumber }) => ({ key, rowNumber }))
  }, [activeSort, activeView, deferredQuery, embed, extraText, extras, haystacks, sort, specOf, valueOf, viewTables])

  // La colonne « Onglet » de la vue « Tout ». Stable : les lignes ne se redessinent pas pour rien.
  const moveRow = useRef(mutate)
  useLayoutEffect(() => { moveRow.current = mutate; mutateRef.current = mutate; mutateRowsRef.current = mutateRows })
  const renderTabCell = useCallback((rowKey: string, columnKey: string) => {
    const extra = embed?.extraColumns?.find((column) => column.key === columnKey)
    if (extra) return extra.render(embedRow(rowKey), true)
    const { tabName: rowTab } = parseRowKey(rowKey)
    return <Select value={rowTab} onValueChange={(target) => { if (target !== rowTab) void moveRow.current("move", [rowKey], "move", { toTab: target }) }} disabled={busy}>
      <SelectTrigger size="sm" aria-label="Onglet" title="Changer d’onglet" className="h-8 w-full border-transparent bg-transparent px-2 text-muted-foreground shadow-none hover:border-input dark:bg-transparent"><SelectValue /></SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={rowTab}>{rowTab}</SelectItem>
        {moveTargetsOf(rowTab).map((target) => <SelectItem key={target} value={target}>{target}</SelectItem>)}
      </SelectContent>
    </Select>
  }, [busy, embed, embedRow, moveTargetsOf])

  const detailsFound = details !== null ? locate(details) : null

  // La vue en cartes : la carte de l'onglet affiché ; dans « Tout », chaque ligne prend celle de son onglet.
  const tabCards = table ? tabCardsOf(settings.cards, indexKey, table.tabName) : null
  const shownCard = tabCards ? pickCard(tabCards, cardChoice) : null
  const cardOf = useCallback((rowKey: string) => {
    const entry = tabCardsOf(settings.cards, indexKey, parseRowKey(rowKey).tabName)
    return pickCard(entry, cardChoice) ?? shownCard!
  }, [cardChoice, indexKey, settings.cards, shownCard])
  const cardRow = useCallback((rowKey: string): CardRowSource => ({
    value: (header) => valueOf(rowKey, header),
    spec: (header) => { const found = locate(rowKey); return found ? specOf(found.table.tabName, header) : undefined },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- une ligne réécrite depuis sa fiche redessine ses cartes
  }), [locate, specOf, valueOf, rowVersions])
  // « {Prix} » écrit dans une case de cet index : le menu « { » propose les colonnes de la ligne.
  const referenceTab = detailsFound?.table.tabName ?? table?.tabName
  const referenceScope = { index: indexKey, tab: referenceTab }
  const hints = table ? linkHints(links, indexKey, table.tabName) : []
  const formTable = spanning ? tableByName.get(creatingTab) ?? table : table
  const formDefinition = definition.tabs.find((tab) => tab.name === formTable?.tabName) ?? tabDefinition
  // Le formulaire d'ajout montre les colonnes du formulaire (« Tableau et formulaire »,
  // « Formulaire seulement »), sauf l'identifiant (généré), les colonnes calculées et,
  // pour les créatures, ce qui se remplit dans leur fiche.
  const formFields: IndexFormField[] = formTable ? (data?.columns[formTable.tabName] ?? [])
    .flatMap(({ header, spec }) => {
      if (!(isSheetSpec(spec) || layoutPlaces(tabLayout(settings.layouts, formTable.tabName, "form"), header)) || ["id", "lookup", "rollup", "formula", "actions", "random", "auto-links", "ranked-links", "tab"].includes(spec.kind)) return []
      if (nameOpensDetails && (!isGridSpec(spec) || foldName(header) === "extension")) return []
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

  // La fiche d'une ligne (index sans fiche dédiée) : tous ses champs du formulaire.
  // Une colonne hors fiche (ancien « Tableau seulement ») y vient quand sa mise en page la place.
  const sheetLayout = detailsFound ? tabLayout(settings.layouts, detailsFound.table.tabName, "form") : null
  /* eslint-disable react-hooks/refs -- la fiche lit les cases comme le tableau les montre, saisies enregistrées comprises */
  const sheetFields = detailsFound && !nameOpensDetails ? (data?.columns[detailsFound.table.tabName] ?? [])
    .filter((column) => (isSheetSpec(column.spec) || layoutPlaces(sheetLayout, column.header)) && !["auto-links", "ranked-links", "tab"].includes(column.spec.kind))
    .map((column) => ({ key: column.header, label: column.header, spec: column.spec, value: details === null ? savedCell(detailsFound, column.header) : rawOf(details, column.header), long: isLongColumn(column.header) }))
    // Les colonnes propres à la page qui accueille la vue, dessinées par elle.
    .concat((embed?.extraColumns ?? []).map((extra) => ({ key: `__embed:${extra.key}`, label: extra.label, spec: { kind: "ranked-links" } as IndexColumnSpec, value: "", long: true }))) : []
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
  /** Le tableau derrière la fiche montre tout de suite ce qui vient d'y être enregistré. */
  function bumpRow(rowKey: string) {
    setRowVersions((current) => ({ ...current, [rowKey]: (current[rowKey] ?? 0) + 1 }))
  }
  // Précédente, « Aller à… », Suivante : les lignes du tableau, dans l'ordre affiché.
  const sheetNavigation = { rows: displayedRows.map((row) => row.key), labelOf: nameOf, onGo: (rowKey: string) => { setSheetError(""); setDetails(rowKey) } }

  // Colonnes qui peuvent pondérer « Tirer » : les nombres et les jauges.
  const weightColumns = table ? (data?.columns[table.tabName] ?? []).filter((column) => ["number", "gauge", "formula", "rollup"].includes(column.spec.kind)).map((column) => column.header) : []

  async function openEditor(mode: "columns" | "cards" = "columns") {
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

  return (
    <ReferenceScopeProvider scope={referenceScope}>
    <section className={`${embed ? "" : "mt-4 "}flex flex-col gap-3`} {...(embed ? {} : { [IN_PLACE_ATTRIBUTE]: pathname })}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        {/* Intégrée : la vue de la page, puis les onglets-fenêtres de l'index (combinés à elle). */}
        {embed && settings.views.length > 0 && <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Vue
          <span className="flex items-center gap-1">
            <NativeSelect value={activeView ? viewSelectKey(activeView.id) : ""} onChange={(event) => { setTabName(event.target.value); setCreating(false); setDetails(null) }} disabled={busy} className="h-9 min-w-44 text-foreground">
              <NativeSelectOption value="">{embed.label}</NativeSelectOption>
              {settings.views.map((view) => <NativeSelectOption key={view.id} value={viewSelectKey(view.id)}>⧉ {view.name}</NativeSelectOption>)}
            </NativeSelect>
            {activeView && <Button type="button" variant="ghost" size="icon" onClick={() => setViewDialog("edit")} title="Modifier cet onglet-fenêtre" aria-label="Modifier cet onglet-fenêtre"><Pencil /></Button>}
          </span>
        </label>}
        {!embed && (tables.length > 1 || settings.views.length > 0 || sortTabs.length > 0) && <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Onglet
          <span className="flex items-center gap-1">
            <IndexTabPicker
              value={activeView ? viewSelectKey(activeView.id) : activeSort ? `${SORT_PREFIX}${activeSort.value}` : showAll ? ALL_TABS : table?.tabName ?? ""}
              options={[
                ...(canShowAll ? [{ value: ALL_TABS, label: "Tout", detail: String(allTables.reduce((total, candidate) => total + candidate.rows.length, 0)) }] : []),
                // Un vrai onglet qui porte le nom d'une valeur de rangement est réuni à son onglet de rangement.
                ...tables.filter((candidate) => !absorbed.has(foldName(candidate.tabName))).map((candidate) => ({ value: candidate.tabName, label: candidate.tabName, detail: String(candidate.rows.length) })),
                ...sortTabs.map((entry) => ({ value: `${SORT_PREFIX}${entry.value}`, label: entry.value, detail: String(entry.count) })),
                ...settings.views.map((view) => ({ value: viewSelectKey(view.id), label: `⧉ ${view.name}`, group: "Onglets-fenêtres" })),
              ]}
              onChange={(value) => { setTabName(value); setCreating(false); setDetails(null) }}
              hrefOf={tabHref}
              tabLabel={(option) => option.value === ALL_TABS ? definition.title : `${definition.title} · ${option.label.replace(/^⧉ /, "")}`}
              disabled={busy}
              className="text-foreground"
            />
            {activeView && <Button type="button" variant="ghost" size="icon" onClick={() => setViewDialog("edit")} title="Modifier cet onglet-fenêtre" aria-label="Modifier cet onglet-fenêtre"><Pencil /></Button>}
          </span>
        </label>}
        {table && embed?.query === undefined && <div className="relative min-w-0 lg:max-w-sm lg:flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={display === "cards" ? "Rechercher dans les cartes…" : "Rechercher dans le tableau…"} className="pl-9" /></div>}
        {table && <IndexDisplayControls display={display} onDisplay={setDisplay} cards={tabCards?.cards ?? []} card={shownCard} onPick={setCardChoice} onEdit={() => void openEditor("cards")} disabled={busy} />}
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          {data?.webViewLink && <Button asChild variant="ghost"><a href={data.webViewLink} target="_blank" rel="noreferrer">Ouvrir dans Sheets<ExternalLink /></a></Button>}
          {corrections > 0 && <Button type="button" variant="outline" onClick={() => void correct()} disabled={busy} title="Réécrit les valeurs de liste mal orthographiées (« Aggressif » → « Agressif »). Les valeurs hors liste ne sont pas touchées.">{pending === "correct" ? <LoaderCircle className="animate-spin" /> : <SpellCheck />}Corriger {corrections} faute{corrections > 1 ? "s" : ""}</Button>}
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={busy}>{pending === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
          {table && <DrawRowButton
            rows={displayedRows}
            weightColumns={weightColumns}
            weightOf={(rowKey, header) => { const found = locate(rowKey); return found ? numericCellValue(valueOf(rowKey, header), specOf(found.table.tabName, header)) : null }}
            nameOf={nameOf}
            onOpen={openRow}
            disabled={busy}
          />}
          <Button type="button" variant="outline" onClick={() => setViewDialog("new")} disabled={busy || !tables.length} title="Un onglet qui réaffiche les lignes répondant à des conditions, sans les copier"><Filter />Onglet-fenêtre</Button>
          <Button type="button" variant="outline" onClick={() => void openEditor("columns")} disabled={busy} title="Colonnes, types, réglages, onglets, mises en page et cartes de cet index">{pending === "editor" ? <LoaderCircle className="animate-spin" /> : <Settings2 />}Modifier</Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => setGuideOpen(true)} title="Guide des colonnes : types, formules, boutons, aléatoire" aria-label="Guide des colonnes"><CircleHelp /></Button>
          <Button type="button" onClick={startAdding} disabled={!table || busy}><Plus />{embed?.addLabel ?? `Ajouter ${spanning ? definition.itemLabel ?? tabDefinition.itemLabel : tabDefinition.itemLabel}`}</Button>
        </div>
      </div>

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
        initialMode={editorMode}
        initialTab={table?.tabName}
      />}

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}

      {hints.length > 0 && <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Link2 className="size-3.5 text-primary" />
        Colonnes liées, qui se complètent d’elles-mêmes (noms séparés par des virgules) : {hints.join(" · ")}
      </p>}

      {creating && formTable && <IndexEntryForm
        key={formTable.tabName}
        title={`Ajouter ${formDefinition.itemLabel}`}
        fields={formFields}
        layout={tabLayout(settings.layouts, formTable.tabName, "form")}
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

      {table && display === "cards" ? (shownCard
        ? <IndexCardGrid
          card={shownCard}
          cardOf={spanning ? cardOf : undefined}
          rows={displayedRows}
          rowSource={cardRow}
          onOpen={openRow}
          hrefOf={rowHref}
          empty={activeView ? "Aucune ligne ne remplit les conditions de cet onglet-fenêtre." : viewTables.some((owner) => owner.rows.length) ? "Aucune ligne ne correspond à la recherche." : `Cet onglet est vide. Ajoute ${tabDefinition.itemLabel} pour commencer.`}
        />
        : <NoCardsYet tabName={table.tabName} onCreate={() => void openEditor("cards")} />
      ) : table ? (
        <SheetGrid
          layoutKey={`eraser:world-index:grid:${storeKey}:${activeView ? `fenetre:${activeView.id}` : activeSort ? `rangement:${foldName(activeSort.value)}` : showAll ? "tout" : table.tabName}`}
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
          empty={activeView ? "Aucune ligne ne remplit les conditions de cet onglet-fenêtre." : viewTables.some((owner) => owner.rows.length) ? "Aucune ligne ne correspond à la recherche." : `Ce tableau est vide. Ajoute ${tabDefinition.itemLabel} pour commencer.`}
        />
      ) : !error ? <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Le classeur « {definition.sheetName} » n’a pas pu être préparé.</div> : null}

      {/* Clé sur la ligne seulement : un rechargement de l'index pendant que la fiche est
          ouverte ne la remonte pas (champs en cours gardés, sorts non relus). */}
      {nameOpensDetails && detailsFound && <CreatureSheetDialog
        key={details}
        open
        headers={detailsFound.table.headers}
        values={detailsFound.row.values}
        html={detailsFound.row.html}
        onClose={() => setDetails(null)}
        onSave={async (fields, previous) => {
          if (!Object.keys(fields).length) return
          // La créature désignée par son identifiant ; ce que la fiche montrait de chaque champ fait
          // refuser l'enregistrement si l'un d'eux a changé ailleurs entre-temps.
          const target = details === null ? null : rowTargetOf(details)
          if (!target) throw new Error("Cette ligne n’existe plus : actualise le tableau.")
          const payload = await post({ action: "update-fields", tabName: target.tabName, rowNumber: target.rowNumber, rowId: target.id, rowName: target.name, fields, previous })
          if (payload.data) applyData(payload.data, payload.seq)
        }}
      />}

      {!nameOpensDetails && detailsFound && details !== null && <IndexRowSheet
        open
        rowKey={details}
        title={savedCell(detailsFound, detailsFound.table.headers[ownNameColumn(detailsFound.table.headers)] ?? "").replace(/<[^>]+>/g, "")}
        subtitle={`${definition.title} · ${detailsFound.table.tabName}`}
        fields={sheetFields}
        layout={sheetLayout}
        rowFor={sheetRow}
        renderField={(field) => {
          const extra = field.key.startsWith("__embed:") ? embed?.extraColumns?.find((column) => `__embed:${column.key}` === field.key) : undefined
          return extra ? <div className="grid content-start gap-1 text-xs font-semibold md:col-span-2">{extra.label}{extra.render(embedRow(details), false)}</div> : undefined
        }}
        error={sheetError}
        navigation={sheetNavigation}
        onSave={saveSheet}
        onClose={() => { setDetails(null); setSheetError("") }}
      />}
      {viewDialog && <IndexViewDialog
        open
        onOpenChange={(open) => { if (!open) setViewDialog(null) }}
        index={indexKey}
        view={viewDialog === "edit" ? activeView : null}
        sources={[{ value: ALL_SOURCES, label: "Tous les onglets de l’index" }, ...tables.map((candidate) => ({ value: candidate.tabName, label: `L’onglet « ${candidate.tabName} »` }))]}
        columnsOf={(source) => [...new Set((source === ALL_SOURCES ? tables : tables.filter((candidate) => candidate.tabName === source)).flatMap((candidate) => (data?.columns[candidate.tabName] ?? []).map((column) => column.header)).filter((header) => !/^id$/i.test(header)))]}
        onSave={async (view) => { const id = await settings.saveView(view); setTabName(viewSelectKey(id)); return id }}
        onDelete={async (id) => { await settings.deleteView(id); setTabName(embed ? "" : ALL_TABS) }}
      />}
      {guideOpen && <IndexGuide open onClose={() => setGuideOpen(false)} />}
      {noticesView}
      {choiceView}
    </section>
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
