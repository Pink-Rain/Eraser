"use client"

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, ImageOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { loadWorldIndexData } from "@/components/eraser/index-cells"
import { calendarsFromTables, firstWeekdayOf, formatCalendarDate, monthLength, parseCalendarDate, realCalendar, REAL_CALENDAR, seasonOf, type CalendarDate, type CalendarDefinition } from "@/lib/calendars"
import { dashboardTileKinds, dashboardTileValue, groupRowsBy, rowTree, sortLayoutRows, timelineEntries, treeSize, type RowTreeNode, type ViewLayout, type ViewLook } from "@/lib/index-view-layouts"

/**
 * Les présentations d'un onglet-fenêtre autres que le tableau et les cartes : liste,
 * kanban, maître-détail, calendrier, tableau de bord, galerie, chronologie, arborescence,
 * codex. Elles lisent les lignes que la vue garde (conditions, recherche, tri) ; une
 * modification passe par la page (ses écritures et leurs vérifications). Leur apparence
 * (« Modifier › la vue › Apparence ») est dans `layout.look`.
 */
export type ViewLayoutProps = {
  layout: ViewLayout
  rows: string[]
  /** Les colonnes de l'onglet, sans l'identifiant. */
  headers: string[]
  nameOf: (rowKey: string) => string
  valueOf: (rowKey: string, header: string) => string
  /** Les choix d'une colonne liste (l'ordre des colonnes du kanban, la couleur des pastilles). */
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

const fold = (value: string) => value.toLocaleLowerCase("fr")

/** La couleur d'une ligne : celle du choix de la colonne « Couleur des lignes selon ». */
function rowColor(layout: ViewLayout, row: string, valueOf: ViewLayoutProps["valueOf"], optionsOf?: ViewLayoutProps["optionsOf"]) {
  if (!layout.colorBy) return undefined
  const value = fold(plain(valueOf(row, layout.colorBy)).split(/\s*[,;]\s*/)[0] ?? "")
  return value ? optionsOf?.(layout.colorBy)?.find((option) => fold(option.value) === value)?.color : undefined
}

/** L'image d'une ligne (première adresse trouvée dans la case choisie). */
function rowImage(layout: ViewLayout, row: string, valueOf: ViewLayoutProps["valueOf"]) {
  if (!layout.imageColumn) return ""
  return valueOf(row, layout.imageColumn).match(/(https:\/\/[^\s"'<>]+|\/api\/[^\s"'<>]+)/)?.[0] ?? ""
}

/** Une grande image (galerie, codex) qui laisse place au repli si elle ne se charge pas. */
function CoverImage({ src, className, fallback = null }: { src: string; className: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState("")
  // eslint-disable-next-line @next/next/no-img-element -- images des index (Drive ou app)
  return src && failed !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className={className} /> : <>{fallback}</>
}

/* ---------- L'apparence : les morceaux communs à toutes les vues ---------- */

const imageSizes = { sm: "size-6", md: "size-9", lg: "size-14" } as const
const imageShapes = { square: "rounded-none", rounded: "rounded-md", circle: "rounded-full" } as const
const titleSizes = { sm: "text-sm", md: "text-[15px]", lg: "text-lg" } as const
const paddings = { compact: "px-2.5 py-1.5", normal: "px-3 py-2.5", airy: "px-4 py-3.5" } as const
const gaps = { compact: "gap-1", normal: "gap-2", airy: "gap-3" } as const

function RowImage({ src, look, size }: { src: string; look: ViewLook; size?: keyof typeof imageSizes }) {
  const [failed, setFailed] = useState("")
  const sized = imageSizes[size ?? look.imageSize ?? "md"]
  // eslint-disable-next-line @next/next/no-img-element -- images des index (Drive ou app)
  return src && failed !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className={`${sized} ${imageShapes[look.imageShape ?? "rounded"]} shrink-0 border object-cover`} /> : null
}

/** Le cadre d'un élément selon « la couleur marque l'élément par… » (liseré par défaut). */
function accentFrame(look: ViewLook, color: string | undefined): { className: string; style?: CSSProperties } {
  if (!color) return { className: "" }
  switch (look.accent ?? "border") {
    case "border": return { className: "border-l-4", style: { borderLeftColor: color } }
    case "tint": return { className: "", style: { backgroundColor: `color-mix(in srgb, ${color} 11%, var(--card))`, borderColor: `color-mix(in srgb, ${color} 35%, var(--border))` } }
    default: return { className: "" }
  }
}

/** Le nom d'un élément : police, taille, couleur ou pastille selon l'apparence. */
function ItemTitle({ row, look, color, nameOf, onOpen, truncate = false, size }: { row: string; look: ViewLook; color?: string; nameOf: ViewLayoutProps["nameOf"]; onOpen: (row: string) => void; truncate?: boolean; size?: keyof typeof titleSizes }) {
  const accent = look.accent ?? "border"
  return <button type="button" onClick={() => onOpen(row)} className={`flex min-w-0 items-center gap-1.5 text-left font-semibold leading-tight hover:underline ${look.titleFont === "display" ? "font-display" : ""} ${titleSizes[size ?? look.titleSize ?? "sm"]} ${truncate ? "shrink-0" : ""}`} style={accent === "title" && color ? { color } : undefined}>
    {accent === "dot" && color && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
    <span className={truncate ? "truncate" : "min-w-0"}>{nameOf(row) || "Sans nom"}</span>
  </button>
}

/** Les colonnes montrées sous le nom : texte en ligne, libellés, pastilles colorées ou lignes empilées. */
function ItemFields({ fields, row, look, valueOf, optionsOf, compact = false, inverted = false }: { fields: string[]; row: string; look: ViewLook; valueOf: ViewLayoutProps["valueOf"]; optionsOf?: ViewLayoutProps["optionsOf"]; compact?: boolean; inverted?: boolean }) {
  const shown = fields.map((field) => ({ field, value: plain(valueOf(row, field)) })).filter((entry) => entry.value)
  if (!shown.length) return null
  const soft = inverted ? "opacity-80" : "text-muted-foreground"
  const style = compact && look.fieldStyle !== "pills" ? "inline" : look.fieldStyle ?? "inline"
  if (style === "pills") {
    const colorOf = (field: string, value: string) => optionsOf?.(field)?.find((option) => fold(option.value) === fold(value))?.color
    const pills = shown.flatMap((entry) => entry.value.split(/\s*[,;]\s*/).filter(Boolean).slice(0, 4).map((value) => ({ key: `${entry.field}:${value}`, value, color: colorOf(entry.field, value) })))
    return <span className={`flex min-w-0 gap-1 ${compact ? "overflow-hidden" : "flex-wrap"}`}>{pills.map((pill) => <span key={pill.key} className="inline-flex max-w-full shrink-0 items-center truncate rounded-full border px-2 py-px text-[11px] font-medium" style={pill.color ? { color: pill.color, borderColor: `color-mix(in srgb, ${pill.color} 45%, transparent)`, backgroundColor: `color-mix(in srgb, ${pill.color} 10%, transparent)` } : undefined}>{pill.value}</span>)}</span>
  }
  if (style === "labels") return <dl className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-3 gap-y-1">{shown.map((entry) => <div key={entry.field} className="min-w-0"><dt className={`truncate text-[10px] font-semibold uppercase tracking-[0.12em] ${soft}`}>{entry.field}</dt><dd className="truncate text-xs">{entry.value}</dd></div>)}</dl>
  if (style === "stacked") return <span className={`grid min-w-0 gap-0.5 text-xs ${soft}`}>{shown.map((entry) => <span key={entry.field} className="line-clamp-2 break-words">{entry.value}</span>)}</span>
  return <span className={`flex min-w-0 gap-x-3 gap-y-0.5 text-xs ${soft} ${compact ? "truncate" : "flex-wrap"}`}>{shown.map((entry) => <span key={entry.field} className={compact ? "truncate" : ""}><span className={`font-semibold ${inverted ? "" : "text-foreground/60"}`}>{entry.field} :</span> {entry.value}</span>)}</span>
}

/** Un élément complet (image, nom, colonnes), encadré ou non : liste, kanban, chronologie, repli des cartes. */
function Item({ row, props, fields, framed, extra, className = "" }: { row: string; props: ViewLayoutProps; fields?: string[]; framed: boolean; extra?: ReactNode; className?: string }) {
  const { layout, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const color = rowColor(layout, row, valueOf, optionsOf)
  const frame = accentFrame(look, color)
  const fieldList = fields ?? layout.fields ?? []
  return <article className={`min-w-0 ${framed ? "rounded-xl border bg-card shadow-sm" : ""} ${paddings[look.density ?? "normal"]} ${frame.className} ${className}`} style={frame.style}>
    <div className={`flex min-w-0 items-center ${look.density === "airy" ? "gap-3" : "gap-2"}`}>
      <RowImage src={rowImage(layout, row, valueOf)} look={look} />
      <div className={`grid min-w-0 flex-1 ${look.density === "compact" ? "gap-0.5" : "gap-1"}`}>
        <ItemTitle row={row} look={look} color={color} nameOf={nameOf} onOpen={onOpen} />
        <ItemFields fields={fieldList} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} />
      </div>
      {extra}
    </div>
  </article>
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
  return <div className="space-y-5">{groups.map((group) => <Section key={group.name || "*"} title={group.name} count={group.rows.length} collapsible={layout.collapsible} startCollapsed={layout.collapsed} hideCount={layout.hideCounts} color={options.find((option) => fold(option.value) === fold(group.name))?.color}>{render(group.rows)}</Section>)}</div>
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
  const look = layout.look ?? {}
  const fields = layout.fields ?? []
  const card = cardFor(props)
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set())
  const toggle = (row: string) => setOpenRows((current) => { const next = new Set(current); if (next.has(row)) next.delete(row); else next.add(row); return next })
  const others = headers.filter((header) => !fields.includes(header))
  const columnsClass = layout.listColumns === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : layout.listColumns === 2 ? "md:grid-cols-2" : ""
  if (card) {
    // Chaque élément est une carte : une, deux ou trois par rangée, sections comprises.
    return <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => <div className={`grid items-start ${layout.compact || look.density === "compact" ? "gap-1.5" : "gap-3"} ${columnsClass}`}>{shown.map((row) => <div key={row} className="min-w-0">{card(row) ?? <Item row={row} props={props} framed />}</div>)}</div>} />} />
  }
  const boxed = look.surface === "boxed"
  const element = (row: string) => {
    const expanded = openRows.has(row)
    const color = rowColor(layout, row, valueOf, optionsOf)
    const frame = accentFrame(look, color)
    const folding = layout.collapsible && !layout.compact
    return <li key={row} className={`min-w-0 ${paddings[layout.compact ? "compact" : look.density ?? "normal"]} ${boxed ? "rounded-xl border bg-card shadow-sm" : columnsClass ? "border-b" : ""} ${frame.className}`} style={frame.style}>
      <div className={`flex min-w-0 items-center ${look.density === "airy" ? "gap-3" : "gap-2"}`}>
        <RowImage src={rowImage(layout, row, valueOf)} look={look} size={layout.compact ? "sm" : undefined} />
        {folding && <button type="button" aria-expanded={expanded} aria-label={expanded ? "Replier" : "Déplier"} onClick={() => toggle(row)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"><ChevronDown className={`size-4 transition-transform ${expanded ? "" : "-rotate-90"}`} /></button>}
        {layout.compact
          ? <><ItemTitle row={row} look={look} color={color} nameOf={nameOf} onOpen={onOpen} truncate /><ItemFields fields={fields} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} compact /></>
          : <div className={`grid min-w-0 flex-1 ${look.density === "compact" ? "gap-0.5" : "gap-1"}`}><ItemTitle row={row} look={look} color={color} nameOf={nameOf} onOpen={onOpen} /><ItemFields fields={fields} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} /></div>}
      </div>
      {expanded && <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-lg bg-muted/30 p-2.5 pl-8 text-xs sm:grid-cols-2">{others.map((header) => { const value = plain(valueOf(row, header)); return value ? <div key={header} className="min-w-0"><dt className="font-semibold text-muted-foreground">{header}</dt><dd className="break-words">{value}</dd></div> : null })}</dl>}
    </li>
  }
  return <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => boxed
    ? <ul className={`grid ${gaps[look.density ?? "normal"]} ${columnsClass}`}>{shown.map(element)}</ul>
    : <ul className={`overflow-hidden rounded-xl border bg-card/70 ${columnsClass ? `grid gap-x-4 ${columnsClass}` : "divide-y"}`}>{shown.map(element)}</ul>} />} />
}

/* ---------- Kanban ---------- */

function KanbanLayout(props: ViewLayoutProps) {
  const { layout, rows, valueOf, optionsOf, onCommit } = props
  const look = layout.look ?? {}
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
  // Les colonnes : les choix de la liste dans leur ordre, puis les valeurs écrites, puis « Sans valeur ».
  const names = [...new Set([...options.map((option) => option.value), ...rows.map(firstValue).filter(Boolean)])]
  const lanes = [...names, ""].map((name) => ({ name, color: options.find((option) => option.value === name)?.color, rows: rows.filter((row) => fold(firstValue(row)) === fold(name)) }))
    .filter((lane) => !layout.hideEmpty || lane.rows.length)
  const width = layout.laneWidth === "narrow" ? "w-52" : layout.laneWidth === "wide" ? "w-80" : "w-64"
  const laneStyle = look.laneStyle ?? "plain"
  if (!column) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne du kanban dans les réglages de cette vue.</p>
  return <div className="flex gap-3 overflow-x-auto pb-2">
    {lanes.filter((lane) => lane.name || lane.rows.length).map((lane) => {
      const tint = lane.color ?? "var(--primary)"
      const laneLook: CSSProperties = laneStyle === "tinted" ? { backgroundColor: `color-mix(in srgb, ${tint} 9%, transparent)`, borderColor: `color-mix(in srgb, ${tint} 30%, var(--border))` } : {}
      return <section key={lane.name || "*"}
        onDragOver={(event) => { if (dragged && movable(dragged)) { event.preventDefault(); setOver(lane.name) } }}
        onDragLeave={() => setOver((current) => current === lane.name ? null : current)}
        onDrop={(event) => { event.preventDefault(); setOver(null); if (onCommit && dragged && movable(dragged) && fold(firstValue(dragged)) !== fold(lane.name)) onCommit(dragged, column, lane.name); setDragged("") }}
        style={laneLook}
        className={`flex ${width} shrink-0 flex-col ${gaps[look.density ?? "normal"]} overflow-hidden rounded-xl border ${laneStyle === "plain" ? "bg-muted/30" : ""} ${laneStyle === "header" ? "bg-muted/20 pb-2" : "p-2"} transition-colors ${over === lane.name ? "ring-2 ring-primary" : ""}`}>
        {laneStyle === "header"
          ? <p className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white" style={{ backgroundColor: lane.color ?? "var(--primary)" }}><span>{lane.name || "Sans valeur"}</span><span className="rounded-full bg-white/20 px-1.5 tabular-nums">{lane.rows.length}</span></p>
          : <p className="flex items-center justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><span className="flex items-center gap-1.5">{lane.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: lane.color }} />}{lane.name || "Sans valeur"}</span><span>{lane.rows.length}</span></p>}
        <div className={`grid ${gaps[look.density ?? "normal"]} ${laneStyle === "header" ? "px-2" : ""}`}>
          {lane.rows.map((row) => {
            const drawn = card?.(row)
            const drag = { draggable: movable(row), onDragStart: () => setDragged(row), onDragEnd: () => { setDragged(""); setOver(null) }, title: onCommit && !movable(row) ? "Plusieurs valeurs ou texte mis en forme : modifie la case dans la fiche" : undefined }
            const cursor = `${movable(row) ? "cursor-grab active:cursor-grabbing" : ""} ${dragged === row ? "opacity-50" : ""}`
            return <div key={row} {...drag} className={`min-w-0 ${cursor}`}>{drawn ?? <Item row={row} props={props} fields={(layout.fields ?? []).filter((field) => field !== column)} framed={look.surface !== "plain"} className={look.surface === "plain" ? "border-b border-border/70" : ""} />}</div>
          })}
        </div>
      </section>
    })}
  </div>
}

/* ---------- Maître-détail ---------- */

const masterWidths = { narrow: "md:grid-cols-[minmax(11rem,15rem)_minmax(0,1fr)]", normal: "md:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]", wide: "md:grid-cols-[minmax(18rem,28rem)_minmax(0,1fr)]" } as const

function MasterDetailLayout(props: ViewLayoutProps) {
  const { layout, rows, headers, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const card = cardFor(props)
  const [chosen, setChosen] = useState("")
  const selected = rows.includes(chosen) ? chosen : rows[0] ?? ""
  return <div className={`grid gap-4 ${masterWidths[look.masterWidth ?? "normal"]}`}>
    <div className="max-h-[70vh] overflow-y-auto rounded-xl border bg-card/70 p-1.5">
      <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <div className={look.surface === "plain" ? "divide-y" : "space-y-0.5"}>{group.map((row) => {
        const color = rowColor(layout, row, valueOf, optionsOf)
        const current = row === selected
        const frame = current ? { className: "" } : accentFrame(look, color)
        return <button key={row} type="button" aria-current={current} onClick={() => setChosen(row)} style={frame.style} className={`block w-full rounded-lg text-left ${paddings[look.density ?? "compact"]} ${frame.className} ${current ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
          <span className="flex min-w-0 items-center gap-2">
            <RowImage src={rowImage(layout, row, valueOf)} look={look} size={look.imageSize ?? "sm"} />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className={`flex min-w-0 items-center gap-1.5 font-semibold ${look.titleFont === "display" ? "font-display" : ""} ${titleSizes[look.titleSize ?? "sm"]}`}>{look.accent === "dot" && color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />}<span className="truncate">{nameOf(row) || "Sans nom"}</span></span>
              <ItemFields fields={layout.fields ?? []} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} compact={look.fieldStyle !== "stacked" && look.fieldStyle !== "labels"} inverted={current} />
            </span>
          </span>
        </button>
      })}</div>} />
    </div>
    {selected && card?.(selected) ? <div className="grid min-w-0 content-start gap-2">
      <div className="mx-auto w-full max-w-xl">{card(selected)}</div>
      <Button type="button" size="sm" variant="outline" className="justify-self-center" onClick={() => onOpen(selected)}><ExternalLink />Ouvrir la fiche</Button>
    </div> : <article className="min-w-0 rounded-xl border bg-card/80 p-4">
      {selected ? <>
        <div className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-center gap-3"><RowImage src={rowImage(layout, selected, valueOf)} look={look} size="lg" /><h3 className={`text-2xl font-semibold ${look.titleFont === "sans" ? "" : "font-display"}`} style={look.accent === "title" ? { color: rowColor(layout, selected, valueOf, optionsOf) } : undefined}>{nameOf(selected) || "Sans nom"}</h3></span><Button type="button" size="sm" variant="outline" onClick={() => onOpen(selected)}><ExternalLink />Ouvrir la fiche</Button></div>
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

/** Une entrée du calendrier : pastille, point de couleur ou barre. */
function CalendarEntry({ row, date, calendar, color, props }: { row: string; date: CalendarDate; calendar: CalendarDefinition; color?: string; props: ViewLayoutProps }) {
  const look = props.layout.look ?? {}
  const style = look.entryStyle ?? "pill"
  const tint = color ?? "var(--primary)"
  const common = "block w-full truncate text-left text-[11px] font-medium"
  const label = props.nameOf(row) || "Sans nom"
  const open = () => props.onOpen(row)
  const title = formatCalendarDate(date, calendar)
  if (style === "dot") return <button type="button" onClick={open} title={title} className={`${common} flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted`}><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} /><span className="truncate">{label}</span></button>
  if (style === "bar") return <button type="button" onClick={open} title={title} className={`${common} rounded-r border-l-[3px] bg-muted/60 px-1.5 py-0.5 hover:bg-muted`} style={{ borderLeftColor: tint }}>{label}</button>
  return <button type="button" onClick={open} title={title} className={`${common} rounded px-1.5 py-0.5 hover:brightness-95`} style={{ backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`, color: color ?? "var(--primary)" }}>{label}</button>
}

function CalendarLayout(props: ViewLayoutProps) {
  const { layout, rows, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const calendars = useCalendars()
  const calendar = (!layout.calendar || layout.calendar === REAL_CALENDAR ? realCalendar : calendars?.find((candidate) => fold(candidate.name) === fold(layout.calendar!))) ?? (calendars ? realCalendar : null)
  const dated = useMemo(() => !calendar || !layout.dateColumn ? [] : rows.flatMap((row) => { const date = parseCalendarDate(valueOf(row, layout.dateColumn!), calendar); return date ? [{ row, date }] : [] }), [calendar, layout.dateColumn, rows, valueOf])
  const today = new Date()
  const start = dated[0]?.date ?? (calendar === realCalendar ? { year: today.getFullYear(), month: today.getMonth(), day: 1 } : { year: 1, month: 0, day: 1 })
  const [shown, setShown] = useState<{ year: number; month: number } | null>(null)
  const current = shown ?? { year: start.year, month: start.month }
  if (!layout.dateColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne de la date dans les réglages de cette vue.</p>
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
  const sorted = [...dated].sort((left, right) => left.date.year - right.date.year || left.date.month - right.date.month || left.date.day - right.date.day)
  const monthOf = (date: CalendarDate) => `${date.year}:${date.month}`
  return <div className="space-y-3">
    {look.calendarMode === "agenda"
      // L'agenda : toutes les dates à la suite, rangées par mois.
      ? <div className="grid gap-4">{[...new Set(sorted.map((entry) => monthOf(entry.date)))].map((key) => {
        const entries = sorted.filter((entry) => monthOf(entry.date) === key)
        const first = entries[0].date
        return <section key={key} className="grid gap-1.5">
          <h3 className="font-display border-b pb-1 text-lg font-semibold">{calendar.months[first.month]?.name} {first.year}{calendar.era ? ` ${calendar.era}` : ""}</h3>
          <ol className={`grid ${gaps[look.density ?? "normal"]}`}>{entries.map(({ row, date }) => {
            const color = rowColor(layout, row, valueOf, optionsOf)
            return <li key={row} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-3">
              <span className="grid justify-items-center rounded-lg border bg-card py-1 leading-none" style={color ? { borderColor: color } : undefined}><span className="font-display text-xl font-semibold tabular-nums" style={color ? { color } : undefined}>{date.day}</span><span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{calendar.weekdays[(firstWeekdayOf(calendar, date.year, date.month) + date.day - 1) % week]?.slice(0, 3) ?? ""}</span></span>
              <Item row={row} props={props} fields={(layout.fields ?? []).filter((field) => field !== layout.dateColumn)} framed={look.surface !== "plain"} />
            </li>
          })}</ol>
        </section>
      })}{!sorted.length && <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Aucune date lisible pour l’instant.</p>}</div>
      : <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1"><Button type="button" size="icon-sm" variant="outline" aria-label="Mois précédent" onClick={() => move(-1)}><ChevronLeft /></Button><Button type="button" size="icon-sm" variant="outline" aria-label="Mois suivant" onClick={() => move(1)}><ChevronRight /></Button></div>
          <h3 className="font-display text-xl font-semibold">{calendar.months[current.month]?.name} {current.year}{calendar.era ? ` ${calendar.era}` : ""}</h3>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">{season && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" style={season.color ? { borderColor: season.color, color: season.color } : undefined}>{season.name}</span>}{calendar.name}</span>
        </div>
        <div className="overflow-x-auto"><div className="grid min-w-[36rem] gap-px overflow-hidden rounded-xl border bg-border" style={{ gridTemplateColumns: `repeat(${week}, minmax(0, 1fr))` }}>
          {Array.from({ length: week }, (_, index) => <div key={`head:${index}`} className="bg-muted/60 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{calendar.weekdays[index] ?? `Jour ${index + 1}`}</div>)}
          {cells.map((day, index) => {
            const entries = day ? dated.filter((entry) => entry.date.year === current.year && entry.date.month === current.month && entry.date.day === day) : []
            return <div key={index} className={`${look.density === "compact" ? "min-h-14" : look.density === "airy" ? "min-h-28" : "min-h-20"} p-1.5 ${day ? "bg-card" : "bg-muted/20"}`}>
              {day && <span className="text-[11px] font-semibold text-muted-foreground">{day}</span>}
              <div className="mt-0.5 space-y-0.5">{entries.map((entry) => <CalendarEntry key={entry.row} row={entry.row} date={entry.date} calendar={calendar} color={rowColor(layout, entry.row, valueOf, optionsOf)} props={props} />)}</div>
            </div>
          })}
        </div></div>
      </>}
    {undated > 0 && layout.showUndated && <ul className="flex flex-wrap gap-1.5">{rows.filter((row) => !dated.some((entry) => entry.row === row)).map((row) => <li key={row}><button type="button" onClick={() => onOpen(row)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted">{nameOf(row) || "Sans nom"}</button></li>)}</ul>}
    {undated > 0 && <p className="text-xs text-muted-foreground">{undated} ligne{undated > 1 ? "s" : ""} sans date lisible dans « {layout.dateColumn} » ({calendar === realCalendar ? "« 12 mars 1023 » ou « 1023-03-12 »" : `« 12 ${calendar.months[0]?.name ?? "Mois"} 1023 »`}).</p>}
  </div>
}

/* ---------- Galerie ---------- */

const galleryWidths = { sm: "8.5rem", md: "12rem", lg: "17rem" } as const
const galleryRatios = { square: "1 / 1", portrait: "4 / 5", landscape: "16 / 10" } as const
const galleryRadius = { square: "rounded-md", rounded: "rounded-xl", circle: "rounded-full" } as const

function GalleryLayout(props: ViewLayoutProps) {
  const { layout, rows, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const width = galleryWidths[layout.gallerySize ?? "md"]
  const circle = look.imageShape === "circle"
  const ratio = circle ? "1 / 1" : galleryRatios[layout.galleryShape ?? "portrait"]
  const radius = galleryRadius[look.imageShape ?? "rounded"]
  const hover = Boolean(layout.captionOnHover)
  const below = look.caption === "below" || circle
  if (!layout.imageColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne des images dans les réglages de cette vue.</p>
  return <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => <div className={`grid ${look.density === "compact" ? "gap-2" : look.density === "airy" ? "gap-5" : "gap-3"}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${width}), 1fr))` }}>
    {shown.map((row) => {
      const src = rowImage(layout, row, valueOf)
      const color = rowColor(layout, row, valueOf, optionsOf)
      const fields = layout.fields ?? []
      const picture = <span className={`relative block overflow-hidden border bg-muted/40 shadow-sm ${radius}`} style={{ aspectRatio: ratio, ...(color && look.accent !== "none" ? (circle ? { boxShadow: `0 0 0 3px ${color}` } : { boxShadow: `inset 0 -3px 0 ${color}` }) : {}) }}>
        <CoverImage src={src} className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" fallback={<span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-muted/30 to-muted text-muted-foreground/60"><ImageOff className="size-6" /></span>} />
        {!below && <span className={`absolute inset-x-0 bottom-0 grid gap-0.5 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2.5 pb-2 pt-8 text-white transition-opacity ${hover ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : ""}`}>
          <span className={`truncate font-semibold leading-tight ${look.titleFont === "sans" ? "" : "font-display"} ${titleSizes[look.titleSize ?? "sm"]}`}>{nameOf(row) || "Sans nom"}</span>
          <ItemFields fields={fields} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} compact inverted />
        </span>}
      </span>
      return <button key={row} type="button" onClick={() => onOpen(row)} title={nameOf(row)} className={`group grid min-w-0 content-start gap-1.5 text-left outline-offset-2 transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${below && circle ? "justify-items-center text-center" : ""}`}>
        {picture}
        {below && <span className={`grid min-w-0 gap-0.5 ${circle ? "justify-items-center" : ""}`}>
          <span className={`truncate font-semibold leading-tight ${look.titleFont === "sans" ? "" : "font-display"} ${titleSizes[look.titleSize ?? "sm"]}`} style={look.accent === "title" && color ? { color } : undefined}>{nameOf(row) || "Sans nom"}</span>
          <ItemFields fields={fields} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} compact={look.fieldStyle !== "stacked"} />
        </span>}
      </button>
    })}
  </div>} />} />
}

/* ---------- Chronologie ---------- */

function TimelineLayout(props: ViewLayoutProps) {
  const { layout, rows, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const card = cardFor(props)
  const calendars = useCalendars()
  const named = layout.calendar && layout.calendar !== REAL_CALENDAR ? calendars?.find((candidate) => fold(candidate.name) === fold(layout.calendar!)) : undefined
  const calendar = named ?? realCalendar
  const { dated, undated } = useMemo(() => !layout.dateColumn ? { dated: [], undated: rows } : timelineEntries(rows, (row) => valueOf(row, layout.dateColumn!), (text) => parseCalendarDate(text, calendar)), [calendar, layout.dateColumn, rows, valueOf])
  if (!layout.dateColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne de la date dans les réglages de cette vue.</p>
  const alternate = (layout.timelineSide ?? "alternate") === "alternate"
  // Les années servent de jalons : un repère chaque fois que l'année change ; les éléments alternent de côté.
  const placed = dated.map((entry, index) => ({ ...entry, milestone: index === 0 || dated[index - 1].date.year !== entry.date.year, right: !alternate || index % 2 === 0 }))
  return <div className="space-y-4">
    <ol className={`relative grid ${gaps[look.density ?? "normal"]} ${alternate ? "md:before:left-1/2" : ""} before:absolute before:inset-y-1 before:left-[0.6875rem] before:w-0.5 before:rounded-full before:bg-gradient-to-b before:from-primary/50 before:via-primary/25 before:to-primary/5 md:before:-translate-x-1/2`}>
      {placed.map(({ row, date, milestone, right }) => {
        const color = rowColor(layout, row, valueOf, optionsOf) ?? "var(--primary)"
        // Une année seule est déjà dite par le jalon : pas de date répétée au-dessus de l'élément.
        const when = date.yearOnly ? "" : formatCalendarDate(date, calendar)
        const body = card?.(row) ?? <Item row={row} props={props} fields={(layout.fields ?? []).filter((field) => field !== layout.dateColumn)} framed={look.surface !== "plain"} />
        return <li key={row} className="contents">
          {milestone && <div className={`relative z-[1] flex ${alternate ? "md:justify-center" : ""}`}><span className="font-display rounded-full border bg-background px-3 py-0.5 text-sm font-semibold shadow-sm">{date.year}{calendar.era ? ` ${calendar.era}` : ""}</span></div>}
          <div className={`relative grid pl-8 ${alternate ? `md:w-1/2 md:pl-0 ${right ? "md:ml-auto md:pl-8" : "md:pr-8"}` : ""}`}>
            <span aria-hidden className={`absolute top-3.5 left-[0.3125rem] size-3 rounded-full border-2 border-background shadow ${alternate ? (right ? "md:-left-1.5" : "md:left-auto md:-right-1.5") : ""}`} style={{ backgroundColor: color }} />
            {when && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>{when}</p>}
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
  if (!parentColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne du parent dans les réglages de cette vue (par exemple « Pays » pour des villes).</p>
  const isOpen = (row: string) => toggled.has(row) ? Boolean(layout.collapsed) : !layout.collapsed
  const toggle = (row: string) => setToggled((current) => { const next = new Set(current); if (next.has(row)) next.delete(row); else next.add(row); return next })
  const all = (open: boolean) => setToggled(open === !layout.collapsed ? new Set() : new Set(rows))
  const plainSurface = layout.look?.surface === "plain"
  return <div className="grid gap-2">
    <div className="flex flex-wrap items-center gap-2 text-xs"><Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => all(true)}>Tout déplier</Button><Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => all(false)}>Tout replier</Button><span className="text-muted-foreground">{tree.length} racine{tree.length > 1 ? "s" : ""} · rangées par « {parentColumn} »</span></div>
    <ul role="tree" aria-label="Arborescence" className={plainSurface ? "" : "rounded-xl border bg-card/70 p-1.5"}>{tree.map((node) => <TreeNode key={node.row} node={node} isOpen={isOpen} toggle={toggle} {...props} />)}</ul>
  </div>
}

function TreeNode({ node, isOpen, toggle, layout, nameOf, valueOf, optionsOf, onOpen }: ViewLayoutProps & { node: RowTreeNode<string>; isOpen: (row: string) => boolean; toggle: (row: string) => void }) {
  const look = layout.look ?? {}
  const open = isOpen(node.row)
  const size = treeSize(node)
  const color = rowColor(layout, node.row, valueOf, optionsOf)
  const leaf = !node.children.length
  const step = look.density === "airy" ? 1.6 : look.density === "compact" ? 1 : 1.25
  const titleLook: ViewLook = { ...look, titleSize: node.depth === 0 ? look.titleSize ?? "md" : "sm", titleFont: node.depth === 0 ? look.titleFont ?? "display" : look.titleFont, accent: look.accent === "border" || !look.accent ? (leaf ? "dot" : "title") : look.accent }
  const frame = look.accent === "tint" ? accentFrame(look, color) : { className: "" }
  return <li role="treeitem" aria-expanded={leaf ? undefined : open} aria-selected={false} className="min-w-0">
    <div className={`group flex min-w-0 items-center gap-1.5 rounded-lg pr-2 hover:bg-muted/60 ${look.density === "compact" ? "py-0.5" : look.density === "airy" ? "py-1.5" : "py-1"} ${frame.className}`} style={{ paddingLeft: `${0.25 + node.depth * step}rem`, ...frame.style }}>
      {leaf ? <span className="size-6 shrink-0" /> : <button type="button" onClick={() => toggle(node.row)} aria-label={open ? "Replier" : "Déplier"} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} /></button>}
      <RowImage src={rowImage(layout, node.row, valueOf)} look={look} size={look.imageSize ?? "sm"} />
      <ItemTitle row={node.row} look={titleLook} color={color} nameOf={nameOf} onOpen={onOpen} truncate />
      {!leaf && !layout.hideCounts && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{size}</span>}
      <span className="ml-auto hidden min-w-0 md:block"><ItemFields fields={(layout.fields ?? []).filter((field) => field !== layout.parentColumn)} row={node.row} look={look} valueOf={valueOf} optionsOf={optionsOf} compact /></span>
    </div>
    {!leaf && open && <ul role="group" className="relative">
      <span aria-hidden className="absolute inset-y-0 w-px bg-border" style={{ left: `${0.25 + node.depth * step + 0.75}rem` }} />
      {node.children.map((child) => <TreeNode key={child.row} node={child} isOpen={isOpen} toggle={toggle} layout={layout} nameOf={nameOf} valueOf={valueOf} optionsOf={optionsOf} onOpen={onOpen} rows={[]} headers={[]} empty="" />)}
    </ul>}
  </li>
}

/* ---------- Codex ---------- */

const codexTitles = { sm: "text-xl", md: "text-2xl", lg: "text-3xl" } as const

function CodexLayout(props: ViewLayoutProps) {
  const { layout, rows, headers, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
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
    const banner = look.codexImage === "banner" && src
    const frame = look.accent === "tint" ? accentFrame(look, color) : { className: "", style: color && look.accent !== "none" ? { borderTop: `3px solid ${color}` } : undefined }
    return <article key={row} id={anchor(row)} className={`scroll-mt-24 overflow-hidden rounded-2xl border bg-card/80 shadow-sm ${frame.className}`} style={frame.style}>
      {banner && <CoverImage src={src} className="aspect-[21/8] w-full border-b object-cover" />}
      <div className={look.density === "compact" ? "p-4" : look.density === "airy" ? "p-7" : "p-5"}>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
          <h3 className={`${look.titleFont === "sans" ? "" : "font-display"} ${codexTitles[look.titleSize ?? "md"]} font-semibold leading-tight`} style={look.accent === "title" && color ? { color } : undefined}>{nameOf(row) || "Sans nom"}</h3>
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(row)}><ExternalLink />Ouvrir la fiche</Button>
        </header>
        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
          <div className="min-w-0 space-y-4 text-[15px] leading-7">
            {long.length ? long.map((entry, index) => <section key={entry.field}><h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{entry.field}</h4><p className={`mt-1 whitespace-pre-line break-words ${look.dropCap && index === 0 ? "first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:[font-family:var(--font-serif)] first-letter:text-5xl first-letter:font-semibold first-letter:leading-[0.8] first-letter:text-[color:var(--dropcap)]" : ""}`} style={look.dropCap && index === 0 ? { ["--dropcap" as string]: color ?? "var(--primary)" } : undefined}>{entry.value}</p></section>) : <p className="text-sm italic text-muted-foreground">Pas encore de texte.</p>}
          </div>
          {((src && !banner) || short.length > 0) && <aside className="grid content-start gap-3 rounded-xl border bg-muted/25 p-3 text-sm md:order-last">
            {!banner && <CoverImage src={src} className={`w-full border object-cover ${look.imageShape === "circle" ? "aspect-square rounded-full" : look.imageShape === "square" ? "rounded-none" : "rounded-lg"}`} />}
            {short.length > 0 && (look.fieldStyle === "pills"
              ? <ItemFields fields={short.map((entry) => entry.field)} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} />
              : <dl className="grid gap-2">{short.map((entry) => <div key={entry.field} className="grid gap-0.5"><dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{entry.field}</dt><dd className="break-words">{entry.value}</dd></div>)}</dl>)}
          </aside>}
        </div>
      </div>
    </article>
  }
  return <div className={layout.showToc ? "grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]" : ""}>
    {layout.showToc && <nav aria-label="Sommaire" className="lg:sticky lg:top-4 lg:max-h-[80vh] lg:self-start lg:overflow-y-auto">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><BookOpen className="size-3.5" />Sommaire</p>
      <ol className="grid gap-0.5 border-l pl-3 text-sm">{rows.map((row) => <li key={row}><a href={`#${anchor(row)}`} className="block truncate py-0.5 text-muted-foreground hover:text-primary">{nameOf(row) || "Sans nom"}</a></li>)}</ol>
    </nav>}
    <Sections layout={layout} rows={rows} valueOf={valueOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => <div className={`grid ${look.density === "compact" ? "gap-3" : "gap-5"}`}>{shown.map(article)}</div>} />} />
  </div>
}

/* ---------- Tableau de bord ---------- */

function DashboardLayout({ layout, rows, valueOf }: ViewLayoutProps) {
  const look = layout.look ?? {}
  const tiles = layout.tiles?.length ? layout.tiles : [{ kind: "count" as const }]
  const grid = layout.tileColumns === 1 ? "" : layout.tileColumns === 2 ? "sm:grid-cols-2" : layout.tileColumns === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3"
  const tileStyle = look.tileStyle ?? "plain"
  return <div className={`grid ${look.density === "compact" ? "gap-2" : look.density === "airy" ? "gap-4" : "gap-3"} ${grid}`}>{tiles.map((tile, index) => {
    const result = dashboardTileValue(tile, rows, valueOf)
    const label = tile.label || `${dashboardTileKinds.find((kind) => kind.value === tile.kind)?.label ?? ""}${tile.column && tile.kind !== "count" ? ` · ${tile.column}` : ""}`
    const top = Math.max(1, ...result.breakdown.map((entry) => entry.count))
    const color = tile.color ?? "var(--primary)"
    const style: CSSProperties = tileStyle === "tinted" ? { backgroundColor: `color-mix(in srgb, ${color} 10%, var(--card))`, borderColor: `color-mix(in srgb, ${color} 35%, var(--border))` } : tileStyle === "accent" ? { borderTop: `4px solid ${color}` } : {}
    return <article key={index} style={style} className={`rounded-xl border bg-card/80 ${look.density === "compact" ? "p-3" : look.density === "airy" ? "p-6" : "p-4"} ${tile.wide ? "sm:col-span-2" : tile.kind === "breakdown" ? "sm:col-span-2 xl:col-span-1" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {tile.kind === "breakdown"
        ? <ul className="mt-3 space-y-1.5">{result.breakdown.map((entry) => <li key={entry.name} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2.5rem] items-center gap-2 text-xs"><span className="truncate">{entry.name}</span><span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${(entry.count / top) * 100}%`, backgroundColor: color }} /></span><span className="text-right tabular-nums text-muted-foreground">{entry.count}</span></li>)}</ul>
        : <p className={`mt-2 font-semibold tabular-nums ${look.titleFont === "sans" ? "" : "font-display"} ${look.titleSize === "sm" ? "text-3xl" : look.titleSize === "lg" ? "text-5xl" : "text-4xl"}`} style={tileStyle !== "plain" || tile.color ? { color } : undefined}>{Number.isInteger(result.number) ? result.number : result.number.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</p>}
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
