"use client"

import { useMemo, useState } from "react"
import { ArrowDownAZ, ArrowUpAZ, Boxes, Copy, ExternalLink, LoaderCircle, Plus, RefreshCw, Save, Search, Sparkles, Trash2 } from "lucide-react"

import { usePersistentState } from "@/hooks/use-persistent-state"
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
import type { ObjectIndexTable } from "@/lib/google-sheets"

function tableKey(table: ObjectIndexTable) {
  return `${table.fileId}:${table.sheetId}`
}

export function ObjectIndexManager({ initialTables, initialError }: { initialTables: ObjectIndexTable[]; initialError: string }) {
  const [tables, setTables] = useState(initialTables)
  const [selectedKey, setSelectedKey] = usePersistentState(
    "eraser:object-index:selected-table", initialTables[0] ? tableKey(initialTables[0]) : "",
    (v): v is string => typeof v === "string",
  )
  const [drafts, setDrafts] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState("")
  const [error, setError] = useState(initialError)
  const [notice, setNotice] = useState("")
  const [query, setQuery] = useState("")
  const [sort, setSort] = usePersistentState<{ column: number; direction: "asc" | "desc" } | null>(
    "eraser:object-index:sort", null,
    (v): v is { column: number; direction: "asc" | "desc" } | null => v === null || (typeof v === "object" && v !== null && typeof (v as { column?: unknown }).column === "number" && ((v as { direction?: unknown }).direction === "asc" || (v as { direction?: unknown }).direction === "desc")),
  )
  const selected = useMemo(() => tables.find((table) => tableKey(table) === selectedKey) ?? tables[0] ?? null, [selectedKey, tables])
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
    setDrafts({})
  }

  async function mutate(action: "add" | "update" | "duplicate" | "delete" | "enrich" | "ensure-stack-limits", rowNumber?: number, values?: string[]) {
    if (!selected && action !== "enrich" && action !== "ensure-stack-limits") return
    const mutationKey = `${action}:${rowNumber ?? "new"}`
    setPending(mutationKey)
    setError("")
    const response = await fetch("/api/resources/object-indexes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, fileId: selected?.fileId, tabName: selected?.tabName, rowNumber, values }),
    })
    const payload = (await response.json()) as { tables?: ObjectIndexTable[]; error?: string; result?: { descriptionsAdded?: number; iconsAdded?: number; stackLimitsAdded?: number; columnsAdded?: number } }
    setPending("")
    if (!response.ok || !payload.tables) return setError(payload.error || "Enregistrement impossible.")
    setTables(payload.tables)
    setDrafts({})
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
        </div>
      </div>

      {selected && <div className="relative mt-4 max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, type, sous-type ou autre champ…" className="pl-9" /></div>}

      {error && <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
      {notice && <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">{notice}</p>}

      {selected ? (
        <div className="mt-5 overflow-x-auto rounded-xl border bg-background/60">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead className="bg-muted/70">
              <tr>
                <th className="sticky left-0 z-20 min-w-16 border-b border-r bg-muted px-3 py-3 text-left font-semibold">Ligne</th>
                {selected.headers.map((header, index) => <th key={`${header}:${index}`} className="min-w-48 border-b border-r px-2 py-2 text-left font-semibold last:border-r-0"><Button type="button" variant="ghost" size="sm" className="w-full justify-between" onClick={() => setSort(sort?.column === index ? { column: index, direction: sort.direction === "asc" ? "desc" : "asc" } : { column: index, direction: "asc" })}>{header}{sort?.column === index ? sort.direction === "asc" ? <ArrowDownAZ /> : <ArrowUpAZ /> : null}</Button></th>)}
                <th className="sticky right-0 z-20 min-w-36 border-b border-l bg-muted px-3 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row) => {
                const key = `${tableKey(selected)}:${row.rowNumber}`
                const values = drafts[key] ?? row.values
                const changed = values.some((value, index) => value !== (row.values[index] ?? ""))
                const rowPending = pending.endsWith(`:${row.rowNumber}`)
                return (
                  <tr key={key} className="border-b last:border-b-0">
                    <td className="sticky left-0 z-10 border-r bg-background px-3 py-2 text-xs tabular-nums text-muted-foreground">{row.rowNumber}</td>
                    {selected.headers.map((header, index) => (
                      <td key={`${header}:${index}`} className="border-r p-1.5 last:border-r-0">
                        <Input
                          value={values[index] ?? ""}
                          disabled={rowPending}
                          aria-label={`${header}, ligne ${row.rowNumber}`}
                          className="min-w-44 border-transparent bg-transparent shadow-none focus-visible:border-input focus-visible:bg-background"
                          onChange={(event) => setDrafts((current) => ({ ...current, [key]: selected.headers.map((_, column) => column === index ? event.target.value : values[column] ?? "") }))}
                        />
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 border-l bg-background px-2 py-2">
                      <div className="flex gap-1">
                        <Button type="button" size="icon-sm" variant="ghost" disabled={!changed || Boolean(pending)} onClick={() => void mutate("update", row.rowNumber, values)} aria-label={`Enregistrer la ligne ${row.rowNumber}`} title="Enregistrer"><Save /></Button>
                        <Button type="button" size="icon-sm" variant="ghost" disabled={Boolean(pending)} onClick={() => void mutate("duplicate", row.rowNumber)} aria-label={`Dupliquer la ligne ${row.rowNumber}`} title="Dupliquer"><Copy /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button type="button" size="icon-sm" variant="ghost" disabled={Boolean(pending)} className="text-destructive" aria-label={`Supprimer la ligne ${row.rowNumber}`} title="Supprimer"><Trash2 /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Supprimer cette ligne ?</AlertDialogTitle><AlertDialogDescription>La ligne {row.rowNumber} sera retirée du tableau Google Sheets « {selected.tabName} ».</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void mutate("delete", row.rowNumber)}>Supprimer</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!displayedRows.length && <div className="px-5 py-12 text-center text-sm text-muted-foreground">{selected.rows.length ? "Aucune ligne ne correspond à la recherche." : "Ce tableau est vide. Ajoute sa première ligne."}</div>}
        </div>
      ) : !error ? <div className="mt-5 rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Aucun Google Sheets n’a été trouvé dans le dossier « Objets ».</div> : null}
    </section>
  )
}
