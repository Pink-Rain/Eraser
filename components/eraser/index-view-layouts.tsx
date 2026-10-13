"use client"

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, ImageOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { loadWorldIndexData } from "@/components/eraser/index-cells"
import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { addDays, addMonths, calendarsFromTables, compareCalendarDates, dateFromDayNumber, dayNumber, firstWeekdayOf, formatCalendarDate, monthLength, parseCalendarDate, realCalendar, REAL_CALENDAR, seasonOf, weekdayOf, weekStartOf, yearLength, type CalendarDate, type CalendarDefinition } from "@/lib/calendars"
import { parseGlyphValue } from "@/lib/index-columns"
import { cellNumber } from "@/lib/index-stats"
import { calendarScaleOf, calendarScales, dashboardTileKinds, dashboardTileValue, DEFAULT_ITEM_CARD, depthPalette, formatViewNumber, groupFormulaValue, groupRowsBy, linkedTiles, rowTree, sortLayoutRows, textWithFormulas, tileGaugeValue, timelineEntries, treeSize, viewLayoutKinds, viewPalette, type CalendarScale, type DashboardTile, type KanbanLane, type RowTreeNode, type TabPresentations, type ViewLayout, type ViewLook } from "@/lib/index-view-layouts"

/**
 * Les présentations d'un onglet-fenêtre autres que le tableau et les cartes : liste,
 * kanban, maître-détail, calendrier, tableau de bord, galerie, chronologie, arborescence,
 * codex. Elles lisent les lignes que la vue garde (conditions, recherche, tri) ; une
 * modification passe par la page (ses écritures et leurs vérifications). Chaque vue a ses
 * propres réglages (Modifier › la vue) : ce qu'elle montre, son dessin, ses couleurs et ses
 * icônes ; l'apparence commune est dans `layout.look`.
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
  /** Une ligne dessinée avec un formulaire de l'onglet en lecture (`formId` : « principal » ou un formulaire nommé) ; `null` si la page ne sait pas. */
  renderForm?: (rowKey: string, formId: string) => ReactNode
  /** Ouvrir la page de la ligne (« Au clic : ouvrir la page ») ; absent : la fiche. */
  onOpenPage?: (rowKey: string) => void
  /** Tableau de bord : les autres vues de l'onglet (tuile « vue ») ; une statistique de l'index dessinée (tuile « stat »). */
  presentations?: TabPresentations
  renderStat?: (statId: string) => ReactNode
  empty: ReactNode
  /** Réglé par la vue elle-même d'après « Au clic » : ouvrir la fiche, la ligne choisie (à côté, dessous), rien. */
  openSheet?: (rowKey: string) => void
  chosen?: string
  onChoose?: (rowKey: string) => void
  inert?: boolean
}

/**
 * L'élément d'une ligne si la vue en demande un : un formulaire en lecture, ou une carte de
 * « Modifier › Cartes » (si la page sait les dessiner). Le clic y suit « Au clic » de la vue.
 */
function cardFor(props: Pick<ViewLayoutProps, "layout" | "renderCard" | "renderForm" | "onOpen" | "inert">) {
  const { itemCard, itemForm, click } = props.layout
  const draw = itemForm && props.renderForm ? (row: string) => props.renderForm!(row, itemForm) : itemCard && props.renderCard ? (row: string) => props.renderCard!(row, itemCard) : null
  if (!draw) return null
  // Une carte ouvre la fiche d'elle-même : seulement quand « Au clic » dit autre chose, la vue reprend le clic.
  const intercept = Boolean(itemForm) || (click ?? "sheet") !== "sheet"
  // eslint-disable-next-line react/display-name -- un rendu par ligne, pas un composant
  return (row: string) => {
    const node = draw(row)
    if (!node || !intercept) return node
    return <div onClickCapture={(event) => { event.stopPropagation(); event.preventDefault(); if (!props.inert) props.onOpen(row) }} className={props.inert ? "" : "cursor-pointer"}>{node}</div>
  }
}

/** La jauge d'une ligne (« Jauge sous chaque élément ») : une colonne nombre en barre ou en charges, sur son maximum. */
function RowGauge({ layout, row, valueOf, color, inverted = false }: { layout: ViewLayout; row: string; valueOf: ViewLayoutProps["valueOf"]; color?: string; inverted?: boolean }) {
  const gauge = layout.gauge
  if (!gauge) return null
  const value = cellNumber(plain(valueOf(row, gauge.column)))
  if (value === null) return null
  const max = gauge.maxColumn ? cellNumber(plain(valueOf(row, gauge.maxColumn))) : gauge.max ?? null
  const tint = inverted ? "#fff" : color ?? accentOf(layout.look ?? {})
  const label = gauge.label ?? gauge.column
  const shown = max ? `${formatViewNumber(value)} / ${formatViewNumber(max)}` : formatViewNumber(value)
  if (gauge.style === "charges") {
    const total = Math.max(1, Math.min(20, Math.round(max ?? value)))
    const filled = Math.max(0, Math.min(total, Math.round(value)))
    return <span className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] ${inverted ? "opacity-90" : "text-muted-foreground"}`} title={`${label} : ${shown}`}>
      <span className="font-semibold uppercase tracking-[0.08em]">{label}</span>
      <span className="flex flex-wrap gap-0.5">{Array.from({ length: total }, (_, at) => <span key={at} aria-hidden className="size-2.5 rounded-full border" style={{ borderColor: tint, backgroundColor: at < filled ? tint : "transparent" }} />)}</span>
      <span className="tabular-nums">{shown}</span>
    </span>
  }
  const ratio = Math.max(0, Math.min(1, max ? value / max : value / 100))
  return <span className={`grid min-w-0 gap-0.5 text-[10px] ${inverted ? "opacity-90" : "text-muted-foreground"}`} title={`${label} : ${shown}`}>
    <span className="flex justify-between gap-2"><span className="truncate font-semibold uppercase tracking-[0.08em]">{label}</span><span className="tabular-nums">{shown}</span></span>
    <span className="block h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: inverted ? "rgb(255 255 255 / .3)" : `color-mix(in srgb, ${tint} 18%, var(--muted))` }}><span className="block h-full rounded-full" style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: tint }} /></span>
  </span>
}

/** La formule d'un groupe (en-tête de section, de colonne du kanban) : son nombre, contre sa cible en barre si elle en a une. */
function GroupFormulaBadge({ layout, rows, valueOf, color, inverted = false }: { layout: ViewLayout; rows: string[]; valueOf: ViewLayoutProps["valueOf"]; color?: string; inverted?: boolean }) {
  const formula = layout.groupFormula
  if (!formula) return null
  const value = groupFormulaValue(formula, rows, valueOf)
  const tint = inverted ? "#fff" : color ?? accentOf(layout.look ?? {})
  const text = `${formula.label ? `${formula.label} ` : ""}${formatViewNumber(value)}${formula.target ? ` / ${formatViewNumber(formula.target)}` : ""}`
  const over = formula.target !== undefined && value > formula.target
  if (formula.style === "bar" && formula.target) return <span className="flex min-w-24 items-center gap-1.5 text-[10px] font-semibold normal-case tracking-normal" title={text}>
    <span className="block h-1.5 w-16 overflow-hidden rounded-full" style={{ backgroundColor: inverted ? "rgb(255 255 255 / .3)" : `color-mix(in srgb, ${tint} 18%, var(--muted))` }}><span className="block h-full rounded-full" style={{ width: `${Math.round(Math.min(1, value / formula.target) * 100)}%`, backgroundColor: over ? "var(--destructive)" : tint }} /></span>
    <span className={`tabular-nums ${over && !inverted ? "text-destructive" : ""}`}>{text}</span>
  </span>
  return <span className={`rounded-full px-1.5 text-[10px] font-semibold normal-case tracking-normal tabular-nums ${inverted ? "bg-white/20" : over ? "bg-destructive/15 text-destructive" : "bg-muted"}`} title={formula.column ? `${formula.op} · ${formula.column}` : undefined}>{text}</span>
}

function plain(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

const fold = (value: string) => value.toLocaleLowerCase("fr")

/** La couleur d'accent de la vue (Modifier › la vue › Couleurs), sinon l'or d'Eraser. */
const accentOf = (look: ViewLook) => look.color ?? "var(--primary)"

/**
 * La couleur d'une ligne : celle du choix de la colonne « Couleur des lignes selon » ; sinon
 * la couleur d'accent réglée pour la vue, qui marque alors chaque élément de la même façon
 * (liseré, teinte, point, nom coloré). Sans l'une ni l'autre : rien.
 */
function rowColor(layout: ViewLayout, row: string, valueOf: ViewLayoutProps["valueOf"], optionsOf?: ViewLayoutProps["optionsOf"]) {
  const fallback = layout.look?.color
  if (!layout.colorBy) return fallback
  const value = fold(plain(valueOf(row, layout.colorBy)).split(/\s*[,;]\s*/)[0] ?? "")
  return (value ? optionsOf?.(layout.colorBy)?.find((option) => fold(option.value) === value)?.color : undefined) ?? fallback
}

/** L'image d'une ligne (première adresse trouvée dans la case choisie). */
function rowImage(layout: ViewLayout, row: string, valueOf: ViewLayoutProps["valueOf"]) {
  if (!layout.imageColumn) return ""
  const raw = valueOf(row, layout.imageColumn)
  const address = raw.match(/(https:\/\/[^\s"'<>]+|\/api\/[^\s"'<>]+)/)?.[0]
  if (address) return address
  // Pas une adresse : un nom d'icône ou un émoji, que RowImage dessine en icône.
  const value = plain(raw).split(/[,;\n]/)[0]?.trim() ?? ""
  return value && (parseGlyphValue(value).emoji || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) ? value : ""
}

/** L'icône d'une ligne : celle écrite dans la colonne icône, sinon l'icône fixe de la vue. */
function rowGlyph(layout: ViewLayout, row: string, valueOf: ViewLayoutProps["valueOf"], fallback = layout.itemIcon) {
  const written = layout.iconColumn ? plain(valueOf(row, layout.iconColumn)) : ""
  const value = written || fallback || ""
  return value ? parseGlyphValue(value) : null
}

/** L'icône devant un nom (colonne icône ou icône fixe), à la couleur voulue. */
function RowIcon({ layout, row, valueOf, color, className = "size-4", fallback }: { layout: ViewLayout; row: string; valueOf: ViewLayoutProps["valueOf"]; color?: string; className?: string; fallback?: string }) {
  const glyph = rowGlyph(layout, row, valueOf, fallback ?? layout.itemIcon)
  if (!glyph) return null
  return <span className="inline-flex shrink-0" style={color ? { color } : undefined}><IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className={className} /></span>
}

/** Une icône fixe (sections, jalons, colonnes du kanban). */
function Glyph({ value, className = "size-3.5", color }: { value: string | undefined; className?: string; color?: string }) {
  if (!value) return null
  const glyph = parseGlyphValue(value)
  return <span className="inline-flex shrink-0" style={color ? { color } : undefined}><IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className={className} /></span>
}

/** La pastille à droite du nom (« Pastille à droite du nom, prise dans »), à la couleur du choix. */
function RowBadge({ layout, row, valueOf, optionsOf, inverted = false }: { layout: ViewLayout; row: string; valueOf: ViewLayoutProps["valueOf"]; optionsOf?: ViewLayoutProps["optionsOf"]; inverted?: boolean }) {
  if (!layout.badgeColumn) return null
  const value = plain(valueOf(row, layout.badgeColumn)).split(/\s*[,;]\s*/)[0] ?? ""
  if (!value) return null
  const color = optionsOf?.(layout.badgeColumn)?.find((option) => fold(option.value) === fold(value))?.color
  return <span className={`inline-flex max-w-32 shrink-0 items-center truncate rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-[0.08em] ${inverted ? "border-white/40 text-white" : ""}`} style={color && !inverted ? { color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` } : undefined}>{value}</span>
}

/** Une grande image (galerie, codex) qui laisse place au repli si elle ne se charge pas. */
function CoverImage({ src, className, style, fallback = null }: { src: string; className: string; style?: CSSProperties; fallback?: ReactNode }) {
  const [failed, setFailed] = useState("")
  // eslint-disable-next-line @next/next/no-img-element -- images des index (Drive ou app)
  return src && failed !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className={className} style={style} /> : <>{fallback}</>
}

/* ---------- L'apparence : les morceaux communs à toutes les vues ---------- */

const imageSizes = { sm: "size-6", md: "size-9", lg: "size-14" } as const
const imageShapes = { square: "rounded-none", rounded: "rounded-md", circle: "rounded-full" } as const
const titleSizes = { sm: "text-sm", md: "text-[15px]", lg: "text-lg" } as const
const paddings = { compact: "px-2.5 py-1.5", normal: "px-3 py-2.5", airy: "px-4 py-3.5" } as const
const gaps = { compact: "gap-1", normal: "gap-2", airy: "gap-3" } as const
const radii = { sm: "rounded-lg", md: "rounded-xl", lg: "rounded-2xl" } as const

/** Le cadre d'un élément encadré : ses coins, son ombre. */
const boxClass = (look: ViewLook) => `${radii[look.radius ?? "md"]} ${look.shadow ? "shadow-md" : "shadow-sm"}`

