"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Check, ExternalLink, Link2, LoaderCircle, Plus, RefreshCw, Search, X } from "lucide-react"

import { RichTextField, richTextPlainText } from "@/components/eraser/rich-text"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { usePersistentState } from "@/hooks/use-persistent-state"
import {
  foldName,
  isLongColumn,
  isNameColumn,
  linkedColumnsOf,
  worldIndexDefinitions,
  worldIndexLinks,
  type WorldIndexKey,
} from "@/lib/world-index-definitions"
import type { WorldIndexData, WorldIndexTable } from "@/lib/world-indexes"

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

/** Les phrases qui expliquent, sous le tableau, quelles colonnes se remplissent seules. */
function linkHints(index: WorldIndexKey, tab: string) {
  return worldIndexLinks.flatMap(([left, right]) => {
    for (const [end, other] of [[left, right], [right, left]] as const) {
      if (end.index !== index || end.tab !== tab) continue
      const where = other.index === index && other.tab === tab ? "" : other.index === index ? ` (onglet ${other.tab})` : ` (${worldIndexDefinitions[other.index].title})`
      return [`« ${end.column} » ↔ « ${other.column} »${where}`]
    }
    return []
  })
}

function EntryForm({ headers, linked, itemLabel, pending, onCancel, onSave }: { headers: string[]; linked: string[]; itemLabel: string; pending: boolean; onCancel: () => void; onSave: (values: string[]) => void }) {
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
      {headers.map((header, index) => isLongColumn(header)
        ? <label key={header + index} className="grid gap-1 text-xs font-semibold md:col-span-2">{header}<RichTextField value={values[index]} onCommit={(html) => set(index, html)} /></label>
        : <label key={header + index} className="grid gap-1 text-xs font-semibold">
            <span className="flex items-center gap-1">{header}{isLinked(header) && <Link2 className="size-3 text-primary" aria-label="Colonne liée" />}</span>
            <Input autoFocus={index === nameIndex} value={values[index]} onChange={(event) => set(index, event.target.value)} placeholder={isLinked(header) ? "Noms séparés par des virgules" : undefined} />
          </label>)}
    </div>
    <div className="mt-4 flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
      <Button type="button" onClick={() => onSave(values)} disabled={pending || !named}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
    </div>
  </section>
}

/**
 * Tableur d'un index du monde (créatures, lieux, religions, peuples), branché sur
 * son classeur Google Sheets. Les colonnes liées d'un index à l'autre se complètent
 * côté serveur ; le tableau se recharge quand un lien a touché l'index affiché.
 */
