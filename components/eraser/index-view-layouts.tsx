"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { loadWorldIndexData } from "@/components/eraser/index-cells"
import { calendarsFromTables, firstWeekdayOf, formatCalendarDate, monthLength, parseCalendarDate, realCalendar, REAL_CALENDAR, seasonOf, type CalendarDefinition } from "@/lib/calendars"
import { dashboardTileKinds, dashboardTileValue, groupRowsBy, sortLayoutRows, type ViewLayout } from "@/lib/index-view-layouts"

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
  empty: string
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
  // eslint-disable-next-line @next/next/no-img-element -- images des index (Drive ou app)
  return src ? <img src={src} alt="" className={`${size} shrink-0 rounded-md border object-cover`} /> : null
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

/* ---------- Liste ---------- */

function ListLayout({ layout, rows, headers, nameOf, valueOf, optionsOf, onOpen }: ViewLayoutProps) {
  const fields = layout.fields ?? []
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set())
  const toggle = (row: string) => setOpenRows((current) => { const next = new Set(current); if (next.has(row)) next.delete(row); else next.add(row); return next })
  const others = headers.filter((header) => !fields.includes(header))
  const grid = layout.listColumns === 3 ? "grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3" : layout.listColumns === 2 ? "grid gap-x-4 md:grid-cols-2" : ""
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

function KanbanLayout({ layout, rows, nameOf, valueOf, optionsOf, onOpen, onCommit }: ViewLayoutProps) {
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
  if (!column) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne du kanban dans « Modifier › Vues ».</p>
  return <div className="flex gap-3 overflow-x-auto pb-2">
    {lanes.filter((lane) => lane.name || lane.rows.length).map((lane) => <section key={lane.name || "*"}
      onDragOver={(event) => { if (dragged && movable(dragged)) { event.preventDefault(); setOver(lane.name) } }}
      onDragLeave={() => setOver((current) => current === lane.name ? null : current)}
      onDrop={(event) => { event.preventDefault(); setOver(null); if (onCommit && dragged && movable(dragged) && !same(firstValue(dragged), lane.name)) onCommit(dragged, column, lane.name); setDragged("") }}
      className={`flex ${width} shrink-0 flex-col gap-2 rounded-xl border bg-muted/30 p-2 transition-colors ${over === lane.name ? "border-primary bg-primary/5" : ""}`}>
      <p className="flex items-center justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><span className="flex items-center gap-1.5">{lane.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: lane.color }} />}{lane.name || "Sans valeur"}</span><span>{lane.rows.length}</span></p>
      {lane.rows.map((row) => { const color = rowColor(layout, row, valueOf, optionsOf); return <article key={row} style={color ? { borderLeftColor: color } : undefined} draggable={movable(row)} onDragStart={() => setDragged(row)} onDragEnd={() => { setDragged(""); setOver(null) }} title={onCommit && !movable(row) ? "Plusieurs valeurs ou texte mis en forme : modifie la case dans la fiche" : undefined} className={`rounded-lg border bg-card p-2.5 shadow-sm ${color ? "border-l-4" : ""} ${movable(row) ? "cursor-grab active:cursor-grabbing" : ""} ${dragged === row ? "opacity-50" : ""}`}>
        <span className="flex min-w-0 items-center gap-2"><RowImage src={rowImage(layout, row, valueOf)} /><button type="button" onClick={() => onOpen(row)} className="min-w-0 text-left text-sm font-semibold hover:text-primary hover:underline">{nameOf(row) || "Sans nom"}</button></span>
        <FieldValues fields={(layout.fields ?? []).filter((field) => field !== column)} rowKey={row} valueOf={valueOf} />
      </article> })}
    </section>)}
  </div>
}

/* ---------- Maître-détail ---------- */

function MasterDetailLayout({ layout, rows, headers, nameOf, valueOf, optionsOf, onOpen }: ViewLayoutProps) {
  const [chosen, setChosen] = useState("")
  const selected = rows.includes(chosen) ? chosen : rows[0] ?? ""
  return <div className="grid gap-4 md:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
    <div className="max-h-[70vh] overflow-y-auto rounded-xl border bg-card/70 p-1.5">
      <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <div className="space-y-0.5">{group.map((row) => { const color = rowColor(layout, row, valueOf, optionsOf); return <button key={row} type="button" aria-current={row === selected} onClick={() => setChosen(row)} style={color ? { borderLeftColor: color } : undefined} className={`block w-full rounded-lg px-2.5 py-1.5 text-left ${color ? "border-l-4" : ""} ${row === selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
        <span className="flex min-w-0 items-center gap-2"><RowImage src={rowImage(layout, row, valueOf)} size="size-6" /><span className="block truncate text-sm font-semibold">{nameOf(row) || "Sans nom"}</span></span>
        {(layout.fields ?? []).length > 0 && <span className={`block truncate text-[11px] ${row === selected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{(layout.fields ?? []).map((field) => plain(valueOf(row, field))).filter(Boolean).join(" · ")}</span>}
      </button> })}</div>} />
    </div>
    <article className="min-w-0 rounded-xl border bg-card/80 p-4">
      {selected ? <>
        <div className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-center gap-3"><RowImage src={rowImage(layout, selected, valueOf)} size="size-14" /><h3 className="font-display text-2xl font-semibold">{nameOf(selected) || "Sans nom"}</h3></span><Button type="button" size="sm" variant="outline" onClick={() => onOpen(selected)}><ExternalLink />Ouvrir la fiche</Button></div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">{(layout.detailFields?.length ? layout.detailFields : headers).map((header) => { const value = plain(valueOf(selected, header)); return value ? <div key={header} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{header}</dt><dd className="mt-0.5 whitespace-pre-line break-words text-sm">{value}</dd></div> : null })}</dl>
      </> : <p className="py-10 text-center text-sm text-muted-foreground">Aucune ligne.</p>}
    </article>
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
  if (!layout.dateColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne de la date dans « Modifier › Vues ».</p>
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
    default: return null
  }
}
