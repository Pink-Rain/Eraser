"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Boxes, Copy, ExternalLink, LoaderCircle, Plus, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react"

import { usePersistentState } from "@/hooks/use-persistent-state"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
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

/** Les colonnes courtes restent étroites, les colonnes de récit prennent la place. */
function columnWidthFor(header: string) {
  const normalized = header.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr")
  if (/description|effet|note|prerequis|attribut/.test(normalized)) return 380
  if (/nom|titre|lien|image/.test(normalized)) return 220
  if (/nombre|poids|prix|encombrement|rarete|edition|actif|icone/.test(normalized)) return 120
  return 180
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
  const [saving, setSaving] = useState(0)
  const [query, setQuery] = useState("")
  const [sort, setSort] = usePersistentState<SheetGridSort>(
    "eraser:object-index:sort", null,
    (v): v is SheetGridSort => v === null || (typeof v === "object" && v !== null && typeof (v as { column?: unknown }).column === "string" && ((v as { direction?: unknown }).direction === "asc" || (v as { direction?: unknown }).direction === "desc")),
  )
  const selected = useMemo(() => tables.find((table) => tableKey(table) === selectedKey) ?? tables[0] ?? null, [selectedKey, tables])
  // Les cellules en cours d’enregistrement gardent la valeur saisie : le tableau
  // n’attend jamais Google Sheets pour afficher ce qui vient d’être tapé.
  const localEdits = useRef<Record<string, string>>({})

  const columns = useMemo<SheetGridColumn[]>(() => (selected?.headers ?? []).map((header, index) => ({
    key: String(index),
    label: header,
    width: columnWidthFor(header),
  })), [selected])

  const displayedRows = useMemo(() => {
    if (!selected) return []
    const normalizedQuery = query.trim().toLocaleLowerCase("fr")
    const filtered = selected.rows.filter((row) => !normalizedQuery || row.values.some((value) => value.toLocaleLowerCase("fr").includes(normalizedQuery)))
    const sorted = sort
      ? [...filtered].sort((left, right) => (left.values[Number(sort.column)] || "").localeCompare(right.values[Number(sort.column)] || "", "fr", { numeric: true }) * (sort.direction === "asc" ? 1 : -1))
      : filtered
    return sorted.map((row) => ({ key: String(row.rowNumber), rowNumber: row.rowNumber }))
  }, [query, selected, sort])

  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    // La clé vient du tableau réellement affiché, pas de la préférence enregistrée :
    // au premier affichage la préférence est encore vide alors qu'un tableau est choisi.
    const local = selected ? localEdits.current[`${tableKey(selected)}:${rowKey}:${columnKey}`] : undefined
    if (local !== undefined) return local
    const row = selected?.rows.find((candidate) => String(candidate.rowNumber) === rowKey)
    return row?.html[Number(columnKey)] ?? ""
  }, [selected])

  const commitCell = useCallback(async (rowKey: string, columnKey: string, html: string) => {
    if (!selected) return
    localEdits.current[`${tableKey(selected)}:${rowKey}:${columnKey}`] = html
    setSaving((current) => current + 1)
    try {
      const response = await fetch("/api/resources/object-indexes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update-cell", fileId: selected.fileId, tabName: selected.tabName, rowNumber: Number(rowKey), column: Number(columnKey), html }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setError(payload.error || "Cette cellule n’a pas pu être enregistrée.")
      } else setError("")
    } catch {
      setError("Cette cellule n’a pas pu être enregistrée.")
    }
    setSaving((current) => current - 1)
  }, [selected])

  async function refresh() {
    setPending("refresh"); setError("")
    const response = await fetch("/api/resources/object-indexes?refresh=1", { cache: "no-store" })
    const payload = (await response.json()) as { tables?: ObjectIndexTable[]; error?: string }
    setPending("")
    if (!response.ok || !payload.tables) return setError(payload.error || "Actualisation impossible.")
    localEdits.current = {}
    setTables(payload.tables)
  }

  async function mutate(action: "add" | "duplicate" | "delete" | "enrich" | "ensure-stack-limits", rowNumber?: number) {
    if (!selected && action !== "enrich" && action !== "ensure-stack-limits") return
    setPending(`${action}:${rowNumber ?? "new"}`); setError("")
    const response = await fetch("/api/resources/object-indexes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, fileId: selected?.fileId, tabName: selected?.tabName, rowNumber }),
    })
    const payload = (await response.json()) as { tables?: ObjectIndexTable[]; error?: string; result?: { descriptionsAdded?: number; iconsAdded?: number; stackLimitsAdded?: number; columnsAdded?: number } }
    setPending("")
    if (!response.ok || !payload.tables) return setError(payload.error || "Enregistrement impossible.")
    localEdits.current = {}
    setTables(payload.tables)
    if (payload.result?.stackLimitsAdded !== undefined) setNotice(`${payload.result.stackLimitsAdded} valeur(s) « Nombre max » ajoutées dans ${payload.result.columnsAdded || 0} nouveau(x) champ(s).`)
    else if (payload.result) setNotice(`${payload.result.descriptionsAdded || 0} description(s) et ${payload.result.iconsAdded || 0} icône(s) ajoutées dans les cellules vides.`)
  }

  const busy = Boolean(pending)

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
          Tableau à afficher
          <NativeSelect value={selected ? tableKey(selected) : ""} onChange={(event) => setSelectedKey(event.target.value)} disabled={!tables.length || busy}>
            {!tables.length && <NativeSelectOption value="">Aucun tableau disponible</NativeSelectOption>}
            {tables.map((table) => <NativeSelectOption key={tableKey(table)} value={tableKey(table)}>{table.fileName} · {table.tabName}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        {selected && <div className="relative min-w-0 lg:max-w-sm lg:flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, type, sous-type ou autre champ…" className="pl-9" /></div>}
        <div className="flex flex-wrap gap-2">
          {selected?.webViewLink && <Button asChild variant="outline"><a href={selected.webViewLink} target="_blank" rel="noreferrer">Google Sheets <ExternalLink /></a></Button>}
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={busy}>{pending === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
          <Button type="button" onClick={() => void mutate("add")} disabled={!selected || busy}>{pending === "add:new" ? <LoaderCircle className="animate-spin" /> : <Plus />}Ajouter une ligne</Button>
          <Button type="button" variant="secondary" onClick={() => void mutate("enrich")} disabled={!tables.length || busy}>{pending === "enrich:new" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}Compléter</Button>
          <Button type="button" variant="secondary" onClick={() => void mutate("ensure-stack-limits")} disabled={!tables.length || busy}>{pending === "ensure-stack-limits:new" ? <LoaderCircle className="animate-spin" /> : <Boxes />}Piles</Button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">{notice}</p>}

      {selected ? (
        <SheetGrid
          layoutKey={`eraser:object-index:grid:${selected.fileId}:${selected.sheetId}`}
          columns={columns}
          rows={displayedRows}
          valueOf={valueOf}
          onCommit={(rowKey, columnKey, html) => void commitCell(rowKey, columnKey, html)}
          sort={sort}
          onSort={setSort}
          disabled={busy}
          toolbarTrailing={saving > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : null}
          empty={selected.rows.length ? "Aucune ligne ne correspond à la recherche." : "Ce tableau est vide. Ajoute sa première ligne."}
          renderActions={(rowKey) => <div className="flex gap-1">
            <Button type="button" size="icon-sm" variant="ghost" disabled={busy} onClick={() => void mutate("duplicate", Number(rowKey))} aria-label={`Dupliquer la ligne ${rowKey}`} title="Dupliquer"><Copy /></Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button type="button" size="icon-sm" variant="ghost" disabled={busy} className="text-destructive" aria-label={`Supprimer la ligne ${rowKey}`} title="Supprimer"><Trash2 /></Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Supprimer cette ligne ?</AlertDialogTitle><AlertDialogDescription>La ligne {rowKey} sera retirée du tableau Google Sheets « {selected.tabName} ».</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void mutate("delete", Number(rowKey))}>Supprimer</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>}
        />
      ) : !error ? <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Aucun Google Sheets n’a été trouvé dans le dossier « Objets ».</div> : null}
    </section>
  )
}
