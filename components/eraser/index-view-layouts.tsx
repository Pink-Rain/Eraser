"use client"

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, ImageOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { loadWorldIndexData } from "@/components/eraser/index-cells"
import { calendarsFromTables, firstWeekdayOf, formatCalendarDate, monthLength, parseCalendarDate, realCalendar, REAL_CALENDAR, seasonOf, type CalendarDefinition } from "@/lib/calendars"
import { dashboardTileKinds, dashboardTileValue, groupRowsBy, rowTree, sortLayoutRows, timelineEntries, treeSize, type RowTreeNode, type ViewLayout } from "@/lib/index-view-layouts"

/**
 * Les présentations d'un onglet-fenêtre autres que le tableau et les cartes : liste,
 * kanban, maître-détail, calendrier, tableau de bord. Elles lisent les lignes que la vue
 * garde (conditions, recherche, tri) ; une modification passe par la page (ses écritures
 * et leurs vérifications).
 */
export type ViewLayoutProps = {
  layout: ViewLayout
  rows: string[]
  /** Les colonnes de l'onglet, sans l'identifiant. */
  headers: string[]
  nameOf: (rowKey: string) => string
  valueOf: (rowKey: string, header: string) => string
  /** Les choix d'une colonne liste (l'ordre des colonnes du kanban). */
  optionsOf?: (header: string) => Array<{ value: string; color?: string }>
  onOpen: (rowKey: string) => void
  /** Écrire une case (kanban) ; absent : la présentation ne modifie rien. */
  onCommit?: (rowKey: string, header: string, value: string) => void
  /**
   * Une ligne dessinée avec une carte de « Modifier › Cartes » (`cardId` : son identifiant,
   * ou « * » pour la carte par défaut de son onglet) ; `null` si l'onglet n'a pas cette carte.
   */
  renderCard?: (rowKey: string, cardId: string) => ReactNode
  empty: string
}

/** La carte d'une ligne si la vue en demande une (et que la page sait la dessiner). */
function cardFor(props: Pick<ViewLayoutProps, "layout" | "renderCard">) {
  const { itemCard } = props.layout
  return itemCard && props.renderCard ? (row: string) => props.renderCard!(row, itemCard) : null
}

