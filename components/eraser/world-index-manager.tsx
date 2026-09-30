"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightLeft, CircleHelp, ExternalLink, FileText, Link2, LoaderCircle, Plus, RefreshCw, Search, Settings2, SpellCheck } from "lucide-react"

import { CreatureSheetDialog } from "@/components/eraser/creature-sheet"
import { chooseCampaign, copyToClipboard, DrawRowButton, rowCard, sendToCampaignChat, useChoiceDialog, useIndexNotices } from "@/components/eraser/index-action-ui"
import { forgetWorldIndexData, indexGridColumn, IndexEntryForm, loadWorldIndexData, type IndexFieldProps, type IndexFormField, type LoadedWorldIndex } from "@/components/eraser/index-cells"
import { IndexEditor } from "@/components/eraser/index-editor"
import { IndexGuide } from "@/components/eraser/index-guide"
import { createRowEngine } from "@/components/eraser/index-row-engine"
import { IndexRowSheet } from "@/components/eraser/index-row-sheet"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from "@/components/ui/context-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { runActionButton, type ActionRuntime } from "@/lib/index-actions"
import { choiceCorrection, columnTypeLabel, computeRollup, isComputedSpec, isGridSpec, isRichSpec, isSheetSpec, normalizeSpec, type ActionButton, type IndexColumnSpec } from "@/lib/index-columns"
import { columnFormulaValue, numericCellValue } from "@/lib/index-formula"
import { cryptoRandom, drawRandom, drawText, type RandomCandidateRow } from "@/lib/index-random"
import { numberSortKey } from "@/lib/index-numbers"
import type { IndexEditorModel, SchemaOperation } from "@/lib/index-schema-shared"
import {
  foldName,
  isBuiltinWorldIndexKey,
  isLongColumn,
  isNameColumn,
  linkEndCovers,
  splitNames,
  worldColumnSpec,
  worldIndexDefinitions,
  type WorldIndexDefinition,
  type WorldIndexKey,
  type WorldIndexLink,
} from "@/lib/world-index-definitions"
import type { WorldIndexData, WorldIndexRow, WorldIndexTable } from "@/lib/world-indexes"

/** Le choix « Tout » de la liste des onglets : toutes les lignes de l'index ensemble. */
const ALL_TABS = "*"
/** Colonne propre à la vue « Tout » : l'onglet de chaque ligne, qu'on peut changer. */
const TAB_COLUMN = "__onglet"

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

function compareSortKeys(left: number | string, right: number | string) {
  if (typeof left === "number" && typeof right === "number") return left === right ? 0 : left < right ? -1 : 1
  return String(left).localeCompare(String(right), "fr", { numeric: true, sensitivity: "base" })
}

