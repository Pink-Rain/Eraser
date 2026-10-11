"use client"

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  aggregate, describeStatConditions, formatStatNumber, groupOf, groupStatRows, histogramBinChoices, percentChoices, percentOf, prepareStat, rankingTopChoices,
  RANK_COLUMN, rowsWithKey, scatterAxis, squarify, STAT_OTHERS, statBreakdown, statHistogram, statKeyLabel, statScatter, statTable, unitRows,
  type StatColumnGroup, type StatDefinition, type StatForm, type StatTableNode, type StatUnit,
} from "@/lib/index-stats"

/**
 * Le dessin d'une statistique, forme par forme : tuile, jauge, barres, colonnes, classement,
 * anneau, mosaïque, barres empilées (100 %, groupées), flux, tableau croisé, tableau à niveaux,
 * histogramme, nuage de points. Chaque marque se choisit (clic, Entrée ou Espace) : ses lignes
 * vont dans « Les lignes concernées ». Graphiques dessinés à la main, en SVG ou en HTML.
 */

/* ---------- Couleurs (palette catégorielle validée : clarté, chroma, daltonismes, contraste) ---------- */

export const PALETTE = ["#2f63b0", "#d07a12", "#13917a", "#c4473c", "#7652b8", "#5a9418", "#c84d8c", "#2a95c2"]
/** Les teintes proposées pour « une teinte » et le dégradé des tableaux. */
export const SWATCHES: Array<[string, string]> = [["Bleu", "#3b5c8a"], ["Bordeaux", "#682522"], ["Sapin", "#315b55"], ["Ambre", "#b7791f"], ["Violet", "#6b4c9a"], ["Framboise", "#9d174d"]]
export const SEQ = "#3b5c8a"
const CMP = "#b0782a"
export const HL = "#a87a1f"
const OTHERS_COLOR = "#a39a8c"
const EMPTY_COLOR = "#d6cdbd"
const CARD = "#faf7ef"
const INK = "#211e1a"
const INK_2 = "#6d645a"
const INK_3 = "#857b6d"
const LINE = "#d1c6b4"
const LINE_SOFT = "#e4dccd"

const hexRgb = (hex: string) => { const value = hex.replace("#", ""); return [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16)) }
const rgbHex = (rgb: number[]) => `#${rgb.map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0")).join("")}`
export const mix = (left: string, right: string, amount: number) => { const a = hexRgb(left); const b = hexRgb(right); return rgbHex(a.map((value, index) => value + (b[index] - value) * amount)) }
const luminance = (hex: string) => { const [r, g, b] = hexRgb(hex).map((value) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (left: string, right: string) => { const [high, low] = [luminance(left), luminance(right)].sort((a, b) => b - a); return (high + 0.05) / (low + 0.05) }
/** Texte clair ou foncé posé sur une couleur : celui qui contraste le plus. */
const textOn = (background: string) => contrast(background, "#ffffff") >= contrast(background, INK) ? "#ffffff" : INK

/** La case d'un tableau : un dégradé de la teinte choisie, et le texte qui contraste le plus (4,5 au moins). */
export function heat(t: number, ramp = SEQ) {
  let background = mix(CARD, ramp, 0.14 + Math.max(0, Math.min(1, t)) * 0.8)
  const color = textOn(background)
  for (let step = 1; contrast(background, color) < 4.5 && step <= 10; step += 1) background = mix(background, color === "#ffffff" ? "#000000" : "#ffffff", 0.06)
  return { background, color }
}

/** Au-delà des 8 couleurs : la palette reprise en plus clair, puis en plus foncé. */
const paletteColor = (rank: number) => { const base = PALETTE[rank % 8]; const round = Math.floor(rank / 8); return round === 0 ? base : round === 1 ? mix(base, CARD, 0.45) : mix(base, INK, 0.3) }

const HUE_FORMS: readonly StatForm[] = ["number", "gauge", "bars", "columns", "ranking", "histogram", "cross", "table"]
export const colorModeOf = (stat: StatDefinition) => stat.colors?.mode ?? (HUE_FORMS.includes(stat.form) ? "hue" : "column")
export const hueOf = (stat: StatDefinition) => stat.colors?.hue ?? SEQ
export const rampOf = (stat: StatDefinition) => stat.colors?.ramp ?? SEQ
/** La colonne dont les valeurs prennent des couleurs (légende), selon la forme. */
export function colorColumn(stat: StatDefinition) {
  if (["bars", "columns", "ranking", "donut", "treemap", "scatter", "sankey"].includes(stat.form)) return stat.by[0] ?? null
  if (["stacked", "stacked100", "grouped"].includes(stat.form)) return stat.cols?.[0] ?? null
  return null
}

/* ---------- Les données d'une statistique ---------- */

export type StatData = {
  rows: string[]
  valueOf: (rowKey: string, column: string) => string
  tabOf: (rowKey: string) => string
  /** L'ordre des choix d'une colonne liste (colonnes réelles). */
  orderOf: (column: string) => string[]
  colorOf: (column: string, value: string) => string | undefined
  groups: StatColumnGroup[]
  /** Le nom d'une colonne de la phrase (groupes compris). */
  labelOf: (column: string) => string
  /** Le nom d'une ligne. */
  nameOf: (rowKey: string) => string
  numeric: string[]
}

type Unit = StatUnit<string>
export type Prepared = ReturnType<typeof prepareStat<string>>
export type PickRows = (label: string, rows: string[], id: string) => void

export function prepareFor(stat: StatDefinition, data: StatData): Prepared {
  return prepareStat(stat, data.rows, { valueOf: data.valueOf, tabOf: data.tabOf, orderOf: data.orderOf, groups: data.groups })
}

/** La couleur propre d'une valeur dans sa colonne (choix d'une liste ; un groupe prend celle de ses colonnes). */
function ownColor(data: StatData, column: string, label: string) {
  if (column === RANK_COLUMN) return undefined
  const group = groupOf(data.groups, column)
  if (!group) return data.colorOf(column, label)
  for (const member of group.columns) { const color = data.colorOf(member, label); if (color) return color }
  return undefined
}

/** La couleur d'une valeur selon le réglage de la statistique ; « Autres » et « Sans valeur » restent gris. */
export function valueColor(stat: StatDefinition, data: StatData, column: string, part: { key: string; label: string }, rank: number) {
  if (part.key === STAT_OTHERS) return OTHERS_COLOR
  if (!part.key) return EMPTY_COLOR
  const mode = colorModeOf(stat)
  if (mode === "hue") return hueOf(stat)
  if (mode === "value" && stat.colors?.values?.[part.label]) return stat.colors.values[part.label]
  return ownColor(data, column, part.label) ?? paletteColor(rank)
}

export type ResultProps = {
  stat: StatDefinition
  data: StatData
  /** Le calcul déjà fait (le constructeur le partage avec « Les lignes concernées »). */
  prepared?: Prepared
  compact?: boolean
  expanded: Set<string>
  onToggle: (key: string) => void
  onPick?: PickRows
  picked?: string
  /** Les réglages faits dans le résultat (classement, objectif, tranches, couleurs…). */
  onChange?: (stat: StatDefinition) => void
}

type Ctx = ResultProps & { prep: Prepared; pick?: (label: string, units: Unit[], id: string) => void }

const measureWords = { count: "", sum: "somme de", average: "moyenne de", max: "maximum de", min: "minimum de" } as const
export const measureWord = (stat: StatDefinition) => stat.measure === "count" ? "" : `${measureWords[stat.measure]} ${stat.field ?? ""}`
const plural = (count: number, word: string) => `${count.toLocaleString("fr-FR")} ${word}${count > 1 ? "s" : ""}`
/** Ce que compte la statistique : des lignes, ou des emplacements (colonnes regroupées). */
export const unitWord = (slots: number, count = 2) => `${slots ? "emplacement" : "ligne"}${count > 1 ? "s" : ""}`
const short = (value: string, max: number) => value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value
const tick = (value: number) => Math.abs(value) >= 1000 ? `${formatStatNumber(value / 1000)} k` : formatStatNumber(value)
const nameA = (stat: StatDefinition) => stat.where?.length ? "Ces lignes" : "Toutes les lignes"
const nameB = (stat: StatDefinition, data: StatData) => stat.compare === "rest" ? "Le reste" : describeStatConditions(stat.compareWhere, data.labelOf) || "Toutes"

/* ---------- Petites pièces ---------- */

const moreButton = "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-dashed border-[#a87a1f] bg-[#a87a1f]/10 px-2 py-0.5 text-left text-xs font-medium text-foreground hover:border-solid hover:bg-[#a87a1f]/15"
const moreOpen = "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground"
const optionSelect = "max-w-full rounded-md border bg-card px-1.5 py-0.5 text-xs text-foreground"
export const mini = "mx-0.5 inline-flex items-center rounded-lg border border-dashed border-border px-2.5 py-0.5 align-middle font-sans text-[13px] leading-normal text-muted-foreground hover:border-[#3b5c8a] hover:text-foreground"

function MoreToggle({ open, hidden, column, onToggle, collapsedLabel, openLabel }: { open: boolean; hidden: number; column: string; onToggle: () => void; collapsedLabel?: string; openLabel?: string }) {
  if (!hidden) return null
  return <button type="button" aria-expanded={open} onClick={onToggle} className={open ? moreOpen : moreButton}>
    {open ? openLabel ?? `◂ regrouper les ${hidden} valeurs de « ${column} » en « Autres »` : collapsedLabel ?? `▸ déplier les ${hidden} autres valeurs de « ${column} »`}
  </button>
}

const pressKeys = (run: () => void) => (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run() } }

/** Une marque cliquable d'un graphique SVG (clavier compris). */
function Hit({ label, onPick, selected, link, children }: { label: string; onPick?: () => void; selected?: boolean; link?: boolean; children: ReactNode }) {
  if (!onPick) return <g>{children}</g>
  return <g role="button" tabIndex={0} aria-label={label} aria-pressed={selected} className={`stat-hit${link ? " stat-link" : ""}`} onClick={onPick} onKeyDown={pressKeys(onPick)}>{children}</g>
}

/** La largeur d'un graphique suit celle de l'aperçu : le texte garde sa vraie taille, du téléphone au bureau. */
function useChartWidth(compact?: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => { const next = Math.round(Math.max(300, Math.min(680, entry.contentRect.width || 600))); setWidth((current) => current === next ? current : next) })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, compact ? 300 : width] as const
}

const svgText = { fontFamily: "var(--font-sans)", fontSize: 12, fill: INK_2 }
const svgValue = { ...svgText, fill: INK, fontWeight: 600 }

const roundedTop = (x: number, y: number, w: number, h: number, r: number) => h <= 0 ? "" : `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`

