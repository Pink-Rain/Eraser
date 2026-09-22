"use client"

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { ArrowDownAZ, ArrowUpAZ, Boxes, Check, Copy, ExternalLink, LoaderCircle, Plus, RefreshCw, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react"

import { usePersistentState } from "@/hooks/use-persistent-state"
import { clampTableColumnWidth, usePersistentTableLayout } from "@/hooks/use-persistent-table-layout"
import { plainText, RichTextEditorField } from "@/components/eraser/rich-text-inline-editor"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ObjectIndexRow, ObjectIndexTable } from "@/lib/google-sheets"

function tableKey(table: ObjectIndexTable) {
  return `${table.fileId}:${table.sheetId}`
}

function ObjectRow({ row, headers, pending, heightOverride, onResizeStart, onResizeReset, onSave, onDuplicate, onDelete }: {
  row: ObjectIndexRow
  headers: string[]
  pending: boolean
  heightOverride?: number
  onResizeStart: (event: ReactPointerEvent<HTMLSpanElement>, rowNumber: number) => void
  onResizeReset: (rowNumber: number) => void
  onSave: (values: string[], html: string[]) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [html, setHtml] = useState(row.html)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const persisted = useMemo(() => row.html, [row.html])
  const changed = JSON.stringify(html) !== JSON.stringify(persisted)
  const values = useMemo(() => html.map((cell) => plainText(cell)), [html])

  // Comme l'index des classes : une pause de frappe déclenche l'enregistrement
  // automatique. Le bouton reste disponible pour forcer la sauvegarde tout de
  // suite (par exemple avant de changer de tableau).
  useEffect(() => {
    if (!changed || pending) return
    const timer = window.setTimeout(() => onSave(values, html), 700)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, onSave, pending, html])

  return (
    <tr className="border-b align-top last:border-b-0" style={heightOverride ? { height: heightOverride } : undefined}>
      <td className="sticky left-0 z-10 relative overflow-hidden border-r bg-background px-3 py-2 text-xs tabular-nums text-muted-foreground">
        {row.rowNumber}
        <span
          role="separator"
          aria-label={`Redimensionner la ligne ${row.rowNumber}`}
          title="Glisser pour ajuster la hauteur, double-clic pour revenir à l’ajustement automatique"
          onPointerDown={(event) => onResizeStart(event, row.rowNumber)}
          onDoubleClick={() => onResizeReset(row.rowNumber)}
          className="absolute inset-x-0 bottom-0 z-30 h-2 cursor-row-resize touch-none"
        />
      </td>
      {headers.map((header, index) => (
        <td key={index} className="h-full overflow-hidden border-r p-1.5 align-top last:border-r-0">
          <RichTextEditorField
            variant="table"
            value={html[index] ?? ""}
            onChange={(next) => setHtml((current) => headers.map((_, column) => column === index ? next : current[column] ?? ""))}
            className={heightOverride ? "h-full" : ""}
            ariaLabel={`${header}, ligne ${row.rowNumber}`}
          />
        </td>
      ))}
      <td className="sticky right-0 z-10 h-full overflow-hidden border-l bg-background px-2 py-2 align-top">
        <div className="flex gap-1">
          <Button type="button" size="icon-sm" variant="ghost" disabled={!changed || pending} onClick={() => onSave(values, html)} aria-label={`Enregistrer la ligne ${row.rowNumber}`} title="Enregistrer">{pending ? <LoaderCircle className="animate-spin" /> : <Check />}</Button>
          <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={onDuplicate} aria-label={`Dupliquer la ligne ${row.rowNumber}`} title="Dupliquer"><Copy /></Button>
          {confirmDelete ? <>
            <Button type="button" size="icon-sm" variant="destructive" onClick={onDelete} aria-label="Confirmer la suppression"><Trash2 /></Button>
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setConfirmDelete(false)} aria-label="Annuler la suppression">×</Button>
          </> : <Button type="button" size="icon-sm" variant="ghost" disabled={pending} className="text-destructive" onClick={() => setConfirmDelete(true)} aria-label={`Supprimer la ligne ${row.rowNumber}`} title="Supprimer"><Trash2 /></Button>}
        </div>
      </td>
    </tr>
  )
}

