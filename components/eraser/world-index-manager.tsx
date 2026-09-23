"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowRightLeft, Check, ExternalLink, Link2, LoaderCircle, Plus, RefreshCw, Search, X } from "lucide-react"

import { CreatureCheckCell, CreatureChoiceCell, CreatureChoiceSelect, CreatureSheetDialog, isChecked } from "@/components/eraser/creature-sheet"
import { RichTextField, richTextPlainText } from "@/components/eraser/rich-text"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePersistentState } from "@/hooks/use-persistent-state"
import {
  creatureChoices,
  foldName,
  gridHeadersOf,
  isLongColumn,
  linkEndCovers,
  isNameColumn,
  linkedColumnsOf,
  worldIndexDefinitions,
  worldIndexLinks,
  type WorldIndexKey,
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

/** Les phrases qui expliquent, sous le tableau, quelles colonnes se remplissent seules. */
function linkHints(index: WorldIndexKey, tab: string) {
  return worldIndexLinks.flatMap(([left, right]) => {
    for (const [end, other] of [[left, right], [right, left]] as const) {
      if (!linkEndCovers(end, index, tab)) continue
      const where = linkEndCovers(other, index, tab) ? "" : other.index === index ? ` (onglet ${other.tab})` : ` (${worldIndexDefinitions[other.index].title})`
      return [`« ${end.column} » ↔ « ${other.column} »${where}`]
    }
    return []
  })
}

function EntryForm({ headers, visible, linked, itemLabel, pending, controls, tabs, tabName, onTabChange, onCancel, onSave }: {
  headers: string[]
  visible: number[]
  linked: string[]
  itemLabel: string
  pending: boolean
  /** Listes déroulantes et case à cocher des créatures. */
  controls: boolean
  /** Vue « Tout » : l'onglet où ranger la nouvelle ligne. */
  tabs?: string[]
  tabName?: string
  onTabChange?: (tabName: string) => void
  onCancel: () => void
  onSave: (values: string[]) => void
}) {
  const [values, setValues] = useState<string[]>(() => headers.map(() => ""))
  const set = (index: number, value: string) => setValues((current) => current.map((item, position) => position === index ? value : item))
  const nameIndex = headers.findIndex(isNameColumn)
  const named = nameIndex < 0 || values[nameIndex].trim().length > 0
  const isLinked = (header: string) => linked.some((column) => foldName(column) === foldName(header))

  return <section className="rounded-2xl border bg-card/90 p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-display text-xl font-semibold">Ajouter {itemLabel}</h3>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Fermer"><X /></Button>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {tabs && tabName && <label className="grid gap-1 text-xs font-semibold">
        Onglet
        <NativeSelect value={tabName} onChange={(event) => onTabChange?.(event.target.value)} className="w-full">
          {tabs.map((tab) => <NativeSelectOption key={tab} value={tab}>{tab}</NativeSelectOption>)}
        </NativeSelect>
      </label>}
      {visible.map((index) => [headers[index], index] as const).map(([header, index]) => {
        if (controls && creatureChoices[header]) return <div key={header + index} className="grid gap-1 text-xs font-semibold"><span>{header}</span><CreatureChoiceSelect header={header} value={values[index]} onChange={(value) => set(index, value)} /></div>
        if (controls && foldName(header) === "dressable") return <label key={header + index} className="flex h-9 items-center gap-2 self-end rounded-lg border bg-background/50 px-3 text-sm font-semibold"><Checkbox checked={isChecked(values[index])} onCheckedChange={(checked) => set(index, checked === true ? "Oui" : "Non")} />{header}</label>
        return isLongColumn(header)
          ? <label key={header + index} className="grid gap-1 text-xs font-semibold md:col-span-2">{header}<RichTextField value={values[index]} onCommit={(html) => set(index, html)} /></label>
          : <label key={header + index} className="grid gap-1 text-xs font-semibold">
              <span className="flex items-center gap-1">{header}{isLinked(header) && <Link2 className="size-3 text-primary" aria-label="Colonne liée" />}</span>
              <Input autoFocus={index === nameIndex} value={values[index]} onChange={(event) => set(index, event.target.value)} placeholder={isLinked(header) ? "Noms séparés par des virgules" : undefined} />
            </label>
      })}
    </div>
    <div className="mt-4 flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
      <Button type="button" onClick={() => onSave(values)} disabled={pending || !named}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
    </div>
  </section>
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
  const definition = worldIndexDefinitions[indexKey]
  const [data, setData] = useState(initialData)
  // Plusieurs onglets : la liste s'ouvre sur « Tout ».
  const [tabName, setTabName] = usePersistentState(`eraser:world-index:${indexKey}:view`, ALL_TABS, (value): value is string => typeof value === "string")
  const [pending, setPending] = useState("")
  const [error, setError] = useState(initialError)
  const [saving, setSaving] = useState(0)
  const [creating, setCreating] = useState(false)
  const [creatingTab, setCreatingTab] = useState(definition.tabs[0].name)
  const [version, setVersion] = useState(0)
  const [query, setQuery] = useState("")
  const [details, setDetails] = useState<string | null>(null)
  const [sort, setSort] = usePersistentState<SheetGridSort>(`eraser:world-index:${indexKey}:sort`, null, isValidSort)
  const localEdits = useRef<Record<string, string>>({})

  const tables = useMemo(() => data?.tables ?? [], [data])
  const selectedTable = tables.find((candidate) => candidate.tabName === tabName)
  // « Tout » n'a de sens que si les onglets ont les mêmes colonnes : les lieux, pas les religions.
  const canShowAll = useMemo(() => {
    const signature = (headers: string[]) => [...headers].map(foldName).sort().join("|")
    return definition.tabs.length > 1 && definition.tabs.every((tab) => signature(tab.headers) === signature(definition.tabs[0].headers))
  }, [definition])
  const showAll = canShowAll && tables.length > 1 && !selectedTable
  const viewTables = useMemo(() => showAll ? tables : selectedTable ? [selectedTable] : tables.slice(0, 1), [selectedTable, showAll, tables])
  // Le premier tableau affiché donne les colonnes : les onglets d'un même index ont les mêmes.
  const table: WorldIndexTable | null = viewTables[0] ?? null
  const tabDefinition = definition.tabs.find((tab) => tab.name === table?.tabName) ?? definition.tabs[0]
  const linked = useMemo(() => table ? linkedColumnsOf(indexKey, table.tabName) : [], [indexKey, table])
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

  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const local = localEdits.current[`${rowKey}:${columnKey}`]
    if (local !== undefined) return local
    const found = locate(rowKey)
    if (!found) return ""
    if (columnKey === TAB_COLUMN) return found.table.tabName
    const index = columnIndexOf(found.table, columnKey)
    if (index < 0) return ""
    return isLongColumn(columnKey) ? found.row.html[index] ?? "" : found.row.values[index] ?? ""
  }, [locate])

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
  const visible = useMemo(() => table ? gridHeadersOf(tabDefinition, table.headers) : [], [tabDefinition, table])
  const columns = useMemo<SheetGridColumn[]>(() => {
    if (!table) return []
    const isLinked = (header: string) => linked.some((column) => foldName(column) === foldName(header))
    const list: SheetGridColumn[] = visible.map((index) => table.headers[index]).map((header) => {
      const column: SheetGridColumn = {
        key: header,
        label: isLinked(header) ? `${header} ↔` : header,
        width: columnWidthFor(header, tabDefinition.widths[tabDefinition.headers.findIndex((candidate) => foldName(candidate) === foldName(header))]),
        plain: !isLongColumn(header),
        cellClassName: isNameColumn(header) ? "font-semibold" : undefined,
        // Les noms et les colonnes liées déclenchent des liens : on attend la sortie de la
        // cellule, sinon un nom à moitié tapé (« Yfl ») créerait une entité.
        commitDelay: isNameColumn(header) || isLinked(header) ? Infinity : undefined,
      }
      if (!nameOpensDetails) return column
      // Créatures : le nom ouvre la fiche, les listes fermées sont des menus déroulants.
      if (isNameColumn(header)) column.control = (rowKey) => <button
        type="button"
        onClick={() => setDetails(rowKey)}
        className="flex min-h-8 w-full items-center rounded-md px-2 py-1.5 text-left font-semibold hover:bg-muted hover:text-primary hover:underline"
        title="Ouvrir la fiche"
      >{richTextPlainText(valueOf(rowKey, header)) || <span className="font-normal italic text-muted-foreground">Sans nom</span>}</button>
      else if (creatureChoices[header]) column.control = (rowKey) => <CreatureChoiceCell header={header} value={valueOf(rowKey, header)} disabled={busy} onChange={(value) => void commitCell(rowKey, header, value)} />
      else if (foldName(header) === "dressable") column.control = (rowKey) => <CreatureCheckCell label={header} value={valueOf(rowKey, header)} disabled={busy} onChange={(value) => void commitCell(rowKey, header, value)} />
      return column
    })
    if (showAll) list.splice(1, 0, { key: TAB_COLUMN, label: "Onglet", width: 180, custom: true })
    return list
  }, [busy, commitCell, linked, nameOpensDetails, showAll, tabDefinition, table, valueOf, visible])

  const displayedRows = useMemo(() => {
    const folded = foldName(query)
    const rows = viewTables.flatMap((owner) => owner.rows
      .filter((row) => !folded || row.values.some((value) => foldName(value).includes(folded)))
      .map((row) => {
        const column = sort ? (sort.column === TAB_COLUMN ? -1 : columnIndexOf(owner, sort.column)) : -1
        const sortValue = sort?.column === TAB_COLUMN ? owner.tabName : column >= 0 ? row.values[column] ?? "" : ""
        return { key: rowKeyOf(owner.tabName, row.rowNumber), rowNumber: row.rowNumber, sortValue }
      }))
    const sorted = sort
      ? [...rows].sort((left, right) => left.sortValue.localeCompare(right.sortValue, "fr", { numeric: true, sensitivity: "base" }) * (sort.direction === "asc" ? 1 : -1))
      : rows
    return sorted.map(({ key, rowNumber }) => ({ key, rowNumber }))
  }, [query, sort, viewTables])

  // La colonne « Onglet » de la vue « Tout ». Stable : les lignes ne se redessinent pas pour rien.
  const moveRow = useRef(mutate)
  useLayoutEffect(() => { moveRow.current = mutate })
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
  const hints = table ? linkHints(indexKey, table.tabName) : []
  const formTable = showAll ? tableByName.get(creatingTab) ?? table : table
  const formDefinition = definition.tabs.find((tab) => tab.name === formTable?.tabName) ?? tabDefinition

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
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={busy}>{pending === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
          <Button type="button" onClick={() => setCreating(true)} disabled={!table || busy}><Plus />Ajouter {showAll ? definition.itemLabel ?? tabDefinition.itemLabel : tabDefinition.itemLabel}</Button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}

      {hints.length > 0 && <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Link2 className="size-3.5 text-primary" />
        Colonnes liées, qui se complètent d’elles-mêmes (noms séparés par des virgules) : {hints.join(" · ")}
      </p>}

      {creating && formTable && <EntryForm
        key={formTable.tabName}
        headers={formTable.headers}
        // L'extension se règle dans le tableau : elle n'a pas sa place dans le formulaire des créatures.
        visible={gridHeadersOf(formDefinition, formTable.headers).filter((index) => !nameOpensDetails || foldName(formTable.headers[index]) !== "extension")}
        linked={linkedColumnsOf(indexKey, formTable.tabName)}
        itemLabel={formDefinition.itemLabel}
        pending={pending === "add"}
        controls={nameOpensDetails}
        tabs={showAll ? tables.map((candidate) => candidate.tabName) : undefined}
        tabName={showAll ? formTable.tabName : undefined}
        onTabChange={setCreatingTab}
        onCancel={() => setCreating(false)}
        onSave={(values) => void addRow(formTable.tabName, values.map((value, index) => isLongColumn(formTable.headers[index]) ? value : richTextPlainText(value)))}
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
            duplicate: (rowKeys) => void mutate("duplicate", rowKeys, "duplicate"),
            remove: (rowKeys) => void mutate("delete", rowKeys, "delete"),
          }}
          rowMenuExtras={(rowKey) => {
            const targets = moveTargetsOf(parseRowKey(rowKey).tabName)
            if (!targets.length) return null
            return <>
              <ContextMenuSeparator />
              <ContextMenuLabel className="flex items-center gap-1.5"><ArrowRightLeft className="size-3.5" />Déplacer vers</ContextMenuLabel>
              {targets.map((target) => <ContextMenuItem key={target} onSelect={() => void mutate("move", [rowKey], "move", { toTab: target })}>{target}</ContextMenuItem>)}
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
    </section>
  )
}