/** Le choix de la couleur d'une valeur (légende) : la palette, une couleur libre, ou celle d'office. */
function ColorDot({ color, label, onPick, className = "size-3" }: { color: string; label: string; onPick?: (hex: string | null) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  if (!onPick) return <span className={`${className} shrink-0 rounded-sm`} style={{ backgroundColor: color }} />
  const choose = (hex: string | null) => { setOpen(false); onPick(hex) }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label={`Couleur de « ${label} »`} title={`Choisir la couleur de « ${label} »`} className={`${className} shrink-0 rounded-sm shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_2px_var(--foreground)]`} style={{ backgroundColor: color }} onClick={(event) => event.stopPropagation()} /></PopoverTrigger>
    <PopoverContent align="start" className="grid w-64 gap-2 p-3" onClick={(event) => event.stopPropagation()}>
      <p className="text-xs font-semibold">Couleur de « {label} »</p>
      <div className="flex flex-wrap gap-1.5">{[...SWATCHES.map(([, hex]) => hex), ...PALETTE].filter((hex, index, list) => list.indexOf(hex) === index).map((hex) => <button key={hex} type="button" aria-label={`Couleur ${hex}`} title={hex} onClick={() => choose(hex)} className="size-6 rounded-full border-2 border-card shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_2px_var(--foreground)]" style={{ backgroundColor: hex }} />)}</div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-1.5">Libre<input type="color" defaultValue={color.startsWith("#") ? color : SEQ} onChange={(event) => choose(event.target.value)} className="h-6 w-8 cursor-pointer rounded border bg-card p-px" /></label>
        <button type="button" className={mini} onClick={() => choose(null)}>Rétablir</button>
      </div>
    </PopoverContent>
  </Popover>
}

/** Change la couleur d'une valeur (mode « par valeur ») ; `null` la rend à la colonne. */
function setValueColor(stat: StatDefinition, label: string, hex: string | null): StatDefinition {
  const values = { ...(stat.colors?.values ?? {}) }
  if (hex) values[label] = hex
  else delete values[label]
  return { ...stat, colors: { ...(stat.colors ?? {}), mode: "value", ...(Object.keys(values).length ? { values } : { values: undefined }) } }
}

/** Une légende : une pastille par valeur, cliquable pour choisir sa couleur ; au-delà de 12, le reste se déplie. */
function Legend({ ctx, column, parts, extra }: { ctx: Ctx; column: string; parts: Array<{ key: string; label: string; color: string }>; extra?: ReactNode }) {
  const place = `legend|${column}`
  const open = ctx.expanded.has(place)
  const many = parts.length > 13
  const shown = many && !open ? parts.slice(0, 12) : parts
  const pickable = (part: { key: string; label: string }) => ctx.onChange && part.key && part.key !== STAT_OTHERS ? (hex: string | null) => ctx.onChange!(setValueColor(ctx.stat, part.label, hex)) : undefined
  if (ctx.compact) return <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-muted-foreground">{parts.slice(0, 4).map((part) => <span key={part.key} className="inline-flex min-w-0 items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: part.color }} /><span className="truncate">{statKeyLabel(part)}</span></span>)}</div>
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
    {shown.map((part) => <span key={part.key} className="inline-flex min-w-0 items-center gap-1.5 text-foreground/80"><ColorDot color={part.color} label={statKeyLabel(part)} onPick={pickable(part)} className="size-2.5" /><span className="truncate">{statKeyLabel(part)}</span></span>)}
    {many && <MoreToggle open={open} hidden={parts.length - 12} column={column} onToggle={() => ctx.onToggle(place)} collapsedLabel={`+ ${parts.length - 12} autres valeurs ▸`} openLabel="◂ moins de valeurs" />}
    {extra}
  </div>
}

/** Une note sous le résultat : lignes à plusieurs valeurs, emplacements… */
function multiNote(ctx: Ctx, column: string, parts: Array<{ rows: Unit[] }>, where: string) {
  const { stat, prep } = ctx
  if (stat.measure !== "count") return null
  const rows = unitRows(prep.units).length
  const counted = parts.reduce((total, part) => total + part.rows.length, 0)
  if (prep.size) return <span>{plural(prep.units.length, "emplacement")} pour {plural(rows, "ligne")} : chaque ligne compte une fois par colonne remplie de « {ctx.data.labelOf(column)} ».</span>
  if (!stat.joined && counted > prep.units.length) return <span>{plural(rows, "ligne")}, certaines dans plusieurs {where}.</span>
  return null
}

/* ---------- Le résultat ---------- */

export function StatResult(props: ResultProps) {
  const { stat, data } = props
  const prep = props.prepared ?? prepareFor(stat, data)
  const pick = props.onPick ? (label: string, units: Unit[], id: string) => props.onPick!(label, unitRows(units), id) : undefined
  const ctx: Ctx = { ...props, prep, pick }
  if (!prep.units.length && stat.form !== "number" && stat.form !== "gauge") return <p className="py-8 text-center text-sm text-muted-foreground">Aucune ligne ne remplit ces conditions.</p>
  switch (stat.form) {
    case "number": return <TileResult {...ctx} />
    case "gauge": return <GaugeResult {...ctx} />
    case "bars": return <BarsResult {...ctx} />
    case "columns": return <ColumnsResult {...ctx} />
    case "ranking": return <RankingResult {...ctx} />
    case "donut": return <DonutResult {...ctx} />
    case "treemap": return <TreemapResult {...ctx} />
    case "stacked":
    case "stacked100":
    case "grouped": return <StackedResult {...ctx} />
    case "sankey": return <SankeyResult {...ctx} />
    case "cross": return <CrossResult {...ctx} />
    case "table": return <TableResult {...ctx} />
    case "histogram": return <HistogramResult {...ctx} />
    case "scatter": return <ScatterResult {...ctx} />
  }
}

/* --- Tuile (deux tuiles côte à côte si « comparé à ») --- */

function TileResult({ stat, data, prep, compact, pick, picked }: Ctx) {
  const { units, other, all, valueOf } = prep
  const value = aggregate(stat, units, valueOf)
  const whole = aggregate(stat, all, valueOf)
  const percent = stat.percent === "total"
  const shown = (number: number | null) => percent ? `${Math.round(percentOf(number, whole) ?? 0)} %` : formatStatNumber(number)
  const main = shown(value)
  const hue = hueOf(stat)
  const other_ = other ? aggregate(stat, other, valueOf) : null
  if (compact) return <div className="grid gap-1.5">
    <span className="font-display text-4xl leading-none tabular-nums">{main}</span>
    <span className="block h-1 w-12 rounded-full" style={{ backgroundColor: hue }} />
    {other && <span className="text-xs text-muted-foreground">contre {shown(other_)} · {nameB(stat, data)}</span>}
  </div>
  if (!other) {
    const sub = percent ? `${formatStatNumber(value)} sur ${formatStatNumber(whole)}` : stat.measure === "count" ? `${unitWord(prep.size, units.length)} sur ${all.length.toLocaleString("fr-FR")}` : `${measureWord(stat)} · ${plural(units.length, unitWord(prep.size, 1))}`
    return <div className="grid gap-1.5 py-2">
      <button type="button" onClick={() => pick?.(stat.where?.length ? "Lignes retenues" : "Toutes les lignes", units, "number")} className={`grid w-fit gap-1.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3b5c8a] ${picked === "number" ? "outline-2 outline-offset-4 outline-foreground" : ""}`}>
        <span className="font-display text-6xl leading-none tabular-nums">{main}</span>
        <span className="block h-1 w-14 rounded-full" style={{ backgroundColor: hue }} />
      </button>
      <span className="text-sm text-muted-foreground">{sub}</span>
    </div>
  }
  const gap = value !== null && other_ !== null ? value - other_ : null
  const side = (id: string, label: string, list: Unit[], number: number | null, color: string) => <button type="button" onClick={() => pick?.(label, list, id)} className={`grid min-w-0 gap-0.5 rounded-xl border border-l-4 border-border/70 bg-background px-3 py-2.5 text-left ${picked === id ? "outline-2 outline-offset-1 outline-foreground" : ""}`} style={{ borderLeftColor: color }}>
    <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{label}</span>
    <span className="font-display text-4xl leading-tight tabular-nums">{shown(number)}</span>
  </button>
  return <div className="grid gap-2 py-1">
    <div className="grid items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      {side("side:a", nameA(stat), units, value, hue)}
      <span className="text-center font-display text-muted-foreground italic">contre</span>
      {side("side:b", nameB(stat, data), other, other_, CMP)}
    </div>
    <p className="text-sm text-muted-foreground">Écart : {gap === null ? "—" : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${formatStatNumber(Math.abs(gap))}`}{stat.measure === "count" ? ` ${unitWord(prep.size)}` : ` (${measureWord(stat)})`}</p>
  </div>
}

/* --- Jauge avec objectif --- */

/** Un objectif rond, un peu au-dessus de la valeur, tant qu'aucun n'est choisi. */
const defaultGoal = (value: number) => { const target = Math.max(1, value * 1.25); const power = 10 ** Math.floor(Math.log10(target)); return Math.ceil(target / power) * power }

function GaugeResult({ stat, prep, compact, pick, picked, onChange }: Ctx) {
  const value = aggregate(stat, prep.units, prep.valueOf) ?? 0
  const goal = stat.goal ?? defaultGoal(value)
  const share = Math.min(1, value / Math.max(1e-9, goal))
  const bar = <span className={`block overflow-hidden rounded-full bg-muted ${compact ? "h-2" : "h-3.5"}`} role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={value} aria-label={`${formatStatNumber(value)} sur ${formatStatNumber(goal)}`}><span className="block h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, backgroundColor: hueOf(stat) }} /></span>
  if (compact) return <div className="grid gap-1.5"><span className="font-display text-3xl leading-none tabular-nums">{formatStatNumber(value)} <small className="text-base text-muted-foreground">/ {formatStatNumber(goal)}</small></span>{bar}</div>
  return <div className="grid gap-2.5 py-1.5">
    <div className="flex flex-wrap items-baseline gap-2.5">
      <button type="button" onClick={() => pick?.(nameA(stat), prep.units, "gauge")} className={`rounded-md font-display text-6xl leading-none tabular-nums ${picked === "gauge" ? "outline-2 outline-offset-4 outline-foreground" : ""}`}>{formatStatNumber(value)}</button>
      {!onChange ? <span className="text-sm text-muted-foreground">sur un objectif de {formatStatNumber(goal)}</span> : <label className="text-sm text-muted-foreground">sur un objectif de <input key={stat.id} type="number" min={1} step="any" defaultValue={goal} aria-label="Objectif" onChange={(event) => { const next = Number(event.target.value.replace(",", ".")); if (Number.isFinite(next) && next > 0) onChange?.({ ...stat, goal: next }) }} className="ml-1 w-24 rounded-lg border bg-card px-2 py-0.5 text-foreground" /></label>}
    </div>
    {bar}
    <p className="text-sm text-muted-foreground">{value >= goal ? "Objectif atteint." : `Encore ${formatStatNumber(Math.round((goal - value) * 100) / 100)} pour l’atteindre.`}</p>
  </div>
}

/* --- Barres (une colonne ; paires si « comparé à ») --- */

type BarItem = { id: string; key: string; label: string; value: number | null; shown: number | null; color: string; rows: Unit[]; revealed?: boolean; rank?: number; second?: { value: number | null; shown: number | null; rows: Unit[] } }

function BarList({ items, compact, onPick, picked, percent }: { items: BarItem[]; compact?: boolean; onPick?: (item: BarItem, second?: boolean) => void; picked?: string; percent?: boolean }) {
  const max = Math.max(1e-9, ...items.flatMap((item) => [item.shown ?? 0, item.second?.shown ?? 0]))
  const text = (shown: number | null, value: number | null) => shown === null ? "—" : percent ? `${Math.round(shown)} %` : formatStatNumber(value)
  return <ol className={`grid ${compact ? "gap-1" : "gap-0.5"}`}>
    {items.map((item) => {
      const track = (shown: number | null, color: string, thin?: boolean) => <span className={`${compact ? "h-2" : thin ? "h-2" : "h-3"} overflow-hidden rounded-full bg-muted`}><span className="block h-full rounded-full" style={{ width: `${((shown ?? 0) / max) * 100}%`, minWidth: shown ? 2 : 0, backgroundColor: color }} /></span>
      const grid = item.rank !== undefined ? "grid-cols-[1.5rem_minmax(0,11rem)_minmax(2.5rem,1fr)_4.5rem]" : compact ? "grid-cols-[minmax(0,7rem)_minmax(2rem,1fr)_3.5rem]" : "grid-cols-[minmax(0,12rem)_minmax(2.5rem,1fr)_4.5rem]"
      if (item.second) {
        // Comparaison : deux barres fines par valeur (la série, puis l'autre), chacune cliquable.
        const line = (second: boolean) => {
          const entry = second ? item.second! : item
          const id = `${item.id}${second ? ":b" : ""}`
          const look = `grid w-full grid-cols-[minmax(2.5rem,1fr)_4.5rem] items-center gap-2 rounded-md px-1 text-left ${compact ? "text-xs" : "text-[12.5px]"}`
          const inner = <>{track(entry.shown, second ? CMP : item.color, true)}<span className="text-right font-semibold tabular-nums">{text(entry.shown, entry.value)}</span></>
          return compact || !onPick ? <span className={look}>{inner}</span> : <button type="button" title={`${item.label} — ${text(entry.shown, entry.value)}`} onClick={() => onPick(item, second)} className={`${look} hover:bg-muted ${picked === id ? "bg-muted shadow-[inset_0_0_0_2px_var(--foreground)]" : ""}`}>{inner}</button>
        }
        return <li key={item.id} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-2 py-0.5 text-[13px]"><span className="truncate">{item.label}</span><span className="grid gap-px">{line(false)}{line(true)}</span></li>
      }
      const body = <>
        {item.rank !== undefined && <span className="text-right text-xs tabular-nums text-muted-foreground">{item.rank}</span>}
        <span className={`truncate ${item.revealed ? "italic" : ""}`}>{item.label}</span>
        {track(item.shown, item.color)}
        <span className="text-right font-semibold tabular-nums">{text(item.shown, item.value)}</span>
      </>
      return <li key={item.id}>
        {compact || !onPick
          ? <div className={`grid ${grid} items-center gap-2 text-xs`}>{body}</div>
          : <button type="button" title={`${item.label} — ${text(item.shown, item.value)}`} onClick={() => onPick(item)} className={`grid w-full ${grid} items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] hover:bg-muted focus-visible:outline-2 focus-visible:outline-[#3b5c8a] ${picked === item.id ? "bg-muted shadow-[inset_0_0_0_2px_var(--foreground)]" : ""}`}>{body}</button>}
      </li>
    })}
  </ol>
}