export function ObjectIndexManager({ initialTables, initialError }: { initialTables: ObjectIndexTable[]; initialError: string }) {
  const [tables, setTables] = useState(initialTables)
  const [selectedKey, setSelectedKey] = usePersistentState(
    "eraser:object-index:selected-table", initialTables[0] ? tableKey(initialTables[0]) : "",
    (v): v is string => typeof v === "string",
  )
  const [pending, setPending] = useState("")
  const [error, setError] = useState(initialError)
  const [notice, setNotice] = useState("")
  const [query, setQuery] = useState("")
  const [sort, setSort] = usePersistentState<{ column: number; direction: "asc" | "desc" } | null>(
    "eraser:object-index:sort", null,
    (v): v is { column: number; direction: "asc" | "desc" } | null => v === null || (typeof v === "object" && v !== null && typeof (v as { column?: unknown }).column === "number" && ((v as { direction?: unknown }).direction === "asc" || (v as { direction?: unknown }).direction === "desc")),
  )
  const [rowHeightOverrides, setRowHeightOverrides] = useState<Record<number, number>>({})
  const selected = useMemo(() => tables.find((table) => tableKey(table) === selectedKey) ?? tables[0] ?? null, [selectedKey, tables])
  const defaultLayout = useMemo(() => ({
    columnWidths: Object.fromEntries([
      ["line", 70],
      ...(selected?.headers ?? []).map((_, index) => [`column:${index}`, index === 0 ? 180 : 240] as const),
      ["actions", 140],
    ]),
    rowHeight: 72,
  }), [selected])
  const [layout, setLayout] = usePersistentTableLayout(
    `eraser:object-index:layout:${selected?.fileId || "none"}:${selected?.sheetId || "none"}`,
    defaultLayout,
  )
  const [previewWidths, setPreviewWidths] = useState<Record<string, number>>({})
  const columnWidth = (key: string) => previewWidths[key] ?? layout.columnWidths[key] ?? defaultLayout.columnWidths[key] ?? 180
  const tableWidth = ["line", ...(selected?.headers ?? []).map((_, index) => `column:${index}`), "actions"].reduce((total, key) => total + columnWidth(key), 0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef<"table" | "bar" | null>(null)

  function startColumnResize(event: ReactPointerEvent<HTMLSpanElement>, key: string, minimum = 80, maximum = 900) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = columnWidth(key)
    let latest = startWidth
    const move = (pointerEvent: PointerEvent) => {
      latest = clampTableColumnWidth(startWidth + pointerEvent.clientX - startX, minimum, maximum)
      setPreviewWidths((current) => ({ ...current, [key]: latest }))
    }
    const finish = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      setLayout({ ...layout, columnWidths: { ...layout.columnWidths, [key]: latest } })
      setPreviewWidths((current) => { const next = { ...current }; delete next[key]; return next })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
  }

  function startRowResize(event: ReactPointerEvent<HTMLSpanElement>, rowNumber: number) {
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const rowElement = event.currentTarget.closest("tr")
    const startHeight = rowHeightOverrides[rowNumber] ?? rowElement?.getBoundingClientRect().height ?? 40
    const move = (pointerEvent: PointerEvent) => {
      const next = Math.max(36, Math.min(600, Math.round(startHeight + pointerEvent.clientY - startY)))
      setRowHeightOverrides((current) => ({ ...current, [rowNumber]: next }))
    }
    const finish = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
  }

  function resetRowHeight(rowNumber: number) {
    setRowHeightOverrides((current) => { const next = { ...current }; delete next[rowNumber]; return next })
  }

  function syncScroll(source: "table" | "bar") {
    if (syncingScroll.current && syncingScroll.current !== source) return
    syncingScroll.current = source
    const table = scrollRef.current
    const bar = bottomScrollRef.current
    if (table && bar) source === "table" ? (bar.scrollLeft = table.scrollLeft) : (table.scrollLeft = bar.scrollLeft)
    window.requestAnimationFrame(() => { syncingScroll.current = null })
  }

  const displayedRows = useMemo(() => {
    if (!selected) return []
    const normalizedQuery = query.trim().toLocaleLowerCase("fr")
    const filtered = selected.rows.filter((row) => !normalizedQuery || row.values.some((value) => value.toLocaleLowerCase("fr").includes(normalizedQuery)))
    if (!sort) return filtered
    return [...filtered].sort((left, right) => (left.values[sort.column] || "").localeCompare(right.values[sort.column] || "", "fr", { numeric: true }) * (sort.direction === "asc" ? 1 : -1))
  }, [query, selected, sort])

  async function refresh() {
    setPending("refresh")
    setError("")
    const response = await fetch("/api/resources/object-indexes?refresh=1", { cache: "no-store" })
    const payload = (await response.json()) as { tables?: ObjectIndexTable[]; error?: string }
    setPending("")
    if (!response.ok || !payload.tables) return setError(payload.error || "Actualisation impossible.")
    setTables(payload.tables)
  }

  async function mutate(action: "add" | "update" | "duplicate" | "delete" | "enrich" | "ensure-stack-limits", rowNumber?: number, values?: string[], html?: string[]) {
    if (!selected && action !== "enrich" && action !== "ensure-stack-limits") return
    const mutationKey = `${action}:${rowNumber ?? "new"}`
    setPending(mutationKey)
    setError("")
    const response = await fetch("/api/resources/object-indexes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, fileId: selected?.fileId, tabName: selected?.tabName, rowNumber, values, html }),
    })
    const payload = (await response.json()) as { tables?: ObjectIndexTable[]; error?: string; result?: { descriptionsAdded?: number; iconsAdded?: number; stackLimitsAdded?: number; columnsAdded?: number } }
    setPending("")
    if (!response.ok || !payload.tables) return setError(payload.error || "Enregistrement impossible.")
    setTables(payload.tables)
    if (payload.result?.stackLimitsAdded !== undefined) setNotice(`${payload.result.stackLimitsAdded} valeur(s) « Nombre max » ajoutées dans ${payload.result.columnsAdded || 0} nouveau(x) champ(s).`)
    else if (payload.result) setNotice(`${payload.result.descriptionsAdded || 0} description(s) et ${payload.result.iconsAdded || 0} icône(s) ajoutées dans les cellules vides.`)
  }

  return (
    <section className="mt-8 rounded-2xl border bg-card/80 p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
          Tableau à afficher
          <NativeSelect value={selected ? tableKey(selected) : ""} onChange={(event) => setSelectedKey(event.target.value)} disabled={!tables.length || Boolean(pending)}>
            {!tables.length && <NativeSelectOption value="">Aucun tableau disponible</NativeSelectOption>}
            {tables.map((table) => <NativeSelectOption key={tableKey(table)} value={tableKey(table)}>{table.fileName} · {table.tabName}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <div className="flex flex-wrap gap-2">
          {selected?.webViewLink && <Button asChild variant="outline"><a href={selected.webViewLink} target="_blank" rel="noreferrer">Google Sheets <ExternalLink /></a></Button>}
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={Boolean(pending)}>{pending === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
          <Button type="button" onClick={() => void mutate("add")} disabled={!selected || Boolean(pending)}>{pending === "add:new" ? <LoaderCircle className="animate-spin" /> : <Plus />}Ajouter une ligne</Button>
          <Button type="button" variant="secondary" onClick={() => void mutate("enrich")} disabled={!tables.length || Boolean(pending)}>{pending === "enrich:new" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}Compléter les cellules vides</Button>
          <Button type="button" variant="secondary" onClick={() => void mutate("ensure-stack-limits")} disabled={!tables.length || Boolean(pending)}>{pending === "ensure-stack-limits:new" ? <LoaderCircle className="animate-spin" /> : <Boxes />}Configurer les piles</Button>
          {(Object.keys(rowHeightOverrides).length > 0 || Object.keys(layout.columnWidths).some((key) => layout.columnWidths[key] !== defaultLayout.columnWidths[key])) && <Button type="button" size="sm" variant="ghost" onClick={() => { setLayout(defaultLayout); setPreviewWidths({}); setRowHeightOverrides({}) }}><RotateCcw />Réinitialiser la mise en page</Button>}
        </div>
      </div>

      {error && <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
      {notice && <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">{notice}</p>}

      {selected ? (
        <>
          <div className="sticky top-14 z-30 -mx-4 mt-4 border-b bg-background/95 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="relative max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, type, sous-type ou autre champ…" className="pl-9" /></div>
          </div>
          <div ref={scrollRef} onScroll={() => syncScroll("table")} className="mt-3 overflow-x-auto rounded-xl border bg-background/60">
            <table className="border-collapse text-sm" style={{ tableLayout: "fixed", width: tableWidth, minWidth: "100%" }}>
              <colgroup>
                <col style={{ width: columnWidth("line") }} />
                {selected.headers.map((_, index) => <col key={index} style={{ width: columnWidth(`column:${index}`) }} />)}
                <col style={{ width: columnWidth("actions") }} />
              </colgroup>
              <thead className="bg-muted/70">
                <tr>
                  <th className="sticky left-0 top-28 z-40 relative border-b border-r bg-muted px-3 py-3 text-left font-semibold whitespace-normal break-words">Ligne<span role="separator" aria-label="Redimensionner la colonne Ligne" onPointerDown={(event) => startColumnResize(event, "line", 60, 180)} className="absolute inset-y-0 right-0 z-30 w-2 translate-x-1 cursor-col-resize touch-none" /></th>
                  {selected.headers.map((header, index) => <th key={`${header}:${index}`} className="sticky top-28 z-30 relative border-b border-r bg-muted px-2 py-2 text-left font-semibold whitespace-normal break-words last:border-r-0"><Button type="button" variant="ghost" size="sm" className="h-auto min-h-8 w-full justify-between whitespace-normal break-words text-left" onClick={() => setSort(sort?.column === index ? { column: index, direction: sort.direction === "asc" ? "desc" : "asc" } : { column: index, direction: "asc" })}>{header}{sort?.column === index ? sort.direction === "asc" ? <ArrowDownAZ /> : <ArrowUpAZ /> : null}</Button><span role="separator" aria-label={`Redimensionner la colonne ${header}`} onPointerDown={(event) => startColumnResize(event, `column:${index}`)} onClick={(event) => event.stopPropagation()} className="absolute inset-y-0 right-0 z-30 w-2 translate-x-1 cursor-col-resize touch-none" /></th>)}
                  <th className="sticky right-0 top-28 z-40 relative border-b border-l bg-muted px-3 py-3 text-left font-semibold whitespace-normal break-words">Actions<span role="separator" aria-label="Redimensionner la colonne Actions" onPointerDown={(event) => startColumnResize(event, "actions", 110, 300)} className="absolute inset-y-0 left-0 z-30 w-2 -translate-x-1 cursor-col-resize touch-none" /></th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row) => {
                  const key = `${tableKey(selected)}:${row.rowNumber}`
                  const rowPending = pending.endsWith(`:${row.rowNumber}`)
                  return (
                    <ObjectRow
                      key={key}
                      row={row}
                      headers={selected.headers}
                      pending={rowPending}
                      heightOverride={rowHeightOverrides[row.rowNumber]}
                      onResizeStart={startRowResize}
                      onResizeReset={resetRowHeight}
                      onSave={(values, html) => void mutate("update", row.rowNumber, values, html)}
                      onDuplicate={() => void mutate("duplicate", row.rowNumber)}
                      onDelete={() => void mutate("delete", row.rowNumber)}
                    />
                  )
                })}
              </tbody>
            </table>
            {!displayedRows.length && <div className="px-5 py-12 text-center text-sm text-muted-foreground">{selected.rows.length ? "Aucune ligne ne correspond à la recherche." : "Ce tableau est vide. Ajoute sa première ligne."}</div>}
          </div>
          <div className="sticky bottom-0 z-30 -mx-4 border-t bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
            <div ref={bottomScrollRef} onScroll={() => syncScroll("bar")} className="overflow-x-auto overflow-y-hidden" style={{ height: 16 }}>
              <div style={{ width: tableWidth, height: 1 }} />
            </div>
          </div>
        </>
      ) : !error ? <div className="mt-5 rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Aucun Google Sheets n’a été trouvé dans le dossier « Objets ».</div> : null}
    </section>
  )
}
