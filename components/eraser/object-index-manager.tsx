"use client"

import dynamic from "next/dynamic"
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRememberedSearch } from "@/hooks/use-remembered-search"
import { usePathname, useRouter } from "next/navigation"
import { ArrowRightLeft, CircleHelp, Coins, FileText, Filter, LoaderCircle, Pencil, Plus, RefreshCw, Search, Send, Settings2 } from "lucide-react"

import { usePersistentState } from "@/hooks/use-persistent-state"
import { chooseCampaign, copyToClipboard, DrawRowButton, rowCard, sendToCampaignChat, useChoiceDialog, useIndexNotices } from "@/components/eraser/index-action-ui"
import { indexGridColumn, IndexEntryForm, type IndexFieldProps } from "@/components/eraser/index-cells"
import { createRowEngine } from "@/components/eraser/index-row-engine"
import { IndexRowSheet } from "@/components/eraser/index-row-sheet"
import { ReferenceScopeProvider } from "@/components/eraser/reference-menu"
import { shownReferenceText } from "@/components/eraser/reference-store"
import { htmlToRichText } from "@/lib/google-sheet-rich-text"
import { OBJECT_REFERENCE_INDEX } from "@/lib/index-references"
import type { EditorMode } from "@/components/eraser/index-editor"
import { IndexViewDialog, useIndexSettings } from "@/components/eraser/index-views"
import { IndexCardGrid, IndexDisplayControls, NoCardsYet, isCardChoice, isIndexDisplay, type CardRowSource, type IndexDisplay } from "@/components/eraser/index-card"
import { pickCard, tabCardsOf } from "@/lib/index-cards"
import { ObjectViewGrid, specIn } from "@/components/eraser/object-view-grid"
import { IndexStats, TAB_PSEUDO } from "@/components/eraser/index-stats"
import { ObjectSendDialog } from "@/components/eraser/object-send-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FullscreenButton, SheetsLinkButton, ToolbarIconButton, useFullscreenPanel } from "@/components/eraser/index-toolbar"
import { useShellData } from "@/components/eraser/app-shell"
import { IN_PLACE_ATTRIBUTE, replaceAppUrl, URL_CHANGE_EVENT } from "@/components/eraser/app-tabs"
import { IndexTabPicker, useIndexTabParam } from "@/components/eraser/index-tab-picker"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { ObjectIcon } from "@/components/eraser/object-icon"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ObjectIndexTable } from "@/lib/google-sheets"
import { buttonPresets, runActionButton, type ActionRuntime } from "@/lib/index-actions"
import { foldName, isComputedSpec, isRichSpec, isSheetSpec, normalizeSpec, objectColumnSpec, type ActionButton, type IndexColumnSpec } from "@/lib/index-columns"
import { columnFormulaValue, numericCellValue } from "@/lib/index-formula"
import { cryptoRandom, drawRandom, drawText, type RandomCandidateRow } from "@/lib/index-random"
import { isBuiltinWorldIndexKey, worldIndexDefinitions } from "@/lib/world-index-definitions"
import { numberCorrection } from "@/lib/index-numbers"
import { indexSortKey, sortByIndexKey } from "@/lib/index-sort"
import { findEntry, isTrashedEntry, objectHeaderIndex, type IndexEditorModel, type SchemaEntry, type SchemaOperation } from "@/lib/index-schema-shared"
import { ALL_SOURCES, viewIdOfSelectKey, viewSelectKey } from "@/lib/index-views"
import { isPresentationKind, presentationFor, type ViewLayout } from "@/lib/index-view-layouts"
import { layoutPlaces, tabLayout } from "@/lib/index-layouts"
import { headerOccurrence, objectIndexRowRef } from "@/lib/object-index-refs"
import { objectItemId, positionalObjectId } from "@/lib/object-item-id"

// Les fenêtres (« Modifier », guide) ne sont chargées qu'à leur ouverture : la page s'affiche plus vite.
const IndexEditor = dynamic(() => import("@/components/eraser/index-editor").then((module) => module.IndexEditor), { ssr: false })
const IndexGuide = dynamic(() => import("@/components/eraser/index-guide").then((module) => module.IndexGuide), { ssr: false })


function tableKey(table: ObjectIndexTable) {
  return `${table.fileId}:${table.sheetId}`
}

function normalize(header: string) {
  return header.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr")
}

/** Les colonnes courtes restent étroites, les colonnes de récit prennent la place. */
function columnWidthFor(header: string) {
  const normalized = normalize(header)
  if (/description|effet|note|prerequis|attribut/.test(normalized)) return 380
  if (/nom|titre|lien|image/.test(normalized)) return 220
  if (/nombre|poids|prix|encombrement|rarete|edition|actif|icone/.test(normalized)) return 120
  return 180
}

/** Les mêmes colonnes de récit se saisissent en texte enrichi dans le formulaire. */
function isLongField(header: string) {
  return /description|effet|note|prerequis|attribut/.test(normalize(header))
}

/** Colonne virtuelle : l'identifiant que l'inventaire donne à un item d'une feuille sans colonne ID. */
const COMPUTED_ID = "__id"
/** La colonne des boutons d’Eraser (envoyer, déplacer) : jamais écrite dans Sheets. */
const ACTIONS_COLUMN = "__actions"
const idSpec: IndexColumnSpec = { kind: "id", hidden: true }
const presetButton = (key: string): ActionButton => { const preset = buttonPresets.find((item) => item.key === key)!; return { ...preset.button, id: `preset:${key}` } }
const inventoryPreset = presetButton("inventory")
const movePreset = presetButton("move-ask")

function isIconHeader(header: string) {
  return ["icone", "icon"].includes(normalize(header).trim())
}

type Schemas = Record<string, SchemaEntry[]>