function plain(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

/** La couleur d'une ligne : celle du choix de la colonne « Couleur des lignes selon ». */
function rowColor(layout: ViewLayout, row: string, valueOf: ViewLayoutProps["valueOf"], optionsOf?: ViewLayoutProps["optionsOf"]) {
  if (!layout.colorBy) return undefined
  const value = plain(valueOf(row, layout.colorBy)).split(/\s*[,;]\s*/)[0]?.toLocaleLowerCase("fr")
  return value ? optionsOf?.(layout.colorBy)?.find((option) => option.value.toLocaleLowerCase("fr") === value)?.color : undefined
}

/** L'image d'une ligne (première adresse trouvée dans la case choisie). */
function rowImage(layout: ViewLayout, row: string, valueOf: ViewLayoutProps["valueOf"]) {
  if (!layout.imageColumn) return ""
  return valueOf(row, layout.imageColumn).match(/(https:\/\/[^\s"'<>]+|\/api\/[^\s"'<>]+)/)?.[0] ?? ""
}

function RowImage({ src, size = "size-8" }: { src: string; size?: string }) {
  const [failed, setFailed] = useState("")
  // eslint-disable-next-line @next/next/no-img-element -- images des index (Drive ou app)
  return src && failed !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className={`${size} shrink-0 rounded-md border object-cover`} /> : null
}

/** Une grande image (galerie, codex) qui laisse place au repli si elle ne se charge pas. */
function CoverImage({ src, className, fallback = null }: { src: string; className: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState("")
  // eslint-disable-next-line @next/next/no-img-element -- images des index (Drive ou app)
  return src && failed !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className={className} /> : <>{fallback}</>
}

function Section({ title, count, collapsible, startCollapsed, color, hideCount, children }: { title: string; count: number; collapsible?: boolean; startCollapsed?: boolean; color?: string; hideCount?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!startCollapsed)
  const label = <><span className="flex items-center gap-2">{color && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}{title || "Sans valeur"}</span>{!hideCount && <span className="text-muted-foreground">{count}</span>}</>
  return <section className="space-y-2">
    {collapsible
      ? <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 border-b pb-1.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-primary/80 hover:text-primary"><ChevronDown className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} /><span className="flex flex-1 items-center justify-between gap-2">{label}</span></button>
      : <p className="flex items-center justify-between gap-2 border-b pb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">{label}</p>}
    {open && children}
  </section>
}

/** Les lignes rangées en sections si la présentation le demande. */
function Sections({ layout, rows, valueOf, optionsOf, render }: { layout: ViewLayout; rows: string[]; valueOf: ViewLayoutProps["valueOf"]; optionsOf?: ViewLayoutProps["optionsOf"]; render: (rows: string[]) => ReactNode }) {
  if (!layout.groupBy) return <>{render(rows)}</>
  const options = optionsOf?.(layout.groupBy) ?? []
  const groups = groupRowsBy(rows, (row) => valueOf(row, layout.groupBy!), options.map((option) => option.value)).filter((group) => group.name || !layout.hideEmpty)
  return <div className="space-y-5">{groups.map((group) => <Section key={group.name || "*"} title={group.name} count={group.rows.length} collapsible={layout.collapsible} startCollapsed={layout.collapsed} hideCount={layout.hideCounts} color={options.find((option) => option.value.toLocaleLowerCase("fr") === group.name.toLocaleLowerCase("fr"))?.color}>{render(group.rows)}</Section>)}</div>
}

function FieldValues({ fields, rowKey, valueOf, compact }: { fields: string[]; rowKey: string; valueOf: ViewLayoutProps["valueOf"]; compact?: boolean }) {
  const shown = fields.map((field) => ({ field, value: plain(valueOf(rowKey, field)) })).filter((entry) => entry.value)
  if (!shown.length) return null
  return <span className={`flex min-w-0 gap-x-3 gap-y-0.5 text-xs text-muted-foreground ${compact ? "truncate" : "flex-wrap"}`}>{shown.map((entry) => <span key={entry.field} className={compact ? "truncate" : ""}><span className="font-semibold text-foreground/60">{entry.field} :</span> {entry.value}</span>)}</span>
}

/** L'élément simple (nom, image, colonnes choisies) : quand la carte demandée manque. */
function SimpleItem({ row, layout, nameOf, valueOf, optionsOf, onOpen }: ViewLayoutProps & { row: string }) {
  const color = rowColor(layout, row, valueOf, optionsOf)
  return <article style={color ? { borderLeftColor: color } : undefined} className={`rounded-lg border bg-card p-2.5 ${color ? "border-l-4" : ""}`}>
    <span className="flex min-w-0 items-center gap-2"><RowImage src={rowImage(layout, row, valueOf)} /><button type="button" onClick={() => onOpen(row)} className="min-w-0 text-left text-sm font-semibold hover:text-primary hover:underline">{nameOf(row) || "Sans nom"}</button></span>
    <FieldValues fields={layout.fields ?? []} rowKey={row} valueOf={valueOf} />
  </article>
}

const PAGE = 60

/** Les éléments par paquets de 60 : une vue de mille lignes reste fluide. */
function Paged({ rows, render }: { rows: string[]; render: (rows: string[]) => ReactNode }) {
  const [limit, setLimit] = useState(PAGE)
  return <>
    {render(rows.slice(0, limit))}
    {rows.length > limit && <p className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">{limit} / {rows.length}<button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setLimit((current) => current + PAGE * 4)}>Afficher la suite</button></p>}
  </>
}

/* ---------- Liste ---------- */

function ListLayout(props: ViewLayoutProps) {
  const { layout, rows, headers, nameOf, valueOf, optionsOf, onOpen } = props
  const fields = layout.fields ?? []
  const card = cardFor(props)
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set())
  const toggle = (row: string) => setOpenRows((current) => { const next = new Set(current); if (next.has(row)) next.delete(row); else next.add(row); return next })
  const others = headers.filter((header) => !fields.includes(header))
  const grid = layout.listColumns === 3 ? "grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3" : layout.listColumns === 2 ? "grid gap-x-4 md:grid-cols-2" : ""
  if (card) {
    // Chaque élément est une carte : une, deux ou trois par rangée, sections comprises.
    const cardGrid = layout.listColumns === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : layout.listColumns === 2 ? "md:grid-cols-2" : ""
    return <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => <div className={`grid items-start ${layout.compact ? "gap-1.5" : "gap-3"} ${cardGrid}`}>{shown.map((row) => <div key={row} className="min-w-0">{card(row) ?? <SimpleItem row={row} {...props} />}</div>)}</div>} />} />
  }
  return <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <ul className={`overflow-hidden rounded-xl border bg-card/70 ${grid || "divide-y"}`}>
    {group.map((row) => {
      const expanded = openRows.has(row)
      const color = rowColor(layout, row, valueOf, optionsOf)
      return <li key={row} className={`${layout.compact ? "px-3 py-1.5" : "px-3 py-2.5"} ${grid ? "border-b" : ""} ${color ? "border-l-4" : ""}`} style={color ? { borderLeftColor: color } : undefined}>
        <div className="flex min-w-0 items-center gap-2">
          <RowImage src={rowImage(layout, row, valueOf)} size={layout.compact ? "size-6" : "size-8"} />
          {layout.collapsible && !layout.compact && <button type="button" aria-expanded={expanded} aria-label={expanded ? "Replier" : "Déplier"} onClick={() => toggle(row)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"><ChevronDown className={`size-4 transition-transform ${expanded ? "" : "-rotate-90"}`} /></button>}
          <button type="button" onClick={() => onOpen(row)} className={`min-w-0 text-left font-semibold hover:text-primary hover:underline ${layout.compact ? "shrink-0 truncate text-sm" : "text-sm"}`}>{nameOf(row) || "Sans nom"}</button>
          {layout.compact && <FieldValues fields={fields} rowKey={row} valueOf={valueOf} compact />}
        </div>
        {!layout.compact && <div className={layout.collapsible ? "pl-8" : ""}><FieldValues fields={fields} rowKey={row} valueOf={valueOf} /></div>}
        {expanded && <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-lg bg-muted/30 p-2.5 pl-8 text-xs sm:grid-cols-2">{others.map((header) => { const value = plain(valueOf(row, header)); return value ? <div key={header} className="min-w-0"><dt className="font-semibold text-muted-foreground">{header}</dt><dd className="break-words">{value}</dd></div> : null })}</dl>}
      </li>
    })}
  </ul>} />
}

/* ---------- Kanban ---------- */

function KanbanLayout(props: ViewLayoutProps) {
  const { layout, rows, nameOf, valueOf, optionsOf, onOpen, onCommit } = props
  const card = cardFor(props)
  const column = layout.kanbanColumn ?? ""
  const [dragged, setDragged] = useState("")
  const [over, setOver] = useState<string | null>(null)
  const options = column ? optionsOf?.(column) ?? [] : []
  const firstValue = (row: string) => plain(valueOf(row, column)).split(/\s*[,;]\s*/)[0] ?? ""
  // Glisser réécrit toute la case : seulement si elle tient une seule valeur, sans mise en forme
  // (« Commun, Elfique » ou un texte en gras ne perdent jamais une partie de leur contenu).
  const movable = (row: string) => {
    const raw = valueOf(row, column).trim()
    return Boolean(onCommit) && plain(raw) === raw && !/[,;\n]/.test(raw)
  }
  const same = (left: string, right: string) => left.toLocaleLowerCase("fr") === right.toLocaleLowerCase("fr")
  // Les colonnes : les choix de la liste dans leur ordre, puis les valeurs écrites, puis « Sans valeur ».
  const names = [...new Set([...options.map((option) => option.value), ...rows.map(firstValue).filter(Boolean)])]
  const lanes = [...names, ""].map((name) => ({ name, color: options.find((option) => option.value === name)?.color, rows: rows.filter((row) => firstValue(row).toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")) }))
    .filter((lane) => !layout.hideEmpty || lane.rows.length)
  const width = layout.laneWidth === "narrow" ? "w-52" : layout.laneWidth === "wide" ? "w-80" : "w-64"
  if (!column) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne du kanban dans « Modifier › Kanban ».</p>
  return <div className="flex gap-3 overflow-x-auto pb-2">
    {lanes.filter((lane) => lane.name || lane.rows.length).map((lane) => <section key={lane.name || "*"}
      onDragOver={(event) => { if (dragged && movable(dragged)) { event.preventDefault(); setOver(lane.name) } }}
      onDragLeave={() => setOver((current) => current === lane.name ? null : current)}
      onDrop={(event) => { event.preventDefault(); setOver(null); if (onCommit && dragged && movable(dragged) && !same(firstValue(dragged), lane.name)) onCommit(dragged, column, lane.name); setDragged("") }}
      className={`flex ${width} shrink-0 flex-col gap-2 rounded-xl border bg-muted/30 p-2 transition-colors ${over === lane.name ? "border-primary bg-primary/5" : ""}`}>
      <p className="flex items-center justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><span className="flex items-center gap-1.5">{lane.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: lane.color }} />}{lane.name || "Sans valeur"}</span><span>{lane.rows.length}</span></p>
      {lane.rows.map((row) => {
        const color = rowColor(layout, row, valueOf, optionsOf)
        const drawn = card?.(row)
        const drag = { draggable: movable(row), onDragStart: () => setDragged(row), onDragEnd: () => { setDragged(""); setOver(null) }, title: onCommit && !movable(row) ? "Plusieurs valeurs ou texte mis en forme : modifie la case dans la fiche" : undefined }
        if (drawn) return <div key={row} {...drag} className={`min-w-0 ${movable(row) ? "cursor-grab active:cursor-grabbing" : ""} ${dragged === row ? "opacity-50" : ""}`}>{drawn}</div>
        return <article key={row} style={color ? { borderLeftColor: color } : undefined} {...drag} className={`rounded-lg border bg-card p-2.5 shadow-sm ${color ? "border-l-4" : ""} ${movable(row) ? "cursor-grab active:cursor-grabbing" : ""} ${dragged === row ? "opacity-50" : ""}`}>
          <span className="flex min-w-0 items-center gap-2"><RowImage src={rowImage(layout, row, valueOf)} /><button type="button" onClick={() => onOpen(row)} className="min-w-0 text-left text-sm font-semibold hover:text-primary hover:underline">{nameOf(row) || "Sans nom"}</button></span>
          <FieldValues fields={(layout.fields ?? []).filter((field) => field !== column)} rowKey={row} valueOf={valueOf} />
        </article>
      })}
    </section>)}
  </div>
}

/* ---------- Maître-détail ---------- */

function MasterDetailLayout(props: ViewLayoutProps) {
  const { layout, rows, headers, nameOf, valueOf, optionsOf, onOpen } = props
  const card = cardFor(props)
  const [chosen, setChosen] = useState("")
  const selected = rows.includes(chosen) ? chosen : rows[0] ?? ""
  return <div className="grid gap-4 md:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
    <div className="max-h-[70vh] overflow-y-auto rounded-xl border bg-card/70 p-1.5">
      <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <div className="space-y-0.5">{group.map((row) => { const color = rowColor(layout, row, valueOf, optionsOf); return <button key={row} type="button" aria-current={row === selected} onClick={() => setChosen(row)} style={color ? { borderLeftColor: color } : undefined} className={`block w-full rounded-lg px-2.5 py-1.5 text-left ${color ? "border-l-4" : ""} ${row === selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
        <span className="flex min-w-0 items-center gap-2"><RowImage src={rowImage(layout, row, valueOf)} size="size-6" /><span className="block truncate text-sm font-semibold">{nameOf(row) || "Sans nom"}</span></span>
        {(layout.fields ?? []).length > 0 && <span className={`block truncate text-[11px] ${row === selected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{(layout.fields ?? []).map((field) => plain(valueOf(row, field))).filter(Boolean).join(" · ")}</span>}
      </button> })}</div>} />
    </div>
    {selected && card?.(selected) ? <div className="grid min-w-0 content-start gap-2">
      <div className="mx-auto w-full max-w-xl">{card(selected)}</div>
      <Button type="button" size="sm" variant="outline" className="justify-self-center" onClick={() => onOpen(selected)}><ExternalLink />Ouvrir la fiche</Button>
    </div> : <article className="min-w-0 rounded-xl border bg-card/80 p-4">
      {selected ? <>
        <div className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-center gap-3"><RowImage src={rowImage(layout, selected, valueOf)} size="size-14" /><h3 className="font-display text-2xl font-semibold">{nameOf(selected) || "Sans nom"}</h3></span><Button type="button" size="sm" variant="outline" onClick={() => onOpen(selected)}><ExternalLink />Ouvrir la fiche</Button></div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">{(layout.detailFields?.length ? layout.detailFields : headers).map((header) => { const value = plain(valueOf(selected, header)); return value ? <div key={header} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{header}</dt><dd className="mt-0.5 whitespace-pre-line break-words text-sm">{value}</dd></div> : null })}</dl>
      </> : <p className="py-10 text-center text-sm text-muted-foreground">Aucune ligne.</p>}
    </article>}
  </div>
}

/* ---------- Calendrier ---------- */

/** Les calendriers de l'Index des calendriers, lus une fois par page. */
function useCalendars() {
  const [calendars, setCalendars] = useState<CalendarDefinition[] | null>(null)
  useEffect(() => {
    let alive = true
    void loadWorldIndexData("calendars").then((data) => { if (alive) setCalendars(calendarsFromTables(data?.tables ?? [])) })
    return () => { alive = false }
  }, [])
  return calendars
}

function CalendarLayout({ layout, rows, nameOf, valueOf, onOpen }: ViewLayoutProps) {
  const calendars = useCalendars()
  const calendar = (!layout.calendar || layout.calendar === REAL_CALENDAR ? realCalendar : calendars?.find((candidate) => candidate.name.toLocaleLowerCase("fr") === layout.calendar!.toLocaleLowerCase("fr"))) ?? (calendars ? realCalendar : null)
  const dated = useMemo(() => !calendar || !layout.dateColumn ? [] : rows.flatMap((row) => { const date = parseCalendarDate(valueOf(row, layout.dateColumn!), calendar); return date ? [{ row, date }] : [] }), [calendar, layout.dateColumn, rows, valueOf])
  const today = new Date()
  const start = dated[0]?.date ?? (calendar === realCalendar ? { year: today.getFullYear(), month: today.getMonth(), day: 1 } : { year: 1, month: 0, day: 1 })
  const [shown, setShown] = useState<{ year: number; month: number } | null>(null)
  const current = shown ?? { year: start.year, month: start.month }
  if (!layout.dateColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne de la date dans « Modifier › Calendrier ».</p>
  if (!calendar) return <p className="py-10 text-center text-sm text-muted-foreground">Chargement du calendrier…</p>
  if (!calendar.months.length) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Le calendrier « {calendar.name} » n’a pas encore de mois : ajoute-les dans l’Index des calendriers, onglet Mois.</p>
  const week = calendar.weekdays.length || 7
  const length = monthLength(calendar, current.year, current.month)
  const offset = firstWeekdayOf(calendar, current.year, current.month)
  const cells = [...Array(offset).fill(null), ...Array.from({ length }, (_, index) => index + 1)]
  const move = (step: number) => {
    let month = current.month + step
    let year = current.year
    if (month < 0) { month = calendar.months.length - 1; year -= 1 }
    if (month >= calendar.months.length) { month = 0; year += 1 }
    setShown({ year, month })
  }
  const season = seasonOf(calendar, current.month)
  const undated = rows.length - dated.length
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1"><Button type="button" size="icon-sm" variant="outline" aria-label="Mois précédent" onClick={() => move(-1)}><ChevronLeft /></Button><Button type="button" size="icon-sm" variant="outline" aria-label="Mois suivant" onClick={() => move(1)}><ChevronRight /></Button></div>
      <h3 className="font-display text-xl font-semibold">{calendar.months[current.month]?.name} {current.year}{calendar.era ? ` ${calendar.era}` : ""}</h3>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">{season && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" style={season.color ? { borderColor: season.color, color: season.color } : undefined}>{season.name}</span>}{calendar.name}</span>
    </div>
    <div className="overflow-x-auto"><div className="grid min-w-[36rem] gap-px overflow-hidden rounded-xl border bg-border" style={{ gridTemplateColumns: `repeat(${week}, minmax(0, 1fr))` }}>
      {Array.from({ length: week }, (_, index) => <div key={`head:${index}`} className="bg-muted/60 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{calendar.weekdays[index] ?? `Jour ${index + 1}`}</div>)}
      {cells.map((day, index) => {
        const entries = day ? dated.filter((entry) => entry.date.year === current.year && entry.date.month === current.month && entry.date.day === day) : []
        return <div key={index} className={`min-h-20 p-1.5 ${day ? "bg-card" : "bg-muted/20"}`}>
          {day && <span className="text-[11px] font-semibold text-muted-foreground">{day}</span>}
          <div className="mt-0.5 space-y-0.5">{entries.map((entry) => <button key={entry.row} type="button" onClick={() => onOpen(entry.row)} title={formatCalendarDate(entry.date, calendar)} className="block w-full truncate rounded bg-primary/10 px-1.5 py-0.5 text-left text-[11px] font-medium text-primary hover:bg-primary/20">{nameOf(entry.row) || "Sans nom"}</button>)}</div>
        </div>
      })}
    </div></div>
    {undated > 0 && layout.showUndated && <ul className="flex flex-wrap gap-1.5">{rows.filter((row) => !dated.some((entry) => entry.row === row)).map((row) => <li key={row}><button type="button" onClick={() => onOpen(row)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted">{nameOf(row) || "Sans nom"}</button></li>)}</ul>}
    {undated > 0 && <p className="text-xs text-muted-foreground">{undated} ligne{undated > 1 ? "s" : ""} sans date lisible dans « {layout.dateColumn} » ({calendar === realCalendar ? "« 12 mars 1023 » ou « 1023-03-12 »" : `« 12 ${calendar.months[0]?.name ?? "Mois"} 1023 »`}).</p>}
  </div>
}

/* ---------- Galerie ---------- */

const galleryWidths = { sm: "8.5rem", md: "12rem", lg: "17rem" } as const
const galleryRatios = { square: "1 / 1", portrait: "4 / 5", landscape: "16 / 10" } as const

function GalleryLayout(props: ViewLayoutProps) {
  const { layout, rows, nameOf, valueOf, optionsOf, onOpen } = props
  const width = galleryWidths[layout.gallerySize ?? "md"]
  const ratio = galleryRatios[layout.galleryShape ?? "portrait"]
  const hover = Boolean(layout.captionOnHover)
  if (!layout.imageColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne des images dans « Modifier › Galerie ».</p>
  return <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${width}), 1fr))` }}>
    {shown.map((row) => {
      const src = rowImage(layout, row, valueOf)
      const color = rowColor(layout, row, valueOf, optionsOf)
      const caption = <span className="grid gap-0.5"><span className="font-display truncate text-sm font-semibold leading-tight">{nameOf(row) || "Sans nom"}</span>{(layout.fields ?? []).length > 0 && <span className="truncate text-[11px] opacity-80">{(layout.fields ?? []).map((field) => plain(valueOf(row, field))).filter(Boolean).join(" · ")}</span>}</span>
      return <button key={row} type="button" onClick={() => onOpen(row)} title={nameOf(row)} className="group relative block min-w-0 overflow-hidden rounded-xl border bg-muted/40 text-left shadow-sm outline-offset-2 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0" style={{ aspectRatio: ratio, ...(color ? { boxShadow: `inset 0 -3px 0 ${color}` } : {}) } as CSSProperties}>
        <CoverImage src={src} className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" fallback={<span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-muted/30 to-muted text-muted-foreground/60"><ImageOff className="size-6" /></span>} />
        <span className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2.5 pb-2 pt-8 text-white transition-opacity ${hover ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : ""}`}>{caption}</span>
      </button>
    })}
  </div>} />} />
}

/* ---------- Chronologie ---------- */

function TimelineLayout(props: ViewLayoutProps) {
  const { layout, rows, nameOf, valueOf, optionsOf, onOpen } = props
  const card = cardFor(props)
  const calendars = useCalendars()
  const named = layout.calendar && layout.calendar !== REAL_CALENDAR ? calendars?.find((candidate) => candidate.name.toLocaleLowerCase("fr") === layout.calendar!.toLocaleLowerCase("fr")) : undefined
  const calendar = named ?? realCalendar
  const { dated, undated } = useMemo(() => !layout.dateColumn ? { dated: [], undated: rows } : timelineEntries(rows, (row) => valueOf(row, layout.dateColumn!), (text) => parseCalendarDate(text, calendar)), [calendar, layout.dateColumn, rows, valueOf])
  if (!layout.dateColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne de la date dans « Modifier › Chronologie ».</p>
  const alternate = (layout.timelineSide ?? "alternate") === "alternate"
  // Les années servent de jalons : un repère chaque fois que l'année change ; les éléments alternent de côté.
  const placed = dated.map((entry, index) => ({ ...entry, milestone: index === 0 || dated[index - 1].date.year !== entry.date.year, right: !alternate || index % 2 === 0 }))
  return <div className="space-y-4">
    <ol className={`relative grid gap-3 ${alternate ? "md:before:left-1/2" : ""} before:absolute before:inset-y-1 before:left-[0.6875rem] before:w-0.5 before:rounded-full before:bg-gradient-to-b before:from-primary/50 before:via-primary/25 before:to-primary/5 md:before:-translate-x-1/2`}>
      {placed.map(({ row, date, milestone, right }) => {
        const color = rowColor(layout, row, valueOf, optionsOf) ?? "var(--primary)"
        // Une année seule est déjà dite par le jalon : pas de date répétée au-dessus de l'élément.
        const when = date.yearOnly ? "" : formatCalendarDate(date, calendar)
        const body = card?.(row) ?? <article className="rounded-xl border bg-card/90 p-3 shadow-sm">
          {when && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>{when}</p>}
          <span className="flex min-w-0 items-center gap-2"><RowImage src={rowImage(layout, row, valueOf)} size="size-9" /><button type="button" onClick={() => onOpen(row)} className="font-display min-w-0 text-left text-base font-semibold leading-tight hover:text-primary hover:underline">{nameOf(row) || "Sans nom"}</button></span>
          <FieldValues fields={(layout.fields ?? []).filter((field) => field !== layout.dateColumn)} rowKey={row} valueOf={valueOf} />
        </article>
        return <li key={row} className="contents">
          {milestone && <div className={`relative z-[1] flex ${alternate ? "md:justify-center" : ""}`}><span className="font-display ml-0 rounded-full border bg-background px-3 py-0.5 text-sm font-semibold shadow-sm">{date.year}{calendar.era ? ` ${calendar.era}` : ""}</span></div>}
          <div className={`relative grid pl-8 ${alternate ? `md:w-1/2 md:pl-0 ${right ? "md:ml-auto md:pl-8" : "md:pr-8"}` : ""}`}>
            <span aria-hidden className={`absolute top-3.5 size-3 rounded-full border-2 border-background shadow left-[0.3125rem] ${alternate ? (right ? "md:-left-1.5" : "md:left-auto md:-right-1.5") : ""}`} style={{ backgroundColor: color }} />
            {card && when && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>{when}</p>}
            {body}
          </div>
        </li>
      })}
    </ol>
    {undated.length > 0 && <div className="grid gap-1.5 border-t pt-3">
      <p className="text-xs text-muted-foreground">{undated.length} ligne{undated.length > 1 ? "s" : ""} sans date lisible dans « {layout.dateColumn} » ({calendar === realCalendar ? "« 12 mars 1023 », « 1023-03-12 » ou une année seule" : `« 12 ${calendar.months[0]?.name ?? "Mois"} 1023 » ou une année seule`}).</p>
      <ul className="flex flex-wrap gap-1.5">{undated.map((row) => <li key={row}><button type="button" onClick={() => onOpen(row)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted">{nameOf(row) || "Sans nom"}</button></li>)}</ul>
    </div>}
  </div>
}

/* ---------- Arborescence ---------- */

function TreeLayout(props: ViewLayoutProps) {
  const { layout, rows, nameOf, valueOf } = props
  const parentColumn = layout.parentColumn
  const tree = useMemo(() => parentColumn ? rowTree(rows, nameOf, (row) => valueOf(row, parentColumn)) : [], [nameOf, parentColumn, rows, valueOf])
  // Les nœuds ouverts ou fermés à la main ; les autres suivent « replié à l'ouverture ».
  const [toggled, setToggled] = useState<Set<string>>(() => new Set())
  if (!parentColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne du parent dans « Modifier › Arborescence » (par exemple « Pays » pour des villes).</p>
  const isOpen = (row: string) => toggled.has(row) ? Boolean(layout.collapsed) : !layout.collapsed
  const toggle = (row: string) => setToggled((current) => { const next = new Set(current); if (next.has(row)) next.delete(row); else next.add(row); return next })
  const all = (open: boolean) => setToggled(open === !layout.collapsed ? new Set() : new Set(rows))
  return <div className="grid gap-2">
    <div className="flex flex-wrap items-center gap-2 text-xs"><Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => all(true)}>Tout déplier</Button><Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => all(false)}>Tout replier</Button><span className="text-muted-foreground">{tree.length} racine{tree.length > 1 ? "s" : ""} · rangées par « {parentColumn} »</span></div>
    <ul role="tree" aria-label="Arborescence" className="rounded-xl border bg-card/70 p-1.5">{tree.map((node) => <TreeNode key={node.row} node={node} isOpen={isOpen} toggle={toggle} {...props} />)}</ul>
  </div>
}

function TreeNode({ node, isOpen, toggle, layout, nameOf, valueOf, optionsOf, onOpen }: ViewLayoutProps & { node: RowTreeNode<string>; isOpen: (row: string) => boolean; toggle: (row: string) => void }) {
  const open = isOpen(node.row)
  const size = treeSize(node)
  const color = rowColor(layout, node.row, valueOf, optionsOf)
  const leaf = !node.children.length
  return <li role="treeitem" aria-expanded={leaf ? undefined : open} aria-selected={false} className="min-w-0">
    <div className="group flex min-w-0 items-center gap-1.5 rounded-lg py-1 pr-2 hover:bg-muted/60" style={{ paddingLeft: `${0.25 + node.depth * 1.25}rem` }}>
      {leaf ? <span className="grid size-6 shrink-0 place-items-center"><span className="size-1.5 rounded-full bg-muted-foreground/40" style={color ? { backgroundColor: color } : undefined} /></span>
        : <button type="button" onClick={() => toggle(node.row)} aria-label={open ? "Replier" : "Déplier"} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} /></button>}
      <RowImage src={rowImage(layout, node.row, valueOf)} size="size-6" />
      <button type="button" onClick={() => onOpen(node.row)} className={`min-w-0 truncate text-left text-sm hover:text-primary hover:underline ${node.depth === 0 ? "font-display text-base font-semibold" : leaf ? "" : "font-semibold"}`} style={color && !leaf ? { color } : undefined}>{nameOf(node.row) || "Sans nom"}</button>
      {!leaf && !layout.hideCounts && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{size}</span>}
      <span className="ml-auto hidden min-w-0 md:block"><FieldValues fields={(layout.fields ?? []).filter((field) => field !== layout.parentColumn)} rowKey={node.row} valueOf={valueOf} compact /></span>
    </div>
    {!leaf && open && <ul role="group" className="relative">
      <span aria-hidden className="absolute inset-y-0 w-px bg-border" style={{ left: `${0.25 + node.depth * 1.25 + 0.75}rem` }} />{node.children.map((child) => <TreeNode key={child.row} node={child} isOpen={isOpen} toggle={toggle} layout={layout} nameOf={nameOf} valueOf={valueOf} optionsOf={optionsOf} onOpen={onOpen} rows={[]} headers={[]} empty="" />)}</ul>}
  </li>
}

/* ---------- Codex ---------- */

function CodexLayout(props: ViewLayoutProps) {
  const { layout, rows, headers, nameOf, valueOf, optionsOf, onOpen } = props
  const fields = layout.detailFields?.length ? layout.detailFields : headers
  const anchor = (row: string) => `codex-${row.replace(/[^a-z0-9_-]/gi, "-")}`
  const article = (row: string) => {
    const color = rowColor(layout, row, valueOf, optionsOf)
    const src = rowImage(layout, row, valueOf)
    const entries = fields.filter((field) => field !== layout.imageColumn).map((field) => ({ field, value: plain(valueOf(row, field)) })).filter((entry) => entry.value && entry.value !== plain(nameOf(row)))
    // Les textes longs se lisent en paragraphes ; les valeurs courtes forment l'encadré.
    const prose = (entry: { field: string; value: string }) => entry.value.length > 80 || /descri|histoire|lore|note|texte|r[ée]sum|contenu|effet|r[eè]gle|biograph|apparence|personnalit/i.test(entry.field)
    const short = entries.filter((entry) => !prose(entry))
    const long = entries.filter(prose)
    return <article key={row} id={anchor(row)} className="scroll-mt-24 rounded-2xl border bg-card/80 p-5 shadow-sm" style={color ? { borderTop: `3px solid ${color}` } : undefined}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <h3 className="font-display text-2xl font-semibold leading-tight">{nameOf(row) || "Sans nom"}</h3>
        <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(row)}><ExternalLink />Ouvrir la fiche</Button>
      </header>
      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
        <div className="min-w-0 space-y-4 text-[15px] leading-7">
          {long.length ? long.map((entry) => <section key={entry.field}><h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{entry.field}</h4><p className="mt-1 whitespace-pre-line break-words">{entry.value}</p></section>) : <p className="text-sm italic text-muted-foreground">Pas encore de texte.</p>}
        </div>
        {(src || short.length > 0) && <aside className="grid content-start gap-3 rounded-xl border bg-muted/25 p-3 text-sm md:order-last">
          <CoverImage src={src} className="w-full rounded-lg border object-cover" />
          {short.length > 0 && <dl className="grid gap-2">{short.map((entry) => <div key={entry.field} className="grid gap-0.5"><dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{entry.field}</dt><dd className="break-words">{entry.value}</dd></div>)}</dl>}
        </aside>}
      </div>
    </article>
  }
  return <div className={layout.showToc ? "grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]" : ""}>
    {layout.showToc && <nav aria-label="Sommaire" className="lg:sticky lg:top-4 lg:max-h-[80vh] lg:self-start lg:overflow-y-auto">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><BookOpen className="size-3.5" />Sommaire</p>
      <ol className="grid gap-0.5 border-l pl-3 text-sm">{rows.map((row) => <li key={row}><a href={`#${anchor(row)}`} className="block truncate py-0.5 text-muted-foreground hover:text-primary">{nameOf(row) || "Sans nom"}</a></li>)}</ol>
    </nav>}
    <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => <div className="grid gap-5">{shown.map(article)}</div>} />} />
  </div>
}

/* ---------- Tableau de bord ---------- */

function DashboardLayout({ layout, rows, valueOf }: ViewLayoutProps) {
  const tiles = layout.tiles?.length ? layout.tiles : [{ kind: "count" as const }]
  const grid = layout.tileColumns === 1 ? "" : layout.tileColumns === 2 ? "sm:grid-cols-2" : layout.tileColumns === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3"
  return <div className={`grid gap-3 ${grid}`}>{tiles.map((tile, index) => {
    const result = dashboardTileValue(tile, rows, valueOf)
    const label = tile.label || `${dashboardTileKinds.find((kind) => kind.value === tile.kind)?.label ?? ""}${tile.column && tile.kind !== "count" ? ` · ${tile.column}` : ""}`
    const top = Math.max(1, ...result.breakdown.map((entry) => entry.count))
    return <article key={index} className={`rounded-xl border bg-card/80 p-4 ${tile.kind === "breakdown" ? "sm:col-span-2 xl:col-span-1" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {tile.kind === "breakdown"
        ? <ul className="mt-3 space-y-1.5">{result.breakdown.map((entry) => <li key={entry.name} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2.5rem] items-center gap-2 text-xs"><span className="truncate">{entry.name}</span><span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(entry.count / top) * 100}%` }} /></span><span className="text-right tabular-nums text-muted-foreground">{entry.count}</span></li>)}</ul>
        : <p className="font-display mt-2 text-4xl font-semibold tabular-nums">{Number.isInteger(result.number) ? result.number : result.number.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</p>}
    </article>
  })}</div>
}

/** La présentation d'un onglet-fenêtre (hors tableau et cartes, que la page dessine elle-même). */
export function IndexViewLayout(input: ViewLayoutProps) {
  const props = { ...input, rows: sortLayoutRows(input.rows, input.layout, input.valueOf) }
  if (!props.rows.length && props.layout.kind !== "dashboard") return <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">{props.empty}</div>
  switch (props.layout.kind) {
    case "list": return <ListLayout {...props} />
    case "kanban": return <KanbanLayout {...props} />
    case "master-detail": return <MasterDetailLayout {...props} />
    case "calendar": return <CalendarLayout {...props} />
    case "dashboard": return <DashboardLayout {...props} />
    case "gallery": return <GalleryLayout {...props} />
    case "timeline": return <TimelineLayout {...props} />
    case "tree": return <TreeLayout {...props} />
    case "codex": return <CodexLayout {...props} />
    default: return null
  }
}
