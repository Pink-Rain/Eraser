"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { ImageIcon, LoaderCircle, Plus, RefreshCw, Search } from "lucide-react"

import { usePersistentState } from "@/hooks/use-persistent-state"
import { indexGridColumn, IndexEntryForm } from "@/components/eraser/index-cells"
import { ObjectIcon } from "@/components/eraser/object-icon"
import { SheetGrid, type SheetGridColumn, type SheetGridSort } from "@/components/eraser/sheet-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ObjectIndexTable } from "@/lib/google-sheets"
import { isRichSpec, objectColumnSpec, type IndexColumnSpec } from "@/lib/index-columns"

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
const idSpec: IndexColumnSpec = { kind: "id" }

function isIconHeader(header: string) {
  return ["icone", "icon"].includes(normalize(header).trim())
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

  const specs = useMemo(() => (selected?.headers ?? []).map((header, _index, headers) => objectColumnSpec(header, headers)), [selected])
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

  /** Import d'une icône : l'image va dans le dossier « icone objet » du Drive et le serveur la pose dans la case. */
  const uploadIcon = useCallback(async (file: File, _previous: string, rowKey: string) => {
    if (!selected) throw new Error("Aucun tableau choisi.")
    const form = new FormData()
    form.set("fileId", selected.fileId)
    form.set("tabName", selected.tabName)
    form.set("rowNumber", rowKey)
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
  }, [selected])

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

  // Chaque colonne passe par le moteur des index : son type décide de sa cellule.
  /* eslint-disable react-hooks/refs -- les cellules ne lisent ces valeurs qu'en se dessinant, comme avant : indexGridColumn ne fait que les ranger dans la colonne */
  const columns = useMemo<SheetGridColumn[]>(() => {
    const context = { valueOf, commit: (rowKey: string, columnKey: string, value: string) => void commitCell(rowKey, columnKey, value), idComputed: () => !hasIdColumn }
    const list = (selected?.headers ?? []).map((header, index) => isIconHeader(header)
      // L'icône garde son affichage et son import dans le dossier « icone objet ».
      ? indexGridColumn(String(index), header, specs[index], 96, context, { renderValue: iconPreview, upload: uploadIcon })
      : indexGridColumn(String(index), header, specs[index], columnWidthFor(header), context))
    // Sans colonne ID dans la feuille, l'identifiant calculé par l'inventaire est montré à part.
    if (selected && !hasIdColumn) list.push(indexGridColumn(COMPUTED_ID, "ID", idSpec, 200, context, { sortable: false }))
    return list
  }, [commitCell, hasIdColumn, iconPreview, selected, specs, uploadIcon, valueOf])
  /* eslint-enable react-hooks/refs */

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
          <Button type="button" variant="outline" onClick={() => void syncIcons()} disabled={!tables.length || busy} title="Remplit les cases « Icône » vides avec les icônes d’Eraser du dossier « icone objet » ; une icône choisie à la main reste en place.">{pending === "icons" ? <LoaderCircle className="animate-spin" /> : <ImageIcon />}Mettre à jour les icônes</Button>
          <Button type="button" onClick={() => setCreating(true)} disabled={!selected || busy}><Plus />Ajouter un objet</Button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-xl border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">{notice}</p>}

      {creating && selected && <IndexEntryForm
        title="Nouvel objet"
        fields={selected.headers.map((header, index) => ({ key: String(index), label: header, spec: specs[index], long: isLongField(header) }))}
        pending={pending === "add"}
        onCancel={() => setCreating(false)}
        onSave={(values) => void mutate({ action: "add", values: selected.headers.map((_, index) => values[String(index)] ?? "") }, "add")}
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