/** L'image à côté du nom : une adresse donne une image, un nom d'icône ou un émoji donne une icône ; taille en pixels si réglée. */
function RowImage({ src, look, size }: { src: string; look: ViewLook; size?: keyof typeof imageSizes }) {
  const [failed, setFailed] = useState("")
  const sized = look.imageWidth || look.imageHeight ? "" : imageSizes[size ?? look.imageSize ?? "md"]
  const style: CSSProperties | undefined = look.imageWidth || look.imageHeight ? { width: look.imageWidth ?? look.imageHeight, height: look.imageHeight ?? look.imageWidth } : undefined
  if (!src) return null
  if (!/^(https?:\/\/|\/)/.test(src)) {
    const glyph = parseGlyphValue(src)
    if (!glyph.icon && !glyph.emoji) return null
    return <span className={`${sized} ${imageShapes[look.imageShape ?? "rounded"]} grid shrink-0 place-items-center ${look.imageBare ? "" : "border bg-muted/40"}`} style={style}><IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className="size-[60%]" /></span>
  }
  // eslint-disable-next-line @next/next/no-img-element -- images des index (Drive ou app)
  return failed !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className={`${sized} ${imageShapes[look.imageShape ?? "rounded"]} shrink-0 ${look.imageBare ? "object-contain" : "border object-cover"}`} style={style} /> : null
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

/** Le nom d'un élément : police, taille, capitales, icône, couleur ou pastille selon l'apparence. */
function ItemTitle({ row, look, color, nameOf, onOpen, truncate = false, size, icon, badge, inert = false }: { row: string; look: ViewLook; color?: string; nameOf: ViewLayoutProps["nameOf"]; onOpen: (row: string) => void; truncate?: boolean; size?: keyof typeof titleSizes; icon?: ReactNode; badge?: ReactNode; /** « Au clic : rien » : le nom n'est pas un bouton. */ inert?: boolean }) {
  const accent = look.accent ?? "border"
  const inner = <>
    {accent === "dot" && color && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
    {icon}
    <span className={truncate ? "truncate" : "min-w-0"}>{nameOf(row) || "Sans nom"}</span>
  </>
  const classes = `flex min-w-0 items-center gap-1.5 text-left font-semibold leading-tight ${inert ? "" : "hover:underline"} ${look.titleFont === "display" ? "font-display" : ""} ${titleSizes[size ?? look.titleSize ?? "sm"]} ${look.titleCaps ? "uppercase tracking-[0.12em]" : ""}`
  return <span className={`flex min-w-0 items-center gap-1.5 ${truncate ? "shrink-0" : ""}`}>
    {inert ? <span className={classes} style={accent === "title" && color ? { color } : undefined}>{inner}</span> : <button type="button" onClick={() => onOpen(row)} className={classes} style={accent === "title" && color ? { color } : undefined}>{inner}</button>}
    {badge}
  </span>
}

/** Les colonnes montrées sous le nom : texte en ligne, libellés, pastilles colorées ou lignes empilées. */
function ItemFields({ fields, row, look, valueOf, optionsOf, compact = false, inverted = false }: { fields: string[]; row: string; look: ViewLook; valueOf: ViewLayoutProps["valueOf"]; optionsOf?: ViewLayoutProps["optionsOf"]; compact?: boolean; inverted?: boolean }) {
  const shown = fields.map((field) => ({ field, value: plain(valueOf(row, field)) })).filter((entry) => entry.value)
  if (!shown.length) return null
  const soft = inverted ? "opacity-80" : "text-muted-foreground"
  const labelStyle: CSSProperties | undefined = look.fieldColor === "accent" && !inverted ? { color: accentOf(look) } : undefined
  const style = compact && look.fieldStyle !== "pills" ? "inline" : look.fieldStyle ?? "inline"
  if (style === "pills") {
    const colorOf = (field: string, value: string) => optionsOf?.(field)?.find((option) => fold(option.value) === fold(value))?.color
    const pills = shown.flatMap((entry) => entry.value.split(/\s*[,;]\s*/).filter(Boolean).slice(0, 4).map((value) => ({ key: `${entry.field}:${value}`, value, color: colorOf(entry.field, value) ?? (look.fieldColor === "accent" ? accentOf(look) : undefined) })))
    return <span className={`flex min-w-0 gap-1 ${compact ? "overflow-hidden" : "flex-wrap"}`}>{pills.map((pill) => <span key={pill.key} className="inline-flex max-w-full shrink-0 items-center truncate rounded-full border px-2 py-px text-[11px] font-medium" style={pill.color ? { color: pill.color, borderColor: `color-mix(in srgb, ${pill.color} 45%, transparent)`, backgroundColor: `color-mix(in srgb, ${pill.color} 10%, transparent)` } : undefined}>{pill.value}</span>)}</span>
  }
  if (style === "labels") return <dl className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-3 gap-y-1">{shown.map((entry) => <div key={entry.field} className="min-w-0"><dt className={`truncate text-[10px] font-semibold uppercase tracking-[0.12em] ${soft}`} style={labelStyle}>{entry.field}</dt><dd className="truncate text-xs">{entry.value}</dd></div>)}</dl>
  if (style === "stacked") return <span className={`grid min-w-0 gap-0.5 text-xs ${soft}`}>{shown.map((entry) => <span key={entry.field} className="line-clamp-2 break-words">{entry.value}</span>)}</span>
  return <span className={`flex min-w-0 gap-x-3 gap-y-0.5 text-xs ${soft} ${compact ? "truncate" : "flex-wrap"}`}>{shown.map((entry) => <span key={entry.field} className={compact ? "truncate" : ""}><span className={`font-semibold ${inverted ? "" : "text-foreground/60"}`} style={labelStyle}>{entry.field} :</span> {entry.value}</span>)}</span>
}

/** Un élément complet (icône, image, nom, pastille, colonnes), encadré ou non : liste, kanban, chronologie, repli des cartes. */
function Item({ row, props, fields, framed, extra, className = "", lead }: { row: string; props: ViewLayoutProps; fields?: string[]; framed: boolean; extra?: ReactNode; className?: string; lead?: ReactNode }) {
  const { layout, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const color = rowColor(layout, row, valueOf, optionsOf)
  const frame = accentFrame(look, color)
  const fieldList = fields ?? layout.fields ?? []
  return <article className={`min-w-0 ${framed ? `border bg-card ${boxClass(look)}` : ""} ${paddings[look.density ?? "normal"]} ${frame.className} ${className}`} style={frame.style}>
    <div className={`flex min-w-0 items-center ${look.density === "airy" ? "gap-3" : "gap-2"}`}>
      {lead}
      <RowImage src={rowImage(layout, row, valueOf)} look={look} />
      <div className={`grid min-w-0 flex-1 ${look.density === "compact" ? "gap-0.5" : "gap-1"}`}>
        <ItemTitle row={row} look={look} color={color} nameOf={nameOf} onOpen={onOpen} inert={props.inert} icon={<RowIcon layout={layout} row={row} valueOf={valueOf} color={color} />} badge={<RowBadge layout={layout} row={row} valueOf={valueOf} optionsOf={optionsOf} />} />
        <ItemFields fields={fieldList} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} />
        <RowGauge layout={layout} row={row} valueOf={valueOf} color={color} />
      </div>
      {extra}
    </div>
  </article>
}

/** L'ancre d'une section dans la page (le menu des sections y descend). */
const sectionAnchor = (title: string) => `section-${(title || "sans-valeur").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9#]+/g, "-")}`

function Section({ title, count, collapsible, startCollapsed, color, hideCount, heading, letter, icon, accent, extra, children }: { title: string; count: number; collapsible?: boolean; startCollapsed?: boolean; color?: string; hideCount?: boolean; heading?: boolean; letter?: boolean; icon?: string; accent?: string; /** La formule du groupe, à côté du nombre. */ extra?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(!startCollapsed)
  const glyph = <Glyph value={icon} className={heading ? "size-6" : "size-3.5"} color={color ?? accent} />
  const anchor = sectionAnchor(title)
  // La lettre (ou le nom) en marge, grande et qui reste visible en défilant : le glossaire.
  if (letter) return <section id={anchor} className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(5rem,8rem)_minmax(0,1fr)]">
    <div className="sm:sticky sm:top-20 sm:self-start">
      {collapsible
        ? <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 font-display text-6xl font-semibold leading-none hover:text-primary sm:text-[7.5rem]" style={{ color: color ?? accent }}>{title || "—"}</button>
        : <h2 className="font-display text-6xl font-semibold leading-none sm:text-[7.5rem]" style={{ color: color ?? accent }}>{glyph}{title || "—"}</h2>}
      {(!hideCount || extra) && <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{!hideCount && count}{extra}</p>}
    </div>
    {open && <div className="min-w-0">{children}</div>}
  </section>
  // Un grand titre centré, au-dessus d'un trait (les familles de la page des classes).
  if (heading) return <section id={anchor} className="space-y-5">
    {collapsible
      ? <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-center gap-2 border-b pb-3 text-center font-display text-3xl font-semibold hover:text-primary sm:text-4xl"><ChevronDown className={`size-5 transition-transform ${open ? "" : "-rotate-90"}`} />{glyph}{title || "Sans valeur"}{!hideCount && <span className="text-base font-normal text-muted-foreground">{count}</span>}{extra && <span className="text-sm font-normal">{extra}</span>}</button>
      : <h2 className="flex items-center justify-center gap-2 border-b pb-3 text-center font-display text-3xl font-semibold sm:text-4xl">{color && !icon && <span className="size-3 rounded-full" style={{ backgroundColor: color }} />}{glyph}{title || "Sans valeur"}{!hideCount && <span className="text-base font-normal text-muted-foreground">{count}</span>}{extra && <span className="text-sm font-normal">{extra}</span>}</h2>}
    {open && children}
  </section>
  const label = <><span className="flex items-center gap-2">{color && !icon && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}{glyph}{title || "Sans valeur"}</span><span className="flex items-center gap-2">{extra}{!hideCount && <span className="text-muted-foreground">{count}</span>}</span></>
  const tone: CSSProperties = { color: accent ?? "var(--primary)" }
  return <section id={anchor} className="space-y-2">
    {collapsible
      ? <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 border-b pb-1.5 text-left text-xs font-semibold uppercase tracking-[0.14em] opacity-80 hover:opacity-100" style={tone}><ChevronDown className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} /><span className="flex flex-1 items-center justify-between gap-2">{label}</span></button>
      : <p className="flex items-center justify-between gap-2 border-b pb-1.5 text-xs font-semibold uppercase tracking-[0.14em] opacity-80" style={tone}>{label}</p>}
    {open && children}
  </section>
}

/** Les lignes rangées en sections si la présentation le demande (une colonne, ou la première lettre du nom). */
/** Le menu relié aux sections : leurs lettres ou leurs noms, en haut ou sur le côté ; un clic descend à la section. */
function SectionMenu({ names, accent, side }: { names: string[]; accent?: string; side?: boolean }) {
  if (!names.length) return null
  return <nav aria-label="Sections" className={side ? "flex flex-wrap gap-1 lg:sticky lg:top-20 lg:flex-col lg:self-start" : "flex flex-wrap gap-1"}>
    {names.map((name) => <a key={name || "*"} href={`#${sectionAnchor(name)}`} className={`rounded-full border bg-card px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-muted ${side ? "lg:rounded-md lg:border-0 lg:bg-transparent lg:px-2 lg:py-1 lg:text-sm lg:font-medium" : ""}`} style={{ color: accent }}>{name || "Sans valeur"}</a>)}
  </nav>
}

/** Les sections en onglets (« Menu des sections : onglets ») : une section à la fois, son nombre et sa formule dans l'onglet. */
function SectionTabs({ groups, layout, valueOf, accent, render }: { groups: Array<{ name: string; rows: string[]; color?: string }>; layout: ViewLayout; valueOf: ViewLayoutProps["valueOf"]; accent?: string; render: (rows: string[]) => ReactNode }) {
  const [active, setActive] = useState(groups[0]?.name ?? "")
  const current = groups.find((group) => group.name === active) ?? groups[0]
  return <div className="grid gap-4">
    <div role="tablist" className="flex flex-wrap gap-0 border-b">
      {groups.map((group) => <button key={group.name || "*"} type="button" role="tab" aria-selected={group === current} onClick={() => setActive(group.name)} className={`-mb-px inline-flex h-8 items-center gap-1.5 border-b-2 px-3 text-xs font-semibold uppercase tracking-[0.12em] transition ${group === current ? "border-current" : "border-transparent text-muted-foreground hover:text-foreground"}`} style={group === current ? { color: group.color ?? accent ?? "var(--primary)" } : undefined}>
        {group.color && <span className="size-2 rounded-full" style={{ backgroundColor: group.color }} />}{group.name || "Sans valeur"}{!layout.hideCounts && <span className="font-normal normal-case tracking-normal text-muted-foreground">{group.rows.length}</span>}<GroupFormulaBadge layout={layout} rows={group.rows} valueOf={valueOf} color={group.color} />
      </button>)}
    </div>
    {current && render(current.rows)}
  </div>
}

function Sections({ layout, rows, valueOf, nameOf, optionsOf, render }: { layout: ViewLayout; rows: string[]; valueOf: ViewLayoutProps["valueOf"]; nameOf?: ViewLayoutProps["nameOf"]; optionsOf?: ViewLayoutProps["optionsOf"]; render: (rows: string[]) => ReactNode }) {
  const look = layout.look ?? {}
  const heading = look.sectionStyle === "heading"
  const letter = look.sectionStyle === "letter"
  const spacing = heading ? "space-y-14" : letter ? "space-y-10" : "space-y-5"
  // Le menu des sections (lettres ou noms) : au-dessus des sections, ou à leur gauche sur un grand écran.
  const withMenu = (names: string[], body: ReactNode) => !layout.menu || layout.menu === "tabs" ? body
    : layout.menu === "side" ? <div className="grid gap-5 lg:grid-cols-[9rem_minmax(0,1fr)]"><SectionMenu names={names} accent={look.color} side />{body}</div>
      : <div className="grid gap-5"><SectionMenu names={names} accent={look.color} />{body}</div>
  const formula = (group: string[], color?: string) => layout.groupFormula ? <GroupFormulaBadge layout={layout} rows={group} valueOf={valueOf} color={color} /> : undefined
  let groups: Array<{ name: string; rows: string[]; color?: string }>
  if (!layout.groupBy && layout.alphabet && nameOf) {
    // L'annuaire : une section par première lettre (les accents pliés, les chiffres et symboles sous « # »).
    const first = (row: string) => { const initial = plain(nameOf(row)).normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toLocaleUpperCase("fr"); return /[A-Z]/.test(initial) ? initial : "#" }
    groups = [...new Set(rows.map(first))].sort((left, right) => left === "#" ? 1 : right === "#" ? -1 : left.localeCompare(right, "fr")).map((name) => ({ name, rows: rows.filter((row) => first(row) === name) }))
  } else if (layout.groupBy) {
    const options = optionsOf?.(layout.groupBy) ?? []
    groups = groupRowsBy(rows, (row) => valueOf(row, layout.groupBy!), options.map((option) => option.value)).filter((group) => group.name || !layout.hideEmpty).map((group) => ({ ...group, color: options.find((option) => fold(option.value) === fold(group.name))?.color }))
  } else return <>{render(rows)}</>
  if (layout.menu === "tabs") return <SectionTabs groups={groups} layout={layout} valueOf={valueOf} accent={look.color} render={render} />
  return withMenu(groups.map((group) => group.name), <div className={spacing}>{groups.map((group) => <Section key={group.name || "*"} title={group.name} count={group.rows.length} collapsible={layout.collapsible} startCollapsed={layout.collapsed} hideCount={layout.hideCounts} heading={heading} letter={letter} icon={look.sectionIcon} accent={look.color} color={group.color} extra={formula(group.rows, group.color)}>{render(group.rows)}</Section>)}</div>)
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

// Plusieurs colonnes seulement sur un écran assez large : une à deux sur téléphone.
const listColumnClasses: Record<number, string> = { 1: "", 2: "md:grid-cols-2", 3: "sm:grid-cols-2 xl:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", 5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" }

function ListLayout(props: ViewLayoutProps) {
  const { layout, rows, headers, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const fields = layout.fields ?? []
  const card = cardFor(props)
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set())
  const toggle = (row: string) => setOpenRows((current) => { const next = new Set(current); if (next.has(row)) next.delete(row); else next.add(row); return next })
  const others = headers.filter((header) => !fields.includes(header))
  const columnsClass = listColumnClasses[layout.listColumns ?? 1]
  const number = (index: number) => layout.numbered ? <span className="w-6 shrink-0 text-right font-display text-sm font-semibold tabular-nums" style={{ color: accentOf(look) }}>{index + 1}.</span> : null
  if (card) {
    // Chaque élément est une carte : une, deux ou trois par rangée, sections comprises.
    return <Sections layout={layout} rows={rows} valueOf={valueOf} nameOf={nameOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => <div className={`grid items-start ${layout.compact || look.density === "compact" ? "gap-1.5" : "gap-3"} ${columnsClass}`}>{shown.map((row, index) => <div key={row} className="flex min-w-0 items-start gap-1.5">{number(index)}<div className="min-w-0 flex-1">{card(row) ?? <Item row={row} props={props} framed />}{layout.click === "below" && props.chosen === row && <div className="mt-2"><DetailPanel row={row} rows={rows} props={props} inline /></div>}</div></div>)}</div>} />} />
  }
  const boxed = look.surface === "boxed"
  const zebra = look.surface === "zebra"
  const element = (row: string, index: number) => {
    const expanded = openRows.has(row)
    const color = rowColor(layout, row, valueOf, optionsOf)
    const frame = accentFrame(look, color)
    const folding = layout.collapsible && !layout.compact && !layout.groupBy && !layout.alphabet
    // Zigzag : l'image change de côté une ligne sur deux.
    const flipped = Boolean(look.zigzag) && index % 2 === 1
    const chosenBelow = layout.click === "below" && props.chosen === row
    return <li key={row} className={`min-w-0 ${paddings[layout.compact ? "compact" : look.density ?? "normal"]} ${boxed ? `border bg-card ${boxClass(look)}` : columnsClass ? "border-b" : ""} ${zebra && index % 2 === 1 ? "bg-muted/35" : ""} ${chosenBelow ? "ring-1 ring-primary/40" : ""} ${frame.className}`} style={frame.style}>
      <div className={`flex min-w-0 items-center ${look.density === "airy" ? "gap-3" : "gap-2"} ${flipped ? "flex-row-reverse text-right" : ""}`}>
        {number(index)}
        <RowImage src={rowImage(layout, row, valueOf)} look={look} size={layout.compact ? "sm" : undefined} />
        {folding && <button type="button" aria-expanded={expanded} aria-label={expanded ? "Replier" : "Déplier"} onClick={() => toggle(row)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"><ChevronDown className={`size-4 transition-transform ${expanded ? "" : "-rotate-90"}`} /></button>}
        {layout.compact
          ? <><ItemTitle row={row} look={look} color={color} nameOf={nameOf} onOpen={onOpen} inert={props.inert} truncate icon={<RowIcon layout={layout} row={row} valueOf={valueOf} color={color} />} badge={<RowBadge layout={layout} row={row} valueOf={valueOf} optionsOf={optionsOf} />} /><ItemFields fields={fields} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} compact /><RowGauge layout={layout} row={row} valueOf={valueOf} color={color} /></>
          : <div className={`grid min-w-0 flex-1 ${look.density === "compact" ? "gap-0.5" : "gap-1"} ${flipped ? "justify-items-end" : ""}`}><ItemTitle row={row} look={look} color={color} nameOf={nameOf} onOpen={onOpen} inert={props.inert} icon={<RowIcon layout={layout} row={row} valueOf={valueOf} color={color} />} badge={<RowBadge layout={layout} row={row} valueOf={valueOf} optionsOf={optionsOf} />} /><ItemFields fields={fields} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} /><RowGauge layout={layout} row={row} valueOf={valueOf} color={color} /></div>}
      </div>
      {expanded && <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-lg bg-muted/30 p-2.5 pl-8 text-xs sm:grid-cols-2">{others.map((header) => { const value = plain(valueOf(row, header)); return value ? <div key={header} className="min-w-0"><dt className="font-semibold text-muted-foreground">{header}</dt><dd className="break-words">{value}</dd></div> : null })}</dl>}
      {chosenBelow && <div className="mt-2"><DetailPanel row={row} rows={rows} props={props} inline /></div>}
    </li>
  }
  return <Sections layout={layout} rows={rows} valueOf={valueOf} nameOf={nameOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => boxed
    ? <ul className={`grid ${gaps[look.density ?? "normal"]} ${columnsClass}`}>{shown.map(element)}</ul>
    : <ul className={`overflow-hidden border bg-card/70 ${radii[look.radius ?? "md"]} ${look.shadow ? "shadow-md" : ""} ${columnsClass ? `grid gap-x-4 ${columnsClass}` : zebra ? "" : "divide-y"}`}>{shown.map(element)}</ul>} />} />
}

/* ---------- Kanban ---------- */

function KanbanLayout(props: ViewLayoutProps) {
  const { layout, rows, valueOf, optionsOf, onCommit } = props
  const look = layout.look ?? {}
  const card = cardFor(props)
  const column = layout.kanbanColumn ?? ""
  const [dragged, setDragged] = useState("")
  const [over, setOver] = useState<string | null>(null)
  const [folded, setFolded] = useState<Set<string>>(() => new Set())
  const options = column ? optionsOf?.(column) ?? [] : []
  const settings = (name: string): KanbanLane | undefined => layout.lanes?.find((lane) => fold(lane.value) === fold(name))
  const firstValue = (row: string) => plain(valueOf(row, column)).split(/\s*[,;]\s*/)[0] ?? ""
  // Glisser réécrit toute la case : seulement si elle tient une seule valeur, sans mise en forme
  // (« Commun, Elfique » ou un texte en gras ne perdent jamais une partie de leur contenu).
  const movable = (row: string) => {
    const raw = valueOf(row, column).trim()
    return Boolean(onCommit) && plain(raw) === raw && !/[,;\n]/.test(raw)
  }
  // Les colonnes : les choix de la liste dans leur ordre, puis les valeurs écrites, puis « Sans valeur ».
  const names = [...new Set([...options.map((option) => option.value), ...(layout.lanes ?? []).map((lane) => lane.value), ...rows.map(firstValue).filter(Boolean)])]
  const lanes = [...names, ""].map((name) => {
    const own = settings(name)
    return { name, label: own?.label || name, color: own?.color ?? options.find((option) => option.value === name)?.color, icon: own?.icon ?? look.sectionIcon, limit: own?.limit, hidden: Boolean(own?.hidden), rows: rows.filter((row) => fold(firstValue(row)) === fold(name)) }
  }).filter((lane) => !lane.hidden && (!layout.hideEmpty || lane.rows.length))
  const width = layout.laneWidth === "narrow" ? "w-52" : layout.laneWidth === "wide" ? "w-80" : "w-64"
  const laneStyle = look.laneStyle ?? "plain"
  const accent = accentOf(look)
  if (!column) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne du kanban dans les réglages de cette vue.</p>
  return <div className="flex gap-3 overflow-x-auto pb-2">
    {lanes.filter((lane) => lane.name || lane.rows.length).map((lane) => {
      const tint = lane.color ?? accent
      const closed = layout.laneCollapse && folded.has(lane.name)
      const laneLook: CSSProperties = laneStyle === "tinted" ? { backgroundColor: `color-mix(in srgb, ${tint} 9%, transparent)`, borderColor: `color-mix(in srgb, ${tint} 30%, var(--border))` } : {}
      const full = lane.limit !== undefined && lane.rows.length > lane.limit
      const count = <span className="flex items-center gap-1">{layout.groupFormula && <GroupFormulaBadge layout={layout} rows={lane.rows} valueOf={valueOf} color={lane.color} inverted={laneStyle === "header"} />}{!layout.hideCounts && <span className={`rounded-full px-1.5 tabular-nums ${laneStyle === "header" ? "bg-white/20" : full ? "bg-destructive/15 text-destructive" : ""}`}>{lane.rows.length}{lane.limit !== undefined ? ` / ${lane.limit}` : ""}</span>}</span>
      const toggle = () => { if (layout.laneCollapse) setFolded((current) => { const next = new Set(current); if (next.has(lane.name)) next.delete(lane.name); else next.add(lane.name); return next }) }
      const head = laneStyle === "header"
        ? <p className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white" style={{ backgroundColor: tint }}><span className="flex items-center gap-1.5"><Glyph value={lane.icon} />{lane.label || "Sans valeur"}</span>{count}</p>
        : <p className="flex items-center justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><span className="flex items-center gap-1.5">{lane.color && !lane.icon && <span className="size-2.5 rounded-full" style={{ backgroundColor: lane.color }} />}<Glyph value={lane.icon} color={tint} />{lane.label || "Sans valeur"}</span>{count}</p>
      return <section key={lane.name || "*"}
        onDragOver={(event) => { if (dragged && movable(dragged)) { event.preventDefault(); setOver(lane.name) } }}
        onDragLeave={() => setOver((current) => current === lane.name ? null : current)}
        onDrop={(event) => { event.preventDefault(); setOver(null); if (onCommit && dragged && movable(dragged) && fold(firstValue(dragged)) !== fold(lane.name)) onCommit(dragged, column, lane.name); setDragged("") }}
        style={laneLook}
        className={`flex ${closed ? "w-12" : width} shrink-0 flex-col ${gaps[look.density ?? "normal"]} overflow-hidden ${radii[look.radius ?? "md"]} border ${laneStyle === "plain" ? "bg-muted/30" : ""} ${laneStyle === "header" ? "bg-muted/20 pb-2" : "p-2"} transition-[width,colors] ${over === lane.name ? "ring-2 ring-primary" : ""}`}>
        {layout.laneCollapse
          ? <button type="button" onClick={toggle} aria-expanded={!closed} className={`text-left ${closed ? "[writing-mode:vertical-rl] rotate-180 px-1 py-2" : ""}`} title={closed ? "Déplier la colonne" : "Replier la colonne"}>{closed ? <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{lane.label || "Sans valeur"} · {lane.rows.length}</span> : head}</button>
          : head}
        {!closed && <div className={`grid ${gaps[look.density ?? "normal"]} ${laneStyle === "header" ? "px-2" : ""}`}>
          {lane.rows.map((row) => {
            const drawn = card?.(row)
            const drag = { draggable: movable(row), onDragStart: () => setDragged(row), onDragEnd: () => { setDragged(""); setOver(null) }, title: onCommit && !movable(row) ? "Plusieurs valeurs ou texte mis en forme : modifie la case dans la fiche" : undefined }
            const cursor = `${movable(row) ? "cursor-grab active:cursor-grabbing" : ""} ${dragged === row ? "opacity-50" : ""}`
            return <div key={row} {...drag} className={`min-w-0 ${cursor}`}>{drawn ?? <Item row={row} props={props} fields={(layout.fields ?? []).filter((field) => field !== column)} framed={look.surface !== "plain"} className={look.surface === "plain" ? "border-b border-border/70" : ""} />}{layout.click === "below" && props.chosen === row && <div className="mt-1.5"><DetailPanel row={row} rows={rows} props={props} inline /></div>}</div>
          })}
        </div>}
      </section>
    })}
  </div>
}

/* ---------- Maître-détail ---------- */

const masterWidths = { narrow: "md:grid-cols-[minmax(11rem,15rem)_minmax(0,1fr)]", normal: "md:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]", wide: "md:grid-cols-[minmax(18rem,28rem)_minmax(0,1fr)]" } as const
const masterWidthsRight = { narrow: "md:grid-cols-[minmax(0,1fr)_minmax(11rem,15rem)]", normal: "md:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]", wide: "md:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)]" } as const
const detailGrids = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" } as const

/** Les colonnes d'une ligne (« le détail montre les colonnes ») : nom, image, pastille, puis les colonnes choisies. */
function DetailFields({ row, props }: { row: string; props: ViewLayoutProps }) {
  const { layout, headers, nameOf, valueOf, optionsOf } = props
  const look = layout.look ?? {}
  const src = rowImage(layout, row, valueOf)
  const detailImage = layout.detailImage ?? "side"
  const color = rowColor(layout, row, valueOf, optionsOf)
  return <>
    {detailImage === "banner" && src && <CoverImage src={src} className="aspect-[21/8] w-full border-b object-cover" />}
    <div className={look.density === "compact" ? "p-3" : look.density === "airy" ? "p-6" : "p-4"}>
      <span className="flex min-w-0 items-center gap-3">{detailImage === "side" && <RowImage src={src} look={look} size="lg" />}<h3 className={`flex items-center gap-2 text-2xl font-semibold ${look.titleFont === "sans" ? "" : "font-display"} ${look.titleCaps ? "uppercase tracking-[0.12em]" : ""}`} style={look.accent === "title" ? { color } : undefined}><RowIcon layout={layout} row={row} valueOf={valueOf} color={color} className="size-6" />{nameOf(row) || "Sans nom"}<RowBadge layout={layout} row={row} valueOf={valueOf} optionsOf={optionsOf} /></h3></span>
      <RowGauge layout={layout} row={row} valueOf={valueOf} color={color} />
      <dl className={`mt-4 grid gap-x-6 gap-y-3 ${detailGrids[layout.detailColumns ?? 2]}`}>{(layout.detailFields?.length ? layout.detailFields : headers).filter((header) => header !== layout.imageColumn || detailImage === "none").map((header) => { const value = plain(valueOf(row, header)); return value ? <div key={header} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground" style={look.fieldColor === "accent" ? { color: accentOf(look) } : undefined}>{header}</dt><dd className="mt-0.5 whitespace-pre-line break-words text-sm">{value}</dd></div> : null })}</dl>
    </div>
  </>
}

/**
 * Le panneau de détail d'une ligne : ce que « Le détail montre » demande (les colonnes, un
 * formulaire en lecture, une carte), « Ouvrir la fiche », et précédent / suivant si la vue le
 * veut. Il sert au maître-détail, à « afficher à côté » et à « afficher dessous » (en place).
 */
function DetailPanel({ row, rows, props, inline = false }: { row: string; rows: string[]; props: ViewLayoutProps; inline?: boolean }) {
  const { layout, renderCard, renderForm, onChoose } = props
  const look = layout.look ?? {}
  const detail = layout.detail ?? {}
  const kind = detail.kind ?? (layout.kind === "master-detail" && layout.itemCard && !layout.itemForm ? "card" : "fields")
  const color = rowColor(layout, row, props.valueOf, props.optionsOf)
  const open = props.openSheet ?? props.onOpen
  const at = rows.indexOf(row)
  const nav = detail.nav && onChoose && rows.length > 1 ? <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
    <Button type="button" size="sm" variant="ghost" className="h-7" disabled={at <= 0} onClick={() => onChoose(rows[at - 1])}><ChevronLeft />Précédent</Button>
    <span className="tabular-nums">{at + 1} / {rows.length}</span>
    <Button type="button" size="sm" variant="ghost" className="h-7" disabled={at < 0 || at >= rows.length - 1} onClick={() => onChoose(rows[at + 1])}>Suivant<ChevronRight /></Button>
  </div> : null
  const drawn = kind === "form" && renderForm ? renderForm(row, detail.form || "principal") : kind === "card" && renderCard ? renderCard(row, detail.card || layout.itemCard || "*") : null
  const body = drawn
    ? <div className={inline ? "p-2" : look.density === "compact" ? "p-3" : "p-4"}>{kind === "card" ? <div className="mx-auto w-full max-w-xl">{drawn}</div> : drawn}</div>
    : <DetailFields row={row} props={props} />
  const footer = !props.inert && open ? <div className={`flex justify-end gap-2 border-t px-3 py-2`}><Button type="button" size="sm" variant="outline" onClick={() => open(row)}><ExternalLink />Ouvrir la fiche</Button></div> : null
  return <article className={`min-w-0 overflow-hidden border bg-card/80 ${boxClass(look)}`} style={color && look.accent === "tint" ? { backgroundColor: `color-mix(in srgb, ${color} 8%, var(--card))` } : color && (look.accent ?? "border") === "border" ? { borderTop: `4px solid ${color}` } : undefined}>
    {nav}
    {body}
    {footer}
  </article>
}

const detailWidths = { narrow: "md:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)]", normal: "md:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]", wide: "md:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)]" } as const

function MasterDetailLayout(props: ViewLayoutProps) {
  const { layout, rows, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const [chosen, setChosen] = useState("")
  const selected = rows.includes(chosen) ? chosen : rows[0] ?? ""
  const right = layout.masterSide === "right"
  const columns = right ? masterWidthsRight[look.masterWidth ?? "normal"] : masterWidths[look.masterWidth ?? "normal"]
  return <div className={`grid gap-4 ${columns}`}>
    <div className={`max-h-[70vh] overflow-y-auto border bg-card/70 p-1.5 ${radii[look.radius ?? "md"]} ${right ? "md:order-2" : ""}`}>
      <Sections layout={layout} rows={rows} valueOf={valueOf} nameOf={nameOf} optionsOf={optionsOf} render={(group) => <div className={look.surface === "plain" ? "divide-y" : "space-y-0.5"}>{group.map((row) => {
        const rowTint = rowColor(layout, row, valueOf, optionsOf)
        const current = row === selected
        const frame = current ? { className: "" } : accentFrame(look, rowTint)
        return <button key={row} type="button" aria-current={current} onClick={() => setChosen(row)} style={current ? { backgroundColor: accentOf(look), ...frame.style } : frame.style} className={`block w-full rounded-lg text-left ${paddings[look.density ?? "compact"]} ${frame.className} ${current ? "text-white" : "hover:bg-muted"}`}>
          <span className="flex min-w-0 items-center gap-2">
            <RowIcon layout={layout} row={row} valueOf={valueOf} color={current ? undefined : rowTint} />
            <RowImage src={rowImage(layout, row, valueOf)} look={look} size={look.imageSize ?? "sm"} />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className={`flex min-w-0 items-center gap-1.5 font-semibold ${look.titleFont === "display" ? "font-display" : ""} ${titleSizes[look.titleSize ?? "sm"]} ${look.titleCaps ? "uppercase tracking-[0.12em]" : ""}`}>{look.accent === "dot" && rowTint && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: rowTint }} />}<span className="truncate" style={look.accent === "title" && rowTint && !current ? { color: rowTint } : undefined}>{nameOf(row) || "Sans nom"}</span><RowBadge layout={layout} row={row} valueOf={valueOf} optionsOf={optionsOf} inverted={current} /></span>
              <ItemFields fields={layout.fields ?? []} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} compact={look.fieldStyle !== "stacked" && look.fieldStyle !== "labels"} inverted={current} />
              <RowGauge layout={layout} row={row} valueOf={valueOf} color={rowTint} inverted={current} />
            </span>
          </span>
        </button>
      })}</div>} />
    </div>
    {selected
      ? <DetailPanel row={selected} rows={rows} props={{ ...props, openSheet: props.openSheet ?? onOpen, onChoose: setChosen }} />
      : <article className={`min-w-0 overflow-hidden border bg-card/80 ${boxClass(look)}`}><p className="py-10 text-center text-sm text-muted-foreground">Aucune ligne.</p></article>}
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

/** Une entrée du calendrier : pastille, point de couleur ou barre, avec son icône ; sa jauge dessous si la vue en a une. */
function CalendarEntry({ row, date, calendar, color, props, style: wanted }: { row: string; date: CalendarDate; calendar: CalendarDefinition; color?: string; props: ViewLayoutProps; style?: ViewLook["entryStyle"] }) {
  const look = props.layout.look ?? {}
  const style = wanted ?? look.entryStyle ?? "pill"
  const tint = color ?? accentOf(look)
  const common = `flex w-full items-center gap-1 text-left text-[11px] font-medium ${props.inert ? "" : "cursor-pointer"}`
  const label = <span className="truncate">{props.nameOf(row) || "Sans nom"}</span>
  const icon = <RowIcon layout={props.layout} row={row} valueOf={props.valueOf} className="size-3" />
  const open = () => props.onOpen(row)
  const title = formatCalendarDate(date, calendar)
  const gauge = props.layout.gauge ? <div className="px-1"><RowGauge layout={props.layout} row={row} valueOf={props.valueOf} color={tint} /></div> : null
  const button = style === "dot" ? <button type="button" onClick={open} title={title} className={`${common} rounded px-1 py-0.5 hover:bg-muted`}><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />{icon}{label}</button>
    : style === "bar" ? <button type="button" onClick={open} title={title} className={`${common} rounded-r border-l-[3px] bg-muted/60 px-1.5 py-0.5 hover:bg-muted`} style={{ borderLeftColor: tint }}>{icon}{label}</button>
      : <button type="button" onClick={open} title={title} className={`${common} rounded px-1.5 py-0.5 hover:brightness-95`} style={{ backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}>{icon}{label}</button>
  return gauge ? <div className="grid gap-0.5">{button}{gauge}</div> : button
}

type DatedRow = { row: string; date: CalendarDate }

/**
 * Le calendrier : les lignes placées à leur date dans un calendrier du monde (ou le réel), à
 * l'échelle réglée — année, mois, semaine, jour, agenda, saisons — chacune sous sa forme. Les
 * échelles s'emboîtent : un mois de l'année ouvre le mois, un jour du mois ouvre le jour ; la
 * barre des échelles passe de l'une à l'autre. L'élément, le clic, la formule des groupes et la
 * jauge des lignes sont ceux de toutes les vues.
 */
function CalendarLayout(props: ViewLayoutProps) {
  const { layout, rows, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const calendars = useCalendars()
  const calendar = (!layout.calendar || layout.calendar === REAL_CALENDAR ? realCalendar : calendars?.find((candidate) => fold(candidate.name) === fold(layout.calendar!))) ?? (calendars ? realCalendar : null)
  const dated = useMemo<DatedRow[]>(() => !calendar || !layout.dateColumn ? [] : rows.flatMap((row) => { const date = parseCalendarDate(valueOf(row, layout.dateColumn!), calendar); return date ? [{ row, date }] : [] }).sort((left, right) => compareCalendarDates(left.date, right.date)), [calendar, layout.dateColumn, rows, valueOf])
  const today = new Date()
  const start: CalendarDate = dated[0]?.date ?? (calendar === realCalendar ? { year: today.getFullYear(), month: today.getMonth(), day: 1 } : { year: 1, month: 0, day: 1 })
  const [scaleOverride, setScale] = useState<CalendarScale | null>(null)
  const [cursor, setCursor] = useState<CalendarDate | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<number>>(() => new Set())
  const card = cardFor(props)
  const scale = scaleOverride ?? calendarScaleOf(layout)
  const at = cursor ?? start
  if (!layout.dateColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne de la date dans les réglages de cette vue.</p>
  if (!calendar) return <p className="py-10 text-center text-sm text-muted-foreground">Chargement du calendrier…</p>
  if (!calendar.months.length) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Le calendrier « {calendar.name} » n’a pas encore de mois : ajoute-les dans l’Index des calendriers, onglet Mois.</p>
  const forms = layout.calendarForms ?? {}
  const week = calendar.weekdays.length || 7
  const accent = accentOf(look)
  const drill = !layout.calendarStay
  const fields = (layout.fields ?? []).filter((field) => field !== layout.dateColumn)
  const season = seasonOf(calendar, at.month)
  const seasonTint = layout.monthStyle === "season" && season?.color ? season.color : undefined
  const headingClass = `${look.titleFont === "sans" ? "" : "font-display"} text-xl font-semibold ${look.titleCaps ? "uppercase tracking-[0.12em]" : ""}`
  const undated = rows.length - dated.length
  const era = calendar.era ? ` ${calendar.era}` : ""
  const monthName = (month: number) => calendar.months[month]?.name ?? ""
  const weekdayName = (date: CalendarDate, short = false) => { const name = calendar.weekdays[weekdayOf(calendar, date)] ?? ""; return short ? name.slice(0, 3) : name }
  const sameDay = (left: CalendarDate, right: CalendarDate) => compareCalendarDates(left, right) === 0
  const entriesOn = (date: CalendarDate) => dated.filter((entry) => sameDay(entry.date, date))
  const entriesInMonth = (year: number, month: number) => dated.filter((entry) => entry.date.year === year && entry.date.month === month)
  const colorOf = (row: string) => rowColor(layout, row, valueOf, optionsOf)
  const formula = (group: DatedRow[], color?: string) => layout.groupFormula ? <GroupFormulaBadge layout={layout} rows={group.map((entry) => entry.row)} valueOf={valueOf} color={color} /> : null
  const goMonth = (year: number, month: number) => { setCursor({ year, month, day: 1 }); setScale("month"); setExpandedDays(new Set()) }
  const goDay = (date: CalendarDate) => { setCursor(date); setScale("day") }
  const move = (step: number) => {
    setExpandedDays(new Set())
    if (scale === "year" || scale === "seasons") setCursor({ ...at, year: at.year + step })
    else if (scale === "month") setCursor({ ...addMonths(calendar, at.year, at.month, step), day: 1 })
    else if (scale === "week") setCursor(addDays(calendar, at, step * week))
    else if (scale === "day") setCursor(addDays(calendar, at, step))
  }
  const title = scale === "year" || scale === "seasons" ? `${at.year}${era}`
    : scale === "month" ? `${monthName(at.month)} ${at.year}${era}`
      : scale === "week" ? `Semaine du ${formatCalendarDate(weekStartOf(calendar, at), calendar)}`
        : scale === "day" ? `${weekdayName(at)} ${formatCalendarDate(at, calendar)}`.trim()
          : "Agenda"
  const element = (row: string, extraFields = fields) => card?.(row) ?? <Item row={row} props={props} fields={extraFields} framed={look.surface !== "plain"} className={look.surface === "plain" ? "border-b border-border/70" : ""} />
  const dayButton = (date: CalendarDate, label: ReactNode, className = "") => drill
    ? <button type="button" onClick={() => goDay(date)} className={`${className} rounded hover:bg-muted`} title="Ouvrir ce jour">{label}</button>
    : <span className={className}>{label}</span>
  const monthButton = (year: number, month: number, label: ReactNode, className = "") => drill
    ? <button type="button" onClick={() => goMonth(year, month)} className={`${className} rounded hover:bg-muted`} title="Ouvrir ce mois">{label}</button>
    : <span className={className}>{label}</span>
  // Les cases d'un mois : les vides avant le 1er, puis les jours.
  const cellsOf = (year: number, month: number) => [...Array(firstWeekdayOf(calendar, year, month)).fill(null) as null[], ...Array.from({ length: monthLength(calendar, year, month) }, (_, index) => index + 1)]
  const bannerSrc = layout.calendarBanner === "fixed" ? layout.bannerImage ?? "" : layout.calendarBanner === "month" ? calendar.months[at.month]?.image ?? "" : layout.calendarBanner === "season" ? season?.image ?? "" : ""
  const banner = bannerSrc ? <CoverImage src={bannerSrc} className={`w-full object-cover ${radii[look.radius ?? "md"]}`} style={{ height: layout.bannerHeight ?? 120 }} /> : null
  const switcher = layout.calendarSwitcher ? <div role="tablist" className="flex flex-wrap gap-0.5 rounded-lg border bg-muted/40 p-0.5">{calendarScales.map((option) => <button key={option.value} type="button" role="tab" aria-selected={scale === option.value} onClick={() => { setScale(option.value); setExpandedDays(new Set()) }} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${scale === option.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`} style={scale === option.value ? { color: accent } : undefined}>{option.label}</button>)}</div> : null
  const header = <div className={`flex flex-wrap items-center justify-between gap-2 ${seasonTint ? "rounded-xl px-3 py-2" : ""}`} style={seasonTint ? { backgroundColor: `color-mix(in srgb, ${seasonTint} 12%, transparent)`, borderLeft: `4px solid ${seasonTint}` } : undefined}>
    <div className="flex items-center gap-1">{scale !== "agenda" && <><Button type="button" size="icon-sm" variant="outline" aria-label="Précédent" onClick={() => move(-1)}><ChevronLeft /></Button><Button type="button" size="icon-sm" variant="outline" aria-label="Suivant" onClick={() => move(1)}><ChevronRight /></Button></>}{scaleOverride && scaleOverride !== calendarScaleOf(layout) && !layout.calendarSwitcher && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setScale(null)}>Revenir</Button>}</div>
    <h3 className={`${headingClass} flex items-center gap-2`} style={seasonTint ? { color: seasonTint } : undefined}>{title}{scale === "month" || scale === "year" ? formula(scale === "month" ? entriesInMonth(at.year, at.month) : dated.filter((entry) => entry.date.year === at.year), seasonTint) : null}</h3>
    <span className="flex items-center gap-2 text-xs text-muted-foreground">{switcher}{season && !layout.hideSeasons && scale !== "year" && scale !== "seasons" && scale !== "agenda" && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" style={season.color ? { borderColor: season.color, color: season.color } : undefined}>{season.name}</span>}{calendar.name}</span>
  </div>

  /* ---- Mois ---- */
  const monthGrid = (year: number, month: number) => {
    const cells = cellsOf(year, month)
    return <div className="overflow-x-auto"><div className={`grid min-w-[36rem] gap-px overflow-hidden border bg-border ${radii[look.radius ?? "md"]}`} style={{ gridTemplateColumns: `repeat(${week}, minmax(0, 1fr))` }}>
      {Array.from({ length: week }, (_, index) => <div key={`head:${index}`} className="bg-muted/60 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{calendar.weekdays[index] ?? `Jour ${index + 1}`}</div>)}
      {cells.map((day, index) => {
        const date: CalendarDate | null = day ? { year, month, day } : null
        const entries = date ? entriesOn(date) : []
        const limit = layout.maxPerDay && !expandedDays.has(index) ? layout.maxPerDay : entries.length
        const hidden = entries.length - limit
        return <div key={index} className={`${look.density === "compact" ? "min-h-14" : look.density === "airy" ? "min-h-28" : "min-h-20"} p-1.5 ${day ? "bg-card" : "bg-muted/20"}`}>
          {date && dayButton(date, day, "px-1 text-[11px] font-semibold text-muted-foreground")}
          <div className="mt-0.5 space-y-0.5">
            {entries.slice(0, limit).map((entry) => <CalendarEntry key={entry.row} row={entry.row} date={entry.date} calendar={calendar} color={colorOf(entry.row)} props={props} />)}
            {hidden > 0 && <button type="button" onClick={() => setExpandedDays((set) => new Set(set).add(index))} className="w-full rounded px-1 text-left text-[10px] font-semibold hover:bg-muted" style={{ color: accent }}>+{hidden}</button>}
          </div>
        </div>
      })}
    </div></div>
  }
  const dayLines = (dates: CalendarDate[]) => <ol className={`grid ${gaps[look.density ?? "normal"]}`}>{dates.flatMap((date) => {
    const entries = entriesOn(date)
    if (layout.hideEmptyDays && !entries.length) return []
    return [<li key={`${date.year}:${date.month}:${date.day}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3">
      {dayButton(date, <span className="grid justify-items-center rounded-lg border bg-card py-1 leading-none"><span className="font-display text-xl font-semibold tabular-nums" style={{ color: entries[0] ? colorOf(entries[0].row) ?? accent : undefined }}>{date.day}</span><span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{weekdayName(date, true)}</span></span>, "block text-left")}
      <div className={`grid ${gaps[look.density ?? "normal"]}`}>{entries.length ? entries.map((entry) => <div key={entry.row}>{element(entry.row)}</div>) : <p className="py-2 text-xs text-muted-foreground">—</p>}</div>
    </li>]
  })}</ol>
  const monthBody = forms.month === "lines"
    ? dayLines(Array.from({ length: monthLength(calendar, at.year, at.month) }, (_, index) => ({ year: at.year, month: at.month, day: index + 1 })))
    : monthGrid(at.year, at.month)

  /* ---- Année ---- */
  const yearMonths = calendar.months.map((_, month) => ({ month, entries: entriesInMonth(at.year, month), season: seasonOf(calendar, month) }))
  const yearGrids = <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{yearMonths.map(({ month, entries, season: monthSeason }) => <section key={month} className={`border bg-card/70 p-2 ${radii[look.radius ?? "md"]}`} style={layout.monthStyle === "season" && monthSeason?.color ? { borderColor: `color-mix(in srgb, ${monthSeason.color} 45%, var(--border))` } : undefined}>
    <p className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: layout.monthStyle === "season" && monthSeason?.color ? monthSeason.color : accent }}>{monthButton(at.year, month, monthName(month), "px-1 text-left")}<span className="flex items-center gap-1 normal-case tracking-normal text-muted-foreground">{formula(entries, monthSeason?.color)}{!layout.hideCounts && entries.length > 0 && <span className="tabular-nums">{entries.length}</span>}</span></p>
    <div className="mt-1 grid gap-px text-[9px]" style={{ gridTemplateColumns: `repeat(${week}, minmax(0, 1fr))` }}>
      {cellsOf(at.year, month).map((day, index) => {
        const date = day ? { year: at.year, month, day } : null
        const own = date ? entriesOn(date) : []
        const tint = own[0] ? colorOf(own[0].row) ?? accent : undefined
        return <span key={index} className={`grid aspect-square place-items-center rounded ${day ? "" : "opacity-0"}`}>{date ? dayButton(date, <span className="grid place-items-center leading-none"><span className={own.length ? "font-semibold" : "text-muted-foreground"}>{day}</span>{own.length > 0 && <span aria-hidden className="mt-px size-1.5 rounded-full" style={{ backgroundColor: tint }} title={own.map((entry) => nameOf(entry.row)).join(", ")} />}</span>, "size-full") : null}</span>
      })}
    </div>
  </section>)}</div>
  const band = (segments: Array<{ key: string; label: string; days: number; color?: string; onClick?: () => void }>, entries: DatedRow[], origin: number, total: number) => <div className="grid gap-2">
    <div className="relative">
      <div className={`flex h-9 overflow-hidden border ${radii[look.radius ?? "md"]}`}>{segments.map((segment) => <button key={segment.key} type="button" disabled={!segment.onClick} onClick={segment.onClick} className="grid min-w-0 place-items-center truncate px-1 text-[10px] font-semibold uppercase tracking-[0.08em] disabled:cursor-default" style={{ flex: `${segment.days} 0 0`, backgroundColor: segment.color ? `color-mix(in srgb, ${segment.color} 22%, var(--card))` : "var(--muted)", color: segment.color ?? undefined, borderRight: "1px solid var(--border)" }} title={segment.label}><span className="truncate">{segment.label}</span></button>)}</div>
      {entries.map((entry) => { const left = ((dayNumber(calendar, entry.date) - origin) / Math.max(1, total)) * 100; return <button key={entry.row} type="button" onClick={() => onOpen(entry.row)} title={`${nameOf(entry.row)} · ${formatCalendarDate(entry.date, calendar)}`} className="absolute -top-1.5 size-3 -translate-x-1/2 rounded-full border-2 border-background shadow" style={{ left: `${Math.max(0, Math.min(100, left))}%`, backgroundColor: colorOf(entry.row) ?? accent }} /> })}
    </div>
    <ul className="flex flex-wrap gap-1.5">{entries.map((entry) => <li key={entry.row}><CalendarEntry row={entry.row} date={entry.date} calendar={calendar} color={colorOf(entry.row)} props={props} style={look.entryStyle ?? "pill"} /></li>)}</ul>
  </div>
  const yearOrigin = dayNumber(calendar, { year: at.year, month: 0, day: 1 })
  const yearDays = yearLength(calendar, at.year)
  const yearEntries = dated.filter((entry) => entry.date.year === at.year)
  const yearBand = band(calendar.months.map((month, index) => ({ key: String(index), label: month.name, days: monthLength(calendar, at.year, index), color: seasonOf(calendar, index)?.color || undefined, onClick: drill ? () => goMonth(at.year, index) : undefined })), yearEntries, yearOrigin, yearDays)
  const yearLines = <ol className="divide-y">{yearMonths.map(({ month, entries, season: monthSeason }) => <li key={month} className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)] items-start gap-3 py-1.5">
    <span className="flex flex-col"><span className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: layout.monthStyle === "season" && monthSeason?.color ? monthSeason.color : accent }}>{monthButton(at.year, month, monthName(month), "px-1 text-left")}</span><span className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">{!layout.hideCounts && <span className="tabular-nums">{entries.length}</span>}{formula(entries, monthSeason?.color)}</span></span>
    <ul className="flex flex-wrap gap-1">{entries.map((entry) => <li key={entry.row} className="max-w-56"><CalendarEntry row={entry.row} date={entry.date} calendar={calendar} color={colorOf(entry.row)} props={props} /></li>)}{!entries.length && <li className="text-xs text-muted-foreground">—</li>}</ul>
  </li>)}</ol>
  const yearBody = forms.year === "band" ? yearBand : forms.year === "lines" ? yearLines : yearGrids

  /* ---- Semaine ---- */
  const weekStart = weekStartOf(calendar, at)
  const weekDates = Array.from({ length: week }, (_, index) => addDays(calendar, weekStart, index))
  const weekEntries = weekDates.flatMap((date) => entriesOn(date).map((entry) => ({ ...entry, weekday: weekdayName(date, true) })))
  const weekColumns = <div className="overflow-x-auto"><div className={`grid min-w-[36rem] gap-px overflow-hidden border bg-border ${radii[look.radius ?? "md"]}`} style={{ gridTemplateColumns: `repeat(${week}, minmax(0, 1fr))` }}>
    {weekDates.map((date, index) => <div key={index} className="bg-muted/60 px-2 py-1.5 text-center">{dayButton(date, <span className="block"><span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{calendar.weekdays[index] ?? `Jour ${index + 1}`}</span><span className="font-display text-lg font-semibold leading-none" style={sameDay(date, at) ? { color: accent } : undefined}>{date.day}</span></span>, "w-full")}</div>)}
    {weekDates.map((date, index) => <div key={`body:${index}`} className={`grid content-start ${gaps[look.density ?? "normal"]} bg-card p-1.5 ${look.density === "compact" ? "min-h-24" : look.density === "airy" ? "min-h-48" : "min-h-36"}`}>{entriesOn(date).map((entry) => <div key={entry.row}>{element(entry.row)}</div>)}</div>)}
  </div></div>
  const weekLines = dayLines(weekDates)
  const weekTable = <div className={`overflow-x-auto border ${radii[look.radius ?? "md"]}`}><table className="w-full border-collapse text-[13px]">
    <thead><tr><th className="whitespace-nowrap border-b bg-muted px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Jour</th><th className="border-b bg-muted px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Nom</th>{fields.map((field) => <th key={field} className="border-b bg-muted px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{field}</th>)}</tr></thead>
    <tbody>{weekEntries.map((entry) => <tr key={entry.row} className="border-b border-border/60 last:border-b-0">
      <td className="whitespace-nowrap px-3 py-1.5 align-top text-xs text-muted-foreground">{dayButton(entry.date, <>{entry.weekday} {entry.date.day}</>, "px-1")}</td>
      <td className="px-3 py-1.5 align-top"><ItemTitle row={entry.row} look={look} color={colorOf(entry.row)} nameOf={nameOf} onOpen={onOpen} inert={props.inert} icon={<RowIcon layout={layout} row={entry.row} valueOf={valueOf} color={colorOf(entry.row)} />} badge={<RowBadge layout={layout} row={entry.row} valueOf={valueOf} optionsOf={optionsOf} />} /><RowGauge layout={layout} row={entry.row} valueOf={valueOf} color={colorOf(entry.row)} /></td>
      {fields.map((field) => <td key={field} className="max-w-[18rem] px-3 py-1.5 align-top text-xs"><span className="line-clamp-3">{plain(valueOf(entry.row, field))}</span></td>)}
    </tr>)}{!weekEntries.length && <tr><td colSpan={2 + fields.length} className="px-3 py-6 text-center text-xs text-muted-foreground">Rien cette semaine.</td></tr>}</tbody>
  </table></div>
  const weekBody = forms.week === "lines" ? weekLines : forms.week === "table" ? weekTable : weekColumns

  /* ---- Jour ---- */
  const dayEntries = entriesOn(at)
  const dayBody = <div className={`grid ${gaps[look.density ?? "normal"]}`}>
    {dayEntries.length ? dayEntries.map((entry) => forms.day === "paragraphs"
      ? <article key={entry.row} className={`min-w-0 ${look.surface === "boxed" ? `border bg-card ${boxClass(look)} ${paddings[look.density ?? "normal"]}` : "border-b pb-3"}`}>
        <ItemTitle row={entry.row} look={{ ...look, titleFont: look.titleFont ?? "display" }} color={colorOf(entry.row)} nameOf={nameOf} onOpen={onOpen} inert={props.inert} size={look.titleSize ?? "lg"} icon={<RowIcon layout={layout} row={entry.row} valueOf={valueOf} color={colorOf(entry.row)} className="size-5" />} badge={<RowBadge layout={layout} row={entry.row} valueOf={valueOf} optionsOf={optionsOf} />} />
        {fields[0] && <p className="mt-1.5 whitespace-pre-line text-sm leading-6">{plain(valueOf(entry.row, fields[0]))}</p>}
        <div className="mt-1.5"><ItemFields fields={fields.slice(1)} row={entry.row} look={look} valueOf={valueOf} optionsOf={optionsOf} /><RowGauge layout={layout} row={entry.row} valueOf={valueOf} color={colorOf(entry.row)} /></div>
      </article>
      : <div key={entry.row}>{element(entry.row)}</div>)
      : <p className="rounded-xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">Rien ce jour-là.</p>}
  </div>

  /* ---- Agenda ---- */
  const monthKey = (date: CalendarDate) => `${date.year}:${date.month}`
  const agendaMonths = [...new Set(dated.map((entry) => monthKey(entry.date)))].map((key) => { const entries = dated.filter((entry) => monthKey(entry.date) === key); return { key, entries, first: entries[0].date, season: seasonOf(calendar, entries[0].date.month) } })
  const agendaHeading = (first: CalendarDate, monthSeason: ReturnType<typeof seasonOf>, entries: DatedRow[]) => <h3 className={`${headingClass} flex items-center gap-2 border-b pb-1`} style={layout.monthStyle === "season" && monthSeason?.color ? { color: monthSeason.color, borderColor: monthSeason.color } : { borderColor: `color-mix(in srgb, ${accent} 40%, transparent)` }}>{monthButton(first.year, first.month, <>{monthName(first.month)} {first.year}{era}</>, "px-1 text-left")}{!layout.hideSeasons && monthSeason && <span className="text-xs font-normal text-muted-foreground">· {monthSeason.name}</span>}{formula(entries, monthSeason?.color)}</h3>
  const agendaList = <div className="grid gap-4">{agendaMonths.map(({ key, entries, first, season: monthSeason }) => <section key={key} className="grid gap-1.5">
    {agendaHeading(first, monthSeason, entries)}
    <ol className={`grid ${gaps[look.density ?? "normal"]}`}>{entries.map(({ row, date }) => <li key={row} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-3">
      {dayButton(date, <span className="grid justify-items-center rounded-lg border bg-card py-1 leading-none" style={{ borderColor: colorOf(row) ?? `color-mix(in srgb, ${accent} 40%, transparent)` }}><span className="font-display text-xl font-semibold tabular-nums" style={{ color: colorOf(row) ?? accent }}>{date.day}</span><span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{weekdayName(date, true)}</span></span>, "block text-left")}
      {element(row)}
    </li>)}</ol>
  </section>)}</div>
  const agendaThread = <ol className={`relative grid ${gaps[look.density ?? "normal"]} pl-6 before:absolute before:inset-y-1 before:left-[0.4375rem] before:w-0.5 before:rounded-full before:bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--eraser-timeline)_50%,transparent),color-mix(in_srgb,var(--eraser-timeline)_10%,transparent))]`} style={{ ["--eraser-timeline" as string]: accent }}>{dated.map(({ row, date }) => <li key={row} className="relative">
    <span aria-hidden className="absolute top-2 -left-[1.1875rem] size-3 rounded-full border-2 border-background shadow" style={{ backgroundColor: colorOf(row) ?? accent }} />
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: colorOf(row) ?? accent }}>{dayButton(date, formatCalendarDate(date, calendar), "px-1")}</p>
    {element(row)}
  </li>)}</ol>
  const agendaWeeks = (() => {
    const keys = [...new Set(dated.map((entry) => dayNumber(calendar, weekStartOf(calendar, entry.date))))]
    return <div className="grid gap-4">{keys.map((startNumber) => {
      const begin = dateFromDayNumber(calendar, startNumber)
      const entries = dated.filter((entry) => dayNumber(calendar, weekStartOf(calendar, entry.date)) === startNumber)
      const days = [...new Set(entries.map((entry) => dayNumber(calendar, entry.date)))].map((number) => dateFromDayNumber(calendar, number))
      return <section key={startNumber} className="grid gap-1.5">
        <h3 className={`${headingClass} flex items-center gap-2 border-b pb-1 text-base`} style={{ borderColor: `color-mix(in srgb, ${accent} 40%, transparent)` }}>Semaine du {formatCalendarDate(begin, calendar)}{formula(entries)}</h3>
        {dayLines(days)}
      </section>
    })}</div>
  })()
  const agendaBody = !dated.length ? <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Aucune date lisible pour l’instant.</p> : forms.agenda === "thread" ? agendaThread : forms.agenda === "weeks" ? agendaWeeks : agendaList

  /* ---- Saisons ---- */
  const seasonsOfYear = calendar.seasons.map((item) => ({ ...item, months: calendar.months.map((month, index) => ({ month, index })).filter(({ month }) => fold(month.season) === fold(item.name)) }))
  const seasonEntries = (item: (typeof seasonsOfYear)[number]) => yearEntries.filter((entry) => item.months.some(({ index }) => index === entry.date.month))
  const seasonsBand = seasonsOfYear.length
    ? band(seasonsOfYear.map((item) => ({ key: item.name, label: item.name, days: item.months.reduce((sum, { index }) => sum + monthLength(calendar, at.year, index), 0) || 1, color: item.color || undefined })), yearEntries, yearOrigin, yearDays)
    : yearBand
  const seasonsPanels = seasonsOfYear.length
    ? <div className="grid gap-3 md:grid-cols-2">{seasonsOfYear.map((item) => { const entries = seasonEntries(item); const tint = item.color || accent; return <section key={item.name} className={`overflow-hidden border ${radii[look.radius ?? "md"]}`} style={{ borderColor: `color-mix(in srgb, ${tint} 45%, var(--border))` }}>
      <p className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white" style={{ backgroundColor: tint }}><span>{item.name}<span className="ml-2 font-normal normal-case tracking-normal opacity-80">{item.months.map(({ month }) => month.name).join(" · ")}</span></span><span className="flex items-center gap-1">{layout.groupFormula && <GroupFormulaBadge layout={layout} rows={entries.map((entry) => entry.row)} valueOf={valueOf} inverted />}{!layout.hideCounts && <span className="rounded-full bg-white/20 px-1.5 tabular-nums">{entries.length}</span>}</span></p>
      <div className={`grid ${gaps[look.density ?? "normal"]} p-2`} style={{ backgroundColor: `color-mix(in srgb, ${tint} 6%, var(--card))` }}>{entries.length ? entries.map((entry) => <div key={entry.row}>{element(entry.row)}</div>) : <p className="py-3 text-center text-xs text-muted-foreground">Rien cette saison.</p>}</div>
    </section> })}</div>
    : <p className="rounded-xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">Le calendrier « {calendar.name} » n’a pas de saisons : ajoute-les dans l’Index des calendriers (onglet Saisons, et la saison de chaque mois).</p>
  const seasonsBody = forms.seasons === "panels" ? seasonsPanels : seasonsBand

  const body = scale === "year" ? yearBody : scale === "week" ? weekBody : scale === "day" ? dayBody : scale === "agenda" ? agendaBody : scale === "seasons" ? seasonsBody : monthBody
  return <div className="space-y-3">
    {banner}
    {header}
    {body}
    {undated > 0 && layout.showUndated && <ul className="flex flex-wrap gap-1.5">{rows.filter((row) => !dated.some((entry) => entry.row === row)).map((row) => <li key={row}><button type="button" onClick={() => onOpen(row)} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted"><RowIcon layout={layout} row={row} valueOf={valueOf} className="size-3" />{nameOf(row) || "Sans nom"}</button></li>)}</ul>}
    {undated > 0 && <p className="text-xs text-muted-foreground">{undated} ligne{undated > 1 ? "s" : ""} sans date lisible dans « {layout.dateColumn} » ({calendar === realCalendar ? "« 12 mars 1023 » ou « 1023-03-12 »" : `« 12 ${calendar.months[0]?.name ?? "Mois"} 1023 »`}).</p>}
  </div>
}

/* ---------- Galerie ---------- */

const galleryWidths = { sm: 8.5, md: 12, lg: 17 } as const
const galleryRatios = { square: 1, portrait: 0.8, landscape: 1.6 } as const
const galleryRadius = { square: 6, rounded: 12, circle: 999 } as const

function GalleryLayout(props: ViewLayoutProps) {
  const { layout, rows, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const width = layout.galleryWidthRem ?? galleryWidths[layout.gallerySize ?? "md"]
  const circle = look.imageShape === "circle"
  const ratio = circle ? 1 : layout.galleryHeightRem ? width / layout.galleryHeightRem : layout.galleryRatio ?? galleryRatios[layout.galleryShape ?? "portrait"]
  const radius = circle ? 999 : layout.galleryRadiusPx ?? galleryRadius[look.imageShape ?? "rounded"]
  const hover = Boolean(layout.captionOnHover)
  const below = look.caption === "below" || circle
  const boxed = look.surface === "boxed" && !circle
  const accent = accentOf(look)
  if (!layout.imageColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne des images dans les réglages de cette vue.</p>
  return <Sections layout={layout} rows={rows} valueOf={valueOf} nameOf={nameOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => <div className={`grid ${look.density === "compact" ? "gap-2" : look.density === "airy" ? "gap-5" : "gap-3"}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${width}rem), 1fr))` }}>
    {shown.map((row) => {
      const src = rowImage(layout, row, valueOf)
      const color = rowColor(layout, row, valueOf, optionsOf)
      const fields = layout.fields ?? []
      const marks: CSSProperties = color && look.accent !== "none" && look.accent !== "title" ? (circle ? { boxShadow: `0 0 0 3px ${color}` } : look.accent === "tint" ? { boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 55%, transparent)` } : { boxShadow: `inset 0 -3px 0 ${color}` }) : {}
      const glyph = rowGlyph(layout, row, valueOf)
      const picture = <span className={`relative block overflow-hidden border bg-muted/40 ${look.shadow ? "shadow-md" : "shadow-sm"}`} style={{ aspectRatio: String(ratio), borderRadius: radius, ...marks }}>
        <CoverImage src={src} className={`absolute inset-0 size-full ${layout.galleryFit === "contain" ? "object-contain" : "object-cover"} ${layout.galleryStill ? "" : "transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"}`} fallback={<span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-muted/30 to-muted text-muted-foreground/60"><ImageOff className="size-6" /></span>} />
        {layout.badgeColumn && (() => { const value = plain(valueOf(row, layout.badgeColumn!)).split(/\s*[,;]\s*/)[0] ?? ""; if (!value) return null; const tint = optionsOf?.(layout.badgeColumn!)?.find((option) => fold(option.value) === fold(value))?.color ?? accent; return <span className="absolute left-0 top-2 z-[1] rounded-r-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white shadow-sm" style={{ backgroundColor: tint }}>{value}</span> })()}
        {glyph && <span className="absolute right-1.5 top-1.5 z-[1] grid size-6 place-items-center rounded-full bg-black/55 text-white"><IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className="size-3.5" /></span>}
        {!below && <span className={`absolute inset-x-0 bottom-0 grid gap-0.5 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2.5 pb-2 pt-8 text-white transition-opacity ${hover ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : ""}`}>
          <span className={`truncate font-semibold leading-tight ${look.titleFont === "sans" ? "" : "font-display"} ${titleSizes[look.titleSize ?? "sm"]} ${look.titleCaps ? "uppercase tracking-[0.12em]" : ""}`}>{nameOf(row) || "Sans nom"}</span>
          <ItemFields fields={fields} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} compact inverted />
        </span>}
      </span>
      return <button key={row} type="button" onClick={() => onOpen(row)} title={nameOf(row)} className={`group grid min-w-0 content-start gap-1.5 text-left outline-offset-2 transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${below && circle ? "justify-items-center text-center" : ""} ${boxed ? `border bg-card p-2 pb-3 ${radii[look.radius ?? "md"]} ${look.shadow ? "shadow-md" : "shadow-sm"}` : ""}`}>
        {picture}
        {below && <span className={`grid min-w-0 gap-0.5 ${circle ? "justify-items-center" : ""} ${boxed ? "px-0.5" : ""}`}>
          <span className={`truncate font-semibold leading-tight ${look.titleFont === "sans" ? "" : "font-display"} ${titleSizes[look.titleSize ?? "sm"]} ${look.titleCaps ? "uppercase tracking-[0.12em]" : ""}`} style={look.accent === "title" && color ? { color } : undefined}>{nameOf(row) || "Sans nom"}</span>
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
  const every = layout.milestoneEvery ?? 1
  const period = (year: number) => Math.floor(year / every) * every
  const style = layout.timelineStyle ?? "dots"
  const accent = accentOf(look)
  // Les années (ou décennies, siècles…) servent de jalons : un repère chaque fois que la période change ; les éléments alternent de côté.
  const placed = dated.map((entry, index) => ({ ...entry, milestone: index === 0 || period(dated[index - 1].date.year) !== period(entry.date.year), right: !alternate || index % 2 === 0 }))
  const milestoneLabel = (year: number) => every === 1 ? `${year}${calendar.era ? ` ${calendar.era}` : ""}` : every === 10 ? `Années ${period(year)}` : every === 100 ? `${Math.floor(period(year) / 100) + 1}ᵉ siècle` : `${Math.floor(period(year) / 1000) + 1}ᵉ millénaire`
  const lineClass = style === "icons" ? "before:left-[1.1875rem]" : "before:left-[0.6875rem]"
  return <div className="space-y-4">
    <ol className={`relative grid ${gaps[look.density ?? "normal"]} ${alternate ? "md:before:left-1/2" : ""} before:absolute before:inset-y-1 ${lineClass} before:w-0.5 before:rounded-full before:bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--eraser-timeline)_50%,transparent),color-mix(in_srgb,var(--eraser-timeline)_25%,transparent),color-mix(in_srgb,var(--eraser-timeline)_5%,transparent))] md:before:-translate-x-1/2`} style={{ ["--eraser-timeline" as string]: accent }}>
      {placed.map(({ row, date, milestone, right }) => {
        const color = rowColor(layout, row, valueOf, optionsOf) ?? accent
        // Une année seule est déjà dite par le jalon : pas de date répétée au-dessus de l'élément.
        const when = layout.dateStyle === "hidden" || (date.yearOnly && every === 1) ? "" : formatCalendarDate(date, calendar)
        const body = card?.(row) ?? (style === "chapters"
          ? <article className={`min-w-0 ${look.surface === "boxed" ? `border bg-card ${boxClass(look)} ${paddings[look.density ?? "normal"]}` : ""}`}>
            <ItemTitle row={row} look={{ ...look, titleFont: look.titleFont ?? "display" }} color={color} nameOf={nameOf} onOpen={onOpen} size={look.titleSize ?? "lg"} icon={<RowIcon layout={layout} row={row} valueOf={valueOf} color={color} className="size-5" />} />
            <div className="mt-1"><ItemFields fields={(layout.fields ?? []).filter((field) => field !== layout.dateColumn)} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} /></div>
          </article>
          : <Item row={row} props={props} fields={(layout.fields ?? []).filter((field) => field !== layout.dateColumn)} framed={look.surface !== "plain"} />)
        const glyph = style === "icons" ? rowGlyph(layout, row, valueOf, layout.itemIcon ?? "sparkle") : null
        const pad = style === "icons" ? "pl-12" : "pl-8"
        return <li key={row} className="contents">
          {milestone && <div className={`relative z-[1] flex ${alternate ? "md:justify-center" : ""}`}><span className={`flex items-center gap-1.5 rounded-full border bg-background px-3 py-0.5 font-display font-semibold shadow-sm ${style === "chapters" ? "text-base" : "text-sm"}`} style={{ borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`, color: accent }}><Glyph value={layout.milestoneIcon} />{milestoneLabel(date.year)}</span></div>}
          <div className={`relative grid ${pad} ${alternate ? `md:w-1/2 md:pl-0 ${right ? `md:ml-auto md:${pad}` : style === "icons" ? "md:pr-12" : "md:pr-8"}` : ""}`}>
            {style === "icons"
              ? <span aria-hidden className={`absolute top-1 left-0 grid size-10 place-items-center rounded-full border-2 border-background text-white shadow ${alternate ? (right ? "md:-left-5" : "md:left-auto md:-right-5") : ""}`} style={{ backgroundColor: color }}>{glyph && <IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className="size-5" />}</span>
              : <span aria-hidden className={`absolute top-3.5 left-[0.3125rem] size-3 rounded-full border-2 border-background shadow ${alternate ? (right ? "md:-left-1.5" : "md:left-auto md:-right-1.5") : ""}`} style={{ backgroundColor: color }} />}
            {when && (layout.dateStyle === "badge"
              ? <p className="mb-1"><span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white" style={{ backgroundColor: color }}>{when}</span></p>
              : <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>{when}</p>)}
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
  const { layout, rows, nameOf, valueOf, optionsOf } = props
  const look = layout.look ?? {}
  const parentColumn = layout.parentColumn
  const tree = useMemo(() => parentColumn ? rowTree(rows, nameOf, (row) => valueOf(row, parentColumn)) : [], [nameOf, parentColumn, rows, valueOf])
  // Les nœuds ouverts ou fermés à la main ; les autres suivent « replié à l'ouverture ».
  const [toggled, setToggled] = useState<Set<string>>(() => new Set())
  if (!parentColumn) return <p className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">Choisis la colonne du parent dans les réglages de cette vue (par exemple « Pays » pour des villes).</p>
  const isOpen = (row: string) => toggled.has(row) ? Boolean(layout.collapsed) : !layout.collapsed
  const toggle = (row: string) => setToggled((current) => { const next = new Set(current); if (next.has(row)) next.delete(row); else next.add(row); return next })
  const all = (open: boolean) => setToggled(open === !layout.collapsed ? new Set() : new Set(rows))
  const style = layout.treeStyle ?? "lines"
  const framed = style !== "boxed" && look.surface !== "plain"
  const heading = look.sectionStyle === "heading"
  if (layout.rootsAsSections) {
    // Chaque racine est une section (titre, nombre), ses enfants en arbre dessous.
    return <div className={heading ? "space-y-14" : "space-y-5"}>
      {tree.map((node) => <Section key={node.row} title={plain(nameOf(node.row)) || "Sans nom"} count={treeSize(node)} collapsible={Boolean(layout.collapsed) || Boolean(layout.collapsible)} startCollapsed={layout.collapsed} hideCount={layout.hideCounts} heading={heading} icon={look.sectionIcon ?? layout.branchIcon} accent={look.color} color={rowColor(layout, node.row, valueOf, optionsOf)}>
        <ul role="tree" aria-label={plain(nameOf(node.row))} className={framed ? `border bg-card/70 p-1.5 ${radii[look.radius ?? "md"]}` : ""}>{node.children.map((child) => <TreeNode key={child.row} node={{ ...child, depth: 0 }} isOpen={isOpen} toggle={toggle} {...props} />)}</ul>
      </Section>)}
    </div>
  }
  return <div className="grid gap-2">
    <div className="flex flex-wrap items-center gap-2 text-xs"><Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => all(true)}>Tout déplier</Button><Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => all(false)}>Tout replier</Button><span className="text-muted-foreground">{tree.length} racine{tree.length > 1 ? "s" : ""} · rangées par « {parentColumn} »</span></div>
    <ul role="tree" aria-label="Arborescence" className={framed ? `border bg-card/70 p-1.5 ${radii[look.radius ?? "md"]}` : style === "boxed" ? `grid ${gaps[look.density ?? "normal"]}` : ""}>{tree.map((node) => <TreeNode key={node.row} node={node} isOpen={isOpen} toggle={toggle} {...props} />)}</ul>
  </div>
}

function TreeNode({ node, isOpen, toggle, layout, nameOf, valueOf, optionsOf, onOpen }: ViewLayoutProps & { node: RowTreeNode<string>; isOpen: (row: string) => boolean; toggle: (row: string) => void }) {
  const look = layout.look ?? {}
  const open = isOpen(node.row)
  const size = treeSize(node)
  const leaf = !node.children.length
  const depthColor = layout.depthColors ? depthPalette[node.depth % depthPalette.length] : undefined
  const color = rowColor(layout, node.row, valueOf, optionsOf) ?? depthColor
  const style = layout.treeStyle ?? "lines"
  const boxed = style === "boxed"
  const step = look.density === "airy" ? 1.6 : look.density === "compact" ? 1 : 1.25
  const titleLook: ViewLook = { ...look, titleSize: node.depth === 0 ? look.titleSize ?? "md" : look.titleSize === "lg" ? "md" : "sm", titleFont: node.depth === 0 ? look.titleFont ?? "display" : look.titleFont, accent: look.accent === "border" || !look.accent ? (leaf ? "dot" : "title") : look.accent }
  const frame = look.accent === "tint" ? accentFrame(look, color) : { className: "" }
  const fallbackIcon = leaf ? layout.leafIcon : layout.branchIcon
  const icon = <RowIcon layout={layout} row={node.row} valueOf={valueOf} color={color} fallback={layout.itemIcon ?? fallbackIcon} />
  const rowLine = <div className={`group flex min-w-0 items-center gap-1.5 rounded-lg pr-2 hover:bg-muted/60 ${look.density === "compact" ? "py-0.5" : look.density === "airy" ? "py-1.5" : "py-1"} ${frame.className}`} style={{ paddingLeft: boxed ? "0.25rem" : `${0.25 + node.depth * step}rem`, ...frame.style }}>
    {leaf ? <span className="size-6 shrink-0" /> : <button type="button" onClick={() => toggle(node.row)} aria-label={open ? "Replier" : "Déplier"} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} /></button>}
    <RowImage src={rowImage(layout, node.row, valueOf)} look={look} size={look.imageSize ?? "sm"} />
    <ItemTitle row={node.row} look={titleLook} color={color} nameOf={nameOf} onOpen={onOpen} truncate icon={icon} badge={<RowBadge layout={layout} row={node.row} valueOf={valueOf} optionsOf={optionsOf} />} />
    {!leaf && !layout.hideCounts && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{size}</span>}
    <span className="ml-auto hidden min-w-0 md:block"><ItemFields fields={(layout.fields ?? []).filter((field) => field !== layout.parentColumn)} row={node.row} look={look} valueOf={valueOf} optionsOf={optionsOf} compact /></span>
  </div>
  const children = !leaf && open && <ul role="group" className={boxed ? `grid ${gaps[look.density ?? "normal"]} pl-4 pt-1` : "relative"}>
    {!boxed && style === "lines" && <span aria-hidden className="absolute inset-y-0 w-px" style={{ left: `${0.25 + node.depth * step + 0.75}rem`, backgroundColor: color ? `color-mix(in srgb, ${color} 45%, transparent)` : "var(--border)" }} />}
    {node.children.map((child) => <TreeNode key={child.row} node={child} isOpen={isOpen} toggle={toggle} layout={layout} nameOf={nameOf} valueOf={valueOf} optionsOf={optionsOf} onOpen={onOpen} rows={[]} headers={[]} empty="" />)}
  </ul>
  return <li role="treeitem" aria-expanded={leaf ? undefined : open} aria-selected={false} className={`min-w-0 ${boxed ? `border bg-card/80 p-1.5 ${radii[look.radius ?? "md"]} ${look.shadow ? "shadow-md" : ""}` : ""}`} style={boxed && color ? { borderLeft: `4px solid ${color}` } : undefined}>
    {rowLine}
    {children}
  </li>
}

