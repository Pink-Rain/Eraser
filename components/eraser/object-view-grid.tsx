"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { LoaderCircle, Search } from "lucide-react"

import { indexGridColumn } from "@/components/eraser/index-cells"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { Input } from "@/components/ui/input"
import type { ObjectIndexTable } from "@/lib/google-sheets"
import { foldName, isComputedSpec, isGridSpec, isRichSpec, objectColumnSpec, type IndexColumnSpec } from "@/lib/index-columns"
import { numberSortKey } from "@/lib/index-numbers"
import { findEntry, isTrashedEntry, type SchemaEntry } from "@/lib/index-schema-shared"
import { ALL_SOURCES, matchesView, type IndexView } from "@/lib/index-views"

export function objectTableKey(table: ObjectIndexTable) {
  return `${table.fileId}:${table.sheetId}`
}

const ORIGIN = "__origine"
const originSpec: IndexColumnSpec = { kind: "rich" }

function specIn(table: ObjectIndexTable, header: string, schemas: Record<string, SchemaEntry[]>) {
  const base = objectColumnSpec(header, table.headers)
  const entry = findEntry(schemas[table.fileId] ?? [], table.tabName, header)
  return entry?.spec ? { ...base, ...entry.spec } : base
}

/**
 * Un onglet-fenêtre de l'index des objets : les lignes de plusieurs tableaux (ou d'un
 * seul) qui remplissent ses conditions. Chaque case modifiée est écrite dans son tableau
 * d'origine ; rien n'est copié. Ajouter, supprimer ou les boutons se font depuis
 * l'onglet d'origine de la ligne.
 */
