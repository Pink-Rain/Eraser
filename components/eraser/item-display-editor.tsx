"use client"

/**
 * « Index des items › Modifier › Affichage des items » : pour chaque endroit (inventaire,
 * magasin, fouille), les colonnes de l'index, chacune dans sa zone, son style et pour qui, avec
 * l'aperçu de l'endroit sur un vrai item, vu par un joueur ou par le MJ.
 *
 * Enregistré aussitôt (un instant après le dernier changement), pour tout le monde, sur le
 * serveur partagé d'Eraser : les pages ouvertes le reprennent sans être rechargées.
 */
import { ArrowDown, ArrowUp, Anvil, Check, ChevronDown, ChevronRight, Dices, GripVertical, LoaderCircle, MapPin, MoveRight, Pin, RefreshCw, RotateCcw, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"

import { Segmented, hintText, settingsTitle } from "@/components/eraser/editor-controls"
import { itemZoneParts, placeZone, reloadItemDisplay, type ItemColumnValue, type ItemSource, type ItemZoneContext } from "@/components/eraser/item-display"
import { ObjectIcon } from "@/components/eraser/object-icon"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { normalizeSpec, type IndexColumnSpec } from "@/lib/index-columns"
import type { ObjectTraitLook } from "@/lib/inventory-schema"
import {
  defaultItemFieldStyle,
  defaultItemPlaceDisplay,
  foldItemColumn,
  isDefaultItemPlaceDisplay,
  isFixedItemColumn,
  isItemTrait,
  itemAudiences,
  itemFieldStyle,
  itemFieldStyles,
  itemFieldVisible,
  itemPlaceDisplay,
  itemPlaceFixed,
  itemPlaces,
  itemZoneHints,
  itemZones,
  knownItemField,
  parseItemDisplaySettings,
  renameItemDisplayColumns,
  sameItemColumn,
  type ItemAudience,
  type ItemDisplayField,
  type ItemDisplaySettings,
  type ItemFieldStyle,
  type ItemPlace,
  type ItemPlaceDisplay,
  type ItemViewer,
  type ItemZone,
} from "@/lib/item-display"
import { cn } from "@/lib/utils"

/** Une colonne de l'index : son nom et son type (le premier onglet qui l'a). */
export type ItemDisplayColumn = { header: string; spec?: IndexColumnSpec }

/** Ce qu'aucune zone ne sait montrer : pas de valeur à afficher. */
const hiddenKinds = new Set(["id", "archived", "tab", "auto-links", "ranked-links", "actions", "name", "name-form"])

/** Les colonnes que l'éditeur propose : toutes, sauf le nom, l'identifiant, l'icône, l'image et ce qui n'a pas de valeur à montrer. */
export function itemDisplayColumnsOf(columns: ItemDisplayColumn[]) {
  const kept: ItemDisplayColumn[] = []
  for (const column of columns) {
    const header = column.header.trim()
    if (!header || isFixedItemColumn(header) || hiddenKinds.has(normalizeSpec(column.spec ?? { kind: "rich" }).kind)) continue
    if (kept.some((other) => foldItemColumn(other.header) === foldItemColumn(header))) continue
    kept.push({ ...column, header })
  }
  return kept
}

const HIDDEN = "hidden"
type ZoneChoice = ItemZone | typeof HIDDEN

/** Une ligne de la liste : une colonne de l'index, et sa place (absente : masquée). */
type Row = { header: string; spec?: IndexColumnSpec; field?: ItemDisplayField }

/** Les lignes d'un endroit : les colonnes placées, zone par zone et dans leur ordre, puis les masquées. */
function rowsOf(display: ItemPlaceDisplay, columns: ItemDisplayColumn[]) {
  const placed: Row[] = []
  for (const field of display.fields) {
    const column = columns.find((candidate) => sameItemColumn(candidate.header, field.column))
    if (column && !placed.some((row) => row.header === column.header)) placed.push({ header: column.header, spec: column.spec, field })
  }
  const hidden = columns.filter((column) => !placed.some((row) => row.header === column.header)).map((column): Row => ({ header: column.header, spec: column.spec }))
  return { placed, hidden }
}

/** L'allure d'une colonne d'après son type (style imposé, couleurs de la liste, unité), pour l'aperçu. */
function lookOf(spec: IndexColumnSpec | undefined): ObjectTraitLook | undefined {
  if (!spec) return undefined
  const clean = normalizeSpec(spec)
  const look: ObjectTraitLook = {}
  if (clean.style && !clean.style.keepCellFormatting) look.style = clean.style
  if ((clean.kind === "choice" || clean.kind === "linked-choice") && clean.options?.length) look.options = clean.options.map((option) => ({ value: option.value, ...(option.color ? { color: option.color } : {}) }))
  if (clean.kind === "number" && clean.number?.defaultUnit) look.unit = clean.number.defaultUnit
  return Object.keys(look).length ? look : undefined
}

const nameColumns = ["Nom", "Nom de l'objet", "Objet", "Arme", "Équipement", "Ressource", "Livre", "Titre"].map(foldItemColumn)
const iconColumns = ["Icône", "Icone", "Icon"].map(foldItemColumn)

/** Un item d'aperçu, tiré d'une ligne de l'index (en-tête → texte). */
function previewItemOf(row: Record<string, string>) {
  const item: ItemSource & { name: string; icon: string } = { name: "", icon: "" }
  const values: Record<string, ItemColumnValue> = {}
  for (const [header, raw] of Object.entries(row)) {
    const text = String(raw ?? "").trim()
    if (!text) continue
    const folded = foldItemColumn(header)
    if (!item.name && nameColumns.includes(folded)) item.name = text.replace(/<[^>]+>/g, "")
    if (!item.icon && iconColumns.includes(folded)) item.icon = text
    const key = knownItemField(header)
    if (key && !(item as Record<string, unknown>)[key]) (item as unknown as Record<string, string>)[key] = text
    values[header] = { t: text }
  }
  return { item, values }
}

/** Un bouton factice de l'aperçu : la place qu'il prend dans l'endroit. */
function Fake({ children, className }: { children: ReactNode; className?: string }) {
  return <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70", className)}>{children}</span>
}

function joined(parts: ReactNode[]) {
  return parts.map((part, index) => <span key={index}>{index > 0 && " · "}{part}</span>)
}

/** L'aperçu d'un endroit, dessiné comme lui, avec les zones réglées. */
function PlacePreview({ place, display, context }: { place: ItemPlace; display: ItemPlaceDisplay; context: ItemZoneContext & { item: ItemSource & { name: string; icon: string } } }) {
  const [open, setOpen] = useState(true)
  const { item } = context
  const nameParts = itemZoneParts(placeZone(display, "name"), { ...context, inline: true })
  if (place === "inventory") {
    const underParts = itemZoneParts(placeZone(display, "under"), { ...context, inline: true })
    const descriptionFields = placeZone(display, "description")
    const withDescription = descriptionFields.some((field) => knownItemField(field.column) === "description")
    const extras = itemZoneParts(descriptionFields.filter((field) => knownItemField(field.column) !== "description"), context)
    const effectParts = itemZoneParts(placeZone(display, "effect"), context)
    const description = withDescription ? item.description ?? "" : ""
    return <article className="rounded-xl border border-border/55 bg-background/40 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/70 text-muted-foreground"><ObjectIcon icon={item.icon} name={item.name} type={item.type ?? ""} subtype={item.subtype ?? ""} className="size-full p-0.5" emojiClassName="text-2xl" fallback="◇" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-sm font-semibold">{item.name}</span>{nameParts}</div>
              {underParts.length > 0 && <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{underParts.map((part, index) => <span key={index} className="contents">{index > 0 && <span>·</span>}{part}</span>)}</div>}
            </div>
            <span className="min-w-7 text-center text-sm font-semibold tabular-nums">1<span className="text-[9px] font-normal text-muted-foreground">/1</span></span>
            <Fake><Anvil className="size-3.5" /></Fake><Fake><MoveRight className="size-3.5" /></Fake><Fake className="text-destructive/60"><Trash2 className="size-3.5" /></Fake>
          </div>
          {(description || extras.length > 0 || effectParts.length > 0) && <div className="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground">
            {(description || extras.length > 0) && <div className="flex min-w-0 items-start gap-1 text-muted-foreground/80">
              <button type="button" onClick={() => setOpen(!open)} className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:bg-muted" aria-label={open ? "Replier" : "Déplier"}><ChevronRight className={`size-3 transition-transform ${open ? "rotate-90" : ""}`} /></button>
              {open
                ? <div className="grid min-w-0 flex-1 gap-1">{description && <span className="italic">{description.replace(/<[^>]+>/g, " ")}</span>}{extras}</div>
                : <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 truncate text-left italic">{description.replace(/<[^>]+>/g, " ") || "Détails"}</button>}
            </div>}
            {effectParts}
          </div>}
        </div>
      </div>
    </article>
  }
  if (place === "shop") {
    const underParts = itemZoneParts(placeZone(display, "under"), { ...context, inline: true, renderKnown: (key, field) => key === "type" && itemFieldStyle(field) === "value" ? <span className="font-semibold text-foreground/65">{item.type || "Objet"}</span> : undefined })
    const descriptionFields = placeZone(display, "description")
    const effectFields = placeZone(display, "effect")
    const descriptionParts = itemZoneParts(descriptionFields, context)
    const effectParts = itemZoneParts(effectFields, context)
    const headingOf = (fields: ItemDisplayField[], key: "description" | "effect") => fields.find((field) => knownItemField(field.column) === key)?.column
    const details = descriptionParts.length > 0 || effectParts.length > 0
    return <div className="overflow-hidden rounded-2xl border bg-card/90 shadow-sm"><div className="px-4 py-2">
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto_1.75rem_1.75rem] items-center gap-2">
        <span className="flex size-10 items-center justify-center overflow-hidden rounded-md border bg-background text-sm"><ObjectIcon icon={item.icon} name={item.name} type={item.type ?? ""} subtype={item.subtype ?? ""} className="size-full p-0.5" emojiClassName="text-base" fallback="◇" /></span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5"><p className="truncate text-sm font-semibold">{item.name}</p><span className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0 text-[9px] font-semibold text-emerald-800">Commun</span>{nameParts}</div>
          {underParts.length > 0 && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{joined(underParts)}</p>}
        </div>
        <span className="text-xs font-semibold tabular-nums text-amber-700">{item.price || "—"}</span>
        <Fake><Dices className="size-3.5" /></Fake>
        {details ? <button type="button" onClick={() => setOpen(!open)} className="flex size-7 items-center justify-center rounded-md hover:bg-muted" aria-label={open ? "Masquer les détails" : "Afficher les détails"}><ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></button> : <span />}
      </div>
      {open && details && <div className="ml-12 mt-2 grid gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs leading-5">
        {descriptionParts.length > 0 && <div>{headingOf(descriptionFields, "description") && <p className="font-semibold text-foreground">{headingOf(descriptionFields, "description")}</p>}<div className="mt-0.5 grid gap-1 text-muted-foreground">{descriptionParts}</div></div>}
        {effectParts.length > 0 && <div>{headingOf(effectFields, "effect") && <p className="font-semibold text-foreground">{headingOf(effectFields, "effect")}</p>}<div className="mt-0.5 grid gap-1 text-muted-foreground">{effectParts}</div></div>}
      </div>}
    </div></div>
  }
  const underParts = itemZoneParts(placeZone(display, "under"), { ...context, inline: true })
  const descriptionParts = itemZoneParts(placeZone(display, "description"), context)
  const effectParts = itemZoneParts(placeZone(display, "effect"), { ...context, renderKnown: (key, field) => key === "effect" && itemFieldStyle(field) === "label" && item.effect ? <p className="text-xs leading-5"><span className="font-semibold">{field.column} :</span> {item.effect.replace(/<[^>]+>/g, " ")}</p> : undefined })
  return <article className="rounded-2xl border bg-card/80 p-4 shadow-sm">
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800">Réussite</span>
      <span className="inline-flex items-center gap-1 font-medium text-muted-foreground"><MapPin className="size-3" />Forêt</span>
      <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold tabular-nums">d100 · 42</span>
      <span className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800">Commun</span>
    </div>
    <div className="mt-3 flex items-start gap-3">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/70 text-muted-foreground"><ObjectIcon icon={item.icon} name={item.name} type={item.type ?? ""} subtype={item.subtype ?? ""} className="size-full p-0.5" emojiClassName="text-2xl" fallback="◇" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5"><p className="font-display text-lg font-semibold leading-tight">{item.name}</p>{nameParts}</div>
        {underParts.length > 0 && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{joined(underParts)}</p>}
        {descriptionParts.length > 0 && <div className="mt-1.5 grid gap-1 text-xs leading-5 text-muted-foreground">{descriptionParts}</div>}
        {effectParts.length > 0 && <div className="mt-1 grid gap-1.5 text-xs leading-5">{effectParts}</div>}
      </div>
    </div>
    <div className="mt-3 flex items-center justify-end gap-1 border-t pt-2"><Fake><Pin className="size-3.5" /></Fake><Fake><RefreshCw className="size-3.5" /></Fake><Fake><MoveRight className="size-3.5" /></Fake><Fake><X className="size-3.5" /></Fake></div>
  </article>
}

/**
 * Des colonnes renommées dans « Modifier › Colonnes » (et absentes de tous les onglets sous leur
 * ancien nom) : chaque endroit qui les place suit leur nouveau nom. Sans effet ailleurs.
 */
export async function followItemDisplayRenames(renames: Array<{ from: string; to: string }>) {
  if (!renames.length) return
  const response = await fetch("/api/items/display?all=1", { cache: "no-store" }).catch(() => null)
  if (!response?.ok) return
  const settings = parseItemDisplaySettings(((await response.json().catch(() => ({}))) as { settings?: unknown }).settings)
  const renamed = renameItemDisplayColumns(settings, renames)
  if (!renamed) return
  for (const option of itemPlaces) {
    const display = renamed[option.value]
    if (!display || JSON.stringify(display) === JSON.stringify(settings[option.value])) continue
    await fetch("/api/items/display", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ place: option.value, display }) }).catch(() => null)
  }
  void reloadItemDisplay()
}

