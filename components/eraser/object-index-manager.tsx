"use client"

import dynamic from "next/dynamic"
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRememberedSearch } from "@/hooks/use-remembered-search"
import { usePathname, useRouter } from "next/navigation"
import { CircleHelp, Coins, FileText, Filter, ImageIcon, LoaderCircle, Pencil, Plus, RefreshCw, Search, Settings2 } from "lucide-react"

import { usePersistentState } from "@/hooks/use-persistent-state"
import { addToInventory, chooseCampaign, copyToClipboard, DrawRowButton, rowCard, sendToCampaignChat, useChoiceDialog, useIndexNotices } from "@/components/eraser/index-action-ui"
import { indexGridColumn, IndexEntryForm, type IndexFieldProps } from "@/components/eraser/index-cells"
import { createRowEngine } from "@/components/eraser/index-row-engine"
import { IndexRowSheet } from "@/components/eraser/index-row-sheet"
import { ReferenceScopeProvider } from "@/components/eraser/reference-menu"
import { shownReferenceText } from "@/components/eraser/reference-store"
import { OBJECT_REFERENCE_INDEX } from "@/lib/index-references"
import { IndexViewDialog, useIndexSettings } from "@/components/eraser/index-views"
import { ObjectViewGrid } from "@/components/eraser/object-view-grid"
import { ObjectIndexRegroup } from "@/components/eraser/object-index-regroup"
import { useShellData } from "@/components/eraser/app-shell"
import { IN_PLACE_ATTRIBUTE, replaceAppUrl, URL_CHANGE_EVENT } from "@/components/eraser/app-tabs"
import { IndexTabPicker, useIndexTabParam } from "@/components/eraser/index-tab-picker"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { ObjectIcon } from "@/components/eraser/object-icon"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ObjectIndexTable } from "@/lib/google-sheets"
import { runActionButton, type ActionRuntime } from "@/lib/index-actions"
import { foldName, isComputedSpec, isGridSpec, isRichSpec, isSheetSpec, normalizeSpec, objectColumnSpec, type ActionButton, type IndexColumnSpec } from "@/lib/index-columns"
import { columnFormulaValue, numericCellValue } from "@/lib/index-formula"
import { cryptoRandom, drawRandom, drawText, type RandomCandidateRow } from "@/lib/index-random"
import { isBuiltinWorldIndexKey, worldIndexDefinitions } from "@/lib/world-index-definitions"
import { numberCorrection } from "@/lib/index-numbers"
import { indexSortKey, sortByIndexKey } from "@/lib/index-sort"
import { findEntry, isTrashedEntry, type IndexEditorModel, type SchemaEntry, type SchemaOperation } from "@/lib/index-schema-shared"
import { ALL_SOURCES, viewIdOfSelectKey, viewSelectKey } from "@/lib/index-views"
import { tabLayout } from "@/lib/index-layouts"
import { headerOccurrence, objectIndexRowRef } from "@/lib/object-index-refs"

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