export function ObjectViewGrid({ view, tables, schemas, disabled, onEdited }: { view: IndexView; tables: ObjectIndexTable[]; schemas: Record<string, SchemaEntry[]>; disabled: boolean; onEdited?: () => void }) {
  const sources = useMemo(() => view.source === ALL_SOURCES ? tables : tables.filter((table) => objectTableKey(table) === view.source), [tables, view.source])
  const byKey = useMemo(() => new Map(sources.map((table) => [objectTableKey(table), table])), [sources])
  // Un seul classeur (index regroupés) : la colonne « Tableau » montre l'onglet seul.
  const originOf = useCallback((table: ObjectIndexTable) => tables.every((candidate) => candidate.fileId === table.fileId) ? table.tabName : `${table.fileName} · ${table.tabName}`, [tables])
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SheetGridSort>(null)
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState("")
  const localEdits = useRef<Record<string, string>>({})

  const locate = useCallback((rowKey: string) => {
    const separator = rowKey.lastIndexOf("|")
    const table = byKey.get(rowKey.slice(0, separator))
    const row = table?.rows.find((candidate) => candidate.rowNumber === Number(rowKey.slice(separator + 1)))
    return table && row ? { table, row } : null
  }, [byKey])

  // Les colonnes : celles du premier tableau (les index d'objets partagent la même disposition).
  const headers = useMemo(() => {
    const first = sources[0]
    if (!first) return []
    return first.headers.filter((header) => {
      const spec = specIn(first, header, schemas)
      return header.trim() && spec.kind !== "archived" && !isComputedSpec(spec) && isGridSpec(spec) && !isTrashedEntry(findEntry(schemas[first.fileId] ?? [], first.tabName, header))
    })
  }, [schemas, sources])

  const rawOf = useCallback((rowKey: string, header: string) => {
    const local = localEdits.current[`${rowKey}:${header}`]
    if (local !== undefined) return local
    const found = locate(rowKey)
    if (!found) return ""
    if (header === ORIGIN) return originOf(found.table)
    const column = found.table.headers.findIndex((candidate) => foldName(candidate) === foldName(header))
    if (column < 0) return ""
    return (isRichSpec(specIn(found.table, header, schemas)) ? found.row.html[column] : found.row.values[column]) ?? ""
  }, [locate, originOf, schemas])

  const commit = useCallback(async (rowKey: string, header: string, html: string) => {
    const found = locate(rowKey)
    const column = found ? found.table.headers.findIndex((candidate) => foldName(candidate) === foldName(header)) : -1
    if (!found || column < 0) return
    localEdits.current[`${rowKey}:${header}`] = html
    setSaving((current) => current + 1)
    try {
      const response = await fetch("/api/resources/object-indexes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update-cell", fileId: found.table.fileId, tabName: found.table.tabName, rowNumber: found.row.rowNumber, column, html }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      setError(response.ok ? "" : payload.error || "Cette cellule n’a pas pu être enregistrée.")
      if (response.ok) onEdited?.()
    } catch {
      setError("Cette cellule n’a pas pu être enregistrée.")
    }
    setSaving((current) => current - 1)
  }, [locate, onEdited])

  const rows = useMemo(() => {
    const folded = foldName(query)
    const matched = sources.flatMap((table) => table.rows
      .filter((row) => matchesView(view, (header) => { const column = table.headers.findIndex((candidate) => foldName(candidate) === foldName(header)); return column >= 0 ? row.values[column] ?? "" : "" }))
      .filter((row) => !folded || row.values.some((value) => foldName(value).includes(folded)))
      .map((row) => ({ key: `${objectTableKey(table)}|${row.rowNumber}`, rowNumber: row.rowNumber, table, row })))
    if (!sort) return matched.map(({ key, rowNumber }) => ({ key, rowNumber }))
    const keyOf = (entry: (typeof matched)[number]) => {
      const column = entry.table.headers.findIndex((candidate) => foldName(candidate) === foldName(sort.column))
      const text = sort.column === ORIGIN ? originOf(entry.table) : column >= 0 ? entry.row.values[column] ?? "" : ""
      const spec = sort.column === ORIGIN ? null : specIn(entry.table, sort.column, schemas)
      return spec?.kind === "number" ? numberSortKey(text, spec.number ?? {}) : text
    }
    return [...matched].sort((left, right) => {
      const a = keyOf(left); const b = keyOf(right)
      const order = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "fr", { numeric: true })
      return order * (sort.direction === "asc" ? 1 : -1)
    }).map(({ key, rowNumber }) => ({ key, rowNumber }))
  }, [originOf, query, schemas, sort, sources, view])

  /* eslint-disable react-hooks/refs -- les cellules ne lisent les modifications en cours qu'en se dessinant, comme dans les autres index */
  const columns = useMemo<SheetGridColumn[]>(() => {
    const first = sources[0]
    if (!first) return []
    const context = { valueOf: rawOf, commit: (rowKey: string, columnKey: string, value: string) => void commit(rowKey, columnKey, value), disabled }
    const list = headers.map((header) => indexGridColumn(header, header, specIn(first, header, schemas), /description|effet/i.test(header) ? 380 : 180, context))
    if (sources.length > 1) list.splice(1, 0, indexGridColumn(ORIGIN, "Tableau", originSpec, 220, { ...context, disabled: true }))
    return list
  }, [commit, disabled, headers, rawOf, schemas, sources])
  /* eslint-enable react-hooks/refs */

  return <div className="grid gap-3">
    <div className="relative min-w-0 lg:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans cet onglet-fenêtre…" className="pl-9" /></div>
    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
    <SheetGrid
      layoutKey={`eraser:object-index:fenetre:${view.id}`}
      columns={columns}
      rows={rows}
      valueOf={rawOf}
      onCommit={(rowKey, columnKey, html) => void commit(rowKey, columnKey, html)}
      sort={sort}
      onSort={setSort}
      disabled={disabled}
      toolbarTrailing={saving > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : <span className="text-[11px] text-muted-foreground">Fenêtre sur {sources.length > 1 ? `${sources.length} tableaux` : "un tableau"} : les cases modifiées sont écrites à la source.</span>}
      empty="Aucun objet ne remplit les conditions de cet onglet-fenêtre."
    />
  </div>
}