type SaveState = "idle" | "saving" | "saved" | "error"

/**
 * L'onglet « Affichage des items ». `columns` : les colonnes enregistrées de l'index (celles
 * ajoutées dans « Colonnes » arrivent après « Enregistrer ») ; `rows` : des lignes pour l'aperçu.
 */
export function ItemDisplayEditor({ columns, rows, initialPlace = "inventory", canEdit = true }: { columns: ItemDisplayColumn[]; rows: Array<Record<string, string>>; initialPlace?: ItemPlace; canEdit?: boolean }) {
  const [settings, setSettings] = useState<ItemDisplaySettings | null>(null)
  const [loadError, setLoadError] = useState("")
  const [place, setPlace] = useState<ItemPlace>(initialPlace)
  const [viewer, setViewer] = useState<ItemViewer>("players")
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveError, setSaveError] = useState("")
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const timers = useRef(new Map<ItemPlace, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    let alive = true
    fetch("/api/items/display?all=1", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { settings?: unknown; error?: string; unavailable?: boolean }
        if (!alive) return
        if (!response.ok) { setLoadError(payload.error || "L’affichage des items n’a pas pu être lu."); return }
        setSettings(parseItemDisplaySettings(payload.settings))
        if (payload.unavailable) setLoadError("Le serveur partagé d’Eraser ne répond pas : voici l’affichage d’Eraser, et rien ne pourra être enregistré pour l’instant.")
      })
      .catch(() => { if (alive) setLoadError("L’affichage des items n’a pas pu être lu.") })
    const pending = timers.current
    return () => { alive = false; for (const timer of pending.values()) clearTimeout(timer) }
  }, [])

  const usable = useMemo(() => itemDisplayColumnsOf(columns), [columns])
  // L'aperçu : la ligne la plus remplie d'abord (on y voit le plus de colonnes), puis les autres.
  const samples = useMemo(() => rows.map((row) => ({ row, ...previewItemOf(row) })).filter((sample) => sample.item.name).map((sample) => ({ ...sample, filled: Object.keys(sample.values).length })).sort((left, right) => right.filled - left.filled).slice(0, 60), [rows])
  const [sampleIndex, setSampleIndex] = useState(0)
  const sample = samples[Math.min(sampleIndex, Math.max(0, samples.length - 1))]
  const looks = useMemo(() => Object.fromEntries(usable.flatMap((column) => { const look = lookOf(column.spec); return look ? [[column.header, look] as const] : [] })), [usable])

  if (!settings) {
    return <div className="grid min-h-40 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">{loadError || <LoaderCircle className="size-5 animate-spin" />}</div>
  }

  const display = itemPlaceDisplay(settings, place)
  const { placed, hidden } = rowsOf(display, usable)

  function save(target: ItemPlace, next: ItemPlaceDisplay) {
    const pending = timers.current.get(target)
    if (pending) clearTimeout(pending)
    setSaveState("saving"); setSaveError("")
    timers.current.set(target, setTimeout(() => {
      timers.current.delete(target)
      const body = { place: target, display: isDefaultItemPlaceDisplay(target, next) ? null : next }
      fetch("/api/items/display", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          if (!response.ok) throw new Error(payload.error || "L’affichage n’a pas pu être enregistré.")
          setSaveState("saved")
          void reloadItemDisplay()
        })
        .catch((reason: unknown) => { setSaveState("error"); setSaveError(reason instanceof Error ? reason.message : "L’affichage n’a pas pu être enregistré.") })
    }, 700))
  }

  /** Change l'endroit affiché : ses colonnes rangées zone par zone, puis enregistrées un instant après. */
  function change(fields: ItemDisplayField[]) {
    const next: ItemPlaceDisplay = { fields: itemZones.flatMap((zone) => fields.filter((field) => field.zone === zone.value)) }
    setSettings((current) => ({ ...(current ?? {}), [place]: next }))
    save(place, next)
  }

  function reset() {
    const next = defaultItemPlaceDisplay(place)
    setSettings((current) => { const copy = { ...(current ?? {}) }; delete copy[place]; return copy })
    save(place, next)
  }

  // Les colonnes placées gardent leur nom d'enregistrement ; les autres (absentes de l'index) restent telles quelles.
  const others = display.fields.filter((field) => !placed.some((row) => row.field === field))

  function setZone(row: Row, zone: ZoneChoice) {
    const kept = display.fields.filter((field) => field !== row.field)
    if (zone === HIDDEN) return change(kept)
    if (row.field) return change(display.fields.map((field) => field === row.field ? { ...field, zone, ...(field.style && field.style !== defaultItemFieldStyle(zone) ? {} : { style: undefined }) } : field))
    change([...kept, { column: row.header, zone }])
  }

  function setField(row: Row, patch: Partial<ItemDisplayField>) {
    if (!row.field) return
    change(display.fields.map((field) => field === row.field ? { ...field, ...patch } : field))
  }

  /** Glisser une colonne sur une autre : elle prend sa zone et se pose juste avant elle (sur une masquée : elle se masque). */
  function dropOn(target: Row | ItemZone) {
    const moved = [...placed, ...hidden].find((row) => row.header === dragging)
    setDragging(null); setOver(null)
    if (!moved) return
    const zone: ZoneChoice = typeof target === "string" ? target : target.field?.zone ?? HIDDEN
    if (typeof target !== "string" && target.header === moved.header) return
    const field: ItemDisplayField | null = zone === HIDDEN ? null : moved.field ? { ...moved.field, zone } : { column: moved.header, zone }
    const rest = display.fields.filter((item) => item !== moved.field)
    if (!field) return change(rest)
    const at = typeof target === "string" || !target.field ? -1 : rest.indexOf(target.field)
    change(at < 0 ? [...rest, field] : [...rest.slice(0, at), field, ...rest.slice(at)])
  }

  function move(row: Row, delta: number) {
    if (!row.field) return
    const zone = placeZone(display, row.field.zone)
    const index = zone.indexOf(row.field)
    const swap = zone[index + delta]
    if (!swap) return
    change(display.fields.map((field) => field === row.field ? swap : field === swap ? row.field! : field))
  }

  const dragProps = (row: Row) => canEdit ? {
    draggable: true,
    onDragStart: (event: DragEvent) => { setDragging(row.header); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", row.header) },
    onDragOver: (event: DragEvent) => { if (!dragging) return; event.preventDefault(); setOver(row.header) },
    onDragEnd: () => { setDragging(null); setOver(null) },
    onDrop: (event: DragEvent) => { event.preventDefault(); dropOn(row) },
  } : {}
  const zoneDropProps = (zone: ItemZone) => canEdit ? {
    onDragOver: (event: DragEvent) => { if (!dragging) return; event.preventDefault(); setOver(`zone:${zone}`) },
    onDrop: (event: DragEvent) => { event.preventDefault(); dropOn(zone) },
  } : {}

  const shown: ItemPlaceDisplay = { fields: [...placed.flatMap((row) => row.field ? [row.field] : []), ...others].filter((field) => itemFieldVisible(place, field, viewer)) }
  const context = sample ? { item: sample.item, values: sample.values, looks } : null
  const isDefault = isDefaultItemPlaceDisplay(place, display)

  function rowNode(row: Row, index: number, zoneRows: Row[]) {
    const key = knownItemField(row.header)
    const trait = isItemTrait(key)
    const zone: ZoneChoice = row.field?.zone ?? HIDDEN
    return <li key={row.header} {...dragProps(row)} className={cn("grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-lg border bg-background/60 px-2 py-1.5 sm:grid-cols-[1rem_minmax(7rem,1fr)_9.5rem_9rem_7rem_auto]", over === row.header && "ring-2 ring-primary/50", dragging === row.header && "opacity-50")}>
      <GripVertical className={cn("size-3.5 text-muted-foreground/60", canEdit && "cursor-grab")} aria-hidden="true" />
      <span className="min-w-0 truncate text-sm font-medium" title={key ? "Lue dans l’item (retouches de l’exemplaire comprises)" : undefined}>{row.header}{key && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">Eraser</span>}</span>
      <NativeSelect value={zone} disabled={!canEdit} onChange={(event) => setZone(row, event.target.value as ZoneChoice)} className="h-7 text-xs max-sm:col-start-2" aria-label={`Zone de ${row.header}`}>
        <NativeSelectOption value={HIDDEN}>Masqué</NativeSelectOption>
        {itemZones.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
      </NativeSelect>
      {row.field
        ? trait
          ? <span className="text-[11px] text-muted-foreground max-sm:col-start-2" title="Les traits de combat se dessinent comme leur colonne, ensemble.">Style de sa colonne</span>
          : <NativeSelect value={itemFieldStyle(row.field)} disabled={!canEdit} onChange={(event) => setField(row, { style: event.target.value === defaultItemFieldStyle(row.field!.zone) ? undefined : event.target.value as ItemFieldStyle })} className="h-7 text-xs max-sm:col-start-2" aria-label={`Style de ${row.header}`}>
            {itemFieldStyles.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
          </NativeSelect>
        : <span className="max-sm:hidden" />}
      {row.field
        ? <NativeSelect value={row.field.audience ?? "all"} disabled={!canEdit} onChange={(event) => setField(row, { audience: event.target.value === "all" ? undefined : event.target.value as ItemAudience })} className="h-7 text-xs max-sm:col-start-2" aria-label={`Qui voit ${row.header}`}>
          {itemAudiences.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
        </NativeSelect>
        : <span className="max-sm:hidden" />}
      {row.field && canEdit
        ? <span className="flex items-center max-sm:col-start-2"><Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => move(row, -1)} aria-label={`Monter ${row.header}`}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon-xs" disabled={index === zoneRows.length - 1} onClick={() => move(row, 1)} aria-label={`Descendre ${row.header}`}><ArrowDown /></Button></span>
        : <span className="max-sm:hidden" />}
    </li>
  }

  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Segmented ariaLabel="Endroit" value={place} options={itemPlaces.map((option) => ({ value: option.value, label: option.label, title: option.hint }))} onChange={setPlace} />
      <span className="flex flex-wrap items-center gap-2">
        <span className={settingsTitle}>Voir comme</span>
        <Segmented ariaLabel="Voir comme" value={viewer} options={[{ value: "players", label: "Joueur" }, { value: "mj", label: "MJ" }]} onChange={setViewer} />
        <span className="min-w-24 text-[11px] text-muted-foreground" aria-live="polite">{saveState === "saving" ? <span className="inline-flex items-center gap-1"><LoaderCircle className="size-3 animate-spin" />Enregistrement…</span> : saveState === "saved" ? <span className="inline-flex items-center gap-1"><Check className="size-3" />Enregistré</span> : saveState === "error" ? <span className="text-destructive">Non enregistré</span> : null}</span>
      </span>
    </div>
    {(loadError || saveError) && <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">{saveError || loadError}</p>}

    <section className="grid gap-2 rounded-xl border bg-muted/20 p-3" aria-label="Aperçu">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={settingsTitle}>Aperçu · {itemPlaces.find((option) => option.value === place)?.label} · {viewer === "mj" ? "MJ" : "joueur"}</p>
        {samples.length > 1 && <NativeSelect value={String(Math.min(sampleIndex, samples.length - 1))} onChange={(event) => setSampleIndex(Number(event.target.value))} className="h-7 max-w-64 text-xs" aria-label="Item de l’aperçu">
          {samples.map((candidate, index) => <NativeSelectOption key={`${candidate.item.name}:${index}`} value={String(index)}>{candidate.item.name}</NativeSelectOption>)}
        </NativeSelect>}
      </div>
      {context ? <PlacePreview key={place} place={place} display={shown} context={context} /> : <p className={hintText}>Aucun item à montrer : l’index est vide.</p>}
      {place === "shop" && viewer === "players" && placeZone(display, "effect").length > 0 && <p className={hintText}>Un joueur ne voit jamais l’effet dans un magasin, ni ce qui va avec.</p>}
    </section>

    <section className="grid gap-3" aria-label="Colonnes">
      <p className={hintText}>Glisse une colonne d’une zone à l’autre, ou choisis sa zone. Une case vide ne s’affiche jamais. Fixes ici : {itemPlaceFixed[place]}</p>
      {itemZones.map((zone) => {
        const zoneRows = placed.filter((row) => row.field?.zone === zone.value)
        return <div key={zone.value} {...zoneDropProps(zone.value)} className={cn("grid gap-1 rounded-xl border border-dashed p-2", over === `zone:${zone.value}` && "border-primary/60 bg-primary/5")}>
          <p className="px-1 text-xs font-semibold text-foreground">{zone.label} <span className="font-normal text-muted-foreground">— {itemZoneHints[place][zone.value]}</span></p>
          {zoneRows.length ? <ul className="grid gap-1">{zoneRows.map((row, index) => rowNode(row, index, zoneRows))}</ul> : <p className="px-1 py-1 text-[11px] text-muted-foreground">Rien ici{canEdit ? " : glisse une colonne dans cette zone." : "."}</p>}
        </div>
      })}
      <div className="grid gap-1 rounded-xl border border-dashed p-2" onDragOver={(event) => { if (dragging) { event.preventDefault(); setOver("zone:hidden") } }} onDrop={(event) => { event.preventDefault(); const moved = placed.find((row) => row.header === dragging); setDragging(null); setOver(null); if (moved) setZone(moved, HIDDEN) }}>
        <p className="px-1 text-xs font-semibold text-foreground">Masqué <span className="font-normal text-muted-foreground">— les nouvelles colonnes arrivent ici.</span></p>
        {hidden.length ? <ul className="grid gap-1">{hidden.map((row, index) => rowNode(row, index, hidden))}</ul> : <p className="px-1 py-1 text-[11px] text-muted-foreground">Toutes les colonnes sont affichées.</p>}
      </div>
      {canEdit && !isDefault && <div><Button type="button" variant="outline" size="sm" onClick={reset}><RotateCcw />Revenir à l’affichage d’Eraser ({itemPlaces.find((option) => option.value === place)?.label.toLocaleLowerCase("fr")})</Button></div>}
    </section>
  </div>
}