/* ---------- Codex ---------- */

const codexTitles = { sm: "text-xl", md: "text-2xl", lg: "text-3xl" } as const

function CodexLayout(props: ViewLayoutProps) {
  const { layout, rows, headers, nameOf, valueOf, optionsOf, onOpen } = props
  const look = layout.look ?? {}
  const fields = layout.detailFields?.length ? layout.detailFields : headers
  const anchor = (row: string) => `codex-${row.replace(/[^a-z0-9_-]/gi, "-")}`
  const style = layout.codexStyle ?? "book"
  const accent = accentOf(look)
  const numberOf = new Map(rows.map((row, index) => [row, index + 1]))
  const article = (row: string) => {
    const color = rowColor(layout, row, valueOf, optionsOf)
    const src = rowImage(layout, row, valueOf)
    const entries = fields.filter((field) => field !== layout.imageColumn && field !== layout.iconColumn).map((field) => ({ field, value: plain(valueOf(row, field)) })).filter((entry) => entry.value && entry.value !== plain(nameOf(row)))
    // Les textes longs se lisent en paragraphes ; les valeurs courtes forment l'encadré.
    const prose = (entry: { field: string; value: string }) => entry.value.length > 80 || /descri|histoire|lore|note|texte|r[ée]sum|contenu|effet|r[eè]gle|biograph|apparence|personnalit/i.test(entry.field)
    const short = entries.filter((entry) => !prose(entry))
    const long = entries.filter(prose)
    const banner = look.codexImage === "banner" && src
    const frame = look.accent === "tint" ? accentFrame(look, color) : { className: "", style: color && (look.accent ?? "border") === "border" ? { borderTop: `3px solid ${color}` } : undefined }
    const shell = style === "scroll"
      ? { className: "border border-[#d9c7a3] text-[#3b2f1e] shadow-[0_10px_30px_rgb(120_90_40/0.12)]", style: { backgroundColor: "#f6ecd6", backgroundImage: "linear-gradient(180deg, rgb(255 255 255 / 0.35), transparent 30%, rgb(120 90 40 / 0.06))" } as CSSProperties }
      : style === "plain" ? { className: "border-b pb-6 last:border-b-0", style: undefined }
      : { className: `border bg-card/80 ${boxClass(look)}`, style: undefined }
    const chapter = layout.chapterNumbers ? <span className="mr-2 font-display text-base font-normal opacity-60">{style === "scroll" ? "✦ " : ""}{numberOf.get(row)}.</span> : null
    return <article key={row} id={anchor(row)} className={`scroll-mt-24 overflow-hidden ${style === "plain" ? "" : radii[look.radius ?? "lg"]} ${shell.className} ${frame.className}`} style={{ ...shell.style, ...frame.style }}>
      {banner && <CoverImage src={src} className="aspect-[21/8] w-full border-b object-cover" />}
      <div className={style === "plain" ? "" : look.density === "compact" ? "p-4" : look.density === "airy" ? "p-7" : "p-5"}>
        <header className={`flex flex-wrap items-start justify-between gap-3 pb-3 ${style === "scroll" ? "border-b border-[#d9c7a3]" : "border-b"}`}>
          <h3 className={`flex items-center gap-2 ${look.titleFont === "sans" ? "" : "font-display"} ${codexTitles[look.titleSize ?? "md"]} font-semibold leading-tight ${look.titleCaps ? "uppercase tracking-[0.12em]" : ""}`} style={look.accent === "title" && color ? { color } : style === "scroll" ? { color: color ?? "#6b4a1e" } : undefined}>{chapter}<RowIcon layout={layout} row={row} valueOf={valueOf} color={color ?? accent} className="size-6" />{nameOf(row) || "Sans nom"}<RowBadge layout={layout} row={row} valueOf={valueOf} optionsOf={optionsOf} /></h3>
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(row)}><ExternalLink />Ouvrir la fiche</Button>
        </header>
        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
          <div className={`min-w-0 space-y-4 text-[15px] leading-7 ${layout.proseColumns === 2 ? "md:[column-count:2] md:[column-gap:2rem] [&>section]:[break-inside:avoid]" : ""}`}>
            {long.length ? long.map((entry, index) => <section key={entry.field}><h4 className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${style === "scroll" ? "opacity-70" : "text-muted-foreground"}`} style={look.fieldColor === "accent" ? { color: accent } : undefined}>{entry.field}</h4><p className={`mt-1 whitespace-pre-line break-words ${look.dropCap && index === 0 ? "first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:[font-family:var(--font-serif)] first-letter:text-5xl first-letter:font-semibold first-letter:leading-[0.8] first-letter:text-[color:var(--dropcap)]" : ""}`} style={look.dropCap && index === 0 ? { ["--dropcap" as string]: color ?? accent } : undefined}>{entry.value}</p></section>) : <p className={`text-sm italic ${style === "scroll" ? "opacity-70" : "text-muted-foreground"}`}>Pas encore de texte.</p>}
          </div>
          {((src && !banner) || short.length > 0) && <aside className={`grid content-start gap-3 border p-3 text-sm md:order-last ${radii[look.radius ?? "md"]} ${style === "scroll" ? "border-[#d9c7a3] bg-white/40" : "bg-muted/25"}`}>
            {!banner && <CoverImage src={src} className={`w-full border object-cover ${look.imageShape === "circle" ? "aspect-square rounded-full" : look.imageShape === "square" ? "rounded-none" : "rounded-lg"}`} />}
            {short.length > 0 && (look.fieldStyle === "pills"
              ? <ItemFields fields={short.map((entry) => entry.field)} row={row} look={look} valueOf={valueOf} optionsOf={optionsOf} />
              : <dl className="grid gap-2">{short.map((entry) => <div key={entry.field} className="grid gap-0.5"><dt className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${style === "scroll" ? "opacity-70" : "text-muted-foreground"}`} style={look.fieldColor === "accent" ? { color: accent } : undefined}>{entry.field}</dt><dd className="break-words">{entry.value}</dd></div>)}</dl>)}
          </aside>}
        </div>
      </div>
    </article>
  }
  const toc = layout.showToc && (layout.tocPosition === "top"
    ? <nav aria-label="Sommaire" className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-muted/20 px-3 py-2">
      <span className="mr-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><BookOpen className="size-3.5" />Sommaire</span>
      {rows.map((row) => <a key={row} href={`#${anchor(row)}`} className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:text-primary">{layout.chapterNumbers ? `${numberOf.get(row)}. ` : ""}{nameOf(row) || "Sans nom"}</a>)}
    </nav>
    : <nav aria-label="Sommaire" className="lg:sticky lg:top-4 lg:max-h-[80vh] lg:self-start lg:overflow-y-auto">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><BookOpen className="size-3.5" />Sommaire</p>
      <ol className="grid gap-0.5 border-l pl-3 text-sm" style={{ borderColor: `color-mix(in srgb, ${accent} 40%, transparent)` }}>{rows.map((row) => <li key={row}><a href={`#${anchor(row)}`} className="block truncate py-0.5 text-muted-foreground hover:text-primary">{layout.chapterNumbers ? `${numberOf.get(row)}. ` : ""}{nameOf(row) || "Sans nom"}</a></li>)}</ol>
    </nav>)
  return <div className={layout.showToc && layout.tocPosition !== "top" ? "grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]" : "grid gap-4"}>
    {toc}
    <Sections layout={layout} rows={rows} valueOf={valueOf} nameOf={nameOf} optionsOf={optionsOf} render={(group) => <Paged rows={group} render={(shown) => <div className={`grid ${look.density === "compact" ? "gap-3" : "gap-5"}`}>{shown.map(article)}</div>} />} />
  </div>
}

/* ---------- Tableau de bord ---------- */

const tileGrids = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 xl:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4", 5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5", 6: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" } as const
const tileNumbers = { sm: "text-3xl", md: "text-4xl", lg: "text-5xl" } as const

/** Un anneau de jauge (SVG) : la part remplie à la couleur, le reste discret. */
function Ring({ ratio, color, size = 56, children }: { ratio: number; color: string; size?: number; children?: ReactNode }) {
  const stroke = 6
  const radius = (size - stroke) / 2
  const length = 2 * Math.PI * radius
  return <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`color-mix(in srgb, ${color} 18%, var(--muted))`} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${length * Math.max(0, Math.min(1, ratio))} ${length}`} />
    </svg>
    <span className="absolute inset-0 grid place-items-center text-xs font-semibold tabular-nums">{children}</span>
  </span>
}

/** La jauge d'une tuile (une formule ou une ligne précise, contre une cible) : anneau, barre ou charges. */
function TileGauge({ tile, rows, props, color }: { tile: DashboardTile; rows: string[]; props: ViewLayoutProps; color: string }) {
  const { value, max, row } = tileGaugeValue(tile, rows, props.valueOf, props.nameOf)
  const ratio = max ? value / max : Math.max(0, Math.min(1, value / 100))
  const over = max !== null && value > max
  const tint = over ? "var(--destructive)" : color
  const shown = `${formatViewNumber(value)}${max ? ` / ${formatViewNumber(max)}` : ""}${tile.unit ? ` ${tile.unit}` : ""}`
  const name = row ? <button type="button" onClick={() => props.onOpen(row)} className="text-left text-sm font-semibold hover:underline">{props.nameOf(row)}</button> : null
  if (tile.style === "charges") {
    const total = Math.max(1, Math.min(30, Math.round(max ?? value)))
    const filled = Math.max(0, Math.min(total, Math.round(value)))
    return <div className="mt-2 grid gap-1.5">{name}<span className="flex flex-wrap gap-1">{Array.from({ length: total }, (_, at) => <span key={at} aria-hidden className="size-3.5 rounded-full border-2" style={{ borderColor: tint, backgroundColor: at < filled ? tint : "transparent" }} />)}</span><span className="text-xs tabular-nums text-muted-foreground">{shown}</span></div>
  }
  if (tile.style === "bar") return <div className="mt-2 grid gap-1.5">{name}<span className="block h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${tint} 18%, var(--muted))` }}><span className="block h-full rounded-full transition-[width]" style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`, backgroundColor: tint }} /></span><span className={`text-xs tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}>{shown}</span></div>
  return <div className="mt-2 flex items-center gap-3"><Ring ratio={ratio} color={tint}>{max ? `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)} %` : formatViewNumber(value)}</Ring><span className="grid gap-0.5">{name}<span className={`text-sm tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}>{shown}</span></span></div>
}

/**
 * Le tableau de bord : ses tuiles sur une grille, rangées en sections (repliables si la vue le
 * veut). Un chiffre, une répartition, une jauge, une statistique de l'index, une autre vue de
 * l'onglet, une ligne en carte ou en formulaire, un texte à formules, une tuile par ligne liée.
 */
function DashboardLayout(props: ViewLayoutProps) {
  const { layout, rows, valueOf, nameOf, headers, renderCard, renderForm, renderStat, presentations } = props
  const look = layout.look ?? {}
  const tiles = layout.tiles?.length ? layout.tiles : [{ kind: "count" as const }]
  const grid = tileGrids[layout.tileColumns ?? 3]
  const tileStyle = look.tileStyle ?? "plain"
  const accent = accentOf(look)
  const [closed, setClosed] = useState<Set<string>>(() => new Set(layout.collapsed ? tiles.map((tile) => tile.section ?? "") : []))
  const padding = look.density === "compact" ? "p-3" : look.density === "airy" ? "p-6" : "p-4"
  const span = (tile: DashboardTile) => tile.full ? "col-span-full" : tile.wide ? "sm:col-span-2" : tile.kind === "breakdown" && (layout.tileColumns ?? 3) >= 3 ? "sm:col-span-2 xl:col-span-1" : ""
  const findRow = (name: string | undefined) => name ? rows.find((row) => fold(plain(nameOf(row))) === fold(name)) : undefined
  const kindLabel = (tile: DashboardTile) => dashboardTileKinds.find((kind) => kind.value === tile.kind)?.label ?? ""
  const tileNode = (tile: DashboardTile, index: number) => {
    const color = tile.color ?? accent
    const style: CSSProperties = tileStyle === "tinted" ? { backgroundColor: `color-mix(in srgb, ${color} 10%, var(--card))`, borderColor: `color-mix(in srgb, ${color} 35%, var(--border))` } : tileStyle === "accent" ? { borderTop: `4px solid ${color}` } : {}
    const glyph = tile.icon ? parseGlyphValue(tile.icon) : null
    const label = tile.label || (tile.kind === "count" || tile.kind === "text" || tile.kind === "stat" || tile.kind === "card" ? (tile.kind === "count" ? kindLabel(tile) : "") : tile.kind === "view" ? (tile.view ? viewLayoutKinds.find((kind) => kind.value === tile.view)?.label ?? "" : "Vue") : `${kindLabel(tile)}${tile.column ? ` · ${tile.column}` : ""}`)
    const frame = (children: ReactNode, extra = "") => <article key={index} style={style} className={`relative min-w-0 border bg-card/80 ${boxClass(look)} ${padding} ${span(tile)} ${extra}`}>
      {glyph && <span className="absolute right-3 top-3 grid size-9 place-items-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}><IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className="size-5" /></span>}
      {label && <p className="pr-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>}
      {children}
      {tile.note && <p className="mt-1 text-[11px] text-muted-foreground">{tile.note}</p>}
    </article>
    switch (tile.kind) {
      case "gauge": return frame(<TileGauge tile={tile} rows={rows} props={props} color={color} />)
      case "stat": {
        const drawn = tile.stat ? renderStat?.(tile.stat) : null
        return <div key={index} className={`min-w-0 ${span(tile)}`}>{drawn ?? frame(<p className="mt-2 text-xs text-muted-foreground">{tile.stat ? "Cette statistique se dessine dans l’index et dans les pages." : "Choisis une statistique de l’index dans les réglages de la tuile."}</p>)}</div>
      }
      case "view": {
        const nested: ViewLayout = tile.view && tile.view !== "dashboard" ? presentations?.[tile.view] ?? { kind: tile.view } : { kind: "list" }
        const shown = sortLayoutRows(rows, nested, valueOf).slice(0, tile.limit ?? 10)
        return frame(<div className="mt-2 min-w-0"><IndexViewLayout {...props} layout={nested} rows={shown} presentations={undefined} empty="Aucune ligne." /></div>, tile.wide || tile.full ? "" : "sm:col-span-2 xl:col-span-1")
      }
      case "card": {
        const row = findRow(tile.row)
        const drawn = row ? (tile.form ? renderForm?.(row, tile.form) : renderCard?.(row, tile.card || DEFAULT_ITEM_CARD)) ?? <Item row={row} props={props} framed={false} /> : null
        return drawn && !tile.form ? <div key={index} className={`min-w-0 ${span(tile)}`}>{label && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>}{drawn}</div>
          : frame(drawn ? <div className="mt-2">{drawn}</div> : <p className="mt-2 text-xs text-muted-foreground">{tile.row ? `Aucune ligne nommée « ${tile.row} » dans la vue.` : "Nomme la ligne à montrer dans les réglages de la tuile."}</p>)
      }
      case "text": {
        const segments = textWithFormulas(tile.text ?? "", rows, valueOf, nameOf, headers)
        return frame(<p className={`mt-2 whitespace-pre-line text-sm leading-7 ${look.titleFont === "sans" ? "" : "font-display"}`}>{segments.map((segment, at) => "text" in segment ? <span key={at}>{segment.text}</span> : <b key={at} title={segment.formula} className="rounded px-1 font-semibold tabular-nums" style={{ backgroundColor: `color-mix(in srgb, ${tile.color ?? viewPalette[segment.at % viewPalette.length]} 20%, transparent)`, color: tile.color ?? viewPalette[segment.at % viewPalette.length] }}>{segment.value}</b>)}</p>)
      }
      case "linked": {
        const linked = linkedTiles(tile, rows, valueOf)
        return frame(linked.length
          ? <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{linked.map((entry) => <div key={entry.name} className={`min-w-0 border bg-background/60 p-2.5 ${radii[look.radius ?? "md"]}`}>
            <p className="truncate text-sm font-semibold">{entry.name}</p>
            <dl className="mt-1 grid gap-0.5">{entry.values.map((item, at) => <div key={at} className="flex items-baseline justify-between gap-2 text-xs"><dt className="truncate text-muted-foreground">{item.label}</dt><dd className={`font-semibold tabular-nums ${look.titleFont === "sans" ? "" : "font-display"} text-base`} style={{ color }}>{formatViewNumber(item.value)}{item.unit && <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{item.unit}</span>}</dd></div>)}</dl>
          </div>)}</div>
          : <p className="mt-2 text-xs text-muted-foreground">{tile.column ? "Aucune ligne ne cite cette colonne." : "Choisis la colonne liée (personnage, lieu…) dans les réglages de la tuile."}</p>, "sm:col-span-2")
      }
      default: {
        const result = dashboardTileValue(tile, rows, valueOf)
        const top = Math.max(1, ...result.breakdown.map((entry) => entry.count))
        return frame(tile.kind === "breakdown"
          ? <ul className="mt-3 space-y-1.5">{result.breakdown.map((entry) => <li key={entry.name} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2.5rem] items-center gap-2 text-xs"><span className="truncate">{entry.name}</span><span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${(entry.count / top) * 100}%`, backgroundColor: color }} /></span><span className="text-right tabular-nums text-muted-foreground">{entry.count}</span></li>)}</ul>
          : <p className={`mt-2 font-semibold tabular-nums ${look.titleFont === "sans" ? "" : "font-display"} ${tileNumbers[tile.size ?? (look.titleSize === "sm" ? "sm" : look.titleSize === "lg" ? "lg" : "md")]}`} style={tileStyle !== "plain" || tile.color || look.color ? { color } : undefined}>{formatViewNumber(result.number)}{tile.unit && <span className="ml-1 text-base font-normal text-muted-foreground">{tile.unit}</span>}</p>)
      }
    }
  }
  // Les sections : dans l'ordre où elles apparaissent ; les tuiles sans section d'abord.
  const sections = [...new Set(tiles.map((tile) => tile.section ?? ""))].sort((left, right) => (left ? 1 : 0) - (right ? 1 : 0)).map((name) => ({ name, tiles: tiles.map((tile, index) => ({ tile, index })).filter(({ tile }) => (tile.section ?? "") === name) }))
  const gridOf = (entries: Array<{ tile: DashboardTile; index: number }>) => <div className={`grid ${look.density === "compact" ? "gap-2" : look.density === "airy" ? "gap-4" : "gap-3"} ${grid}`}>{entries.map(({ tile, index }) => tileNode(tile, index))}</div>
  if (sections.length === 1 && !sections[0].name) return gridOf(sections[0].tiles)
  return <div className="grid gap-5">{sections.map((section) => {
    if (!section.name) return <div key="*">{gridOf(section.tiles)}</div>
    const open = !closed.has(section.name)
    const toggle = () => setClosed((current) => { const next = new Set(current); if (next.has(section.name)) next.delete(section.name); else next.add(section.name); return next })
    const head = <span className="flex flex-1 items-center justify-between gap-2"><span className="flex items-center gap-2"><Glyph value={look.sectionIcon} />{section.name}</span><span className="font-normal normal-case tracking-normal text-muted-foreground">{section.tiles.length} tuile{section.tiles.length > 1 ? "s" : ""}</span></span>
    return <section key={section.name} className="space-y-2">
      {layout.collapsible
        ? <button type="button" aria-expanded={open} onClick={toggle} className="flex w-full items-center gap-2 border-b pb-1.5 text-left text-xs font-semibold uppercase tracking-[0.14em] opacity-80 hover:opacity-100" style={{ color: accent }}><ChevronDown className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />{head}</button>
        : <p className="flex items-center gap-2 border-b pb-1.5 text-xs font-semibold uppercase tracking-[0.14em] opacity-80" style={{ color: accent }}>{head}</p>}
      {open && gridOf(section.tiles)}
    </section>
  })}</div>
}