/** La colonne « Nom » d'un tableau : c'est par elle que les relations retrouvent une ligne. */
function nameColumnOf(headers: string[]) {
  const exact = headers.findIndex((header) => foldName(header) === "nom")
  return exact >= 0 ? exact : headers.findIndex((header) => isNameColumn(header))
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

type WorldIndexManagerProps = { indexKey: WorldIndexKey; initialData: WorldIndexData | null; initialError: string; nameOpensDetails?: boolean }

/**
 * Les pages d'index rendent ce composant au même endroit de l'arbre : sans clé,
 * React le réutiliserait d'une page à l'autre et garderait l'état de la première
 * visitée (ses données, son onglet, son tri). La clé repart de zéro à chaque index.
 */
export function WorldIndexManager(props: WorldIndexManagerProps) {
  return <WorldIndexView key={props.indexKey} {...props} />
}

/**
 * Tableur d'un index du monde (créatures, lieux, religions, peuples, langues), branché
 * sur son classeur Google Sheets. Les colonnes liées d'un index à l'autre se complètent
 * côté serveur ; le tableau se recharge quand un lien a touché l'index affiché.
 */
function WorldIndexView({ indexKey, initialData, initialError, nameOpensDetails = false }: WorldIndexManagerProps) {
  const [data, setData] = useState(initialData)
  const definition = useMemo(() => data?.definition ?? fallbackDefinition(indexKey), [data, indexKey])
  // Plusieurs onglets : la liste s'ouvre sur « Tout ».
  const [tabName, setTabName] = usePersistentState(`eraser:world-index:${indexKey}:view`, ALL_TABS, (value): value is string => typeof value === "string")
  const [pending, setPending] = useState("")
  const [error, setError] = useState(initialError)
  const [saving, setSaving] = useState(0)
  const [creating, setCreating] = useState(false)
  const [creatingTab, setCreatingTab] = useState(definition.tabs[0]?.name ?? "")
  const [editor, setEditor] = useState<IndexEditorModel | null>(null)
  const [editorError, setEditorError] = useState("")
  const [version, setVersion] = useState(0)
  const [query, setQuery] = useState("")
  const [details, setDetails] = useState<string | null>(null)
  const [sort, setSort] = usePersistentState<SheetGridSort>(`eraser:world-index:${indexKey}:sort`, null, isValidSort)
  const localEdits = useRef<Record<string, string>>({})
  const engineRef = useRef<ReturnType<typeof createRowEngine> | null>(null)
  const router = useRouter()
  const { notify, view: noticesView } = useIndexNotices()
  const { ask, view: choiceView } = useChoiceDialog()
  // Le hasard des formules reste le même jusqu'à « Actualiser ».
  const [seed, setSeed] = useState(() => `${indexKey}:${Date.now()}`)
  const [sheetPending, setSheetPending] = useState(false)
  const [sheetError, setSheetError] = useState("")
  const [guideOpen, setGuideOpen] = useState(false)
  // Un lien « ?q=… » (bouton « Ouvrir la ligne liée ») ouvre l'index filtré sur ce nom.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q")
    // L'adresse n'est connue qu'une fois la page affichée : la lire au rendu ferait différer le serveur et le navigateur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial) setQuery(initial)
  }, [])

  const tables = useMemo(() => data?.tables ?? [], [data])
  const selectedTable = tables.find((candidate) => candidate.tabName === tabName)
  // « Tout » n'a de sens que si les onglets ont les mêmes colonnes : les lieux, pas les religions.
  const canShowAll = useMemo(() => {
    const signature = (tab: string) => (data?.columns[tab] ?? []).map((column) => foldName(column.header)).sort().join("|")
    return tables.length > 1 && tables.every((candidate) => signature(candidate.tabName) === signature(tables[0].tabName))
  }, [data, tables])
  const showAll = canShowAll && tables.length > 1 && !selectedTable
  const viewTables = useMemo(() => showAll ? tables : selectedTable ? [selectedTable] : tables.slice(0, 1), [selectedTable, showAll, tables])
  // Le premier tableau affiché donne les colonnes : les onglets d'un même index ont les mêmes.
  const table: WorldIndexTable | null = viewTables[0] ?? null
  const tabDefinition = useMemo(() => definition.tabs.find((tab) => tab.name === table?.tabName) ?? definition.tabs[0] ?? { name: "", itemLabel: "une ligne", headers: [], widths: [], idPrefix: "IDX" }, [definition, table])
  // Le type de chaque colonne, par onglet et en-tête : celui du schéma envoyé par le
  // serveur (colonnes renommées, types choisis dans « Modifier »), sinon le type par défaut.
  const specOf = useCallback((tab: string, header: string) => data?.columns[tab]?.find((column) => foldName(column.header) === foldName(header))?.spec ?? worldColumnSpec(indexKey, tab, header), [data, indexKey])
  const links = useMemo(() => data?.links ?? [], [data])
  const tableByName = useMemo(() => new Map(tables.map((candidate) => [candidate.tabName, candidate])), [tables])

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
    const remount = () => { if (seq < appliedSeq.current) return; localEdits.current = {}; setData(next); setVersion((current) => current + 1) }
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
    })
    const payload = (await response.json().catch(() => ({}))) as { data?: WorldIndexData; changed?: string[]; error?: string }
    if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
    return { ...payload, seq }
  }, [indexKey])

  const commitCell = useCallback(async (rowKey: string, columnKey: string, value: string) => {
    const found = locate(rowKey)
    const column = found ? columnIndexOf(found.table, columnKey) : -1
    if (!found || column < 0) return
    localEdits.current[`${rowKey}:${columnKey}`] = value
    engineRef.current?.invalidate()
    setSaving((current) => current + 1)
    try {
      const payload = await post({ action: "update-cell", tabName: found.table.tabName, rowNumber: found.row.rowNumber, column, html: value })
      setError("")
      if (payload.data) applyData(payload.data, payload.seq)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cette cellule n’a pas pu être enregistrée.")
    }
    setSaving((current) => current - 1)
  }, [applyData, locate, post])

  /** Une action sur des lignes, onglet par onglet : la vue « Tout » peut en mêler plusieurs. */
  async function mutate(action: string, rowKeys: string[], label: string, extra: Record<string, unknown> = {}) {
    setPending(label); setError("")
    try {
      const byTab = new Map<string, number[]>()
      for (const key of rowKeys) {
        const { tabName: rowTab, rowNumber } = parseRowKey(key)
        byTab.set(rowTab, [...byTab.get(rowTab) ?? [], rowNumber])
      }
      for (const [rowTab, rowNumbers] of byTab) {
        const payload = await post({ action, tabName: rowTab, rowNumbers, ...extra })
        if (payload.data) applyData(payload.data, payload.seq)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.")
    }
    setPending("")
  }

  async function addRow(targetTab: string, values: string[]) {
    setPending("add"); setError("")
    try {
      const payload = await post({ action: "add", tabName: targetTab, values })
      if (payload.data) applyData(payload.data, payload.seq)
      setCreating(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.")
    }
    setPending("")
  }

  async function refresh() {
    setPending("refresh"); setError("")
    const seq = ++requestSeq.current
    const response = await fetch(`/api/resources/world-indexes?key=${indexKey}&refresh=1`, { cache: "no-store" })
    const payload = (await response.json().catch(() => ({}))) as { data?: WorldIndexData; error?: string }
    setPending("")
    if (!response.ok || !payload.data) return setError(payload.error || "Actualisation impossible.")
    // Les formules au hasard (ALEA, DES…) sont retirées à chaque actualisation.
    setSeed(`${indexKey}:${Date.now()}`)
    applyData(payload.data, seq)
  }

  // Déplacer une ligne n'a de sens qu'entre onglets aux mêmes colonnes (les lieux).
  const moveTargetsOf = useCallback((fromTab: string) => {
    const signature = (headers: string[]) => [...headers].map(foldName).sort().join("|")
    const from = definition.tabs.find((tab) => tab.name === fromTab)
    if (!from) return []
    return definition.tabs.filter((tab) => tab.name !== fromTab && signature(tab.headers) === signature(from.headers)).map((tab) => tab.name)
  }, [definition])

  const busy = Boolean(pending)

  // Les colonnes remplies par la fiche d'une créature restent dans Sheets, hors du tableau.
  // Les colonnes masquées restent dans la liste : la grille les cache et les montre d'un clic.
  const visible = useMemo(() => table ? (data?.columns[table.tabName] ?? []).filter((column) => isGridSpec(column.spec)).map((column) => column.header) : [], [data, table])

  // Recherche, Agrégat, formules et tirages lisent d'autres index : chargés une fois pour la page.
  const [related, setRelated] = useState<Record<string, LoadedWorldIndex | null>>({})
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

  /** Ce qu'affiche une case : la valeur de Sheets, ou le résultat d'une colonne calculée (tri, recherche, copie). */
  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const found = locate(rowKey)
    if (found && columnKey !== TAB_COLUMN) {
      const spec = specOf(found.table.tabName, columnKey)
      if (isComputedSpec(spec) && spec.kind !== "auto-links" && spec.kind !== "actions") return engine.computedText(rowKey, columnKey, spec) ?? ""
    }
    return rawOf(rowKey, columnKey)
  }, [engine, locate, rawOf, specOf])

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
  const drawCell = useCallback(async (rowKey: string, header: string, spec: IndexColumnSpec, force = false) => {
    const settings = normalizeSpec(spec).random
    if (!settings) return null
    if (!force && settings.mode === "fixed" && rawOf(rowKey, header).trim()) return null
    const draw = drawRandom(settings, { random: cryptoRandom, row: engine.context(rowKey), rowsOf })
    if (draw.error) { notify(`${header} : ${draw.error}`, "error"); return null }
    const text = drawText(draw)
    await commitCell(rowKey, header, text)
    if (draw.detail) notify(`${header} : ${text} (${draw.detail})`)
    return text
  }, [commitCell, engine, notify, rawOf, rowsOf])

  // Les boutons d'une ligne : ce qu'ils peuvent toucher dans un index du monde.
  const mutateRef = useRef<(action: string, rowKeys: string[], label: string, extra?: Record<string, unknown>) => Promise<void>>(async () => undefined)
  const pathOf = useCallback((index: string) => isBuiltinWorldIndexKey(index) ? worldIndexDefinitions[index].path : `/ressources/index/${index}`, [])
  const runtimeFor = useCallback((rowKey: string): ActionRuntime => {
    const found = locate(rowKey)
    const tab = found?.table.tabName ?? ""
    const sheetFields = (data?.columns[tab] ?? []).filter((column) => isSheetSpec(column.spec) && !["id", "actions"].includes(column.spec.kind))
    return {
      row: () => engine.context(rowKey),
      cell: (header) => rawOf(rowKey, header),
      specOf: (header) => (data?.columns[tab] ?? []).some((column) => foldName(column.header) === foldName(header)) ? specOf(tab, header) : undefined,
      setCell: async (header, value) => {
        if (!found || columnIndexOf(found.table, header) < 0) throw new Error(`La colonne « ${header} » n’existe pas dans cet onglet.`)
        await commitCell(rowKey, header, value)
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
      roll: async (header) => drawCell(rowKey, header, specOf(tab, header), true),
      duplicate: () => mutateRef.current("duplicate", [rowKey], "duplicate"),
      remove: () => mutateRef.current("delete", [rowKey], "delete"),
      move: (target) => mutateRef.current("move", [rowKey], "move", { toTab: target }),
      create: async (index, targetTab, values) => {
        const target = index === indexKey ? { tables: tables as LoadedWorldIndex["tables"] } : await loadWorldIndexData(index as WorldIndexKey)
        const table = target?.tables.find((candidate) => !targetTab || candidate.tabName === targetTab) ?? target?.tables[0]
        if (!table) throw new Error("Cet index ou cet onglet est introuvable.")
        const row = table.headers.map((header) => Object.entries(values).find(([key]) => foldName(key) === foldName(header))?.[1] ?? "")
        const response = await fetch("/api/resources/world-indexes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: index, action: "add", tabName: table.tabName, values: row }) })
        const payload = (await response.json().catch(() => ({}))) as { data?: WorldIndexData; error?: string }
        if (!response.ok) throw new Error(payload.error || "La ligne n’a pas pu être créée.")
        forgetWorldIndexData(index as WorldIndexKey)
        if (index === indexKey && payload.data) applyData(payload.data, ++requestSeq.current)
        const name = row[nameColumnOf(table.headers)] ?? ""
        return { href: `${pathOf(index)}${name ? `?q=${encodeURIComponent(name)}` : ""}` }
      },
      copy: copyToClipboard,
      card: () => rowCard(rawOf(rowKey, "Nom").replace(/<[^>]+>/g, "") || "Sans nom", sheetFields.filter((column) => !isComputedSpec(column.spec) || column.spec.kind === "formula").map((column) => {
        const text = valueOf(rowKey, column.header).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        return { label: column.header, text }
      }).filter((field) => foldName(field.label) !== "nom")),
      chat: async (message, audience) => {
        const campaign = await chooseCampaign(ask, "chat")
        if (!campaign) throw new Error("Aucune campagne choisie : le message n’est pas parti.")
        await sendToCampaignChat(campaign, message, audience)
      },
    }
  }, [applyData, ask, commitCell, data, drawCell, engine, indexKey, locate, notify, pathOf, rawOf, relationOf, router, specOf, tables, valueOf])

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
        openForm: setDetails,
        computed,
        formula: (rowKey, columnKey, spec) => engine.formula(rowKey, columnKey, spec),
        gaugeMax: (rowKey, spec) => engine.gaugeMax(rowKey, spec),
        draw: async (rowKey, columnKey, spec) => { await drawCell(rowKey, columnKey, spec) },
        buttonVisible: (rowKey, button) => engine.buttonVisible(rowKey, button),
        runButton,
      },
    ))
    if (showAll) list.splice(1, 0, { key: TAB_COLUMN, label: "Onglet", width: 180, custom: true, typeLabel: columnTypeLabel(tabSpec) })
    return list
  }, [busy, commitCell, computed, drawCell, engine, runButton, showAll, specOf, tabDefinition, table, valueOf, visible])
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

  const displayedRows = useMemo(() => {
    const folded = foldName(query)
    const rows = viewTables.flatMap((owner) => owner.rows
      .filter((row) => !folded || row.values.some((value) => foldName(value).includes(folded)))
      .map((row) => {
        const column = sort ? (sort.column === TAB_COLUMN ? -1 : columnIndexOf(owner, sort.column)) : -1
        const text = sort?.column === TAB_COLUMN ? owner.tabName : column >= 0 ? row.values[column] ?? "" : ""
        // Un nombre se trie par sa valeur : 2 PO passe après 50 PC, 1 km après 800 m.
        const spec = sort && column >= 0 ? specOf(owner.tabName, sort.column) : null
        const sortValue: number | string = spec?.kind === "number" ? numberSortKey(text, spec.number ?? {}) : text
        return { key: rowKeyOf(owner.tabName, row.rowNumber), rowNumber: row.rowNumber, sortValue }
      }))
    const sorted = sort
      ? [...rows].sort((left, right) => compareSortKeys(left.sortValue, right.sortValue) * (sort.direction === "asc" ? 1 : -1))
      : rows
    return sorted.map(({ key, rowNumber }) => ({ key, rowNumber }))
  }, [query, sort, specOf, viewTables])

  // La colonne « Onglet » de la vue « Tout ». Stable : les lignes ne se redessinent pas pour rien.
  const moveRow = useRef(mutate)
  useLayoutEffect(() => { moveRow.current = mutate; mutateRef.current = mutate })
  const renderTabCell = useCallback((rowKey: string) => {
    const { tabName: rowTab } = parseRowKey(rowKey)
    return <Select value={rowTab} onValueChange={(target) => { if (target !== rowTab) void moveRow.current("move", [rowKey], "move", { toTab: target }) }} disabled={busy}>
      <SelectTrigger size="sm" aria-label="Onglet" title="Changer d’onglet" className="h-8 w-full border-transparent bg-transparent px-2 text-muted-foreground shadow-none hover:border-input dark:bg-transparent"><SelectValue /></SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={rowTab}>{rowTab}</SelectItem>
        {moveTargetsOf(rowTab).map((target) => <SelectItem key={target} value={target}>{target}</SelectItem>)}
      </SelectContent>
    </Select>
  }, [busy, moveTargetsOf])

  const detailsFound = details !== null ? locate(details) : null
  const hints = table ? linkHints(links, indexKey, table.tabName) : []
  const formTable = showAll ? tableByName.get(creatingTab) ?? table : table
  const formDefinition = definition.tabs.find((tab) => tab.name === formTable?.tabName) ?? tabDefinition
  // Le formulaire d'ajout montre les colonnes du formulaire (« Tableau et formulaire »,
  // « Formulaire seulement »), sauf l'identifiant (généré), les colonnes calculées et,
  // pour les créatures, ce qui se remplit dans leur fiche.
  const formFields: IndexFormField[] = formTable ? (data?.columns[formTable.tabName] ?? [])
    .flatMap(({ header, spec }) => {
      if (!isSheetSpec(spec) || ["id", "lookup", "rollup", "formula", "actions", "random", "auto-links", "ranked-links", "tab"].includes(spec.kind)) return []
      if (nameOpensDetails && (!isGridSpec(spec) || foldName(header) === "extension")) return []
      return [{ key: header, label: header, spec, long: isLongColumn(header) }]
    }) : []

  /** Le texte enregistré d'une case (la fiche relit la ligne telle que Sheets l'a renvoyée). */
  const savedCell = (found: { table: WorldIndexTable; row: WorldIndexRow }, header: string) => {
    const column = columnIndexOf(found.table, header)
    if (column < 0) return ""
    return isRichSpec(specOf(found.table.tabName, header)) ? found.row.html[column] ?? "" : found.row.values[column] ?? ""
  }

  // La fiche d'une ligne (index sans fiche dédiée) : tous ses champs du formulaire.
  const sheetFields = detailsFound && !nameOpensDetails ? (data?.columns[detailsFound.table.tabName] ?? [])
    .filter((column) => isSheetSpec(column.spec) && !["auto-links", "ranked-links", "tab"].includes(column.spec.kind))
    .map((column) => ({ key: column.header, label: column.header, spec: column.spec, value: savedCell(detailsFound, column.header), long: isLongColumn(column.header) })) : []
  const sheetRow = (header: string): IndexFieldProps["row"] => details === null ? undefined : {
    formula: (spec) => engine.formula(details, header, spec),
    computed: (spec) => computed(details, header, spec),
    gaugeMax: (spec) => engine.gaugeMax(details, spec),
    draw: async (spec) => { await drawCell(details, header, spec) },
    buttonVisible: (button) => engine.buttonVisible(details, button),
    runButton: (button) => runButton(details, button),
  }

  async function saveSheet(changes: Record<string, string>) {
    if (details === null) return
    setSheetPending(true); setSheetError("")
    try {
      // Champ par champ, comme dans le tableau : un nom renommé ou une colonne liée gardent leurs effets.
      for (const [header, value] of Object.entries(changes)) await commitCell(details, header, value)
    } catch (reason) {
      setSheetError(reason instanceof Error ? reason.message : "La fiche n’a pas pu être enregistrée.")
    }
    setSheetPending(false)
  }

  // Colonnes qui peuvent pondérer « Tirer » : les nombres et les jauges.
  const weightColumns = table ? (data?.columns[table.tabName] ?? []).filter((column) => ["number", "gauge", "formula", "rollup"].includes(column.spec.kind)).map((column) => column.header) : []

  async function openEditor() {
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
      setEditor(null)
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : "Les changements n’ont pas pu être écrits.")
    }
    setPending("")
  }

  return (
    <section className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        {tables.length > 1 && <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Onglet
          <NativeSelect value={showAll ? ALL_TABS : table?.tabName ?? ""} onChange={(event) => { setTabName(event.target.value); setCreating(false); setDetails(null) }} disabled={busy} className="min-w-56 text-foreground">
            {canShowAll && <NativeSelectOption value={ALL_TABS}>Tout ({tables.reduce((total, candidate) => total + candidate.rows.length, 0)})</NativeSelectOption>}
            {tables.map((candidate) => <NativeSelectOption key={candidate.tabName} value={candidate.tabName}>{candidate.tabName} ({candidate.rows.length})</NativeSelectOption>)}
          </NativeSelect>
        </label>}
        {table && <div className="relative min-w-0 lg:max-w-sm lg:flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans le tableau…" className="pl-9" /></div>}
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          {data?.webViewLink && <Button asChild variant="ghost"><a href={data.webViewLink} target="_blank" rel="noreferrer">Ouvrir dans Sheets<ExternalLink /></a></Button>}
          {corrections > 0 && <Button type="button" variant="outline" onClick={() => void correct()} disabled={busy} title="Réécrit les valeurs de liste mal orthographiées (« Aggressif » → « Agressif »). Les valeurs hors liste ne sont pas touchées.">{pending === "correct" ? <LoaderCircle className="animate-spin" /> : <SpellCheck />}Corriger {corrections} faute{corrections > 1 ? "s" : ""}</Button>}
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={busy}>{pending === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
          {table && <DrawRowButton
            rows={displayedRows}
            weightColumns={weightColumns}
            weightOf={(rowKey, header) => { const found = locate(rowKey); return found ? numericCellValue(valueOf(rowKey, header), specOf(found.table.tabName, header)) : null }}
            nameOf={(rowKey) => rawOf(rowKey, "Nom").replace(/<[^>]+>/g, "")}
            onOpen={setDetails}
            disabled={busy}
          />}
          <Button type="button" variant="outline" onClick={() => void openEditor()} disabled={busy} title="Colonnes, types, réglages et onglets de cet index">{pending === "editor" ? <LoaderCircle className="animate-spin" /> : <Settings2 />}Modifier</Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => setGuideOpen(true)} title="Guide des colonnes : types, formules, boutons, aléatoire" aria-label="Guide des colonnes"><CircleHelp /></Button>
          <Button type="button" onClick={() => setCreating(true)} disabled={!table || busy}><Plus />Ajouter {showAll ? definition.itemLabel ?? tabDefinition.itemLabel : tabDefinition.itemLabel}</Button>
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
        pending={pending === "add"}
        leading={showAll ? <label className="grid gap-1 text-xs font-semibold">
          Onglet
          <NativeSelect value={formTable.tabName} onChange={(event) => setCreatingTab(event.target.value)} className="w-full">
            {tables.map((candidate) => <NativeSelectOption key={candidate.tabName} value={candidate.tabName}>{candidate.tabName}</NativeSelectOption>)}
          </NativeSelect>
        </label> : undefined}
        onCancel={() => setCreating(false)}
        onSave={(values) => void addRow(formTable.tabName, formTable.headers.map((header) => values[header] ?? ""))}
      />}

      {table ? (
        <SheetGrid
          layoutKey={`eraser:world-index:grid:${indexKey}:${showAll ? "tout" : table.tabName}`}
          columns={columns}
          rows={displayedRows}
          valueOf={valueOf}
          onCommit={(rowKey, columnKey, value) => void commitCell(rowKey, columnKey, value)}
          renderCustomCell={renderTabCell}
          sort={sort}
          onSort={setSort}
          disabled={busy}
          version={version}
          addRowLabel={`Ajouter ${showAll ? definition.itemLabel ?? tabDefinition.itemLabel : tabDefinition.itemLabel}`}
          rowCommands={{
            append: () => setCreating(true),
            insertRows: (rowKey, count) => { const { tabName: rowTab, rowNumber } = parseRowKey(rowKey); void mutate("insert", [rowKey], "insert", { tabName: rowTab, rowNumber, count }) },
            duplicate: (rowKeys) => void mutate("duplicate", rowKeys, "duplicate"),
            remove: (rowKeys) => void mutate("delete", rowKeys, "delete"),
          }}
          rowMenuExtras={(rowKey) => {
            const targets = moveTargetsOf(parseRowKey(rowKey).tabName)
            return <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => setDetails(rowKey)}><FileText className="size-3.5" />Ouvrir la fiche</ContextMenuItem>
              {targets.length > 0 && <>
                <ContextMenuSeparator />
                <ContextMenuLabel className="flex items-center gap-1.5"><ArrowRightLeft className="size-3.5" />Déplacer vers</ContextMenuLabel>
                {targets.map((target) => <ContextMenuItem key={target} onSelect={() => void mutate("move", [rowKey], "move", { toTab: target })}>{target}</ContextMenuItem>)}
              </>}
            </>
          }}
          toolbarTrailing={saving > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : null}
          empty={viewTables.some((owner) => owner.rows.length) ? "Aucune ligne ne correspond à la recherche." : `Ce tableau est vide. Ajoute ${tabDefinition.itemLabel} pour commencer.`}
        />
      ) : !error ? <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Le classeur « {definition.sheetName} » n’a pas pu être préparé.</div> : null}

      {nameOpensDetails && detailsFound && <CreatureSheetDialog
        key={`${version}:${details}`}
        open
        headers={detailsFound.table.headers}
        values={detailsFound.row.values}
        html={detailsFound.row.html}
        onClose={() => setDetails(null)}
        onSave={async (fields) => {
          if (!Object.keys(fields).length) return
          const payload = await post({ action: "update-fields", tabName: detailsFound.table.tabName, rowNumber: detailsFound.row.rowNumber, fields })
          if (payload.data) applyData(payload.data, payload.seq)
        }}
      />}

      {!nameOpensDetails && detailsFound && <IndexRowSheet
        key={`${details}`}
        open
        title={savedCell(detailsFound, "Nom").replace(/<[^>]+>/g, "")}
        subtitle={`${definition.title} · ${detailsFound.table.tabName}`}
        fields={sheetFields}
        rowFor={sheetRow}
        pending={sheetPending}
        error={sheetError}
        onSave={saveSheet}
        onClose={() => { setDetails(null); setSheetError("") }}
      />}
      {guideOpen && <IndexGuide open onClose={() => setGuideOpen(false)} />}
      {noticesView}
      {choiceView}
    </section>
  )
}