export function ObjectIndexManager({ initialTables, initialSchemas = {}, initialError }: { initialTables: ObjectIndexTable[]; initialSchemas?: Schemas; initialError: string }) {
  const [tables, setTables] = useState(initialTables)
  // Le schéma de chaque classeur (onglet « Eraser · colonnes ») : types choisis dans « Modifier », colonnes à la corbeille.
  const [schemas, setSchemas] = useState<Schemas>(initialSchemas)
  const [editor, setEditor] = useState<IndexEditorModel | null>(null)
  const [editorError, setEditorError] = useState("")
  // Le tableau affiché est dans l'adresse (`?onglet=`) : chaque onglet de l'application a le sien.
  const pathname = usePathname()
  const [selectedKey, setSelectedKey, tabHref] = useIndexTabParam(pathname, "eraser:object-index:selected-table", initialTables[0] ? tableKey(initialTables[0]) : "")
  // Un seul classeur (index regroupés) : « Armes », « Équipement »… sans le nom du classeur devant.
  const tableLabel = useCallback((table: ObjectIndexTable) => tables.every((candidate) => candidate.fileId === table.fileId) ? table.tabName : `${table.fileName} · ${table.tabName}`, [tables])
  const [pending, setPending] = useState("")
  const [error, setError] = useState(initialError)
  const [saving, setSaving] = useState(0)
  const [creating, setCreating] = useState(false)
  // Incrémenté seulement quand les valeurs viennent du serveur : les cellules sont
  // alors remontées. La frappe, elle, ne doit jamais les remonter.
  const [version, setVersion] = useState(0)
  const [query, setQuery] = useRememberedSearch()
  const [sort, setSort] = usePersistentState<SheetGridSort>(
    "eraser:object-index:sort", null,
    (v): v is SheetGridSort => v === null || (typeof v === "object" && v !== null && typeof (v as { column?: unknown }).column === "string" && ((v as { direction?: unknown }).direction === "asc" || (v as { direction?: unknown }).direction === "desc")),
  )
  // Les onglets-fenêtres de l'index des items : des lignes de un ou plusieurs tableaux, selon des conditions.
  const settings = useIndexSettings("objects")
  // Tableau ou cartes, et la carte choisie : retenus sur ce poste.
  const [display, setDisplay] = usePersistentState<IndexDisplay>("eraser:object-index:display", "table", isIndexDisplay)
  const [cardChoice, setCardChoice] = usePersistentState<string>("eraser:object-index:card", "", isCardChoice)
  const [editorMode, setEditorMode] = useState<EditorMode>("columns")
  const { viewRole, selectedCampaignId } = useShellData()
  const [viewDialog, setViewDialog] = useState<"new" | "edit" | null>(null)
  // Une case modifiée dans une fenêtre : en revenant à un tableau, il est relu.
  const editedInView = useRef(false)
  const activeView = useMemo(() => { const id = viewIdOfSelectKey(selectedKey); return id ? settings.views.find((view) => view.id === id) ?? null : null }, [selectedKey, settings.views])
  // La vue de l'onglet-fenêtre (liste, kanban…) part des réglages de « Modifier › Vues » de son
  // tableau (le premier si la fenêtre les couvre tous) ; ce qu'elle règle elle-même passe par-dessus.
  const activeLayout = useMemo((): ViewLayout | null => {
    const own = activeView?.layout ?? null
    if (!own || !isPresentationKind(own.kind)) return own
    const table = activeView!.source === ALL_SOURCES ? tables[0] : tables.find((candidate) => tableKey(candidate) === activeView!.source)
    const base = table ? presentationFor(settings.presentations, table.tabName, own.kind) : { kind: own.kind }
    const set = Object.fromEntries(Object.entries(own).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)))
    return { ...base, ...set, kind: own.kind } as ViewLayout
  }, [activeView, settings.presentations, tables])

  // Les statistiques des items (Modifier › Stats), sur tous les tableaux ; un onglet stat montre les épinglées.
  const statKey = (table: ObjectIndexTable, rowNumber: number) => `${tableKey(table)}|${rowNumber}`
  const statLocate = useCallback((rowKey: string) => {
    const separator = rowKey.lastIndexOf("|")
    const table = tables.find((candidate) => tableKey(candidate) === rowKey.slice(0, separator))
    const row = table?.rows.find((candidate) => candidate.rowNumber === Number(rowKey.slice(separator + 1)))
    return table && row ? { table, row } : null
  }, [tables])
  const statRowKeys = useMemo(() => tables.flatMap((table) => table.rows.map((row) => statKey(table, row.rowNumber))), [tables])
  const statTabs = useMemo(() => tables.map((table) => table.tabName), [tables])
  const statHeaders = useMemo(() => {
    const seen = new Map<string, string>()
    for (const table of tables) for (const header of table.headers) {
      if (!header.trim() || /^(id|colonne \d+)$/i.test(header.trim()) || seen.has(foldName(header))) continue
      seen.set(foldName(header), header)
    }
    if (tables.length > 1 && !seen.has(foldName(TAB_PSEUDO))) seen.set(foldName(TAB_PSEUDO), TAB_PSEUDO)
    return [...seen.values()]
  }, [tables])
  const statValueOf = useCallback((rowKey: string, column: string) => {
    const found = statLocate(rowKey)
    if (!found) return ""
    const index = objectHeaderIndex(found.table.headers, column)
    if (index < 0) return foldName(column) === foldName(TAB_PSEUDO) ? found.table.tabName : ""
    return found.row.values[index] ?? ""
  }, [statLocate])
  const statTabOf = useCallback((rowKey: string) => statLocate(rowKey)?.table.tabName ?? "", [statLocate])
  const statNameOf = useCallback((rowKey: string) => statValueOf(rowKey, "Nom").replace(/<[^>]+>/g, "").trim(), [statValueOf])
  const statOptionsOf = useCallback((header: string) => {
    const table = tables.find((candidate) => objectHeaderIndex(candidate.headers, header) >= 0)
    return (table ? specIn(table, header, schemas).options ?? [] : []).map((option) => ({ value: option.value, color: option.color }))
  }, [schemas, tables])
  const indexStats = useMemo(() => {
    const seen = new Set<string>()
    return [...settings.stats, ...settings.views.flatMap((view) => view.layout?.kind === "stats" ? view.layout.stats ?? [] : [])].filter((stat) => !seen.has(stat.id) && Boolean(seen.add(stat.id)))
  }, [settings.stats, settings.views])
  const statsProps = { stats: indexStats, rows: statRowKeys, columns: statHeaders, tabs: statTabs, valueOf: statValueOf, tabOf: statTabOf, nameOf: statNameOf, optionsOf: statOptionsOf, onOpen: () => undefined, onSave: settings.saveStats }
  const selected = useMemo(() => tables.find((table) => tableKey(table) === selectedKey) ?? tables[0] ?? null, [selectedKey, tables])
  // « {Prix} » écrit dans une description : le menu « { » propose les colonnes de l'objet.
  const selectedTab = selected?.tabName
  const referenceScope = useMemo(() => ({ index: OBJECT_REFERENCE_INDEX, tab: selectedTab }), [selectedTab])
  // Les cellules en cours d’enregistrement gardent la valeur saisie : le tableau
  // n’attend jamais Google Sheets pour afficher ce qui vient d’être tapé.
  const localEdits = useRef<Record<string, string>>({})
  /** Les cases enregistrées depuis le dernier chargement (la feuille les porte déjà). */
  const savedEdits = useRef<Record<string, string>>({})

  // Le type de chaque colonne : celui du schéma du classeur, sinon reconnu par son nom.
  // Les valeurs tapées dans une liste à ajout libre (Type, Sous-type…) depuis le dernier chargement.
  const [typedChoices, setTypedChoices] = useState<Record<string, string[]>>({})
  /** Les valeurs déjà écrites dans une colonne, dans tous les tableaux d'objets (et celles tapées depuis). */
  const usedValues = useMemo(() => {
    const byHeader = new Map<string, Set<string>>()
    for (const table of tables) table.headers.forEach((header, column) => {
      const folded = foldName(header)
      if (!folded) return
      const values = byHeader.get(folded) ?? new Set<string>()
      for (const row of table.rows) { const value = (row.values[column] ?? "").trim(); if (value && value.length <= 80) values.add(value) }
      byHeader.set(folded, values)
    })
    for (const [folded, values] of Object.entries(typedChoices)) for (const value of values) byHeader.set(folded, (byHeader.get(folded) ?? new Set<string>()).add(value))
    return byHeader
  }, [tables, typedChoices])
  const specs = useMemo(() => (selected?.headers ?? []).map((header, _index, headers) => {
    const base = objectColumnSpec(header, headers)
    const entry = selected ? findEntry(schemas[selected.fileId] ?? [], selected.tabName, header) : undefined
    const spec: IndexColumnSpec = entry?.spec ? { ...base, ...entry.spec } : base
    if (spec.kind !== "choice" || !spec.allowCustom) return spec
    // Une liste à ajout libre propose aussi les valeurs déjà utilisées : une valeur ajoutée une fois se choisit ensuite.
    const known = new Set((spec.options ?? []).map((option) => foldName(option.value)))
    const used = [...(usedValues.get(foldName(header)) ?? [])].filter((value) => !known.has(foldName(value)) && known.add(foldName(value)))
    return used.length ? { ...spec, options: [...(spec.options ?? []), ...used.sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" })).map((value) => ({ value }))] } : spec
  }), [schemas, selected, usedValues])
  // Les colonnes vides d'en-tête ou à la corbeille ne s'affichent pas (elles restent dans Sheets).
  const liveColumns = useMemo(() => (selected?.headers ?? []).flatMap((header, index) => {
    if (!header.trim() || specs[index]?.kind === "archived") return []
    if (selected && isTrashedEntry(findEntry(schemas[selected.fileId] ?? [], selected.tabName, header))) return []
    return [index]
  }), [schemas, selected, specs])
  // Le tableau : toutes les colonnes (les masquées et les anciennes « Formulaire seulement » se
  // montrent d'un clic). La fiche : toutes, sauf les anciennes « Tableau seulement » que sa
  // mise en page ne place pas.
  const formLayout = selected ? tabLayout(settings.layouts, selected.tabName, "form") : null
  const shownColumns = liveColumns
  const sheetColumns = useMemo(() => liveColumns.filter((index) => isSheetSpec(specs[index]) || layoutPlaces(formLayout, selected?.headers[index] ?? "")), [formLayout, liveColumns, selected, specs])
  const columnOfHeader = useCallback((header: string) => {
    // Un nom écrit avant un alignement (« Cout ») retrouve sa colonne (« Prix »).
    const index = objectHeaderIndex(selected?.headers ?? [], header)
    return index >= 0 && liveColumns.includes(index) ? index : -1
  }, [liveColumns, selected])
  const hasIdColumn = specs.some((spec) => spec.kind === "id")

  /** Case « Icône » : l'icône telle qu'Eraser l'affiche (image du Drive, icône d'Eraser, émoji). */
  const iconPreview = useCallback((value: string, rowKey?: string) => {
    if (!selected) return null
    const row = selected.rows.find((candidate) => String(candidate.rowNumber) === rowKey)
    const cell = (aliases: string[]) => {
      const index = selected.headers.findIndex((header) => aliases.includes(normalize(header).replace(/[^a-z]+/g, " ").trim()))
      return index >= 0 ? row?.values[index] ?? "" : ""
    }
    const name = cell(["nom", "nom de l objet", "objet", "arme", "equipement", "ressource", "livre", "titre"])
    return name.trim() ? <ObjectIcon icon={value} name={name} type={cell(["type", "categorie"])} subtype={cell(["sous type", "subtype"])} className="size-full p-0.5" emojiClassName="text-lg" /> : null
  }, [selected])

  /**
   * Une ligne telle que le serveur la retrouve dans la feuille relue : son ID (sa place n'est
   * qu'un indice) et, faute d'ID, son nom à sa place.
   */
  const rowRefOf = useCallback((rowKey: string) => {
    const row = selected?.rows.find((candidate) => String(candidate.rowNumber) === rowKey)
    if (!selected || !row) return { id: "", rowNumber: Number(rowKey), name: "" }
    // Les cases déjà enregistrées depuis le chargement (un nom changé) : la feuille les porte,
    // le serveur doit retrouver la ligne avec elles et non avec l'instantané.
    const values = row.values.map((value, column) => {
      const saved = savedEdits.current[`${tableKey(selected)}:${rowKey}:${column}`]
      return saved === undefined ? value : htmlToRichText(saved).text
    })
    return objectIndexRowRef(selected.headers, { rowNumber: row.rowNumber, values })
  }, [selected])

  /** Import d'une icône : l'image va dans le dossier « icone objet » du Drive et le serveur la pose dans la case. */
  const uploadIcon = useCallback(async (file: File, _previous: string, rowKey: string) => {
    if (!selected) throw new Error("Aucun tableau choisi.")
    const target = rowRefOf(rowKey)
    const form = new FormData()
    form.set("fileId", selected.fileId)
    form.set("tabName", selected.tabName)
    form.set("rowNumber", String(target.rowNumber))
    form.set("id", target.id)
    form.set("name", target.name ?? "")
    form.set("file", file)
    const response = await fetch("/api/resources/object-indexes/icon", { method: "POST", body: form })
    const payload = (await response.json()) as { tables?: ObjectIndexTable[]; error?: string }
    if (!response.ok || !payload.tables) throw new Error(payload.error || "L’icône n’a pas pu être importée.")
    localEdits.current = {}
    savedEdits.current = {}
    setTables(payload.tables)
    setVersion((current) => current + 1)
    const table = payload.tables.find((candidate) => tableKey(candidate) === tableKey(selected))
    const iconIndex = table?.headers.findIndex(isIconHeader) ?? -1
    // La ligne relue a pu changer de place : retrouvée par son ID.
    const updated = table?.rows.find((candidate) => target.id ? objectIndexRowRef(table.headers, candidate).id === target.id : String(candidate.rowNumber) === rowKey)
    return updated?.values[iconIndex] ?? ""
  }, [rowRefOf, selected])


  const rawOf = useCallback((rowKey: string, columnKey: string) => {
    // La clé vient du tableau réellement affiché, pas de la préférence enregistrée :
    // au premier affichage la préférence est encore vide alors qu'un tableau est choisi.
    const local = selected ? localEdits.current[`${tableKey(selected)}:${rowKey}:${columnKey}`] : undefined
    if (local !== undefined) return local
    if (columnKey === COMPUTED_ID) return selected ? positionalObjectId(selected.fileId, selected.sheetId, rowKey) : ""
    const row = selected?.rows.find((candidate) => String(candidate.rowNumber) === rowKey)
    const spec = specs[Number(columnKey)]
    return (spec && !isRichSpec(spec) ? row?.values[Number(columnKey)] : row?.html[Number(columnKey)]) ?? ""
  }, [selected, specs])

  /** Enregistre une case ; rend le message d'erreur, ou "" si elle est enregistrée. */
  const commitCell = useCallback(async (rowKey: string, columnKey: string, html: string) => {
    if (!selected) return ""
    const key = `${tableKey(selected)}:${rowKey}:${columnKey}`
    // La ligne telle que la feuille la porte avant cette écriture.
    const row = rowRefOf(rowKey)
    localEdits.current[key] = html
    setSaving((current) => current + 1)
    let failure = ""
    try {
      // La ligne par son ID, la colonne par son en-tête : le serveur les retrouve dans la feuille.
      const column = Number(columnKey)
      const response = await fetch("/api/resources/object-indexes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update-cell", fileId: selected.fileId, tabName: selected.tabName, row, header: selected.headers[column] ?? "", occurrence: headerOccurrence(selected.headers, column), html }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        failure = payload.error || "Cette cellule n’a pas pu être enregistrée."
      } else savedEdits.current[key] = html
    } catch {
      failure = "Cette cellule n’a pas pu être enregistrée."
    }
    // Refusée : la case reprend ce que porte la feuille, au lieu d'afficher ce qui n'est pas enregistré.
    if (failure) delete localEdits.current[key]
    setError(failure)
    setSaving((current) => current - 1)
    return failure
  }, [rowRefOf, selected])

  const router = useRouter()
  const { notify, view: noticesView } = useIndexNotices()
  const { ask, view: choiceView } = useChoiceDialog()
  const [details, setDetails] = useState<string | null>(null)
  // « Envoyer » et « Déplacer » de la colonne Actions : la ligne visée.
  const [sendRow, setSendRow] = useState<{ itemId: string; name: string } | null>(null)
  const [moveRow, setMoveRow] = useState<{ rowKey: string; name: string } | null>(null)
  const [sheetError, setSheetError] = useState("")
  const [guideOpen, setGuideOpen] = useState(false)
  const [seed, setSeed] = useState(() => `objets:${Date.now()}`)

  /** L'adresse d'une ligne : l'index ouvert sur son onglet et sa fiche (`?ligne=ID`, ou `#numéro` sans colonne ID). */
  const idColumnIndex = specs.findIndex((spec) => spec.kind === "id")
  const rowHref = useCallback((rowKey: string) => {
    if (!selected) return undefined
    const id = idColumnIndex >= 0 ? rawOf(rowKey, String(idColumnIndex)).replace(/<[^>]+>/g, "").trim() : `#${rowKey}`
    return id ? `${tabHref(tableKey(selected))}&ligne=${encodeURIComponent(id)}` : undefined
  }, [idColumnIndex, rawOf, selected, tabHref])
  const [wantedRow, setWantedRow] = useState<string | null>(null)
  useEffect(() => {
    const read = () => setWantedRow(new URLSearchParams(window.location.search).get("ligne"))
    const timer = window.setTimeout(read, 0)
    window.addEventListener(URL_CHANGE_EVENT, read)
    window.addEventListener("popstate", read)
    return () => { window.clearTimeout(timer); window.removeEventListener(URL_CHANGE_EVENT, read); window.removeEventListener("popstate", read) }
  }, [])
  useEffect(() => {
    if (!wantedRow || !selected) return
    const row = wantedRow.startsWith("#")
      ? selected.rows.find((candidate) => `#${candidate.rowNumber}` === wantedRow)
      : idColumnIndex >= 0 ? selected.rows.find((candidate) => (candidate.values[idColumnIndex] ?? "").replace(/<[^>]+>/g, "").trim() === wantedRow) : undefined
    if (!row) return
    // Lue une fois : fermer la fiche ne la rouvre pas.
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href)
      url.searchParams.delete("ligne")
      replaceAppUrl(url.pathname + url.search, { record: false })
      setWantedRow(null)
      setDetails(String(row.rowNumber))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [idColumnIndex, selected, wantedRow])

  // Le moteur de la ligne : formules, jauges « autre colonne », conditions des boutons.
  /* eslint-disable react-hooks/refs -- les fonctions du moteur ne lisent les modifications en cours (une référence) qu'à l'appel */
  const engine = useMemo(() => createRowEngine({
    specOf: (_rowKey, header) => { const index = columnOfHeader(header); return index >= 0 ? specs[index] : undefined },
    raw: (rowKey, header) => { const index = columnOfHeader(header); return index >= 0 ? rawOf(rowKey, String(index)) : "" },
    rowInfo: (rowKey) => selected ? { tabName: selected.tabName, rowNumber: Number(rowKey) } : null,
    seed,
  }), [columnOfHeader, rawOf, seed, selected, specs])
  /* eslint-enable react-hooks/refs */
  const engineRef = useRef(engine)
  useLayoutEffect(() => { engineRef.current = engine })

  /** Ce qu'affiche une case : la valeur de Sheets, ou le résultat d'une formule (tri, recherche, copie). */
  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const spec = specs[Number(columnKey)]
    if (spec && spec.kind === "formula" && selected) return engine.computedText(rowKey, selected.headers[Number(columnKey)], spec) ?? ""
    return rawOf(rowKey, columnKey)
  }, [engine, rawOf, selected, specs])

  // La recherche suit la frappe sans la ralentir : le tableau se filtre juste après.
  const deferredQuery = useDeferredValue(query)
  const haystacks = useMemo(() => new Map((selected?.rows ?? []).map((row) => [row, row.values.join("\n").toLocaleLowerCase("fr")] as const)), [selected])
  const displayedRows = useMemo(() => {
    if (!selected) return []
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("fr")
    const filtered = selected.rows.filter((row) => !normalizedQuery || (haystacks.get(row) ?? "").includes(normalizedQuery))
    const rows = filtered.map((row) => ({ key: String(row.rowNumber), rowNumber: row.rowNumber }))
    if (!sort) return rows
    // Le tri lit ce que montre la case : un prix sur sa valeur (2 PO après 50 PC), une
    // formule sur son résultat, un nom sur son texte sans mise en forme. Vides en bas.
    const spec = specs[Number(sort.column)]
    // eslint-disable-next-line react-hooks/refs -- le tri lit les cases comme le tableau les montre, saisie en cours comprise
    return sortByIndexKey(rows, (row) => indexSortKey(valueOf(row.key, sort.column), spec, { resolveReference: shownReferenceText }), sort.direction === "asc" ? 1 : -1)
  }, [deferredQuery, haystacks, selected, sort, specs, valueOf])

  // La vue en cartes : celles du tableau affiché (index « objects », onglet du tableau).
  const tabCards = selected ? tabCardsOf(settings.cards, "objects", selected.tabName) : null
  const shownCard = tabCards ? pickCard(tabCards, cardChoice) : null
  const cardRow = useCallback((rowKey: string): CardRowSource => ({
    value: (header) => { const index = columnOfHeader(header); return index >= 0 ? valueOf(rowKey, String(index)) : "" },
    spec: (header) => { const index = columnOfHeader(header); return index >= 0 ? specs[index] : undefined },
  }), [columnOfHeader, specs, valueOf])

  /** Les lignes du tableau affiché, pour un tirage « ligne de cet index ». */
  const rowsOf = useCallback((): RandomCandidateRow[] | undefined => {
    if (!selected) return undefined
    const nameIndex = selected.headers.findIndex((header) => specs[selected.headers.indexOf(header)]?.kind === "name" || specs[selected.headers.indexOf(header)]?.kind === "name-form")
    return selected.rows.map((row) => ({
      name: nameIndex >= 0 ? row.values[nameIndex] ?? "" : "",
      cell: (header) => { const index = columnOfHeader(header); return index >= 0 ? row.values[index] ?? "" : "" },
      formula: { column: (name) => { const index = columnOfHeader(name); return index < 0 ? undefined : columnFormulaValue(row.values[index] ?? "", specs[index]) } },
    }))
  }, [columnOfHeader, selected, specs])

  const drawCell = useCallback(async (rowKey: string, header: string, spec: IndexColumnSpec, force = false) => {
    const settings = normalizeSpec(spec).random
    const index = columnOfHeader(header)
    if (!settings || index < 0) return null
    if (!force && settings.mode === "fixed" && rawOf(rowKey, String(index)).trim()) return null
    const draw = drawRandom(settings, { random: cryptoRandom, row: engine.context(rowKey), rowsOf: () => rowsOf() })
    if (draw.error) { notify(`${header} : ${draw.error}`, "error"); return null }
    const text = drawText(draw)
    await commitCell(rowKey, String(index), text)
    engineRef.current.invalidate()
    if (draw.detail) notify(`${header} : ${text} (${draw.detail})`)
    return text
  }, [columnOfHeader, commitCell, engine, notify, rawOf, rowsOf])

  /** L'identifiant de l'objet pour les inventaires : sa colonne ID, sinon celui que les inventaires lui calculent. */
  const itemIdOf = useCallback((rowKey: string) => {
    const idIndex = specs.findIndex((spec) => spec.kind === "id")
    return selected ? objectItemId(idIndex >= 0 ? rawOf(rowKey, String(idIndex)) : "", selected.fileId, selected.sheetId, rowKey) : (idIndex >= 0 ? rawOf(rowKey, String(idIndex)).trim() : "")
  }, [rawOf, selected, specs])

  /** Le nom d'une ligne, sans sa mise en forme (lu au clic, pour les fenêtres Envoyer et Déplacer). */
  const plainNameOf = useCallback((rowKey: string) => {
    const index = specs.findIndex((spec) => spec.kind === "name" || spec.kind === "name-form")
    return index >= 0 ? rawOf(rowKey, String(index)).replace(/<[^>]+>/g, "").trim() : ""
  }, [rawOf, specs])
  const openSend = useCallback((rowKey: string) => setSendRow({ itemId: itemIdOf(rowKey), name: plainNameOf(rowKey) || "Objet" }), [itemIdOf, plainNameOf])
  const openMove = useCallback((rowKey: string) => setMoveRow({ rowKey, name: plainNameOf(rowKey) }), [plainNameOf])

  const mutateRef = useRef<(body: Record<string, unknown>, label: string) => Promise<unknown>>(async () => undefined)
  const runtimeFor = useCallback((rowKey: string): ActionRuntime => ({
    row: () => engine.context(rowKey),
    cell: (header) => { const index = columnOfHeader(header); return index >= 0 ? rawOf(rowKey, String(index)) : "" },
    specOf: (header) => { const index = columnOfHeader(header); return index >= 0 ? specs[index] : undefined },
    setCell: async (header, value) => {
      const index = columnOfHeader(header)
      if (index < 0) throw new Error(`La colonne « ${header} » n’existe pas dans ce tableau.`)
      await commitCell(rowKey, String(index), value)
      engineRef.current.invalidate()
    },
    confirm: async (message) => window.confirm(message),
    notify,
    openUrl: (url) => { window.open(url, "_blank", "noopener,noreferrer") },
    navigate: (href) => router.push(href),
    openSheet: () => setDetails(rowKey),
    indexHref: (index) => !index ? undefined : isBuiltinWorldIndexKey(index) ? worldIndexDefinitions[index].path : `/ressources/index/${index}`,
    roll: async (header) => { const index = columnOfHeader(header); return index >= 0 ? drawCell(rowKey, header, specs[index], true) : null },
    duplicate: async () => { await mutateRef.current({ action: "duplicate", rows: [rowRefOf(rowKey)] }, "duplicate") },
    remove: async () => { await mutateRef.current({ action: "delete", rows: [rowRefOf(rowKey)] }, "delete") },
    copy: copyToClipboard,
    card: () => {
      const nameIndex = selected?.headers.findIndex((_, index) => specs[index]?.kind === "name" || specs[index]?.kind === "name-form") ?? -1
      return rowCard(nameIndex >= 0 ? rawOf(rowKey, String(nameIndex)).replace(/<[^>]+>/g, "") : "Objet", sheetColumns.filter((index) => index !== nameIndex && !["id", "actions"].includes(specs[index].kind)).map((index) => ({ label: selected!.headers[index], text: valueOf(rowKey, String(index)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() })))
    },
    chat: async (message, audience) => {
      const campaign = await chooseCampaign(ask, "chat")
      if (!campaign) throw new Error("Aucune campagne choisie : le message n’est pas parti.")
      await sendToCampaignChat(campaign, message, audience)
    },
    // Les deux préréglages de la colonne Actions : les mêmes fenêtres que ses icônes.
    campaignInventory: async () => { openSend(rowKey) },
    moveAsk: async () => { openMove(rowKey) },
  }), [ask, columnOfHeader, commitCell, drawCell, engine, notify, openMove, openSend, rawOf, rowRefOf, router, selected, sheetColumns, specs, valueOf])
  const runButton = useCallback(async (rowKey: string, button: ActionButton) => { await runActionButton(button, runtimeFor(rowKey)) }, [runtimeFor])

  // Chaque colonne passe par le moteur des index : son type décide de sa cellule.
  /* eslint-disable react-hooks/refs -- les cellules ne lisent ces valeurs qu'en se dessinant, comme avant : indexGridColumn ne fait que les ranger dans la colonne */
  const columns = useMemo<SheetGridColumn[]>(() => {
    const context = {
      valueOf,
      commit: (rowKey: string, columnKey: string, value: string) => {
        // Une valeur nouvelle d'une liste à ajout libre rejoint aussitôt la liste des autres cases.
        const spec = specs[Number(columnKey)]
        const header = selected?.headers[Number(columnKey)]
        if (spec?.kind === "choice" && spec.allowCustom && header && value.trim()) setTypedChoices((current) => ({ ...current, [foldName(header)]: [...new Set([...(current[foldName(header)] ?? []), value.trim()])] }))
        void commitCell(rowKey, columnKey, value)
      },
      idComputed: () => !hasIdColumn,
      openForm: setDetails,
      tabHrefOf: rowHref,
      formula: (rowKey: string, _columnKey: string, spec: IndexColumnSpec) => engine.formula(rowKey, selected?.headers[Number(_columnKey)] ?? _columnKey, spec),
      gaugeMax: (rowKey: string, spec: IndexColumnSpec) => engine.gaugeMax(rowKey, spec),
      draw: async (rowKey: string, columnKey: string, spec: IndexColumnSpec) => { await drawCell(rowKey, selected?.headers[Number(columnKey)] ?? columnKey, spec) },
      buttonVisible: (rowKey: string, button: ActionButton) => engine.buttonVisible(rowKey, button),
      runButton,
      rowValue: (rowKey: string, header: string) => { const index = columnOfHeader(header); return index >= 0 ? valueOf(rowKey, String(index)) : "" },
    }
    const list = shownColumns.map((index) => [selected!.headers[index], index] as const).map(([header, index]) => isIconHeader(header)
      // L'icône garde son affichage et son import dans le dossier « icone objet ».
      ? indexGridColumn(String(index), header, specs[index], 96, context, { renderValue: iconPreview, upload: uploadIcon })
      : indexGridColumn(String(index), header, specs[index], columnWidthFor(header), context))
    // Sans colonne ID dans la feuille, l'identifiant calculé par l'inventaire est montré à part.
    if (selected && !hasIdColumn) list.push(indexGridColumn(COMPUTED_ID, "ID", idSpec, 200, context, { sortable: false }))
    // Les boutons d'Eraser, sans colonne dans Sheets : envoyer l'objet dans un inventaire, le changer d'onglet.
    // Juste après la première colonne (le nom, qui reste figé à gauche).
    if (selected) list.splice(Math.min(1, list.length), 0, {
      key: ACTIONS_COLUMN,
      label: "Actions",
      width: 84,
      minWidth: 84,
      maxWidth: 84,
      sortable: false,
      computed: true,
      description: "Envoyer l’item dans un inventaire, ou le déplacer vers un autre onglet.",
      // Les deux boutons tout faits du moteur (« Envoyer dans un inventaire », « Envoyer dans un
      // autre onglet ») : les mêmes que dans « Modifier › Boutons », posés d'office ici.
      control: (rowKey) => <span className="flex items-center justify-center gap-0.5 py-0.5">
        <button type="button" onClick={() => void runButton(rowKey, inventoryPreset)} className="flex size-7 items-center justify-center rounded-md text-primary hover:bg-primary/10" title="Envoyer dans un inventaire (campagne, joueur, PNJ, créature)" aria-label="Envoyer dans un inventaire"><Send className="size-3.5" /></button>
        <button type="button" onClick={() => void runButton(rowKey, movePreset)} disabled={tables.length < 2} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" title="Envoyer dans un autre onglet (Objets → Équipement…)" aria-label="Envoyer dans un autre onglet"><ArrowRightLeft className="size-3.5" /></button>
      </span>,
    })
    return list
  }, [columnOfHeader, commitCell, drawCell, engine, hasIdColumn, iconPreview, rowHref, runButton, selected, shownColumns, specs, tables.length, uploadIcon, valueOf])
  /* eslint-enable react-hooks/refs */

  async function refresh(keepSeed = false) {
    setPending("refresh"); setError("")
    // Les formules au hasard sont retirées à chaque actualisation (pas après une fiche enregistrée).
    if (!keepSeed) setSeed(`objets:${Date.now()}`)
    const response = await fetch("/api/resources/object-indexes?refresh=1", { cache: "no-store" })
    const payload = (await response.json()) as { tables?: ObjectIndexTable[]; schemas?: Schemas; error?: string }
    setPending("")
    if (!response.ok || !payload.tables) return setError(payload.error || "Actualisation impossible.")
    localEdits.current = {}
    savedEdits.current = {}
    setTables(payload.tables)
    if (payload.schemas) setSchemas(payload.schemas)
    setVersion((current) => current + 1)
  }

  async function mutate(body: Record<string, unknown>, label: string) {
    if (!selected) return
    setPending(label); setError("")
    const response = await fetch("/api/resources/object-indexes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, fileId: selected.fileId, tabName: selected.tabName }),
    })
    const payload = (await response.json().catch(() => ({}))) as { tables?: ObjectIndexTable[]; error?: string }
    setPending("")
    if (!response.ok || !payload.tables) { setError(payload.error || "Enregistrement impossible."); return false }
    localEdits.current = {}
    savedEdits.current = {}
    setTables(payload.tables)
    setVersion((current) => current + 1)
    setCreating(false)
    return true
  }

  /** Les prix en pièces d'argent ou de bronze (PA, PB), qui n'existent pas : ce sont des PC. */
  const priceCorrections = useMemo(() => {
    if (!selected) return []
    return shownColumns.flatMap((column) => {
      const spec = specs[column]
      if (spec.kind !== "number" || spec.number?.unit !== "money") return []
      return selected.rows.flatMap((row) => {
        const next = numberCorrection(row.values[column] ?? "", spec.number ?? {})
        return next ? [{ rowKey: String(row.rowNumber), column: String(column), value: next }] : []
      })
    })
  }, [selected, shownColumns, specs])

  async function correctPrices() {
    setPending("prices"); setError("")
    for (const correction of priceCorrections) await commitCell(correction.rowKey, correction.column, correction.value)
    setPending("")
    await refresh()
  }

  async function openEditor(mode: EditorMode = "columns") {
    if (!selected) return
    setEditorMode(mode)
    setPending("editor"); setError("")
    try {
      const response = await fetch(`/api/resources/index-schema?family=objects&key=${encodeURIComponent(selected.fileId)}`, { cache: "no-store" })
      const payload = (await response.json().catch(() => ({}))) as { model?: IndexEditorModel; error?: string }
      if (!response.ok || !payload.model) throw new Error(payload.error || "Les colonnes de ce classeur n’ont pas pu être lues.")
      setEditorError("")
      setEditor(payload.model)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Les colonnes de ce classeur n’ont pas pu être lues.")
    }
    setPending("")
  }

  async function applyEditor(operations: SchemaOperation[]) {
    if (!editor) return
    setPending("schema"); setEditorError("")
    try {
      const response = await fetch("/api/resources/index-schema", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ family: "objects", key: editor.key, operations }) })
      const payload = (await response.json().catch(() => ({}))) as { tables?: ObjectIndexTable[]; schemas?: Schemas; error?: string }
      if (!response.ok || !payload.tables) throw new Error(payload.error || "Les changements n’ont pas pu être écrits.")
      localEdits.current = {}
      savedEdits.current = {}
      setTables(payload.tables)
      if (payload.schemas) setSchemas((current) => ({ ...current, ...payload.schemas }))
      setVersion((current) => current + 1)
      setEditor(null)
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : "Les changements n’ont pas pu être écrits.")
    }
    setPending("")
  }

  useLayoutEffect(() => { mutateRef.current = mutate })

  const detailsRow = details !== null ? selected?.rows.find((row) => String(row.rowNumber) === details) : undefined
  const nameColumn = specs.findIndex((spec) => spec.kind === "name" || spec.kind === "name-form")
  const sheetRow = (key: string): IndexFieldProps["row"] => details === null ? undefined : {
    formula: (spec) => engine.formula(details, selected?.headers[Number(key)] ?? key, spec),
    gaugeMax: (spec) => engine.gaugeMax(details, spec),
    draw: async (spec) => { await drawCell(details, selected?.headers[Number(key)] ?? key, spec) },
    buttonVisible: (button) => engine.buttonVisible(details, button),
    runButton: (button) => runButton(details, button),
  }
  /** Les champs d'une ligne, enregistrés d'eux-mêmes par sa fiche (la ligne est donnée : on a pu passer à une autre). */
  async function saveSheet(rowKey: string, changes: Record<string, string>) {
    setSheetError("")
    // Au premier refus, on s'arrête et on le dit : la saisie reste affichée dans la fiche.
    // Comme dans le tableau, chaque case enregistrée est gardée ici (le tableau la montre sans relire la feuille).
    for (const [key, value] of Object.entries(changes)) {
      const failure = await commitCell(rowKey, key, value)
      if (failure) {
        setSheetError(failure)
        throw new Error(failure)
      }
    }
  }
  // La fiche montre les cases comme le tableau : avec ce qui vient d'y être enregistré.
  /* eslint-disable react-hooks/refs -- la fiche lit les cases comme le tableau les montre, saisies enregistrées comprises */
  const sheetTitle = details === null ? "" : nameColumn >= 0 ? rawOf(details, String(nameColumn)).replace(/<[^>]+>/g, "") : `Ligne ${details}`
  const sheetFields = details === null || !selected ? [] : sheetColumns.filter((index) => !["auto-links", "ranked-links", "tab"].includes(specs[index].kind)).map((index) => ({ key: String(index), label: selected.headers[index], spec: specs[index], value: rawOf(details, String(index)), long: isLongField(selected.headers[index]) }))
  /* eslint-enable react-hooks/refs */
  const weightColumns = shownColumns.filter((index) => ["number", "gauge", "formula"].includes(specs[index].kind)).map((index) => selected!.headers[index])

  const busy = Boolean(pending)
  const fullscreen = useFullscreenPanel()
  // Trier ou filtrer détache l’ordre affiché de celui de la feuille : « insérer
  // au-dessus » n’aurait plus de sens, l’entrée disparaît le temps du tri.
  const inSheetOrder = !sort && !query.trim()

  return (
    <ReferenceScopeProvider scope={referenceScope}>
    <section className="flex flex-col gap-3" {...{ [IN_PLACE_ATTRIBUTE]: pathname }}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid w-full min-w-0 gap-1 text-xs font-semibold text-muted-foreground sm:w-72">
          Onglet
          <span className="flex min-w-0 items-center gap-1 text-foreground">
            <IndexTabPicker
              value={activeView ? viewSelectKey(activeView.id) : selected ? tableKey(selected) : ""}
              options={[
                ...tables.map((table) => ({ value: tableKey(table), label: tableLabel(table), detail: String(table.rows.length) })),
                ...settings.views.map((view) => ({ value: viewSelectKey(view.id), label: `⧉ ${view.name}`, group: "Onglets-fenêtres" })),
              ]}
              onChange={(value) => { setSelectedKey(value); if (editedInView.current && !viewIdOfSelectKey(value)) { editedInView.current = false; void refresh(true) } }}
              hrefOf={tabHref}
              tabLabel={(option) => `Objets · ${option.label.replace(/^⧉ /, "")}`}
              disabled={!tables.length || busy}
              empty="Aucun tableau disponible"
            />
            {activeView && <Button type="button" variant="ghost" size="icon" onClick={() => setViewDialog("edit")} title="Modifier cet onglet-fenêtre" aria-label="Modifier cet onglet-fenêtre"><Pencil /></Button>}
          </span>
        </label>
        {selected && !activeView && <div className="relative min-w-48 flex-1 sm:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, type, sous-type ou autre champ…" className="pl-9" /></div>}
        {selected && !activeView && <IndexDisplayControls display={display} onDisplay={setDisplay} cards={tabCards?.cards ?? []} card={shownCard} onPick={setCardChoice} />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {selected?.webViewLink && <SheetsLinkButton href={selected.webViewLink} />}
          {selected && !activeView && display === "table" && <FullscreenButton fullscreen={fullscreen.fullscreen} onToggle={fullscreen.toggle} />}
          <ToolbarIconButton label="Actualiser : relire Google Sheets" onClick={() => void refresh()} disabled={busy}>{pending === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}</ToolbarIconButton>
          {priceCorrections.length > 0 && <Button type="button" variant="outline" onClick={() => void correctPrices()} disabled={busy} title="Les pièces d’argent (PA) et de bronze (PB) n’existent pas : ces prix sont réécrits en pièces de cuivre (PC).">{pending === "prices" ? <LoaderCircle className="animate-spin" /> : <Coins />}Corriger {priceCorrections.length} prix</Button>}
          <ToolbarIconButton label="Onglet-fenêtre : un onglet qui réaffiche les items répondant à des conditions, sans les copier" onClick={() => setViewDialog("new")} disabled={!tables.length || busy}><Filter /></ToolbarIconButton>
          {selected && !activeView && <DrawRowButton
            rows={displayedRows}
            weightColumns={weightColumns}
            weightOf={(rowKey, header) => { const index = columnOfHeader(header); return index >= 0 ? numericCellValue(valueOf(rowKey, String(index)), specs[index]) : null }}
            nameOf={(rowKey) => nameColumn >= 0 ? rawOf(rowKey, String(nameColumn)).replace(/<[^>]+>/g, "") : `Ligne ${rowKey}`}
            onOpen={setDetails}
            disabled={busy}
            compact
          />}
          <Button type="button" variant="outline" onClick={() => void openEditor("columns")} disabled={!selected || busy || Boolean(activeView)} title="Colonnes, types, réglages et tableaux de ce classeur">{pending === "editor" ? <LoaderCircle className="animate-spin" /> : <Settings2 />}Modifier</Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => setGuideOpen(true)} title="Guide des colonnes : types, formules, boutons, aléatoire" aria-label="Guide des colonnes"><CircleHelp /></Button>
          <Button type="button" onClick={() => setCreating(true)} disabled={!selected || busy || Boolean(activeView)}><Plus />Ajouter un item</Button>
        </div>
      </div>

      {editor && <IndexEditor
        model={editor}
        sampleRows={Object.fromEntries(tables.filter((table) => table.fileId === editor.key).map((table) => [table.tabName, table.rows.slice(0, 3).map((row) => Object.fromEntries(table.headers.map((header, index) => [header, row.values[index] ?? ""])))]))}
        open
        pending={pending === "schema"}
        error={editorError}
        onClose={() => { if (pending !== "schema") setEditor(null) }}
        onApply={(operations) => void applyEditor(operations)}
        onDeleteIndex={() => undefined}
        layouts={settings.layouts}
        onSaveLayouts={settings.saveLayouts}
        cardsIndex="objects"
        cards={settings.cards}
        onSaveCards={settings.saveCards}
        presentations={settings.presentations}
        onSavePresentations={settings.savePresentations}
        viewPresets={settings.viewPresets}
        onSaveViewPreset={settings.saveViewPreset}
        onDeleteViewPreset={settings.deleteViewPreset}
        previewRows={Object.fromEntries(tables.filter((table) => table.fileId === editor.key).map((table) => [table.tabName, table.rows.slice(0, 40).map((row) => Object.fromEntries(table.headers.map((header, index) => [header, row.values[index] ?? ""])))]))}
        optionsOf={(tabName, header) => { const table = tables.find((candidate) => candidate.fileId === editor.key && candidate.tabName === tabName); return (table ? specIn(table, header, schemas).options ?? [] : []).map((option) => ({ value: option.value, color: option.color })) }}
        statsPanel={<IndexStats {...statsProps} canEdit={!busy} />}
        initialMode={editorMode}
        initialTab={selected?.tabName}
      />}

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}

      {creating && selected && <IndexEntryForm
        title="Nouvel item"
        fields={sheetColumns.filter((index) => !isComputedSpec(specs[index]) && !["random", "id"].includes(specs[index].kind)).map((index) => ({ key: String(index), label: selected.headers[index], spec: specs[index], long: isLongField(selected.headers[index]) }))}
        pending={pending === "add"}
        layout={tabLayout(settings.layouts, selected.tabName, "form")}
        onCancel={() => setCreating(false)}
        onSave={(values) => void mutate({ action: "add", values: selected.headers.map((header, index) => [header, values[String(index)] ?? ""]) }, "add")}
      />}

      {activeView && activeView.layout?.kind === "stats" ? <IndexStats {...statsProps} pinnedOnly canEdit={false} onManage={() => void openEditor("stats")} />
        : activeView ? <ObjectViewGrid view={activeView} tables={tables} schemas={schemas} disabled={busy} layout={activeLayout} cards={settings.cards} onEdited={() => { editedInView.current = true }} /> : selected && display === "cards" ? (shownCard
        ? <IndexCardGrid card={shownCard} rows={displayedRows} rowSource={cardRow} onOpen={setDetails} hrefOf={rowHref} empty={selected.rows.length ? "Aucune ligne ne correspond à la recherche." : "Ce tableau est vide. Ajoute son premier item."} />
        : <NoCardsYet tabName={selected.tabName} onCreate={() => void openEditor("cards")} />
      ) : selected ? (
        <SheetGrid
          fullscreen={fullscreen.fullscreen}
          onExitFullscreen={fullscreen.exit}
          layoutKey={`eraser:object-index:grid:${selected.fileId}:${selected.sheetId}`}
          columns={columns}
          rows={displayedRows}
          valueOf={valueOf}
          onCommit={(rowKey, columnKey, html) => void commitCell(rowKey, columnKey, html)}
          sort={sort}
          onSort={setSort}
          disabled={busy}
          version={version}
          addRowLabel="Ajouter une ligne vide"
          rowCommands={{
            append: () => void mutate({ action: "add" }, "add"),
            // La ligne naît dans le tableau, son nom tapé dans sa case (sans formulaire).
            appendNamed: nameColumn >= 0 ? {
              nameColumn: String(nameColumn),
              placeholder: "Nom du nouvel item…",
              add: async (name: string) => {
                if (!await mutate({ action: "add", values: selected.headers.map((header, index) => [header, index === nameColumn ? name : ""]) }, "add")) throw new Error("NOT_ADDED")
              },
            } : undefined,
            insertBefore: inSheetOrder ? (rowKey) => void mutate({ action: "insert", row: rowRefOf(rowKey), before: true }, "insert") : undefined,
            // Les lignes vides arrivent sous celle-ci dans la feuille, quel que soit le tri affiché.
            insertRows: (rowKey, count) => void mutate({ action: "insert", row: rowRefOf(rowKey), count }, "insert"),
            duplicate: (rowKeys) => void mutate({ action: "duplicate", rows: rowKeys.map(rowRefOf) }, "duplicate"),
            remove: (rowKeys) => void mutate({ action: "delete", rows: rowKeys.map(rowRefOf) }, "delete"),
          }}
          rowMenuExtras={(rowKey) => <><ContextMenuSeparator /><ContextMenuItem onSelect={() => setDetails(rowKey)}><FileText className="size-3.5" />Ouvrir la fiche</ContextMenuItem><ContextMenuItem onSelect={() => openSend(rowKey)}><Send className="size-3.5" />Envoyer dans un inventaire…</ContextMenuItem>{tables.length > 1 && <ContextMenuItem onSelect={() => openMove(rowKey)}><ArrowRightLeft className="size-3.5" />Déplacer vers un onglet…</ContextMenuItem>}</>}
          toolbarTrailing={saving > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : null}
          empty={selected.rows.length ? "Aucune ligne ne correspond à la recherche." : "Ce tableau est vide. Ajoute sa première ligne."}
        />
      ) : !error ? <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Aucun Google Sheets n’a été trouvé dans le dossier « Objets ».</div> : null}

      {selected && detailsRow && details !== null && <IndexRowSheet
        key={tableKey(selected)}
        open
        rowKey={details}
        title={sheetTitle}
        subtitle={tableLabel(selected)}
        fields={sheetFields}
        layout={tabLayout(settings.layouts, selected.tabName, "form")}
        rowFor={sheetRow}
        error={sheetError}
        navigation={{
          rows: displayedRows.map((row) => row.key),
          labelOf: (rowKey) => nameColumn >= 0 ? rawOf(rowKey, String(nameColumn)).replace(/<[^>]+>/g, "") : `Ligne ${rowKey}`,
          onGo: (rowKey) => { setSheetError(""); setDetails(rowKey) },
        }}
        onSave={saveSheet}
        // Le tableau remonte ses cases : il montre ce qui vient d'être écrit dans la fiche.
        onClose={() => { setDetails(null); setSheetError(""); setVersion((current) => current + 1) }}
      />}
      {viewDialog && <IndexViewDialog
        open
        onOpenChange={(open) => { if (!open) setViewDialog(null) }}
        index="objects"
        allowStats
        view={viewDialog === "edit" ? activeView : null}
        sources={[{ value: ALL_SOURCES, label: "Tous les index d’items" }, ...tables.map((table) => ({ value: tableKey(table), label: tableLabel(table) }))]}
        columnsOf={(source) => [...new Set((source === ALL_SOURCES ? tables : tables.filter((table) => tableKey(table) === source)).flatMap((table) => table.headers).filter((header) => header.trim() && !/^(id|colonne \d+)$/i.test(header)))]}
        onSave={async (view) => { const id = await settings.saveView(view); setSelectedKey(viewSelectKey(id)); return id }}
        onDelete={async (id) => { await settings.deleteView(id); setSelectedKey(tables[0] ? tableKey(tables[0]) : "") }}
      />}
      {guideOpen && <IndexGuide open onClose={() => setGuideOpen(false)} />}
      {selected && sendRow !== null && <ObjectSendDialog
        open
        onOpenChange={(open) => { if (!open) setSendRow(null) }}
        itemId={sendRow.itemId}
        itemName={sendRow.name}
        currentCampaignId={viewRole === "mj" ? selectedCampaignId : null}
        onSent={(message) => notify(message)}
      />}
      {selected && moveRow !== null && <Dialog open onOpenChange={(open) => { if (!open && pending !== "move") setMoveRow(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="size-4 text-primary" />Déplacer « {moveRow.name || "cet item"} »</DialogTitle>
            <DialogDescription>Vers quel onglet ? L’item garde son ID : les inventaires qui le contiennent le retrouvent. Une colonne remplie que l’onglet d’arrivée n’a pas y est ajoutée.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-80 gap-1 overflow-y-auto">
            {tables.filter((table) => tableKey(table) !== tableKey(selected)).map((table) => <Button key={tableKey(table)} type="button" variant="outline" className="h-auto justify-start py-2" disabled={busy} onClick={async () => {
              const name = moveRow.name
              if (await mutate({ action: "move", row: rowRefOf(moveRow.rowKey), targetFileId: table.fileId, targetTabName: table.tabName }, "move")) {
                setMoveRow(null)
                notify(`${name ? `« ${name} »` : "L’item"} est maintenant dans « ${tableLabel(table)} ».`)
              }
            }}>{pending === "move" ? <LoaderCircle className="animate-spin" /> : <ArrowRightLeft />}<span className="min-w-0 flex-1 truncate text-left">{tableLabel(table)}</span><span className="text-xs text-muted-foreground">{table.rows.length}</span></Button>)}
          </div>
        </DialogContent>
      </Dialog>}
      {noticesView}
      {choiceView}
    </section>
    </ReferenceScopeProvider>
  )
}