/** Les valeurs d'une colonne pour une ou deux séries (comparaison), « Autres » au-delà de `limit`. */
function seriesItems(ctx: Ctx, column: string, limit: number, place: string) {
  const { stat, data, prep } = ctx
  const open = ctx.expanded.has(place) && !ctx.compact
  const a = statBreakdown(stat, prep.units, prep.valueOf, { column, order: prep.orderOf(column), limit, expanded: open, byValue: true })
  const percent = stat.percent === "total"
  const totalA = aggregate(stat, prep.units, prep.valueOf)
  const other = prep.other
  const b = other ? groupStatRows(other, prep.valueOf, column, { keep: a.keep, whole: Boolean(stat.joined) }) : []
  const totalB = other ? aggregate(stat, other, prep.valueOf) : null
  const keys = [...a.parts]
  for (const group of b) if (!keys.some((part) => part.key === group.key)) keys.push({ ...group, rows: [], value: null })
  const items: BarItem[] = keys.map((part, index) => {
    const second = other ? b.find((group) => group.key === part.key) : undefined
    const valueB = second ? aggregate(stat, second.rows, prep.valueOf) : null
    return {
      id: `bar:${part.key}`, key: part.key, label: statKeyLabel(part), value: part.value, shown: percent ? percentOf(part.value, totalA) : part.value,
      color: other ? hueOf(stat) : valueColor(stat, data, column, part, index), rows: part.rows, revealed: a.revealed(part.key),
      ...(other ? { second: { value: valueB, shown: percent ? percentOf(valueB, totalB) : valueB, rows: second?.rows ?? [] } } : {}),
    }
  })
  return { items, hidden: a.hidden, open, percent, parts: a.parts }
}

function BarsResult(ctx: Ctx) {
  const { stat, data, compact, pick, picked, prep } = ctx
  const column = stat.by[0]
  const place = `bars|${column}`
  const { items, hidden, open, percent, parts } = seriesItems(ctx, column, compact ? 5 : 12, place)
  const label = data.labelOf(column)
  const onPick = pick ? (item: BarItem, second?: boolean) => pick(`${second ? `${nameB(stat, data)} · ` : prep.other ? `${nameA(stat)} · ` : ""}${label} : ${item.label}`, second ? item.second!.rows : item.rows, `${item.id}${second ? ":b" : ""}`) : undefined
  return <div className="grid gap-2">
    <BarList items={items} compact={compact} onPick={onPick} picked={picked} percent={percent} />
    {!compact && <div className="grid gap-1.5 text-xs text-muted-foreground">
      {!prep.other && colorModeOf(stat) !== "hue" && <Legend ctx={ctx} column={column} parts={items.map((item) => ({ key: item.key, label: item.label, color: item.color }))} />}
      <div className="flex flex-wrap items-center gap-2">
        <MoreToggle open={open} hidden={hidden} column={label} onToggle={() => ctx.onToggle(place)} />
        {prep.other && <><span className="inline-flex items-center gap-1.5 text-foreground/80"><span className="size-2.5 rounded-sm" style={{ backgroundColor: hueOf(stat) }} />{nameA(stat)}</span><span className="inline-flex items-center gap-1.5 text-foreground/80"><span className="size-2.5 rounded-sm" style={{ backgroundColor: CMP }} />{nameB(stat, data)}</span>{percent && <span>· chaque série en part de son propre total</span>}</>}
        {multiNote(ctx, column, parts, "barres")}
      </div>
    </div>}
  </div>
}

/* --- Colonnes verticales --- */

function ColumnsResult(ctx: Ctx) {
  const { stat, data, compact, pick, picked, prep } = ctx
  const column = stat.by[0]
  const place = `columns|${column}`
  const [ref, width] = useChartWidth(compact)
  const { items, hidden, open, percent, parts } = seriesItems(ctx, column, 10, place)
  const label = data.labelOf(column)
  const height = compact ? 110 : 270
  const bottom = compact ? 8 : 54
  const top = 18
  const left = 6
  const series = prep.other ? 2 : 1
  const slot = (width - left) / Math.max(1, items.length)
  const barWidth = Math.max(4, Math.min(46, (slot - 10) / series))
  const max = Math.max(1e-9, ...items.flatMap((item) => [item.shown ?? 0, item.second?.shown ?? 0]))
  const text = (shown: number | null, value: number | null) => shown === null ? "—" : percent ? `${Math.round(shown)} %` : formatStatNumber(value)
  const tilted = items.length > 7
  return <div ref={ref} className="grid min-w-0 gap-2">
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`${measureWord(stat) || "Nombre"} par ${label}, en colonnes`} className="block max-w-[680px] overflow-visible">
      <line x1={left} x2={width} y1={height - bottom + 0.5} y2={height - bottom + 0.5} stroke={LINE} />
      {items.map((item, index) => {
        const center = left + slot * index + slot / 2
        const entries = [{ id: item.id, shown: item.shown, value: item.value, color: item.color, rows: item.rows, name: prep.other ? nameA(stat) : "" }, ...(item.second ? [{ id: `${item.id}:b`, shown: item.second.shown, value: item.second.value, color: CMP, rows: item.second.rows, name: nameB(stat, data) }] : [])]
        return <g key={item.id}>
          {entries.map((entry, at) => {
            const h = ((height - bottom - top) * (entry.shown ?? 0)) / max
            const x = center - (barWidth * series) / 2 + at * (barWidth + 1)
            return <Hit key={entry.id} label={`${entry.name ? `${entry.name} · ` : ""}${item.label} — ${text(entry.shown, entry.value)}`} onPick={pick && !compact ? () => pick(`${entry.name ? `${entry.name} · ` : ""}${label} : ${item.label}`, entry.rows, entry.id) : undefined} selected={picked === entry.id}>
              <rect x={center - slot / 2 + 1} y={top - 14} width={Math.max(0, slot - 2)} height={height - bottom - top + 14} fill="transparent" />
              <path className="stat-mark" d={roundedTop(x, height - bottom - h, barWidth, h, Math.min(3, h))} fill={entry.color} />
              {!compact && <text x={x + barWidth / 2} y={height - bottom - h - 5} textAnchor="middle" style={svgValue}>{text(entry.shown, entry.value)}</text>}
              <title>{`${entry.name ? `${entry.name} · ` : ""}${item.label} — ${text(entry.shown, entry.value)}`}</title>
            </Hit>
          })}
          {!compact && <text x={center} y={height - bottom + 14} textAnchor={tilted ? "end" : "middle"} transform={tilted ? `rotate(-35 ${center} ${height - bottom + 14})` : undefined} style={svgText}>{short(item.label, tilted ? 14 : Math.max(6, Math.floor(slot / 7)))}</text>}
        </g>
      })}
    </svg>
    {!compact && <div className="grid gap-1.5 text-xs text-muted-foreground">
      {!prep.other && colorModeOf(stat) !== "hue" && <Legend ctx={ctx} column={column} parts={items.map((item) => ({ key: item.key, label: item.label, color: item.color }))} />}
      <div className="flex flex-wrap items-center gap-2">
        <MoreToggle open={open} hidden={hidden} column={label} onToggle={() => ctx.onToggle(place)} />
        {prep.other && <><span className="inline-flex items-center gap-1.5 text-foreground/80"><span className="size-2.5 rounded-sm" style={{ backgroundColor: hueOf(stat) }} />{nameA(stat)}</span><span className="inline-flex items-center gap-1.5 text-foreground/80"><span className="size-2.5 rounded-sm" style={{ backgroundColor: CMP }} />{nameB(stat, data)}</span></>}
        {multiNote(ctx, column, parts, "colonnes")}
      </div>
    </div>}
  </div>
}

/* --- Classement --- */