/** Colonne virtuelle : l'identifiant que l'inventaire donne à un objet d'une feuille sans colonne ID. */
const COMPUTED_ID = "__id"
const idSpec: IndexColumnSpec = { kind: "id", hidden: true }

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
  const [notice, setNotice] = useState("")
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
  // Les onglets-fenêtres de l'index des objets : des lignes de un ou plusieurs tableaux, selon des conditions.
  const settings = useIndexSettings("objects")
  const { viewRole } = useShellData()
  const [viewDialog, setViewDialog] = useState<"new" | "edit" | null>(null)
  // Une case modifiée dans une fenêtre : en revenant à un tableau, il est relu.
  const editedInView = useRef(false)
  const activeView = useMemo(() => { const id = viewIdOfSelectKey(selectedKey); return id ? settings.views.find((view) => view.id === id) ?? null : null }, [selectedKey, settings.views])
  const selected = useMemo(() => tables.find((table) => tableKey(table) === selectedKey) ?? tables[0] ?? null, [selectedKey, tables])
  // « {Prix} » écrit dans une description : le menu « { » propose les colonnes de l'objet.
  const selectedTab = selected?.tabName
  const referenceScope = useMemo(() => ({ index: OBJECT_REFERENCE_INDEX, tab: selectedTab }), [selectedTab])
  // Les cellules en cours d’enregistrement gardent la valeur saisie : le tableau
  // n’attend jamais Google Sheets pour afficher ce qui vient d’être tapé.
  const localEdits = useRef<Record<string, string>>({})

  // Le type de chaque colonne : celui du schéma du classeur, sinon reconnu par son nom.
  const specs = useMemo(() => (selected?.headers ?? []).map((header, _index, headers) => {
    const base = objectColumnSpec(header, headers)
    const entry = selected ? findEntry(schemas[selected.fileId] ?? [], selected.tabName, header) : undefined
    return entry?.spec ? { ...base, ...entry.spec } : base
  }), [schemas, selected])
  // Les colonnes vides d'en-tête ou à la corbeille ne s'affichent pas (elles restent dans Sheets).
  const liveColumns = useMemo(() => (selected?.headers ?? []).flatMap((header, index) => {
    if (!header.trim() || specs[index]?.kind === "archived") return []
    if (selected && isTrashedEntry(findEntry(schemas[selected.fileId] ?? [], selected.tabName, header))) return []
    return [index]
  }), [schemas, selected, specs])
  // Le tableau : « Tableau et formulaire » et « Tableau seulement » ; la fiche : « … formulaire ».
  const shownColumns = useMemo(() => liveColumns.filter((index) => isGridSpec(specs[index])), [liveColumns, specs])
  const sheetColumns = useMemo(() => liveColumns.filter((index) => isSheetSpec(specs[index])), [liveColumns, specs])
  const columnOfHeader = useCallback((header: string) => {
    const index = (selected?.headers ?? []).findIndex((candidate) => foldName(candidate) === foldName(header))
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
    return selected && row ? objectIndexRowRef(selected.headers, row) : { id: "", rowNumber: Number(rowKey), name: "" }
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
    setTables(payload.tables)
    setVersion((current) => current + 1)
    const table = payload.tables.find((candidate) => tableKey(candidate) === tableKey(selected))
    const iconIndex = table?.headers.findIndex(isIconHeader) ?? -1
    return table?.rows.find((candidate) => String(candidate.rowNumber) === rowKey)?.values[iconIndex] ?? ""
  }, [rowRefOf, selected])


  const rawOf = useCallback((rowKey: string, columnKey: string) => {
    // La clé vient du tableau réellement affiché, pas de la préférence enregistrée :
    // au premier affichage la préférence est encore vide alors qu'un tableau est choisi.
    const local = selected ? localEdits.current[`${tableKey(selected)}:${rowKey}:${columnKey}`] : undefined
    if (local !== undefined) return local
    if (columnKey === COMPUTED_ID) return selected ? `DRIVE-${selected.fileId}-${selected.sheetId}-${rowKey}` : ""
    const row = selected?.rows.find((candidate) => String(candidate.rowNumber) === rowKey)
    const spec = specs[Number(columnKey)]
    return (spec && !isRichSpec(spec) ? row?.values[Number(columnKey)] : row?.html[Number(columnKey)]) ?? ""
  }, [selected, specs])

  const commitCell = useCallback(async (rowKey: string, columnKey: string, html: string) => {
    if (!selected) return
    localEdits.current[`${tableKey(selected)}:${rowKey}:${columnKey}`] = html
    setSaving((current) => current + 1)
    try {
      // La ligne par son ID, la colonne par son en-tête : le serveur les retrouve dans la feuille.
      const column = Number(columnKey)
      const response = await fetch("/api/resources/object-indexes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update-cell", fileId: selected.fileId, tabName: selected.tabName, row: rowRefOf(rowKey), header: selected.headers[column] ?? "", occurrence: headerOccurrence(selected.headers, column), html }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setError(payload.error || "Cette cellule n’a pas pu être enregistrée.")
      } else setError("")
    } catch {
      setError("Cette cellule n’a pas pu être enregistrée.")
    }
    setSaving((current) => current - 1)
  }, [rowRefOf, selected])

  const router = useRouter()
  const { notify, view: noticesView } = useIndexNotices()
  const { ask, view: choiceView } = useChoiceDialog()
  const [details, setDetails] = useState<string | null>(null)
  const [sheetPending, setSheetPending] = useState(false)
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

  const mutateRef = useRef<(body: Record<string, unknown>, label: string) => Promise<void>>(async () => undefined)
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
    duplicate: () => mutateRef.current({ action: "duplicate", rows: [rowRefOf(rowKey)] }, "duplicate"),
    remove: () => mutateRef.current({ action: "delete", rows: [rowRefOf(rowKey)] }, "delete"),
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
    campaignInventory: async () => {
      const idIndex = specs.findIndex((spec) => spec.kind === "id")
      const itemId = (idIndex >= 0 ? rawOf(rowKey, String(idIndex)).trim() : "") || (selected ? `DRIVE-${selected.fileId}-${selected.sheetId}-${rowKey}` : "")
      const target = await addToInventory(ask, itemId)
      if (target) notify(`Objet ajouté : ${target}.`)
    },
  }), [ask, columnOfHeader, commitCell, drawCell, engine, notify, rawOf, rowRefOf, router, selected, sheetColumns, specs, valueOf])
  const runButton = useCallback(async (rowKey: string, button: ActionButton) => { await runActionButton(button, runtimeFor(rowKey)) }, [runtimeFor])

  // Chaque colonne passe par le moteur des index : son type décide de sa cellule.
  /* eslint-disable react-hooks/refs -- les cellules ne lisent ces valeurs qu'en se dessinant, comme avant : indexGridColumn ne fait que les ranger dans la colonne */
  const columns = useMemo<SheetGridColumn[]>(() => {
    const context = {
      valueOf,
      commit: (rowKey: string, columnKey: string, value: string) => void commitCell(rowKey, columnKey, value),
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
    return list
  }, [columnOfHeader, commitCell, drawCell, engine, hasIdColumn, iconPreview, rowHref, runButton, selected, shownColumns, specs, uploadIcon, valueOf])
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
    setTables(payload.tables)
    if (payload.schemas) setSchemas(payload.schemas)
    setVersion((current) => current + 1)
  }

  /** Pose les icônes d'Eraser dans les cases « Icône » encore vides de tous les index. */
  async function syncIcons() {
    setPending("icons"); setError(""); setNotice("")
    const response = await fetch("/api/resources/object-indexes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sync-icons" }),
    })
    const payload = (await response.json()) as { tables?: ObjectIndexTable[]; result?: { iconsUpdated?: number }; error?: string }
    setPending("")
    if (!response.ok || !payload.tables) return setError(payload.error || "Les icônes n’ont pas pu être mises à jour.")
    localEdits.current = {}
    setTables(payload.tables)
    setVersion((current) => current + 1)
    const count = payload.result?.iconsUpdated ?? 0
    setNotice(count ? `${count} icône${count > 1 ? "s" : ""} posée${count > 1 ? "s" : ""} dans Google Sheets (images du dossier « icone objet » du Drive). Les icônes choisies à la main n’ont pas été touchées.` : "Toutes les cases « Icône » ont déjà une image.")
  }

  async function mutate(body: Record<string, unknown>, label: string) {
    if (!selected) return
    setPending(label); setError("")
    const response = await fetch("/api/resources/object-indexes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, fileId: selected.fileId, tabName: selected.tabName }),
    })
    const payload = (await response.json()) as { tables?: ObjectIndexTable[]; error?: string }
    setPending("")
    if (!response.ok || !payload.tables) return setError(payload.error || "Enregistrement impossible.")
    localEdits.current = {}
    setTables(payload.tables)
    setVersion((current) => current + 1)
    setCreating(false)
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

  async function openEditor() {
    if (!selected) return
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
  const savedCell = (index: number) => (specs[index] && !isRichSpec(specs[index]) ? detailsRow?.values[index] : detailsRow?.html[index]) ?? ""
  const nameColumn = specs.findIndex((spec) => spec.kind === "name" || spec.kind === "name-form")
  const sheetRow = (key: string): IndexFieldProps["row"] => details === null ? undefined : {
    formula: (spec) => engine.formula(details, selected?.headers[Number(key)] ?? key, spec),
    gaugeMax: (spec) => engine.gaugeMax(details, spec),
    draw: async (spec) => { await drawCell(details, selected?.headers[Number(key)] ?? key, spec) },
    buttonVisible: (button) => engine.buttonVisible(details, button),
    runButton: (button) => runButton(details, button),
  }
  async function saveSheet(changes: Record<string, string>) {
    if (details === null) return
    setSheetPending(true); setSheetError("")
    for (const [key, value] of Object.entries(changes)) await commitCell(details, key, value)
    setSheetPending(false)
    await refresh(true)
  }
  const weightColumns = shownColumns.filter((index) => ["number", "gauge", "formula"].includes(specs[index].kind)).map((index) => selected!.headers[index])

  const busy = Boolean(pending)
  // Trier ou filtrer détache l’ordre affiché de celui de la feuille : « insérer
  // au-dessus » n’aurait plus de sens, l’entrée disparaît le temps du tri.
  const inSheetOrder = !sort && !query.trim()

  return (
    <ReferenceScopeProvider scope={referenceScope}>
    <section className="flex flex-col gap-3" {...{ [IN_PLACE_ATTRIBUTE]: pathname }}>
      {viewRole === "admin" && <ObjectIndexRegroup onChanged={() => void refresh(true)} />}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
          Tableau à afficher
          <span className="flex items-center gap-1">
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
        {selected && !activeView && <div className="relative min-w-0 lg:max-w-sm lg:flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, type, sous-type ou autre champ…" className="pl-9" /></div>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={busy}>{pending === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
          {priceCorrections.length > 0 && <Button type="button" variant="outline" onClick={() => void correctPrices()} disabled={busy} title="Les pièces d’argent (PA) et de bronze (PB) n’existent pas : ces prix sont réécrits en pièces de cuivre (PC).">{pending === "prices" ? <LoaderCircle className="animate-spin" /> : <Coins />}Corriger {priceCorrections.length} prix</Button>}
          <Button type="button" variant="outline" onClick={() => setViewDialog("new")} disabled={!tables.length || busy} title="Un onglet qui réaffiche les objets répondant à des conditions, sans les copier"><Filter />Onglet-fenêtre</Button>
          {selected && !activeView && <DrawRowButton
            rows={displayedRows}
            weightColumns={weightColumns}
            weightOf={(rowKey, header) => { const index = columnOfHeader(header); return index >= 0 ? numericCellValue(valueOf(rowKey, String(index)), specs[index]) : null }}
            nameOf={(rowKey) => nameColumn >= 0 ? rawOf(rowKey, String(nameColumn)).replace(/<[^>]+>/g, "") : `Ligne ${rowKey}`}
            onOpen={setDetails}
            disabled={busy}
          />}
          <Button type="button" variant="outline" onClick={() => void openEditor()} disabled={!selected || busy || Boolean(activeView)} title="Colonnes, types, réglages et tableaux de ce classeur">{pending === "editor" ? <LoaderCircle className="animate-spin" /> : <Settings2 />}Modifier</Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => setGuideOpen(true)} title="Guide des colonnes : types, formules, boutons, aléatoire" aria-label="Guide des colonnes"><CircleHelp /></Button>
          <Button type="button" variant="outline" onClick={() => void syncIcons()} disabled={!tables.length || busy} title="Remplit les cases « Icône » vides avec les icônes d’Eraser du dossier « icone objet » ; une icône choisie à la main reste en place.">{pending === "icons" ? <LoaderCircle className="animate-spin" /> : <ImageIcon />}Mettre à jour les icônes</Button>
          <Button type="button" onClick={() => setCreating(true)} disabled={!selected || busy || Boolean(activeView)}><Plus />Ajouter un objet</Button>
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
      />}

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-xl border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">{notice}</p>}

      {creating && selected && <IndexEntryForm
        title="Nouvel objet"
        fields={sheetColumns.filter((index) => !isComputedSpec(specs[index]) && !["random", "id"].includes(specs[index].kind)).map((index) => ({ key: String(index), label: selected.headers[index], spec: specs[index], long: isLongField(selected.headers[index]) }))}
        pending={pending === "add"}
        layout={tabLayout(settings.layouts, selected.tabName, "form")}
        onCancel={() => setCreating(false)}
        onSave={(values) => void mutate({ action: "add", values: selected.headers.map((header, index) => [header, values[String(index)] ?? ""]) }, "add")}
      />}

      {activeView ? <ObjectViewGrid view={activeView} tables={tables} schemas={schemas} disabled={busy} onEdited={() => { editedInView.current = true }} /> : selected ? (
        <SheetGrid
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
            insertBefore: inSheetOrder ? (rowKey) => void mutate({ action: "insert", row: rowRefOf(rowKey), before: true }, "insert") : undefined,
            // Les lignes vides arrivent sous celle-ci dans la feuille, quel que soit le tri affiché.
            insertRows: (rowKey, count) => void mutate({ action: "insert", row: rowRefOf(rowKey), count }, "insert"),
            duplicate: (rowKeys) => void mutate({ action: "duplicate", rows: rowKeys.map(rowRefOf) }, "duplicate"),
            remove: (rowKeys) => void mutate({ action: "delete", rows: rowKeys.map(rowRefOf) }, "delete"),
          }}
          rowMenuExtras={(rowKey) => <><ContextMenuSeparator /><ContextMenuItem onSelect={() => setDetails(rowKey)}><FileText className="size-3.5" />Ouvrir la fiche</ContextMenuItem></>}
          toolbarTrailing={saving > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : null}
          empty={selected.rows.length ? "Aucune ligne ne correspond à la recherche." : "Ce tableau est vide. Ajoute sa première ligne."}
        />
      ) : !error ? <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Aucun Google Sheets n’a été trouvé dans le dossier « Objets ».</div> : null}

      {selected && detailsRow && <IndexRowSheet
        key={`${tableKey(selected)}:${details}`}
        open
        title={nameColumn >= 0 ? savedCell(nameColumn).replace(/<[^>]+>/g, "") : `Ligne ${details}`}
        subtitle={tableLabel(selected)}
        fields={sheetColumns.filter((index) => !["auto-links", "ranked-links", "tab"].includes(specs[index].kind)).map((index) => ({ key: String(index), label: selected.headers[index], spec: specs[index], value: savedCell(index), long: isLongField(selected.headers[index]) }))}
        layout={tabLayout(settings.layouts, selected.tabName, "form")}
        rowFor={sheetRow}
        pending={sheetPending}
        error={sheetError}
        onSave={saveSheet}
        onClose={() => { setDetails(null); setSheetError("") }}
      />}
      {viewDialog && <IndexViewDialog
        open
        onOpenChange={(open) => { if (!open) setViewDialog(null) }}
        index="objects"
        view={viewDialog === "edit" ? activeView : null}
        sources={[{ value: ALL_SOURCES, label: "Tous les index d’objets" }, ...tables.map((table) => ({ value: tableKey(table), label: tableLabel(table) }))]}
        columnsOf={(source) => [...new Set((source === ALL_SOURCES ? tables : tables.filter((table) => tableKey(table) === source)).flatMap((table) => table.headers).filter((header) => header.trim() && !/^(id|colonne \d+)$/i.test(header)))]}
        onSave={async (view) => { const id = await settings.saveView(view); setSelectedKey(viewSelectKey(id)); return id }}
        onDelete={async (id) => { await settings.deleteView(id); setSelectedKey(tables[0] ? tableKey(tables[0]) : "") }}
      />}
      {guideOpen && <IndexGuide open onClose={() => setGuideOpen(false)} />}
      {noticesView}
      {choiceView}
    </section>
    </ReferenceScopeProvider>
  )
}
