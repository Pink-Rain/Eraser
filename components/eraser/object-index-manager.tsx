"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Check, ImageIcon, LoaderCircle, Plus, RefreshCw, Search, X } from "lucide-react"

import { usePersistentState } from "@/hooks/use-persistent-state"
import { RichTextField, richTextPlainText } from "@/components/eraser/rich-text"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ObjectIndexTable } from "@/lib/google-sheets"

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

function isGeneratedField(header: string) {
  return normalize(header) === "id"
}

/**
 * Le formulaire d’ajout, construit à partir des colonnes du tableau choisi : chaque
 * index d’objets a les siennes, il n’y a donc pas de formulaire figé à écrire.
 */
function ObjectForm({ headers, pending, onCancel, onSave }: { headers: string[]; pending: boolean; onCancel: () => void; onSave: (values: string[]) => void }) {
  const [values, setValues] = useState<string[]>(() => headers.map(() => ""))
  const set = (index: number, value: string) => setValues((current) => current.map((item, position) => position === index ? value : item))
  const nameIndex = headers.findIndex((header) => /^nom|titre/.test(normalize(header)))
  const named = nameIndex < 0 || values[nameIndex].trim().length > 0

  return <section className="rounded-2xl border bg-card/90 p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-display text-xl font-semibold">Nouvel objet</h3>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Fermer"><X /></Button>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {headers.map((header, index) => isGeneratedField(header)
        ? <label key={header + index} className="grid gap-1 text-xs font-semibold">{header}<Input value={values[index]} onChange={(event) => set(index, event.target.value)} placeholder="Généré si vide" /></label>
        : isLongField(header)
          ? <div key={header + index} className="grid gap-1 text-xs font-semibold md:col-span-2">{header}<RichTextField ariaLabel={header} value={values[index]} onCommit={(html) => set(index, html)} /></div>
          : <label key={header + index} className="grid gap-1 text-xs font-semibold">{header}<Input value={values[index]} onChange={(event) => set(index, event.target.value)} /></label>)}
    </div>
    <div className="mt-4 flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
      <Button type="button" onClick={() => onSave(values)} disabled={pending || !named}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
    </div>
  </section>
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
  const [creating, setCreating] = useState(false)
  // Incrémenté seulement quand les valeurs viennent du serveur : les cellules sont
  // alors remontées. La frappe, elle, ne doit jamais les remonter.
  const [version, setVersion] = useState(0)
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
    setVersion((current) => current + 1)
  }

  /** Pose les icônes croquis dans la colonne « Icône » de tous les index. */
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
    setNotice(count ? `${count} icône${count > 1 ? "s" : ""} mise${count > 1 ? "s" : ""} à jour dans Google Sheets. Les icônes choisies à la main n’ont pas été touchées.` : "Toutes les icônes sont déjà à jour.")
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

  const busy = Boolean(pending)
  // Trier ou filtrer détache l’ordre affiché de celui de la feuille : « insérer
  // au-dessus » n’aurait plus de sens, l’entrée disparaît le temps du tri.
  const inSheetOrder = !sort && !query.trim()

  return (
    <section className="flex flex-col gap-3">
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
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={busy}>{pending === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
          <Button type="button" variant="outline" onClick={() => void syncIcons()} disabled={!tables.length || busy} title="Remplace les icônes posées par Eraser par les icônes croquis ; une icône choisie à la main reste en place.">{pending === "icons" ? <LoaderCircle className="animate-spin" /> : <ImageIcon />}Mettre à jour les icônes</Button>
          <Button type="button" onClick={() => setCreating(true)} disabled={!selected || busy}><Plus />Ajouter un objet</Button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-xl border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">{notice}</p>}

      {creating && selected && <ObjectForm
        headers={selected.headers}
        pending={pending === "add"}
        onCancel={() => setCreating(false)}
        onSave={(values) => void mutate({ action: "add", values: values.map((value, index) => isLongField(selected.headers[index]) ? value : richTextPlainText(value)) }, "add")}
      />}

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
          version={version}
          addRowLabel="Ajouter une ligne vide"
          rowCommands={{
            append: () => void mutate({ action: "add" }, "add"),
            insertBefore: inSheetOrder ? (rowKey) => void mutate({ action: "insert", rowNumber: Number(rowKey) - 1 }, "insert") : undefined,
            // Les lignes vides arrivent sous celle-ci dans la feuille, quel que soit le tri affiché.
            insertRows: (rowKey, count) => void mutate({ action: "insert", rowNumber: Number(rowKey), count }, "insert"),
            duplicate: (rowKeys) => void mutate({ action: "duplicate", rowNumbers: rowKeys.map(Number) }, "duplicate"),
            remove: (rowKeys) => void mutate({ action: "delete", rowNumbers: rowKeys.map(Number) }, "delete"),
          }}
          toolbarTrailing={saving > 0 ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : null}
          empty={selected.rows.length ? "Aucune ligne ne correspond à la recherche." : "Ce tableau est vide. Ajoute sa première ligne."}
        />
      ) : !error ? <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Aucun Google Sheets n’a été trouvé dans le dossier « Objets ».</div> : null}
    </section>
  )
}