function RankingResult(ctx: Ctx) {
  const { stat, data, prep, compact, expanded, onToggle, pick, picked, onChange } = ctx
  const column = stat.by[0]
  const label = data.labelOf(column)
  const place = `ranking|${column}`
  const open = expanded.has(place)
  const top = stat.top ?? 10
  const { parts } = statBreakdown(stat, prep.units, prep.valueOf, { column, byValue: true })
  const ranked = parts.filter((part) => part.value !== null && part.key).sort((left, right) => (right.value ?? 0) - (left.value ?? 0))
  const shown = ranked.slice(0, compact ? 4 : open ? ranked.length : top)
  const hidden = ranked.length - top
  const items: BarItem[] = shown.map((part, index) => ({ id: `rank:${part.key}`, key: part.key, label: statKeyLabel(part), value: part.value, shown: part.value, color: valueColor(stat, data, column, part, index), rows: part.rows, rank: index + 1, revealed: index >= top }))
  return <div className="grid gap-2">
    {!compact && onChange && <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Garder les<select value={top} aria-label="Nombre de valeurs classées" onChange={(event) => onChange({ ...stat, top: Number(event.target.value) })} className={optionSelect}>{rankingTopChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select>premières</label>}
    <BarList items={items} compact={compact} onPick={pick ? (item) => pick(`${label} : ${item.label}`, item.rows, item.id) : undefined} picked={picked} />
    {!compact && hidden > 0 && <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {open ? `les ${ranked.length} valeurs de « ${label} »` : `et ${hidden} autre${hidden > 1 ? "s valeurs" : " valeur"} de « ${label} »`}
      <MoreToggle open={open} hidden={hidden} column={label} onToggle={() => onToggle(place)} collapsedLabel={`+ ${hidden} ▸`} openLabel={`◂ ne garder que les ${top} premières`} />
    </p>}
    {!compact && colorModeOf(stat) !== "hue" && <Legend ctx={ctx} column={column} parts={items.map((item) => ({ key: item.key, label: item.label, color: item.color }))} />}
  </div>
}

/* --- Anneau --- */

function arc(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const sweep = Math.min(end - start, Math.PI * 2 - 1e-4)
  const stop = start + sweep
  const large = sweep > Math.PI ? 1 : 0
  const point = (radius: number, angle: number) => `${cx + radius * Math.cos(angle)} ${cy + radius * Math.sin(angle)}`
  return `M${point(outer, start)}A${outer} ${outer} 0 ${large} 1 ${point(outer, stop)}L${point(inner, stop)}A${inner} ${inner} 0 ${large} 0 ${point(inner, start)}Z`
}

function DonutResult(ctx: Ctx) {
  const { stat, data, prep, compact, expanded, onToggle, pick, picked, onChange } = ctx
  const column = stat.by[0]
  const label = data.labelOf(column)
  const place = `donut|${column}`
  const open = expanded.has(place) && !compact
  const { parts: all } = statBreakdown(stat, prep.units, prep.valueOf, { column, byValue: true })
  const positive = all.filter((part) => (part.value ?? 0) > 0)
  // Huit parts au plus : les sept plus grosses, puis « Autres » (dépliable dans la liste ou dans l'anneau).
  const many = positive.length > 8
  const kept = many && !open ? positive.slice(0, 7) : positive
  const rest = many ? positive.slice(7) : []
  const parts = many && !open ? [...kept, { key: STAT_OTHERS, label: "", rows: [...new Set(rest.flatMap((part) => part.rows))], value: rest.reduce((total, part) => total + (part.value ?? 0), 0) }] : kept
  const ranks = new Map(positive.filter((part) => part.key && part.key !== STAT_OTHERS).map((part, index) => [part.key, index]))
  const colorFor = (part: { key: string; label: string }) => valueColor(stat, data, column, part, ranks.get(part.key) ?? 0)
  const sum = parts.reduce((total, part) => total + (part.value ?? 0), 0) || 1
  const total = aggregate(stat, prep.units, prep.valueOf)
  const [listOpen, setListOpen] = useState(false)
  // Les angles de chaque part, cumulés depuis midi.
  const starts = parts.map((_, index) => -Math.PI / 2 + parts.slice(0, index).reduce((sumSoFar, part) => sumSoFar + ((part.value ?? 0) / sum) * Math.PI * 2, 0))
  const ring = <svg viewBox="0 0 240 240" className={compact ? "w-28" : "w-full max-w-60"} role="img" aria-label={`Part de chaque ${label}`}>
    {parts.map((part, index) => {
      const start = starts[index]
      const id = `part:${part.key}`
      return <Hit key={id} label={`${statKeyLabel(part)} — ${formatStatNumber(part.value)} (${Math.round(((part.value ?? 0) / sum) * 100)} %)`} onPick={pick && !compact ? () => pick(`${label} : ${statKeyLabel(part)}`, part.rows, id) : undefined} selected={picked === id}>
        <path className="stat-mark" d={arc(120, 120, 108, 66, start, start + ((part.value ?? 0) / sum) * Math.PI * 2)} fill={colorFor(part)} stroke={CARD} strokeWidth={parts.length > 16 ? 1 : 2} />
        <title>{`${statKeyLabel(part)} — ${formatStatNumber(part.value)} (${Math.round(((part.value ?? 0) / sum) * 100)} %)`}</title>
      </Hit>
    })}
    <text x="120" y="124" textAnchor="middle" fontFamily="Georgia, serif" fontSize="30" fill="currentColor">{formatStatNumber(total)}</text>
    {!compact && <text x="120" y="146" textAnchor="middle" fontSize="12" fill={INK_2}>{stat.measure === "count" ? unitWord(prep.size) : measureWord(stat)}</text>}
  </svg>
  if (compact) return <div className="flex items-center gap-3">{ring}<ul className="grid min-w-0 gap-0.5 text-xs">{parts.slice(0, 4).map((part) => <li key={part.key} className="flex min-w-0 items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colorFor(part) }} /><span className="truncate">{statKeyLabel(part)}</span></li>)}</ul></div>
  const percentText = (value: number | null) => `${Math.round(((value ?? 0) / sum) * 100)} %`
  const line = (part: { key: string; label: string; rows: Unit[]; value: number | null }, revealedPart = false, nested = false) => {
    const id = `part:${part.key}`
    const pickable = !nested && onChange && part.key && part.key !== STAT_OTHERS ? (hex: string | null) => onChange(setValueColor(stat, part.label, hex)) : undefined
    return <div className={`grid w-full grid-cols-[0.75rem_minmax(0,1fr)_auto_3.2rem] items-center gap-2 rounded-md px-1.5 py-0.5 text-[13px] hover:bg-muted ${picked === id ? "bg-muted shadow-[inset_0_0_0_2px_var(--foreground)]" : ""}`}>
      <ColorDot color={nested ? OTHERS_COLOR : colorFor(part)} label={statKeyLabel(part)} onPick={pickable} />
      <button type="button" onClick={() => pick?.(`${label} : ${statKeyLabel(part)}`, part.rows, id)} className={`truncate rounded text-left hover:underline ${revealedPart ? "italic" : ""}`}>{part.key === STAT_OTHERS ? `Autres (${rest.length})` : statKeyLabel(part)}</button>
      <span className="text-right font-semibold tabular-nums">{formatStatNumber(part.value)}</span>
      <span className="text-right tabular-nums text-muted-foreground">{percentText(part.value)}</span>
    </div>
  }
  // Selon la place de la carte (et non de l'écran) : un tiers de ligne empile l'anneau et sa légende.
  return <div className="@container"><div className="grid items-start gap-4 @lg:grid-cols-[minmax(0,15rem)_minmax(0,34rem)]">
    <div className="mx-auto w-full max-w-60">{ring}</div>
    <div className="grid min-w-0 justify-items-start gap-2">
      <ul className={`grid w-full gap-0.5 ${parts.length > 12 ? "max-h-96 overflow-auto pr-1" : ""}`}>
        {parts.map((part) => <li key={part.key}>
          {line(part, open && (ranks.get(part.key) ?? 0) >= 7)}
          {part.key === STAT_OTHERS && <div className="grid justify-items-start gap-1.5 py-1 pl-6">
            <MoreToggle open={listOpen} hidden={rest.length} column={label} onToggle={() => setListOpen((value) => !value)} collapsedLabel={`▸ détailler les ${rest.length} valeurs d’« Autres »`} openLabel="◂ replier le détail d’« Autres »" />
            {listOpen && <ul aria-label={`Les ${rest.length} valeurs regroupées dans « Autres »`} className="grid w-full gap-px border-l-2 border-[#a87a1f] pl-2">{rest.map((entry) => <li key={entry.key}>{line(entry, false, true)}</li>)}</ul>}
            <MoreToggle open={false} hidden={rest.length} column={label} onToggle={() => onToggle(place)} collapsedLabel={`▸ montrer toutes les parts (${positive.length}) dans l’anneau`} />
          </div>}
        </li>)}
      </ul>
      {open && <MoreToggle open hidden={positive.length - 7} column={label} onToggle={() => onToggle(place)} openLabel={`◂ regrouper les ${positive.length - 7} plus petites parts en « Autres »`} />}
      <p className="text-xs text-muted-foreground">{multiNote(ctx, column, all, "parts")}</p>
    </div>
  </div></div>
}

/* --- Mosaïque (treemap) : une ou deux colonnes imbriquées (Type › Sous-type) --- */

function TreemapResult(ctx: Ctx) {
  const { stat, data, prep, compact, expanded, onToggle, pick, picked } = ctx
  const [first, second] = stat.by
  const [ref, width] = useChartWidth(compact)
  const height = compact ? 170 : Math.round(Math.min(360, width * 0.8))
  const place = `treemap|${first}`
  const open = expanded.has(place) && !compact
  // Au-delà de 9 valeurs : les 8 plus fréquentes (8 couleurs), le reste en « Autres » (dépliable).
  const breakdown = statBreakdown(stat, prep.units, prep.valueOf, { column: first, order: prep.orderOf(first), limit: 8, expanded: open, byValue: true })
  const parents = breakdown.parts.map((part, index) => {
    const children = second ? groupStatRows(part.rows, prep.valueOf, second, { order: prep.orderOf(second), whole: Boolean(stat.joined) }).map((group) => ({ key: group.key, label: group.label, rows: group.rows, value: aggregate(stat, group.rows, prep.valueOf) ?? 0 })).filter((child) => child.value > 0) : []
    return { key: part.key, label: part.label, rows: part.rows, rank: index, children, value: second ? children.reduce((sum, child) => sum + child.value, 0) : part.value ?? 0 }
  }).filter((parent) => parent.value > 0)
  const labelA = data.labelOf(first)
  const labelB = second ? data.labelOf(second) : ""
  const boxes = squarify(parents, 0, 0, width, height)
  return <div ref={ref} className="grid min-w-0 gap-2">
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`Mosaïque ${stat.by.map(data.labelOf).join(" › ")}`} className="block max-w-[680px]">
      {boxes.map((box) => {
        const color = valueColor(stat, data, first, box, box.rank)
        const fill = second ? mix(color, CARD, 0.55) : color
        const head = second && box.h > 34 && box.w > 50 ? 18 : 0
        const id = `tile:${box.key}`
        return <g key={box.key}>
          <Hit label={`${labelA} : ${statKeyLabel(box)} — ${formatStatNumber(box.value)}`} onPick={pick && !compact ? () => pick(`${labelA} : ${statKeyLabel(box)}`, box.rows, id) : undefined} selected={picked === id}>
            <rect className="stat-mark" x={box.x + 1} y={box.y + 1} width={Math.max(0, box.w - 2)} height={Math.max(0, box.h - 2)} fill={fill} rx={3} />
            <title>{`${labelA} : ${statKeyLabel(box)} — ${formatStatNumber(box.value)}`}</title>
          </Hit>
          {second && squarify(box.children, box.x + 3, box.y + 3 + head, Math.max(0, box.w - 6), Math.max(0, box.h - 6 - head)).map((child, index) => {
            const childFill = mix(color, CARD, (index % 3) * 0.14)
            const childId = `tile:${box.key}:${child.key}`
            return <Hit key={child.key} label={`${statKeyLabel(box)} › ${statKeyLabel(child)} — ${formatStatNumber(child.value)}`} onPick={pick && !compact ? () => pick(`${labelA} : ${statKeyLabel(box)} · ${labelB} : ${statKeyLabel(child)}`, child.rows, childId) : undefined} selected={picked === childId}>
              <rect className="stat-mark" x={child.x + 1} y={child.y + 1} width={Math.max(0, child.w - 2)} height={Math.max(0, child.h - 2)} fill={childFill} rx={2} />
              {child.w > 54 && child.h > 30 && !compact && <><text x={child.x + 6} y={child.y + 15} style={{ ...svgText, fill: textOn(childFill), fontSize: 11.5, fontWeight: 600 }}>{short(statKeyLabel(child), Math.floor(child.w / 6.5))}</text><text x={child.x + 6} y={child.y + 28} style={{ ...svgText, fill: textOn(childFill), fontSize: 10.5 }}>{formatStatNumber(child.value)}</text></>}
              <title>{`${statKeyLabel(box)} › ${statKeyLabel(child)} — ${formatStatNumber(child.value)}`}</title>
            </Hit>
          })}
          {box.w > 44 && box.h > 18 && <text x={box.x + 6} y={box.y + 14} pointerEvents="none" style={{ ...svgText, fill: textOn(fill), fontWeight: 700 }}>{`${short(statKeyLabel(box), Math.floor(box.w / 7))}${!second && box.h > 34 ? "" : ` · ${formatStatNumber(box.value)}`}`}</text>}
          {!second && box.w > 44 && box.h > 34 && <text x={box.x + 6} y={box.y + 29} pointerEvents="none" style={{ ...svgText, fill: textOn(fill), fontSize: 10.5 }}>{formatStatNumber(box.value)}</text>}
        </g>
      })}
    </svg>
    {!compact && <Legend ctx={ctx} column={first} parts={parents.map((parent) => ({ key: parent.key, label: statKeyLabel(parent), color: valueColor(stat, data, first, parent, parent.rank) }))} extra={<MoreToggle open={open} hidden={breakdown.hidden} column={labelA} onToggle={() => onToggle(place)} />} />}
  </div>
}

/* --- Barres empilées, empilées 100 %, groupées : les barres par une colonne, les morceaux par une autre --- */

function StackedResult(ctx: Ctx) {
  const { stat, data, prep, compact, expanded, onToggle, pick, picked } = ctx
  const first = stat.by[0]
  const second = stat.cols?.[0] ?? ""
  const labelA = data.labelOf(first)
  const labelB = data.labelOf(second)
  const place = `stack|${second}`
  const open = expanded.has(place) && !compact
  const table = statTable({ ...stat, by: [first], cols: [second], blocks: undefined }, prep.units, prep.valueOf, { orderOf: prep.orderOf, expanded: () => open })
  const segments = (table.headers[0] ?? []).map((header, index) => ({ key: header.key, label: statKeyLabel(header), color: valueColor(stat, data, second, header, index) }))
  const hundred = stat.form === "stacked100"
  const grouped = stat.form === "grouped"
  const lines = table.total.children.slice(0, compact ? 5 : undefined).map((node) => {
    const sum = node.cells.reduce((total, cell) => total + (cell.value ?? 0), 0)
    return { node, sum, items: node.cells.map((cell, index) => ({ ...segments[index], value: cell.value, rows: cell.rows, shown: hundred ? (cell.value === null || !sum ? null : (cell.value / sum) * 100) : cell.value })) }
  })
  const max = Math.max(1e-9, ...lines.map((line) => grouped ? Math.max(0, ...line.items.map((item) => item.shown ?? 0)) : hundred ? 100 : line.items.reduce((total, item) => total + (item.shown ?? 0), 0)))
  const text = (shown: number | null, value: number | null) => shown === null ? "—" : hundred ? `${Math.round(shown)} %` : formatStatNumber(value)
  return <div className="grid min-w-0 gap-2.5">
    <ol className={`grid ${compact ? "gap-1" : "gap-1.5"}`} aria-label={`${labelA} par ${labelB}`}>
      {lines.map((line) => <li key={line.node.key} className={`grid ${compact ? "grid-cols-[minmax(0,6rem)_minmax(0,1fr)] text-xs" : "grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] text-[13px]"} items-center gap-2`}>
        <span className="truncate" title={statKeyLabel(line.node)}>{statKeyLabel(line.node)}</span>
        {grouped
          ? <span className="grid gap-px">{line.items.filter((item) => item.value !== null).map((item) => {
            const id = `seg:${line.node.key}:${item.key}`
            const inner = <><span className="h-2 rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${((item.shown ?? 0) / max) * 100}%`, minWidth: 2, backgroundColor: item.color }} /></span><span className="text-right font-semibold tabular-nums">{text(item.shown, item.value)}</span></>
            const look = "grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-1.5 rounded px-0.5 text-left text-[11.5px]"
            return compact || !pick ? <span key={item.key} className={look}>{inner}</span> : <button key={item.key} type="button" onClick={() => pick(`${labelA} : ${statKeyLabel(line.node)} · ${labelB} : ${item.label}`, item.rows, id)} title={`${item.label} · ${statKeyLabel(line.node)} — ${text(item.shown, item.value)}`} className={`${look} ${picked === id ? "bg-muted shadow-[inset_0_0_0_2px_var(--foreground)]" : "hover:bg-muted"}`}>{inner}</button>
          })}</span>
          : <span className={`flex ${compact ? "h-2.5" : "h-5"} overflow-hidden rounded-md bg-muted`} style={{ width: hundred ? "100%" : `${(line.sum / max) * 100}%`, minWidth: 4 }}>
            {line.items.filter((item) => (item.shown ?? 0) > 0).map((item) => {
              const id = `seg:${line.node.key}:${item.key}`
              const share = hundred ? item.shown ?? 0 : ((item.shown ?? 0) / Math.max(1e-9, line.sum)) * 100
              const look = `h-full min-w-[2px] overflow-hidden border-r-2 border-card text-[11px] font-semibold whitespace-nowrap last:border-r-0 ${picked === id ? "outline-2 -outline-offset-2 outline-foreground" : "hover:brightness-110"}`
              const style = { width: `${share}%`, backgroundColor: item.color, color: textOn(item.color) }
              const title = `${item.label} · ${statKeyLabel(line.node)} — ${text(item.shown, item.value)}`
              return compact || !pick ? <span key={item.key} className={look} style={style} title={title} /> : <button key={item.key} type="button" onClick={() => pick(`${labelA} : ${statKeyLabel(line.node)} · ${labelB} : ${item.label}`, item.rows, id)} title={title} aria-label={title} className={look} style={style}>
                {share > 14 ? text(item.shown, item.value) : null}
              </button>
            })}
          </span>}
        {!compact && <button type="button" disabled={!pick} onClick={() => pick?.(`${labelA} : ${statKeyLabel(line.node)}`, line.node.rows, `line:${line.node.key}`)} className={`rounded px-1 text-right font-semibold tabular-nums ${picked === `line:${line.node.key}` ? "bg-muted shadow-[inset_0_0_0_2px_var(--foreground)]" : "hover:bg-muted"}`}>{hundred ? "100 %" : formatStatNumber(line.node.total)}</button>}
      </li>)}
    </ol>
    <Legend ctx={ctx} column={second} parts={segments} extra={!compact && <>{hundred && <span>· chaque barre fait 100 %</span>}<MoreToggle open={open} hidden={table.hidden[0] ?? 0} column={labelB} onToggle={() => onToggle(place)} /></>} />
  </div>
}

/* --- Flux : de la première colonne vers la seconde --- */

function SankeyResult(ctx: Ctx) {
  const { stat, data, prep, compact, expanded, onToggle, pick, picked } = ctx
  const first = stat.by[0]
  const second = stat.cols?.[0] ?? stat.by[1]
  const labelA = data.labelOf(first)
  const labelB = data.labelOf(second)
  const whole = Boolean(stat.joined)
  const [ref, width] = useChartWidth(compact)
  const placeA = `sankey|a|${first}`
  const placeB = `sankey|b|${second}`
  const left = statBreakdown(stat, prep.units, prep.valueOf, { column: first, order: prep.orderOf(first), limit: 10, expanded: expanded.has(placeA) })
  const right = statBreakdown(stat, prep.units, prep.valueOf, { column: second, order: prep.orderOf(second), limit: stat.top || 8, expanded: expanded.has(placeB) })
  const links = left.parts.flatMap((from) => right.parts.flatMap((to) => {
    const rows = rowsWithKey(from.rows, prep.valueOf, second, to.key, { keep: right.keep, whole })
    const value = rows.length ? aggregate(stat, rows, prep.valueOf) ?? 0 : 0
    return value > 0 ? [{ from, to, value, rows }] : []
  }))
  const outValue = new Map<string, number>()
  const inValue = new Map<string, number>()
  for (const link of links) { outValue.set(link.from.key, (outValue.get(link.from.key) ?? 0) + link.value); inValue.set(link.to.key, (inValue.get(link.to.key) ?? 0) + link.value) }
  const total = links.reduce((sum, link) => sum + link.value, 0)
  const leftParts = left.parts.filter((part) => outValue.get(part.key))
  const rightParts = right.parts.filter((part) => inValue.get(part.key))
  const gap = compact ? 3 : 6
  const nodeWidth = compact ? 7 : 10
  const height = compact ? 170 : Math.max(260, Math.max(leftParts.length, rightParts.length) * 30)
  const scale = (height - gap * (Math.max(leftParts.length, rightParts.length) - 1)) / Math.max(1, total)
  const leftX = compact ? 84 : Math.min(150, width * 0.3)
  const rightX = width - (compact ? 84 : Math.min(160, width * 0.32))
  const place = (parts: typeof leftParts, values: Map<string, number>) => { let y = 0; const out = new Map<string, { y: number; h: number; offset: number }>(); for (const part of parts) { const h = (values.get(part.key) ?? 0) * scale; out.set(part.key, { y, h, offset: 0 }); y += h + gap } return out }
  const leftNodes = place(leftParts, outValue)
  const rightNodes = place(rightParts, inValue)
  const colorA = (part: { key: string; label: string }) => valueColor(stat, data, first, part, Math.max(0, leftParts.findIndex((candidate) => candidate.key === part.key)))
  const paths = links.map((link) => {
    const source = leftNodes.get(link.from.key)!
    const target = rightNodes.get(link.to.key)!
    const h = link.value * scale
    const y0 = source.y + source.offset
    const y1 = target.y + target.offset
    source.offset += h
    target.offset += h
    const x0 = leftX + nodeWidth
    const x1 = rightX
    const middle = (x0 + x1) / 2
    return { link, d: `M${x0},${y0}C${middle},${y0} ${middle},${y1} ${x1},${y1}L${x1},${y1 + h}C${middle},${y1 + h} ${middle},${y0 + h} ${x0},${y0 + h}Z` }
  })
  const nodeLabel = (part: { key: string; label: string }, value: number) => `${short(statKeyLabel(part), compact ? 12 : 20)}${compact ? "" : ` · ${formatStatNumber(value)}`}`
  return <div ref={ref} className="grid min-w-0 gap-2">
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`Flux ${labelA} vers ${labelB}`} className="block max-w-[680px] overflow-visible">
      {paths.map(({ link, d }) => { const id = `flow:${link.from.key}>${link.to.key}`; return <Hit key={id} link label={`${statKeyLabel(link.from)} → ${statKeyLabel(link.to)} : ${formatStatNumber(link.value)}`} onPick={pick && !compact ? () => pick(`${labelA} : ${statKeyLabel(link.from)} → ${labelB} : ${statKeyLabel(link.to)}`, link.rows, id) : undefined} selected={picked === id}>
        <path className="stat-mark" d={d} fill={colorA(link.from)} fillOpacity={0.42} />
        <title>{`${statKeyLabel(link.from)} → ${statKeyLabel(link.to)} : ${formatStatNumber(link.value)}`}</title>
      </Hit> })}
      {leftParts.map((part) => { const node = leftNodes.get(part.key)!; const id = `node:a:${part.key}`; return <Hit key={id} label={`${labelA} : ${statKeyLabel(part)}`} onPick={pick && !compact ? () => pick(`${labelA} : ${statKeyLabel(part)}`, part.rows, id) : undefined} selected={picked === id}>
        <rect className="stat-mark" x={leftX} y={node.y} width={nodeWidth} height={Math.max(1, node.h)} fill={colorA(part)} rx={2} />
        {(!compact || node.h > 9) && <text x={leftX - 6} y={node.y + node.h / 2 + 4} textAnchor="end" style={svgText}>{nodeLabel(part, outValue.get(part.key) ?? 0)}</text>}
      </Hit> })}
      {rightParts.map((part) => { const node = rightNodes.get(part.key)!; const id = `node:b:${part.key}`; return <Hit key={id} label={`${labelB} : ${statKeyLabel(part)}`} onPick={pick && !compact ? () => pick(`${labelB} : ${statKeyLabel(part)}`, part.rows, id) : undefined} selected={picked === id}>
        <rect className="stat-mark" x={rightX} y={node.y} width={nodeWidth} height={Math.max(1, node.h)} fill={INK_2} rx={2} />
        {(!compact || node.h > 9) && <text x={rightX + nodeWidth + 6} y={node.y + node.h / 2 + 4} style={svgText}>{nodeLabel(part, inValue.get(part.key) ?? 0)}</text>}
      </Hit> })}
    </svg>
    {!compact && <Legend ctx={ctx} column={first} parts={leftParts.map((part) => ({ key: part.key, label: statKeyLabel(part), color: colorA(part) }))} extra={<><MoreToggle open={expanded.has(placeA)} hidden={left.hidden} column={labelA} onToggle={() => onToggle(placeA)} /><MoreToggle open={expanded.has(placeB)} hidden={right.hidden} column={labelB} onToggle={() => onToggle(placeB)} /></>} />}
  </div>
}

/* --- Tableau croisé : une colonne en lignes, une en colonnes --- */

function CrossResult(ctx: Ctx) {
  const { stat, data, prep, compact, expanded, onToggle, pick, picked } = ctx
  const first = stat.by[0]
  const second = stat.cols?.[0] ?? ""
  const labelA = data.labelOf(first)
  const labelB = data.labelOf(second)
  const place = `cross|${second}`
  const open = expanded.has(place)
  const table = statTable({ ...stat, by: [first], cols: [second], blocks: undefined }, prep.units, prep.valueOf, { orderOf: prep.orderOf, expanded: () => open })
  const percent = percentChoices(stat).some((choice) => choice.value === stat.percent) ? stat.percent ?? "none" : "none"
  const grand = table.total.total
  const shownOf = (node: StatTableNode<Unit>, index: number, value: number | null) => value === null ? null : percent === "none" ? value : percentOf(value, percent === "total" ? grand : percent === "row" ? node.total : table.total.cells[index]?.value ?? null)
  const max = Math.max(1e-9, ...table.total.children.flatMap((node) => node.cells.map((cell, index) => shownOf(node, index, cell.value) ?? 0)))
  const ramp = rampOf(stat)
  if (compact) return <MiniHeat lines={table.total.children.slice(0, 6).map((node) => ({ key: node.key, label: statKeyLabel(node), cells: node.cells.slice(0, 8).map((cell, index) => shownOf(node, index, cell.value)) }))} max={max} ramp={ramp} />
  const text = (shown: number | null, value: number | null) => shown === null ? "·" : percent === "none" ? formatStatNumber(value) : `${Math.round(shown)} %`
  const headers = table.headers[0] ?? []
  return <div className="grid min-w-0 gap-2">
    <div className="max-w-full overflow-auto" tabIndex={0} aria-label="Tableau croisé, défile dans les deux sens">
      <table className="border-separate border-spacing-[3px] text-[13px] tabular-nums">
        <caption className="pb-1 text-left text-xs text-muted-foreground">{labelA} en lignes, {labelB} en colonnes</caption>
        <thead><tr>
          <th scope="col"><span className="sr-only">{labelA} / {labelB}</span></th>
          {headers.map((header) => <th key={header.key} scope="col" title={header.revealed ? `${statKeyLabel(header)} : sortie d’« Autres »` : statKeyLabel(header)} className={`px-2 py-1 text-center text-xs font-semibold whitespace-nowrap text-muted-foreground ${header.revealed ? "italic shadow-[inset_0_-3px_0_rgb(168_122_31_/_0.7)]" : ""}`}>
            {statKeyLabel(header)}
            {header.key === STAT_OTHERS && (table.hidden[0] ?? 0) > 0 && !open && <button type="button" onClick={() => onToggle(place)} aria-label={`Déplier les ${table.hidden[0]} autres valeurs de « ${labelB} »`} title={`Déplier les ${table.hidden[0]} autres valeurs de « ${labelB} »`} className="ml-1 rounded-md border border-dashed border-[#a87a1f] bg-[#a87a1f]/10 px-1 text-[10.5px] font-bold text-foreground">▸ {table.hidden[0]}</button>}
          </th>)}
          <th scope="col" className="px-2 text-center text-xs font-medium text-muted-foreground">Total</th>
        </tr></thead>
        <tbody>{table.total.children.map((node) => <tr key={node.key}>
          <th scope="row" className="sticky left-0 z-[1] bg-card px-2 py-1 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground">{statKeyLabel(node)}</th>
          {node.cells.map((cell, index) => {
            const id = `cross:${node.key}:${index}`
            const label = `${labelA} : ${statKeyLabel(node)} · ${labelB} : ${statKeyLabel(headers[index])}`
            if (cell.value === null) return <td key={index} className="h-9 min-w-[3.25rem] text-center text-muted-foreground" title={`${label} : aucune`}>·</td>
            const shown = shownOf(node, index, cell.value)
            return <td key={index} className="h-9 min-w-[3.25rem] p-0 text-center font-semibold"><button type="button" onClick={() => pick?.(label, cell.rows, id)} title={`${label} : ${formatStatNumber(cell.value)}`} className={`h-9 w-full rounded-lg px-1.5 ${picked === id ? "outline-2 -outline-offset-2 outline-foreground" : ""}`} style={heat((shown ?? 0) / max, ramp)}>{text(shown, cell.value)}</button></td>
          })}
          <td className="px-2 text-center font-medium text-muted-foreground"><button type="button" onClick={() => pick?.(`${labelA} : ${statKeyLabel(node)}`, node.rows, `crossrow:${node.key}`)} className={`rounded px-1 ${picked === `crossrow:${node.key}` ? "outline-2 outline-foreground" : "hover:bg-muted"}`}>{percent === "column" || percent === "none" ? formatStatNumber(node.total) : percent === "row" ? "100 %" : `${Math.round(percentOf(node.total, grand) ?? 0)} %`}</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <RampLegend ramp={ramp} extra={<>{percent === "row" && <span>· chaque ligne fait 100 %</span>}{percent === "column" && <span>· chaque colonne fait 100 %</span>}<MoreToggle open={open} hidden={table.hidden[0] ?? 0} column={labelB} onToggle={() => onToggle(place)} /></>} />
  </div>
}

function RampLegend({ ramp, extra }: { ramp: string; extra?: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>peu</span><span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${heat(0, ramp).background}, ${heat(1, ramp).background})` }} /><span>beaucoup</span>{extra}</div>
}

/** Miniature d'un tableau : une petite grille de cases. */
function MiniHeat({ lines, max, ramp }: { lines: Array<{ key: string; label: string; cells: Array<number | null> }>; max: number; ramp: string }) {
  return <div className="grid gap-1">{lines.map((line) => <div key={line.key} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 text-[11px]">
    <span className="truncate text-muted-foreground">{line.label}</span>
    <span className="flex gap-0.5">{line.cells.map((value, index) => <span key={index} className="h-3.5 flex-1 rounded-sm" style={{ backgroundColor: value === null ? "var(--muted)" : heat(value / Math.max(1e-9, max), ramp).background }} />)}</span>
  </div>)}</div>
}

/* --- Tableau à niveaux : lignes et colonnes imbriquées, blocs de colonnes côte à côte --- */

function TableResult(ctx: Ctx) {
  const { stat, data, prep, compact, expanded, onToggle, pick, picked } = ctx
  const blocks = [stat.cols ?? [], ...(stat.blocks ?? [])].filter((block) => block.length)
  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  const table = statTable(stat, prep.units, prep.valueOf, { orderOf: prep.orderOf, expanded: (level, block) => expanded.has(`table|${block}|${level}|${blocks[block]?.[level]}`), closed: (block, key) => closed.has(`${block}\u001f${key}`) })
  const [depth, setDepth] = useState(1)
  const [toggled, setToggled] = useState<Set<string>>(() => new Set())
  const percent = percentChoices(stat).some((choice) => choice.value === stat.percent) ? stat.percent ?? "none" : "none"
  const grand = table.total.total
  const columnTotals = table.total.cells
  const ramp = rampOf(stat)
  const slots = prep.size > 0
  const label = data.labelOf
  // La valeur montrée d'une case : la valeur, ou sa part du total, de la ligne, de la colonne ou du niveau au-dessus.
  const shownOf = (node: StatTableNode<Unit>, parent: StatTableNode<Unit>, index: number, value: number | null) => {
    if (value === null || percent === "none") return value
    return percentOf(value, percent === "total" ? grand : percent === "row" ? node.total : percent === "column" ? columnTotals[index]?.value ?? null : parent.cells[index]?.value ?? null)
  }
  // Un dégradé par niveau : un sous-total n'écrase pas les cases de ses enfants.
  const maxByDepth = new Map<number, number>()
  const scan = (nodes: StatTableNode<Unit>[], parent: StatTableNode<Unit>) => nodes.forEach((node) => { node.cells.forEach((cell, index) => maxByDepth.set(node.depth, Math.max(maxByDepth.get(node.depth) ?? 1e-9, shownOf(node, parent, index, cell.value) ?? 0))); scan(node.children, node) })
  scan(table.total.children, table.total)
  const leaves = table.leaves.length
  const text = (node: StatTableNode<Unit>, parent: StatTableNode<Unit>, index: number, value: number | null) => { const shown = shownOf(node, parent, index, value); return shown === null ? "·" : percent === "none" ? formatStatNumber(value) : `${Math.round(shown)} %` }
  const totalText = (node: StatTableNode<Unit>, parent: StatTableNode<Unit>) => percent === "none" || percent === "column" ? formatStatNumber(node.total) : percent === "row" ? "100 %" : percent === "total" ? `${Math.round(percentOf(node.total, grand) ?? 0)} %` : `${Math.round(percentOf(node.total, parent.total) ?? 0)} %`
  if (compact) {
    const lines = table.total.children.slice(0, 6)
    const max = maxByDepth.get(0) ?? 1
    if (leaves) return <MiniHeat lines={lines.map((node) => ({ key: node.key, label: statKeyLabel(node), cells: node.cells.slice(0, 10).map((cell, index) => shownOf(node, table.total, index, cell.value)) }))} max={max} ramp={ramp} />
    return <div className="grid gap-1">{lines.map((node) => <div key={node.key} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 text-[11px]">
      <span className="truncate text-muted-foreground">{statKeyLabel(node)}</span>
      <span className="h-3 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${((node.total ?? 0) / Math.max(1e-9, ...lines.map((line) => line.total ?? 0))) * 100}%`, backgroundColor: ramp }} /></span>
    </div>)}</div>
  }
  const isOpen = (node: StatTableNode<Unit>) => { const path = node.path.join("\u001f"); return toggled.has(path) ? node.depth >= depth : node.depth < depth }
  const toggle = (node: StatTableNode<Unit>) => setToggled((current) => { const next = new Set(current); const path = node.path.join("\u001f"); if (next.has(path)) next.delete(path); else next.add(path); return next })
  const rowLabel = (node: StatTableNode<Unit>) => node.labels.map((value, index) => `${label(stat.by[index])} : ${value}`).join(" › ")
  // Le libellé de chaque colonne feuille (ses niveaux), pour les lignes concernées.
  const leafLabels = table.leafInfo.map((leaf) => leaf.labels.map((value, index) => `${label(leaf.columns[index])} : ${value}`).join(" · "))
  const blockStart = (index: number) => index > 0 && table.leafInfo[index].block !== table.leafInfo[index - 1].block
  const rowsBody: ReactNode[] = []
  const addRow = (node: StatTableNode<Unit>, parent: StatTableNode<Unit>) => {
    const isParent = node.children.length > 0
    const opened = isParent && isOpen(node)
    const max = maxByDepth.get(node.depth) ?? 1
    rowsBody.push(<tr key={node.path.join("\u001f")} className={node.depth === 0 ? "[&>*]:border-t [&>*]:border-border" : ""}>
      <th scope="row" className={`sticky left-0 z-[1] max-w-72 min-w-36 truncate border-r border-b border-border/60 bg-card py-1 pr-2 text-left sm:min-w-48 ${isParent ? "font-semibold" : "font-medium"} ${node.depth === 0 ? "font-display text-[13.5px]" : node.depth > 1 ? "text-muted-foreground" : ""}`} style={{ paddingLeft: 6 + node.depth * 16 }} title={rowLabel(node)}>
        {isParent ? <button type="button" aria-expanded={opened} onClick={() => toggle(node)} className="mr-1.5 inline-grid size-5 place-items-center rounded-md border bg-card align-middle text-[10px] text-muted-foreground hover:border-[#3b5c8a] hover:text-foreground" title={`${opened ? "Replier" : "Déplier"} « ${statKeyLabel(node)} »`}>{opened ? "▾" : "▸"}</button> : stat.by.length > 1 ? <span className="mr-1.5 inline-block w-5" /> : null}
        {statKeyLabel(node)}
      </th>
      {node.cells.map((cell, index) => {
        const id = `cell:${node.path.join("\u001f")}:${index}`
        const border = blockStart(index) ? "border-l-2 border-l-border" : ""
        if (cell.value === null) return <td key={index} className={`h-8 min-w-12 border-b border-border/60 text-center text-muted-foreground ${border}`}>·</td>
        const colors = heat((shownOf(node, parent, index, cell.value) ?? 0) / max, ramp)
        return <td key={index} className={`h-8 min-w-12 border-b border-border/60 p-0 text-center font-semibold ${border}`}>
          <button type="button" onClick={() => pick?.(`${rowLabel(node)} · ${leafLabels[index]}`, cell.rows, id)} title={`${rowLabel(node)} · ${leafLabels[index]} : ${formatStatNumber(cell.value)}`} className={`h-8 w-full px-1.5 tabular-nums ${picked === id ? "outline-2 -outline-offset-2 outline-foreground" : ""}`} style={colors}>{text(node, parent, index, cell.value)}</button>
        </td>
      })}
      <td className="h-8 border-b border-l border-border bg-muted/60 p-0 text-center font-bold"><button type="button" onClick={() => pick?.(rowLabel(node), node.rows, `row:${node.path.join("\u001f")}`)} className={`h-8 w-full px-2 tabular-nums ${picked === `row:${node.path.join("\u001f")}` ? "outline-2 -outline-offset-2 outline-foreground" : ""}`}>{totalText(node, parent)}</button></td>
      {slots && <td className="h-8 border-b border-l border-border bg-muted/60 px-2 text-center font-semibold tabular-nums text-muted-foreground">{formatStatNumber(unitRows(node.rows).length)}</td>}
    </tr>)
    if (opened) node.children.forEach((child) => addRow(child, node))
  }
  table.total.children.forEach((node) => addRow(node, table.total))
  const headerDepth = table.depth
  const multiBlock = table.blocks.length > 1
  const headRows = headerDepth + (multiBlock ? 1 : 0)
  const topOf = (row: number) => ["top-0", "top-7", "top-14", "top-[5.25rem]"][row] ?? "top-0"
  const headerCell = (header: (typeof table.headers)[number][number], row: number, index: number) => {
    const info = table.blocks[header.block]
    const column = info.columns[header.depth]
    const hidden = info.hidden[header.depth] ?? 0
    const open = info.open[header.depth]
    const closeKey = `${header.block}\u001f${header.key}`
    return <th key={`${row}:${index}:${header.block}:${header.key}`} scope={header.span > 1 ? "colgroup" : "col"} colSpan={header.span} rowSpan={header.leaf ? headerDepth - header.depth : 1} title={header.revealed ? `${statKeyLabel(header)} : sortie d’« Autres »` : statKeyLabel(header)}
      className={`sticky z-[2] max-w-32 truncate border-r border-b border-border/60 px-1.5 py-1 text-center text-[11.5px] font-semibold text-muted-foreground ${header.block % 2 ? "bg-[#ebe8e4]" : "bg-[#f3eee3]"} ${topOf(row)} ${header.revealed ? "italic shadow-[inset_0_-3px_0_rgb(168_122_31_/_0.7)]" : ""} ${header.depth === 0 && header.block > 0 ? "border-l-2 border-l-border" : ""}`}>
      {header.closable && <button type="button" aria-expanded={!header.closed} onClick={() => setClosed((current) => { const next = new Set(current); if (next.has(closeKey)) next.delete(closeKey); else next.add(closeKey); return next })} title={`${header.closed ? "Déplier" : "Replier"} « ${statKeyLabel(header)} »`} className="mr-1 inline-grid size-[18px] place-items-center rounded border bg-card align-middle text-[10px] text-muted-foreground hover:border-[#3b5c8a]">{header.closed ? "▸" : "▾"}</button>}
      {statKeyLabel(header)}
      {header.closed && <small className="block text-[10px] font-normal text-muted-foreground">sous-total</small>}
      {header.key === STAT_OTHERS && hidden > 0 && !open && <button type="button" onClick={() => onToggle(`table|${header.block}|${header.depth}|${column}`)} aria-label={`Déplier les ${hidden} autres valeurs de « ${label(column)} »`} title={`Déplier les ${hidden} autres valeurs de « ${label(column)} »`} className="ml-1 rounded-md border border-dashed border-[#a87a1f] bg-[#a87a1f]/10 px-1 text-[10.5px] font-bold text-foreground">▸ {hidden}</button>}
    </th>
  }
  return <div className="grid min-w-0 gap-2">
    {stat.by.length > 1 && <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      Déplier jusqu’à
      {stat.by.slice(0, -1).map((column, index) => <button key={column} type="button" aria-pressed={depth === index + 1 && !toggled.size} onClick={() => { setDepth(index + 1); setToggled(new Set()) }} className={`${mini} ${depth === index + 1 && !toggled.size ? "border-solid border-[#3b5c8a] text-foreground" : ""}`}>{label(stat.by[index + 1])}</button>)}
      <button type="button" onClick={() => { setDepth(stat.by.length); setToggled(new Set()) }} className={mini}>Tout déplier</button>
      <button type="button" onClick={() => { setDepth(0); setToggled(new Set()) }} className={mini}>Tout replier</button>
    </div>}
    <div className="max-h-[36rem] max-w-full overflow-auto rounded-xl border border-border/70" tabIndex={0} aria-label="Tableau à niveaux, défile dans les deux sens">
      <table className="border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            <th scope="col" rowSpan={Math.max(1, headRows)} className="sticky top-0 left-0 z-[4] min-w-36 border-r border-b border-border bg-[#f3eee3] px-2.5 py-1.5 text-left align-bottom font-semibold sm:min-w-48">
              <span className="block">{stat.by.map(label).join(" › ")}</span>
              {blocks.length > 0 && <small className="block font-normal text-muted-foreground">{blocks.map((block) => block.map(label).join(" › ")).join(" · ")}</small>}
            </th>
            {multiBlock
              ? table.blocks.map((block, index) => <th key={`block:${index}`} scope="colgroup" colSpan={block.width} className={`sticky top-0 z-[2] border-b border-border/60 px-2.5 py-1 text-left font-display text-[12.5px] ${index ? "border-l-2 border-l-border" : ""} ${index % 2 ? "bg-[#ebe8e4]" : "bg-[#f3eee3]"}`}>{block.columns.map(label).join(" › ")}</th>)
              : (table.headers[0] ?? []).map((header, index) => headerCell(header, 0, index))}
            <th scope="col" rowSpan={Math.max(1, headRows)} className="sticky top-0 z-[2] border-b border-l border-border bg-[#f3eee3] px-2 text-center font-bold">Total</th>
            {slots && <th scope="col" rowSpan={Math.max(1, headRows)} title="Lignes distinctes (chaque ligne une fois)" className="sticky top-0 z-[2] border-b border-l border-border bg-[#f3eee3] px-2 text-center font-bold">Lignes</th>}
          </tr>
          {(multiBlock ? table.headers : table.headers.slice(1)).map((level, depthIndex) => <tr key={depthIndex}>{level.map((header, index) => headerCell(header, depthIndex + 1, index))}</tr>)}
        </thead>
        <tbody>{rowsBody}</tbody>
        <tfoot>
          <tr className="font-bold">
            <th scope="row" className="sticky bottom-0 left-0 z-[3] border-t-2 border-r border-border bg-[#f3eee3] py-1 pr-2 pl-2 text-left">Total général</th>
            {table.total.cells.map((cell, index) => <td key={index} className={`sticky bottom-0 z-[1] h-8 border-t-2 border-border bg-[#f3eee3] p-0 text-center tabular-nums ${blockStart(index) ? "border-l-2 border-l-border" : ""}`}>{cell.value === null ? "·" : <button type="button" onClick={() => pick?.(`Total · ${leafLabels[index]}`, cell.rows, `foot:${index}`)} className={`h-8 w-full px-1.5 ${picked === `foot:${index}` ? "outline-2 -outline-offset-2 outline-foreground" : ""}`}>{percent === "none" ? formatStatNumber(cell.value) : percent === "column" || percent === "parent" ? "100 %" : `${Math.round(percentOf(cell.value, grand) ?? 0)} %`}</button>}</td>)}
            <td className="sticky bottom-0 z-[1] h-8 border-t-2 border-l border-border bg-[#f3eee3] px-2 text-center tabular-nums">{percent === "none" || percent === "column" ? formatStatNumber(grand) : "100 %"}</td>
            {slots && <td className="sticky bottom-0 z-[1] h-8 border-t-2 border-l border-border bg-[#f3eee3] px-2 text-center tabular-nums">{formatStatNumber(unitRows(prep.units).length)}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {leaves > 0 && <RampLegend ramp={ramp} />}
      {percent === "row" && <span>· chaque ligne fait 100 %</span>}
      {percent === "column" && <span>· chaque colonne fait 100 %</span>}
      {percent === "parent" && <span>· % du niveau au-dessus, case par case</span>}
      {table.blocks.flatMap((block, blockIndex) => block.columns.map((column, level) => <MoreToggle key={`${blockIndex}:${column}`} open={block.open[level]} hidden={block.hidden[level]} column={`${label(column)}${multiBlock ? ` (bloc ${blockIndex + 1})` : ""}`} onToggle={() => onToggle(`table|${blockIndex}|${level}|${column}`)} />))}
    </div>
  </div>
}

/* --- Histogramme : un nombre réparti en tranches (égales ou par paliers ×10) --- */

function HistogramResult(ctx: Ctx) {
  const { stat, data, prep, compact, pick, picked, onChange } = ctx
  const hist = stat.hist ?? { field: data.numeric[0] ?? "", bins: 6, scale: "auto" as const }
  const [ref, width] = useChartWidth(compact)
  const result = statHistogram(prep.units, prep.valueOf, hist.field, hist.bins, hist.scale)
  const set = (changes: Partial<typeof hist>) => onChange?.({ ...stat, hist: { ...hist, ...changes } })
  const height = compact ? 100 : 260
  const bottom = compact ? 4 : 46
  const top = 18
  const max = Math.max(1, ...result.bins.map((bin) => bin.rows.length))
  const slot = width / Math.max(1, result.bins.length)
  const noun = unitWord(prep.size)
  return <div ref={ref} className="grid min-w-0 gap-2">
    {!compact && onChange && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      <label className="inline-flex items-center gap-1.5">Tranches de<select value={hist.field} aria-label="Colonne répartie" onChange={(event) => set({ field: event.target.value })} className={optionSelect}>{data.numeric.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
      <select value={hist.bins} aria-label="Nombre de tranches" onChange={(event) => set({ bins: Number(event.target.value) })} className={optionSelect}>{histogramBinChoices.map((count) => <option key={count} value={count}>{count} tranches</option>)}</select>
      <select value={hist.scale} aria-label="Taille des tranches" onChange={(event) => set({ scale: event.target.value as typeof hist.scale })} className={optionSelect}><option value="auto">taille automatique</option><option value="lin">tranches égales</option><option value="log">paliers ×10 (log)</option></select>
    </div>}
    {result.withValue < 2 ? <p className="py-6 text-center text-sm text-muted-foreground">Moins de deux {noun} ont un « {hist.field || "nombre"} » : rien à répartir.</p> : <>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`Répartition de ${hist.field} en tranches`} className="block max-w-[680px] overflow-visible">
        <line x1={0} x2={width} y1={height - bottom + 0.5} y2={height - bottom + 0.5} stroke={LINE} />
        {result.bins.map((bin, index) => {
          const h = ((height - bottom - top) * bin.rows.length) / max
          const x = index * slot
          const label = bin.zero ? "0" : `${formatStatNumber(bin.from)}–${formatStatNumber(bin.to)}`
          const id = `bin:${index}`
          return <g key={id}>
            <Hit label={`${hist.field} ${label} : ${plural(bin.rows.length, unitWord(prep.size, 1))}`} onPick={pick && !compact ? () => pick(`${hist.field} : ${label}`, bin.rows, id) : undefined} selected={picked === id}>
              <rect x={x} y={top - 14} width={slot} height={height - bottom - top + 14} fill="transparent" />
              <path className="stat-mark" d={roundedTop(x + 1, height - bottom - h, Math.max(1, slot - 2), h, Math.min(3, h))} fill={hueOf(stat)} />
              {!compact && <text x={x + slot / 2} y={height - bottom - h - 5} textAnchor="middle" style={svgValue}>{bin.rows.length}</text>}
              <title>{`${hist.field} ${label} : ${plural(bin.rows.length, unitWord(prep.size, 1))}`}</title>
            </Hit>
            {!compact && <text x={x + slot / 2} y={height - bottom + 15} textAnchor={slot < 64 ? "end" : "middle"} transform={slot < 64 ? `rotate(-30 ${x + slot / 2} ${height - bottom + 15})` : undefined} style={{ ...svgText, fontSize: 10.5 }}>{bin.zero ? "0" : `${tick(bin.from)}–${tick(bin.to)}`}</text>}
          </g>
        })}
        {!compact && <text x={width / 2} y={height - 6} textAnchor="middle" style={svgText}>{`${hist.field}${result.log ? " · paliers ×10" : ""}`}</text>}
      </svg>
      {!compact && <p className="text-xs text-muted-foreground">{plural(result.withValue, unitWord(prep.size, 1))} avec un nombre dans « {hist.field} », {result.without.toLocaleString("fr-FR")} sans.</p>}
    </>}
  </div>
}

/* --- Nuage de points : deux nombres, la couleur par une colonne --- */

function ScatterResult(ctx: Ctx) {
  const { stat, data, prep, compact, pick, picked, onChange } = ctx
  const axes = stat.scatter ?? { x: data.numeric[0] ?? "", y: data.numeric[1] ?? data.numeric[0] ?? "" }
  const colorBy = stat.by[0]
  const [ref, width] = useChartWidth(compact)
  const points = statScatter(prep.units, prep.valueOf, axes.x, axes.y)
  const set = (changes: Partial<typeof axes>) => onChange?.({ ...stat, scatter: { ...axes, ...changes } })
  const options = !compact && onChange && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
    <label className="inline-flex items-center gap-1.5">Horizontal<select value={axes.x} aria-label="Nombre en horizontal" onChange={(event) => set({ x: event.target.value })} className={optionSelect}>{data.numeric.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
    <label className="inline-flex items-center gap-1.5">Vertical<select value={axes.y} aria-label="Nombre en vertical" onChange={(event) => set({ y: event.target.value })} className={optionSelect}>{data.numeric.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
    <span>{colorBy ? `couleur : ${data.labelOf(colorBy)}` : "couleur : choisis une colonne dans « réparties par »"}</span>
  </div>
  if (points.reduce((total, point) => total + point.rows.length, 0) < 2) return <div ref={ref} className="grid gap-2">{options}<p className="py-6 text-center text-sm text-muted-foreground">Moins de deux lignes ont à la fois « {axes.x} » et « {axes.y} ».</p></div>
  const height = compact ? 160 : 320
  const leftPad = compact ? 8 : 48
  const bottom = compact ? 8 : 40
  const top = 10
  const right = 12
  const ax = scatterAxis(points.map((point) => point.x))
  const ay = scatterAxis(points.map((point) => point.y))
  const px = (value: number) => leftPad + ax.at(value) * (width - leftPad - right)
  const py = (value: number) => height - bottom - ay.at(value) * (height - bottom - top)
  const keys = new Map<string, { key: string; label: string }>()
  const colorParts = colorBy ? statBreakdown(stat, prep.units, prep.valueOf, { column: colorBy, order: prep.orderOf(colorBy), byValue: true }).parts : []
  const rankOf = new Map(colorParts.map((part, index) => [part.key, index]))
  return <div ref={ref} className="grid min-w-0 gap-2">
    {options}
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`${axes.y} selon ${axes.x}`} className="block max-w-[680px] overflow-visible">
      {!compact && <>
        {ax.ticks.map((value) => <g key={`x${value}`}><line x1={px(value)} x2={px(value)} y1={top} y2={height - bottom} stroke={LINE_SOFT} /><text x={px(value)} y={height - bottom + 14} textAnchor="middle" style={{ ...svgText, fontSize: 10.5 }}>{tick(value)}</text></g>)}
        {ay.ticks.map((value) => <g key={`y${value}`}><line x1={leftPad} x2={width - right} y1={py(value)} y2={py(value)} stroke={LINE_SOFT} /><text x={leftPad - 6} y={py(value) + 4} textAnchor="end" style={{ ...svgText, fontSize: 10.5 }}>{tick(value)}</text></g>)}
        <text x={(width + leftPad) / 2} y={height - 6} textAnchor="middle" style={svgText}>{`${axes.x}${ax.log ? " · échelle ×10" : ""}`}</text>
        <text x={12} y={(height - bottom) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(height - bottom) / 2})`} style={svgText}>{`${axes.y}${ay.log ? " · ×10" : ""}`}</text>
      </>}
      {points.map((point) => {
        const first = point.rows[0]
        const value = colorBy ? prep.valueOf(first, colorBy) : ""
        const part = colorBy ? colorParts.find((candidate) => candidate.rows.includes(first)) ?? { key: "", label: value } : null
        if (part) keys.set(part.key, part)
        const fill = part ? valueColor(stat, data, colorBy, part, rankOf.get(part.key) ?? 0) : hueOf(stat)
        const id = `pt:${point.x}|${point.y}`
        const names = unitRows(point.rows).map((row) => data.nameOf(row) || "Sans nom")
        const title = `${names.slice(0, 6).join(", ")}${names.length > 6 ? "…" : ""} — ${axes.x} ${formatStatNumber(point.x)}, ${axes.y} ${formatStatNumber(point.y)}`
        return <Hit key={id} label={title} onPick={pick && !compact ? () => pick(point.rows.length > 1 ? `${point.rows.length} lignes à ${axes.x} ${formatStatNumber(point.x)}, ${axes.y} ${formatStatNumber(point.y)}` : names[0], point.rows, id) : undefined} selected={picked === id}>
          <circle className="stat-mark" cx={px(point.x)} cy={py(point.y)} r={Math.min(10, 4.5 + (point.rows.length - 1) * 1.2)} fill={fill} stroke={CARD} strokeWidth={2} />
          <title>{title}</title>
        </Hit>
      })}
    </svg>
    {!compact && <>
      {colorBy && <Legend ctx={ctx} column={colorBy} parts={colorParts.filter((part) => keys.has(part.key)).map((part) => ({ key: part.key, label: statKeyLabel(part), color: valueColor(stat, data, colorBy, part, rankOf.get(part.key) ?? 0) }))} />}
      <p className="text-xs text-muted-foreground">{plural(points.reduce((total, point) => total + point.rows.length, 0), "ligne")}.</p>
    </>}
  </div>
}

/* ---------- Les vignettes des formes ---------- */

const A = SEQ
const B = LINE
const C = "#d07a12"
const FORM_ICONS: Record<StatForm, ReactNode> = {
  number: <><text x="20" y="18" textAnchor="middle" fontFamily="Georgia, serif" fontSize="15" fill={INK}>42</text><rect x="13" y="22" width="14" height="2.5" rx="1" fill={A} /></>,
  gauge: <><rect x="3" y="11" width="34" height="7" rx="3.5" fill={B} /><rect x="3" y="11" width="22" height="7" rx="3.5" fill={A} /></>,
  histogram: <>{[5, 11, 18, 13, 7, 3].map((h, i) => <rect key={i} x={4 + i * 5.4} y={25 - h} width="5" height={h} fill={A} />)}</>,
  scatter: <>{[[8, 20], [12, 15], [17, 17], [21, 10], [26, 12], [31, 6], [14, 9], [28, 19]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill={A} />)}</>,
  bars: <>{[26, 18, 12, 7].map((w, i) => <rect key={i} x="4" y={4 + i * 6} width={w} height="4" rx="1.5" fill={A} />)}</>,
  columns: <>{[8, 16, 12, 20, 6].map((h, i) => <rect key={i} x={5 + i * 6.4} y={25 - h} width="4.4" height={h} rx="1" fill={A} />)}</>,
  ranking: <>{[0, 1, 2, 3].map((i) => <g key={i}><text x="4" y={8 + i * 6} fontSize="5.5" fontWeight="700" fill={INK_3}>{i + 1}</text><rect x="11" y={4.5 + i * 6} width={24 - i * 5} height="3.5" rx="1.5" fill={A} /></g>)}</>,
  donut: <><circle cx="20" cy="14" r="9" fill="none" strokeWidth="5" stroke={B} /><path d="M20 5a9 9 0 0 1 8.6 11.7" fill="none" strokeWidth="5" stroke={A} /><path d="M28.6 16.7A9 9 0 0 1 15 21.5" fill="none" strokeWidth="5" stroke={C} /></>,
  treemap: <><rect x="3" y="3" width="18" height="22" rx="1.5" fill={A} /><rect x="22" y="3" width="15" height="12" rx="1.5" fill={C} /><rect x="22" y="16" width="8" height="9" rx="1.5" fill={B} /><rect x="31" y="16" width="6" height="9" rx="1.5" fill={C} /></>,
  stacked: <>{[[14, 8, 6], [10, 6, 4], [8, 4, 2]].map((parts, i) => { let x = 4; return parts.map((w, j) => { const rect = <rect key={`${i}${j}`} x={x} y={5 + i * 7} width={w - 0.6} height="5" fill={[A, C, B][j]} />; x += w; return rect }) })}</>,
  stacked100: <>{[[16, 10, 6], [10, 14, 8], [20, 6, 6]].map((parts, i) => { let x = 4; return parts.map((w, j) => { const rect = <rect key={`${i}${j}`} x={x} y={5 + i * 7} width={w - 0.6} height="5" fill={[A, C, B][j]} />; x += w; return rect }) })}</>,
  grouped: <>{[[22, 14], [16, 20], [10, 6]].map((parts, i) => parts.map((w, j) => <rect key={`${i}${j}`} x="4" y={3 + i * 8 + j * 3.4} width={w} height="2.8" rx="1" fill={j ? C : A} />))}</>,
  sankey: <><rect x="4" y="3" width="3" height="10" fill={A} /><rect x="4" y="15" width="3" height="10" fill={A} /><rect x="33" y="3" width="3" height="6" fill={C} /><rect x="33" y="11" width="3" height="14" fill={C} /><path d="M7 3C20 3 20 3 33 3V9C20 9 20 7 7 7Z" fill={A} fillOpacity=".32" /><path d="M7 7C20 7 20 11 33 11V17C20 17 20 13 7 13Z" fill={A} fillOpacity=".32" /><path d="M7 15C20 15 20 17 33 17V25C20 25 20 25 7 25Z" fill={A} fillOpacity=".32" /></>,
  cross: <>{[0, 1, 2].map((r) => <g key={r}>{[0, 1, 2, 3].map((c) => <rect key={c} x={10 + c * 7} y={4 + r * 7.4} width="6" height="6" rx="1.2" fill={A} opacity={[0.35, 0.8, 0.55, 1, 0.45, 0.25, 0.9, 0.6, 0.7, 0.3, 0.5, 0.85][r * 4 + c]} />)}<rect x="3" y={5.5 + r * 7.4} width="5" height="3" rx="1" fill={B} /></g>)}</>,
  table: <>{[0, 1, 2, 3].map((row) => <g key={row}><rect x={3 + (row % 2) * 3} y={4 + row * 5.6} width={8 - (row % 2) * 3} height="3" rx="1" fill={B} />{[0, 1, 2].map((column) => <rect key={column} x={14 + column * 7.6} y={3 + row * 5.6} width="6.6" height="4.6" rx="1" fill={A} opacity={[0.9, 0.5, 0.3, 0.6, 0.35, 0.8, 0.45, 0.7, 0.25, 0.55, 0.9, 0.4][row * 3 + column]} />)}</g>)}</>,
}

export function FormIcon({ form, className = "h-4 w-6" }: { form: StatForm; className?: string }) {
  return <svg viewBox="0 0 40 28" className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">{FORM_ICONS[form]}</svg>
}