/**
 * La présentation d'un onglet-fenêtre (hors tableau et cartes, que la page dessine elle-même).
 * « Au clic » se décide ici, pour toutes les vues : ouvrir la fiche (d'office), ouvrir la page,
 * afficher à côté (la vue devient un maître-détail), afficher dessous, rien.
 */
export function IndexViewLayout(input: ViewLayoutProps) {
  const [chosen, setChosen] = useState("")
  const click = input.layout.click ?? "sheet"
  const panel = click === "side" || click === "below"
  const openSheet = input.onOpen
  const onOpen = click === "none" ? () => undefined
    : click === "page" ? (input.onOpenPage ?? input.onOpen)
      : panel ? (row: string) => setChosen((current) => current === row && click === "below" ? "" : row)
        : input.onOpen
  const props: ViewLayoutProps = { ...input, rows: sortLayoutRows(input.rows, input.layout, input.valueOf), onOpen, openSheet, inert: click === "none", ...(panel ? { chosen: input.rows.includes(chosen) ? chosen : (click === "side" ? input.rows[0] ?? "" : ""), onChoose: setChosen } : {}) }
  if (!props.rows.length && props.layout.kind !== "dashboard") return <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">{props.empty}</div>
  const body = viewBody(props)
  if (click === "side" && props.layout.kind !== "master-detail") {
    const selected = props.chosen || props.rows[0]
    return <div className={`grid gap-4 ${detailWidths[props.layout.detail?.width ?? "normal"]}`}>
      <div className="min-w-0">{body}</div>
      {selected && <div className="min-w-0 md:sticky md:top-4 md:self-start"><DetailPanel row={selected} rows={props.rows} props={props} /></div>}
    </div>
  }
  // « Dessous » : la liste et le kanban déplient la ligne à sa place ; les autres vues, sous la vue.
  if (click === "below" && props.chosen && props.layout.kind !== "list" && props.layout.kind !== "kanban" && props.layout.kind !== "master-detail") return <div className="grid gap-4">{body}<DetailPanel row={props.chosen} rows={props.rows} props={props} /></div>
  return body
}

function viewBody(props: ViewLayoutProps) {
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