export function WorldIndexManager({ indexKey, initialData, initialError, nameOpensDetails = false }: { indexKey: WorldIndexKey; initialData: WorldIndexData | null; initialError: string; nameOpensDetails?: boolean }) {
  const definition = worldIndexDefinitions[indexKey]
  const [data, setData] = useState(initialData)
  const [tabName, setTabName] = usePersistentState(`eraser:world-index:${indexKey}:tab`, definition.tabs[0].name, (value): value is string => typeof value === "string")
  const [pending, setPending] = useState("")
  const [error, setError] = useState(initialError)
  const [saving, setSaving] = useState(0)
  const [creating, setCreating] = useState(false)
  const [version, setVersion] = useState(0)
  const [query, setQuery] = useState("")
  const [details, setDetails] = useState<number | null>(null)
  const [sort, setSort] = usePersistentState<SheetGridSort>(`eraser:world-index:${indexKey}:sort`, null, isValidSort)
  const localEdits = useRef<Record<string, string>>({})

  const table: WorldIndexTable | null = useMemo(() => data?.tables.find((candidate) => candidate.tabName === tabName) ?? data?.tables[0] ?? null, [data, tabName])
  const tabDefinition = definition.tabs.find((tab) => tab.name === table?.tabName) ?? definition.tabs[0]
  const linked = useMemo(() => table ? linkedColumnsOf(indexKey, table.tabName) : [], [indexKey, table])
  const nameColumn = table ? table.headers.findIndex(isNameColumn) : -1

  /**
   * Données fraîches du serveur. Remonter les cellules pendant la frappe renverrait le
   * curseur au début : si une cellule a le focus, on attend qu'elle le perde.
   */
  const applyData = useCallback((next: WorldIndexData) => {
    const remount = () => { localEdits.current = {}; setData(next); setVersion((current) => current + 1) }
    const active = document.activeElement
    if (active instanceof HTMLElement && active.isContentEditable) active.addEventListener("blur", () => window.setTimeout(remount, 0), { once: true })
    else remount()
  }, [])

  const columns = useMemo<SheetGridColumn[]>(() => (table?.headers ?? []).map((header, index) => ({
    key: String(index),
    label: linked.some((column) => foldName(column) === foldName(header)) ? `${header} ↔` : header,
    width: columnWidthFor(header, tabDefinition.widths[index]),
    plain: !isLongColumn(header),
    custom: nameOpensDetails && index === nameColumn,
    cellClassName: isNameColumn(header) ? "font-semibold" : undefined,
  })), [linked, nameColumn, nameOpensDetails, tabDefinition, table])

  const displayedRows = useMemo(() => {
    if (!table) return []
    const folded = foldName(query)
    const filtered = table.rows.filter((row) => !folded || row.values.some((value) => foldName(value).includes(folded)))
    const sorted = sort
      ? [...filtered].sort((left, right) => (left.values[Number(sort.column)] || "").localeCompare(right.values[Number(sort.column)] || "", "fr", { numeric: true, sensitivity: "base" }) * (sort.direction === "asc" ? 1 : -1))
      : filtered
    return sorted.map((row) => ({ key: String(row.rowNumber), rowNumber: row.rowNumber }))
  }, [query, sort, table])

  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const local = table ? localEdits.current[`${table.tabName}:${rowKey}:${columnKey}`] : undefined
    if (local !== undefined) return local
    const row = table?.rows.find((candidate) => String(candidate.rowNumber) === rowKey)
    const index = Number(columnKey)
    if (!row) return ""
    return isLongColumn(table?.headers[index] ?? "") ? row.html[index] ?? "" : row.values[index] ?? ""
  }, [table])

  const post = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch("/api/resources/world-indexes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: indexKey, tabName: table?.tabName, ...body }),
    })
    const payload = (await response.json().catch(() => ({}))) as { data?: WorldIndexData; changed?: string[]; error?: string }
    if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
    return payload
  }, [indexKey, table?.tabName])

  const commitCell = useCallback(async (rowKey: string, columnKey: string, value: string) => {
    if (!table) return
    localEdits.current[`${table.tabName}:${rowKey}:${columnKey}`] = value
    setSaving((current) => current + 1)
    try {
      const payload = await post({ action: "update-cell", rowNumber: Number(rowKey), column: Number(columnKey), html: value })
      setError("")
      if (payload.data) applyData(payload.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cette cellule n’a pas pu être enregistrée.")
    }
    setSaving((current) => current - 1)
  }, [applyData, post, table])

  async function mutate(body: Record<string, unknown>, label: string) {
    setPending(label); setError("")
    try {
      const payload = await post(body)
      if (payload.data) applyData(payload.data)
      setCreating(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.")
    }
    setPending("")
  }

  async function refresh() {
    setPending("refresh"); setError("")
    const response = await fetch(`/api/resources/world-indexes?key=${indexKey}`, { cache: "no-store" })
    const payload = (await response.json().catch(() => ({}))) as { data?: WorldIndexData; error?: string }
    setPending("")
    if (!response.ok || !payload.data) return setError(payload.error || "Actualisation impossible.")
    applyData(payload.data)
  }

  const busy = Boolean(pending)
  const detailsRow = details !== null ? table?.rows.find((row) => row.rowNumber === details) : undefined
  const detailsName = detailsRow && nameColumn >= 0 ? detailsRow.values[nameColumn] : ""
  const hints = table ? linkHints(indexKey, table.tabName) : []

  return (
    <section className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        {data && data.tables.length > 1 && <div role="tablist" aria-label="Onglets" className="flex gap-1 rounded-xl border bg-card/70 p-1">
          {data.tables.map((candidate) => <button
            key={candidate.tabName}
            type="button"
            role="tab"
            aria-selected={candidate.tabName === table?.tabName}
            onClick={() => { setTabName(candidate.tabName); setCreating(false); setDetails(null); setSort(null) }}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${candidate.tabName === table?.tabName ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >{candidate.tabName}<span className="ml-1.5 text-xs opacity-70">{candidate.rows.length}</span></button>)}
        </div>}
        {table && <div className="relative min-w-0 lg:max-w-sm lg:flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans le tableau…" className="pl-9" /></div>}
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          {data?.webViewLink && <Button asChild variant="ghost"><a href={data.webViewLink} target="_blank" rel="noreferrer">Ouvrir dans Sheets<ExternalLink /></a></Button>}
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={busy}>{pending === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
          <Button type="button" onClick={() => setCreating(true)} disabled={!table || busy}><Plus />Ajouter {tabDefinition.itemLabel}</Button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}

      {hints.length > 0 && <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Link2 className="size-3.5 text-primary" />
        Colonnes liées, qui se complètent d’elles-mêmes (noms séparés par des virgules) : {hints.join(" · ")}
      </p>}

      {creating && table && <EntryForm
        key={table.tabName}
        headers={table.headers}
        linked={linked}
        itemLabel={tabDefinition.itemLabel}
        pending={pending === "add"}
        onCancel={() => setCreating(false)}
        onSave={(values) => void mutate({ action: "add", values: values.map((value, index) => isLongColumn(table.headers[index]) ? value : richTextPlainText(value)) }, "add")}
      />}

      {table ? (
        <SheetGrid
          layoutKey={`eraser:world-index:grid:${indexKey}:${table.tabName}`}
          columns={columns}
          rows={displayedRows}
          valueOf={valueOf}
          onCommit={(rowKey, columnKey, value) => void commitCell(rowKey, columnKey, value)}
          renderCustomCell={(rowKey) => {
            const name = valueOf(rowKey, String(nameColumn))
            return <button type="button" onClick={() => setDetails(Number(rowKey))} className="w-full rounded-md px-2 py-1.5 text-left font-semibold text-primary underline-offset-4 hover:underline" title="Ouvrir la fiche">
              {name || <span className="font-normal italic text-muted-foreground">Sans nom</span>}
            </button>
          }}
          sort={sort}
          onSort={setSort}
          disabled={busy}
          version={version}
          addRowLabel={`Ajouter ${tabDefinition.itemLabel}`}
          rowCommands={{
            append: () => setCreating(true),
            duplicate: (rowKeys) => void mutate({ action: "duplicate", rowNumbers: rowKeys.map(Number) }, "duplicate"),
            remove: (rowKeys) => void mutate({ action: "delete", rowNumbers: rowKeys.map(Number) }, "delete"),
          }}
          toolbarTrailing={saving > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : null}
          empty={table.rows.length ? "Aucune ligne ne correspond à la recherche." : `Ce tableau est vide. Ajoute ${tabDefinition.itemLabel} pour commencer.`}
        />
      ) : !error ? <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Le classeur « {definition.sheetName} » n’a pas pu être préparé.</div> : null}

      {nameOpensDetails && <Dialog open={Boolean(detailsRow)} onOpenChange={(open) => { if (!open) setDetails(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{detailsName || "Sans nom"}</DialogTitle>
            <DialogDescription className="sr-only">Fiche détaillée</DialogDescription>
          </DialogHeader>
          {detailsRow && <label className="grid gap-1 text-xs font-semibold">
            Nom
            <Input
              key={`${version}:${detailsRow.rowNumber}`}
              defaultValue={detailsName}
              onBlur={(event) => {
                const name = event.target.value.trim()
                if (name && name !== detailsName) void commitCell(String(detailsRow.rowNumber), String(nameColumn), name).then(() => refresh())
              }}
            />
          </label>}
          {/* La fiche détaillée sera construite ici. */}
          <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Les détails de cette fiche arrivent bientôt.</div>
        </DialogContent>
      </Dialog>}
    </section>
  )
}
