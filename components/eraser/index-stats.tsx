"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Copy, LoaderCircle, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, TextCursorInput, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { viewOperators, type ViewCondition } from "@/lib/index-views"
import {
  aggregate, autoStatTitle, cellParts, cleanStat, cleanStats, fitForm, formatStatNumber, formProblem, newStatId, numericColumns, percentChoices, percentOf, pinnedFirst,
  rankingTopChoices, scopeRows, STAT_LIMITS, STAT_OTHERS, statBreakdown, statForms, statKeyLabel, statMeasures, statRows, statTable, tableTopChoices,
  type StatDefinition, type StatForm, type StatTableNode,
} from "@/lib/index-stats"

/**
 * Les statistiques d'un index. Dans « Modifier › Stats » : la phrase à trous qui construit une
 * statistique, son aperçu en direct, les lignes concernées et les statistiques enregistrées.
 * Dans un onglet stat (`pinnedOnly`) : seulement les statistiques épinglées. Tout se calcule
 * sur les lignes déjà chargées : aucune lecture Google de plus.
 */
export type IndexStatsProps = {
  /** Les statistiques de l'index (épinglées ou non). */
  stats: StatDefinition[]
  /** L'onglet stat : seulement les épinglées, sans constructeur. */
  pinnedOnly?: boolean
  /** L'onglet stat : ouvrir « Modifier › Stats ». */
  onManage?: () => void
  /** Les lignes de l'index (recherche comprise), tous onglets de données. */
  rows: string[]
  /** Les colonnes proposées dans la phrase (en-têtes réels, sans l'identifiant). */
  columns: string[]
  tabs: string[]
  valueOf: (rowKey: string, column: string) => string
  tabOf: (rowKey: string) => string
  nameOf: (rowKey: string) => string
  /** Les choix d'une colonne liste : leur ordre et leur couleur. */
  optionsOf: (column: string) => Array<{ value: string; color?: string }>
  onOpen: (rowKey: string) => void
  /** Modifier les statistiques (comme modifier l'onglet) ; sinon elles se lisent seulement. */
  canEdit: boolean
  onSave: (stats: StatDefinition[]) => Promise<void>
}

/** La colonne virtuelle « Onglet » : l'onglet d'où vient la ligne (index à plusieurs onglets). */
export const TAB_PSEUDO = "Onglet"

/* ---------- Couleurs (palette catégorielle validée : clarté, chroma, daltonismes, contraste) ---------- */

const PALETTE = ["#2f63b0", "#d07a12", "#13917a", "#c4473c", "#7652b8", "#5a9418", "#c84d8c", "#2a95c2"]
const SEQ = "#3b5c8a"
const OTHERS_COLOR = "#a39a8c"
const EMPTY_COLOR = "#d6cdbd"
const CARD = "#faf7ef"

const hexRgb = (hex: string) => { const value = hex.replace("#", ""); return [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16)) }
const rgbHex = (rgb: number[]) => `#${rgb.map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0")).join("")}`
const mix = (left: string, right: string, amount: number) => { const a = hexRgb(left); const b = hexRgb(right); return rgbHex(a.map((value, index) => value + (b[index] - value) * amount)) }
const luminance = (hex: string) => { const [r, g, b] = hexRgb(hex).map((value) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (left: string, right: string) => { const [high, low] = [luminance(left), luminance(right)].sort((a, b) => b - a); return (high + 0.05) / (low + 0.05) }

/** La case d'un tableau : un dégradé d'une teinte, et le texte qui contraste le plus (4,5 au moins). */
function heat(t: number) {
  let background = mix(CARD, SEQ, 0.14 + Math.max(0, Math.min(1, t)) * 0.8)
  const color = contrast(background, "#ffffff") >= contrast(background, "#211e1a") ? "#ffffff" : "#211e1a"
  for (let step = 1; contrast(background, color) < 4.5 && step <= 10; step += 1) background = mix(background, color === "#ffffff" ? "#000000" : "#ffffff", 0.06)
  return { background, color }
}

/** Au-delà des 8 couleurs : la palette reprise en plus clair, puis en plus foncé. */
const paletteColor = (rank: number) => { const base = PALETTE[rank % 8]; const round = Math.floor(rank / 8); return round === 0 ? base : round === 1 ? mix(base, CARD, 0.45) : mix(base, "#211e1a", 0.3) }

/* ---------- Petites pièces ---------- */

const chip = "mx-0.5 max-w-full rounded-lg border border-border bg-card px-2 py-0.5 align-middle font-sans text-sm text-foreground shadow-[inset_0_-2px_0_rgb(59_92_138_/_0.45)] [field-sizing:content] hover:border-[#3b5c8a] focus-visible:outline-2 focus-visible:outline-[#3b5c8a] disabled:opacity-60"
const mini = "mx-0.5 inline-flex items-center rounded-lg border border-dashed border-border px-2.5 py-0.5 align-middle font-sans text-[13px] leading-normal text-muted-foreground hover:border-[#3b5c8a] hover:text-foreground"
const dropButton = "inline-grid size-6 place-items-center rounded-md align-middle font-sans text-muted-foreground hover:bg-muted hover:text-foreground"
const moreButton = "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-dashed border-[#a87a1f] bg-[#a87a1f]/10 px-2 py-0.5 text-left text-xs font-medium text-foreground hover:border-solid hover:bg-[#a87a1f]/15"
const moreOpen = "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground"

function ChipSelect({ value, onChange, label, children, disabled }: { value: string; onChange: (value: string) => void; label: string; children: ReactNode; disabled?: boolean }) {
  return <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={chip}>{children}</select>
}

const FORM_ICONS: Record<StatForm, ReactNode> = {
  number: <><text x="20" y="18" textAnchor="middle" fontFamily="Georgia, serif" fontSize="15" fill="currentColor" className="text-foreground">42</text><rect x="13" y="22" width="14" height="2.5" rx="1" fill={SEQ} /></>,
  bars: <>{[26, 18, 12, 7].map((width, index) => <rect key={index} x="4" y={4 + index * 6} width={width} height="4" rx="1.5" fill={SEQ} />)}</>,
  ranking: <>{[0, 1, 2, 3].map((index) => <g key={index}><text x="4" y={8 + index * 6} fontSize="5.5" fontWeight="700" fill="#857b6d">{index + 1}</text><rect x="11" y={4.5 + index * 6} width={24 - index * 5} height="3.5" rx="1.5" fill={SEQ} /></g>)}</>,
  donut: <><circle cx="20" cy="14" r="9" fill="none" strokeWidth="5" stroke="#d1c6b4" /><path d="M20 5a9 9 0 0 1 8.6 11.7" fill="none" strokeWidth="5" stroke={SEQ} /><path d="M28.6 16.7A9 9 0 0 1 15 21.5" fill="none" strokeWidth="5" stroke="#d07a12" /></>,
  table: <>{[0, 1, 2, 3].map((row) => <g key={row}><rect x={3 + (row % 2) * 3} y={4 + row * 5.6} width={8 - (row % 2) * 3} height="3" rx="1" fill="#d1c6b4" />{[0, 1, 2].map((column) => <rect key={column} x={14 + column * 7.6} y={3 + row * 5.6} width="6.6" height="4.6" rx="1" fill={SEQ} opacity={[0.9, 0.5, 0.3, 0.6, 0.35, 0.8, 0.45, 0.7, 0.25, 0.55, 0.9, 0.4][row * 3 + column]} />)}</g>)}</>,
}

function FormIcon({ form, className = "h-4 w-6" }: { form: StatForm; className?: string }) {
  return <svg viewBox="0 0 40 28" className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">{FORM_ICONS[form]}</svg>
}

/* ---------- Le calcul d'une statistique, pour l'affichage ---------- */

type StatData = {
  rows: string[]
  valueOf: (rowKey: string, column: string) => string
  tabOf: (rowKey: string) => string
  orderOf: (column: string) => string[]
  colorOf: (column: string, value: string) => string | undefined
}

type PickRows = (label: string, rows: string[], id: string) => void

type ResultProps = {
  stat: StatDefinition
  data: StatData
  compact?: boolean
  expanded: Set<string>
  onToggle: (key: string) => void
  onPick?: PickRows
  picked?: string
  onTop?: (top: number) => void
}

const measureWords = { count: "", sum: "somme de", average: "moyenne de", max: "maximum de", min: "minimum de" } as const
const measureWord = (stat: StatDefinition) => stat.measure === "count" ? "" : `${measureWords[stat.measure]} ${stat.field ?? ""}`
const plural = (count: number, word: string) => `${count.toLocaleString("fr-FR")} ${word}${count > 1 ? "s" : ""}`

function StatResult(props: ResultProps) {
  const { stat, data } = props
  const rows = useMemo(() => statRows(stat, data.rows, data.valueOf, data.tabOf), [data, stat])
  if (!rows.length && stat.form !== "number") return <p className="py-8 text-center text-sm text-muted-foreground">Aucune ligne ne remplit ces conditions.</p>
  switch (stat.form) {
    case "number": return <NumberResult {...props} rows={rows} />
    case "bars": return <BarsResult {...props} rows={rows} />
    case "ranking": return <RankingResult {...props} rows={rows} />
    case "donut": return <DonutResult {...props} rows={rows} />
    case "table": return <TableResult {...props} rows={rows} />
  }
}

/* --- Chiffre --- */

function NumberResult({ stat, data, rows, compact, onPick, picked }: ResultProps & { rows: string[] }) {
  const scope = scopeRows(stat, data.rows, data.tabOf)
  const value = aggregate(stat, rows, data.valueOf)
  const whole = aggregate(stat, scope, data.valueOf)
  const percent = stat.percent === "total"
  const main = percent ? `${Math.round(percentOf(value, whole) ?? 0)} %` : formatStatNumber(value)
  const sub = percent ? `${formatStatNumber(value)} sur ${formatStatNumber(whole)}` : stat.measure === "count" ? `${rows.length > 1 ? "lignes" : "ligne"} sur ${scope.length.toLocaleString("fr-FR")}` : `${measureWord(stat)} · ${plural(rows.length, "ligne")}`
  if (compact) return <div className="grid gap-1.5"><span className="font-display text-4xl leading-none tabular-nums">{main}</span><span className="block h-1 w-12 rounded-full" style={{ backgroundColor: SEQ }} /><span className="text-xs text-muted-foreground">{sub}</span></div>
  return <div className="grid gap-1.5 py-2">
    <button type="button" onClick={() => onPick?.(stat.where?.length ? "Lignes retenues" : "Toutes les lignes", rows, "number")} className={`grid w-fit gap-1.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3b5c8a] ${picked === "number" ? "outline-2 outline-offset-4 outline-foreground" : ""}`}>
      <span className="font-display text-6xl leading-none tabular-nums">{main}</span>
      <span className="block h-1 w-14 rounded-full" style={{ backgroundColor: SEQ }} />
    </button>
    <span className="text-sm text-muted-foreground">{sub}</span>
  </div>
}

/* --- Barres --- */

function MoreToggle({ open, hidden, column, onToggle, collapsedLabel, openLabel }: { open: boolean; hidden: number; column: string; onToggle: () => void; collapsedLabel?: string; openLabel?: string }) {
  if (!hidden) return null
  return <button type="button" aria-expanded={open} onClick={onToggle} className={open ? moreOpen : moreButton}>
    {open ? openLabel ?? `◂ regrouper les ${hidden} valeurs de « ${column} » en « Autres »` : collapsedLabel ?? `▸ déplier les ${hidden} autres valeurs de « ${column} »`}
  </button>
}

function BarList({ items, compact, onPick, picked, percent }: {
  items: Array<{ id: string; label: string; value: number | null; shown: number | null; color: string; rows: string[]; revealed?: boolean; rank?: number }>
  compact?: boolean
  onPick?: PickRows
  picked?: string
  percent?: boolean
}) {
  const max = Math.max(1e-9, ...items.map((item) => item.shown ?? 0))
  const text = (item: (typeof items)[number]) => item.shown === null ? "—" : percent ? `${Math.round(item.shown)} %` : formatStatNumber(item.value)
  return <ol className={`grid ${compact ? "gap-1" : "gap-0.5"}`}>
    {items.map((item) => {
      const body = <>
        {item.rank !== undefined && <span className="text-right text-xs tabular-nums text-muted-foreground">{item.rank}</span>}
        <span className={`truncate ${item.revealed ? "italic" : ""}`}>{item.label}</span>
        <span className={`${compact ? "h-2" : "h-3"} overflow-hidden rounded-full bg-muted`}><span className="block h-full rounded-full" style={{ width: `${((item.shown ?? 0) / max) * 100}%`, minWidth: item.shown ? 2 : 0, backgroundColor: item.color }} /></span>
        <span className="text-right font-semibold tabular-nums">{text(item)}</span>
      </>
      const grid = item.rank !== undefined ? "grid-cols-[1.5rem_minmax(0,11rem)_minmax(2.5rem,1fr)_4.5rem]" : compact ? "grid-cols-[minmax(0,7rem)_minmax(2rem,1fr)_3.5rem]" : "grid-cols-[minmax(0,12rem)_minmax(2.5rem,1fr)_4.5rem]"
      return <li key={item.id}>
        {compact || !onPick
          ? <div className={`grid ${grid} items-center gap-2 text-xs`}>{body}</div>
          : <button type="button" title={`${item.label} — ${text(item)}`} onClick={() => onPick(item.label, item.rows, item.id)} className={`grid w-full ${grid} items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] hover:bg-muted focus-visible:outline-2 focus-visible:outline-[#3b5c8a] ${picked === item.id ? "bg-muted shadow-[inset_0_0_0_2px_var(--foreground)]" : ""}`}>{body}</button>}
      </li>
    })}
  </ol>
}

function partColor(data: StatData, column: string, key: string, label: string, fallback: string) {
  if (key === STAT_OTHERS) return OTHERS_COLOR
  if (!key) return EMPTY_COLOR
  return data.colorOf(column, label) ?? fallback
}

function BarsResult({ stat, data, rows, compact, expanded, onToggle, onPick, picked }: ResultProps & { rows: string[] }) {
  const column = stat.by[0]
  const place = `bars|${column}`
  const open = expanded.has(place)
  const { parts, hidden, revealed } = statBreakdown(stat, rows, data.valueOf, { order: data.orderOf(column), limit: compact ? 5 : 12, expanded: open && !compact, byValue: true })
  const percent = stat.percent === "total"
  const whole = aggregate(stat, rows, data.valueOf)
  const items = parts.map((part) => ({ id: `bar:${part.key}`, label: statKeyLabel(part), value: part.value, shown: percent ? percentOf(part.value, whole) : part.value, color: part.key === STAT_OTHERS ? OTHERS_COLOR : !part.key ? EMPTY_COLOR : SEQ, rows: part.rows, revealed: revealed(part.key) }))
  return <div className="grid gap-2">
    <BarList items={items} compact={compact} onPick={onPick ? (label, list, id) => onPick(`${column} : ${label}`, list, id) : undefined} picked={picked} percent={percent} />
    {!compact && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <MoreToggle open={open} hidden={hidden} column={column} onToggle={() => onToggle(place)} />
    </div>}
  </div>
}

/* --- Classement --- */

function RankingResult({ stat, data, rows, compact, expanded, onToggle, onPick, picked, onTop }: ResultProps & { rows: string[] }) {
  const column = stat.by[0]
  const place = `ranking|${column}`
  const open = expanded.has(place)
  const top = stat.top ?? 10
  const { parts } = statBreakdown(stat, rows, data.valueOf, { byValue: true })
  const ranked = parts.filter((part) => part.value !== null && part.key).sort((left, right) => (right.value ?? 0) - (left.value ?? 0))
  const shown = ranked.slice(0, compact ? 4 : open ? ranked.length : top)
  const hidden = ranked.length - top
  const items = shown.map((part, index) => ({ id: `rank:${part.key}`, label: statKeyLabel(part), value: part.value, shown: part.value, color: SEQ, rows: part.rows, rank: index + 1, revealed: index >= top }))
  return <div className="grid gap-2">
    {!compact && onTop && <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Garder les<select value={top} onChange={(event) => onTop(Number(event.target.value))} className="rounded-md border bg-card px-1.5 py-0.5 text-xs text-foreground">{rankingTopChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select>premières</label>}
    <BarList items={items} compact={compact} onPick={onPick ? (label, list, id) => onPick(`${column} : ${label}`, list, id) : undefined} picked={picked} />
    {!compact && hidden > 0 && <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {open ? `les ${ranked.length} valeurs de « ${column} »` : `et ${hidden} autre${hidden > 1 ? "s valeurs" : " valeur"} de « ${column} »`}
      <MoreToggle open={open} hidden={hidden} column={column} onToggle={() => onToggle(place)} collapsedLabel={`+ ${hidden} ▸`} openLabel={`◂ ne garder que les ${top} premières`} />
    </p>}
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

function DonutResult({ stat, data, rows, compact, expanded, onToggle, onPick, picked }: ResultProps & { rows: string[] }) {
  const column = stat.by[0]
  const place = `donut|${column}`
  const open = expanded.has(place) && !compact
  const { parts: all } = statBreakdown(stat, rows, data.valueOf, { byValue: true })
  const positive = all.filter((part) => (part.value ?? 0) > 0)
  // Huit parts au plus : les sept plus grosses, puis « Autres » (dépliable dans la liste ou dans l'anneau).
  const many = positive.length > 8
  const kept = many && !open ? positive.slice(0, 7) : positive
  const rest = many ? positive.slice(7) : []
  const parts = many && !open ? [...kept, { key: STAT_OTHERS, label: "", rows: [...new Set(rest.flatMap((part) => part.rows))], value: rest.reduce((total, part) => total + (part.value ?? 0), 0) }] : kept
  const ranks = new Map(positive.filter((part) => part.key && part.key !== STAT_OTHERS).map((part, index) => [part.key, index]))
  const colorFor = (part: { key: string; label: string }) => partColor(data, column, part.key, part.label, paletteColor(ranks.get(part.key) ?? 0))
  const sum = parts.reduce((total, part) => total + (part.value ?? 0), 0) || 1
  const total = aggregate(stat, rows, data.valueOf)
  const [listOpen, setListOpen] = useState(false)
  // Les angles de chaque part, cumulés depuis midi.
  const starts = parts.map((_, index) => -Math.PI / 2 + parts.slice(0, index).reduce((total, part) => total + ((part.value ?? 0) / sum) * Math.PI * 2, 0))
  const ring = <svg viewBox="0 0 240 240" className={compact ? "w-28" : "w-full max-w-60"} role="img" aria-label={`Part de chaque ${column}`}>
    {parts.map((part, index) => {
      const start = starts[index]
      const id = `part:${part.key}`
      return <path key={id} d={arc(120, 120, 108, 66, start, start + ((part.value ?? 0) / sum) * Math.PI * 2)} fill={colorFor(part)} stroke={CARD} strokeWidth={parts.length > 16 ? 1 : 2} className={onPick && !compact ? "cursor-pointer hover:brightness-110" : ""} onClick={onPick && !compact ? () => onPick(`${column} : ${statKeyLabel(part)}`, part.rows, id) : undefined} strokeOpacity={1}>
        <title>{`${statKeyLabel(part)} — ${formatStatNumber(part.value)} (${Math.round(((part.value ?? 0) / sum) * 100)} %)`}</title>
      </path>
    })}
    <text x="120" y="124" textAnchor="middle" fontFamily="Georgia, serif" fontSize="30" fill="currentColor">{formatStatNumber(total)}</text>
    {!compact && <text x="120" y="146" textAnchor="middle" fontSize="12" fill="#6d645a">{stat.measure === "count" ? "lignes" : measureWord(stat)}</text>}
  </svg>
  if (compact) return <div className="flex items-center gap-3">{ring}<ul className="grid min-w-0 gap-0.5 text-xs">{parts.slice(0, 4).map((part) => <li key={part.key} className="flex min-w-0 items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colorFor(part) }} /><span className="truncate">{statKeyLabel(part)}</span></li>)}</ul></div>
  const percentText = (value: number | null) => `${Math.round(((value ?? 0) / sum) * 100)} %`
  const line = (part: { key: string; label: string; rows: string[]; value: number | null }, revealedPart = false) => {
    const id = `part:${part.key}`
    return <button type="button" onClick={() => onPick?.(`${column} : ${statKeyLabel(part)}`, part.rows, id)} className={`grid w-full grid-cols-[0.75rem_minmax(0,1fr)_auto_3.2rem] items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-[13px] hover:bg-muted ${picked === id ? "bg-muted shadow-[inset_0_0_0_2px_var(--foreground)]" : ""}`}>
      <span className="size-3 rounded-sm" style={{ backgroundColor: colorFor(part) }} />
      <span className={`truncate ${revealedPart ? "italic" : ""}`}>{part.key === STAT_OTHERS ? `Autres (${rest.length})` : statKeyLabel(part)}</span>
      <span className="text-right font-semibold tabular-nums">{formatStatNumber(part.value)}</span>
      <span className="text-right tabular-nums text-muted-foreground">{percentText(part.value)}</span>
    </button>
  }
  return <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
    <div className="mx-auto w-full max-w-60">{ring}</div>
    <div className="grid min-w-0 justify-items-start gap-2">
      <ul className={`grid w-full gap-0.5 ${parts.length > 12 ? "max-h-96 overflow-auto pr-1" : ""}`}>
        {parts.map((part) => <li key={part.key}>
          {line(part, open && (ranks.get(part.key) ?? 0) >= 7)}
          {part.key === STAT_OTHERS && <div className="grid justify-items-start gap-1.5 py-1 pl-6">
            <MoreToggle open={listOpen} hidden={rest.length} column={column} onToggle={() => setListOpen((value) => !value)} collapsedLabel={`▸ détailler les ${rest.length} valeurs d’« Autres »`} openLabel="◂ replier le détail d’« Autres »" />
            {listOpen && <ul className="grid w-full gap-px border-l-2 border-[#a87a1f] pl-2">{rest.map((entry) => <li key={entry.key}>{line(entry)}</li>)}</ul>}
            <MoreToggle open={false} hidden={rest.length} column={column} onToggle={() => onToggle(place)} collapsedLabel={`▸ montrer toutes les parts (${positive.length}) dans l’anneau`} />
          </div>}
        </li>)}
      </ul>
      {open && <MoreToggle open hidden={positive.length - 7} column={column} onToggle={() => onToggle(place)} openLabel={`◂ regrouper les ${positive.length - 7} plus petites parts en « Autres »`} />}
    </div>
  </div>
}

/* --- Tableau croisé (à niveaux) --- */

function TableResult({ stat, data, rows, compact, expanded, onToggle, onPick, picked }: ResultProps & { rows: string[] }) {
  const cols = stat.cols ?? []
  const table = statTable(stat, rows, data.valueOf, { orderOf: data.orderOf, expanded: (level) => expanded.has(`table|${level}|${cols[level]}`) })
  const [depth, setDepth] = useState(1)
  const [toggled, setToggled] = useState<Set<string>>(() => new Set())
  const percent = percentChoices(stat).some((choice) => choice.value === stat.percent) ? stat.percent ?? "none" : "none"
  const grand = table.total.total
  const columnTotals = table.total.cells
  const shownOf = (node: StatTableNode<string>, index: number, value: number | null) => {
    if (value === null || percent === "none") return value
    return percentOf(value, percent === "total" ? grand : percent === "row" ? node.total : columnTotals[index]?.value ?? null)
  }
  // Un dégradé par niveau : un sous-total n'écrase pas les cases de ses enfants.
  const maxByDepth = new Map<number, number>()
  const scan = (nodes: StatTableNode<string>[]) => nodes.forEach((node) => { node.cells.forEach((cell, index) => maxByDepth.set(node.depth, Math.max(maxByDepth.get(node.depth) ?? 1e-9, shownOf(node, index, cell.value) ?? 0))); scan(node.children) })
  scan(table.total.children)
  const leaves = table.leaves.length
  const text = (node: StatTableNode<string>, index: number, value: number | null) => { const shown = shownOf(node, index, value); return shown === null ? "·" : percent === "none" ? formatStatNumber(value) : `${Math.round(shown)} %` }
  const totalText = (node: StatTableNode<string>) => percent === "none" || percent === "column" ? formatStatNumber(node.total) : percent === "row" ? "100 %" : `${Math.round(percentOf(node.total, grand) ?? 0)} %`
  if (compact) {
    const lines = table.total.children.slice(0, 6)
    const max = maxByDepth.get(0) ?? 1
    return <div className="grid gap-1">{lines.map((node) => <div key={node.key} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 text-[11px]">
      <span className="truncate text-muted-foreground">{statKeyLabel(node)}</span>
      {leaves ? <span className="flex gap-0.5">{node.cells.slice(0, 10).map((cell, index) => <span key={index} className="h-3.5 flex-1 rounded-sm" style={{ backgroundColor: cell.value === null ? "var(--muted)" : heat((shownOf(node, index, cell.value) ?? 0) / max).background }} />)}</span>
        : <span className="h-3 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${((node.total ?? 0) / Math.max(1e-9, ...lines.map((line) => line.total ?? 0))) * 100}%`, backgroundColor: SEQ }} /></span>}
    </div>)}</div>
  }
  const isOpen = (node: StatTableNode<string>) => { const path = node.path.join("\u001f"); return toggled.has(path) ? node.depth >= depth : node.depth < depth }
  const toggle = (node: StatTableNode<string>) => setToggled((current) => { const next = new Set(current); const path = node.path.join("\u001f"); if (next.has(path)) next.delete(path); else next.add(path); return next })
  const label = (node: StatTableNode<string>) => node.labels.map((value, index) => `${stat.by[index]} : ${value}`).join(" › ")
  // Le libellé de chaque colonne feuille (ses niveaux), pour les lignes concernées.
  const leafLabels = table.leaves.map((labels) => labels.map((value, index) => `${cols[index]} : ${value}`).join(" · "))
  const rowsBody: ReactNode[] = []
  const addRow = (node: StatTableNode<string>) => {
    const parent = node.children.length > 0
    const opened = parent && isOpen(node)
    const max = maxByDepth.get(node.depth) ?? 1
    rowsBody.push(<tr key={node.path.join("\u001f")} className={node.depth === 0 ? "[&>*]:border-t [&>*]:border-border" : ""}>
      <th scope="row" className={`sticky left-0 z-[1] max-w-72 min-w-48 truncate border-r border-b border-border/60 bg-card py-1 pr-2 text-left ${parent ? "font-semibold" : "font-medium"} ${node.depth === 0 ? "font-display text-[13.5px]" : node.depth > 1 ? "text-muted-foreground" : ""}`} style={{ paddingLeft: 6 + node.depth * 16 }} title={label(node)}>
        {parent ? <button type="button" aria-expanded={opened} onClick={() => toggle(node)} className="mr-1.5 inline-grid size-5 place-items-center rounded-md border bg-card align-middle text-[10px] text-muted-foreground hover:border-[#3b5c8a] hover:text-foreground" title={`${opened ? "Replier" : "Déplier"} « ${statKeyLabel(node)} »`}>{opened ? "▾" : "▸"}</button> : stat.by.length > 1 ? <span className="mr-1.5 inline-block w-5" /> : null}
        {statKeyLabel(node)}
      </th>
      {node.cells.map((cell, index) => {
        const id = `cell:${node.path.join("\u001f")}:${index}`
        if (cell.value === null) return <td key={index} className="h-8 min-w-12 border-b border-border/60 text-center text-muted-foreground">·</td>
        const colors = heat((shownOf(node, index, cell.value) ?? 0) / max)
        return <td key={index} className="h-8 min-w-12 border-b border-border/60 p-0 text-center font-semibold">
          <button type="button" onClick={() => onPick?.(`${label(node)} · ${leafLabels[index]}`, cell.rows, id)} title={`${label(node)} · ${leafLabels[index]} : ${formatStatNumber(cell.value)}`} className={`h-8 w-full px-1.5 tabular-nums ${picked === id ? "outline-2 -outline-offset-2 outline-foreground" : ""}`} style={colors}>{text(node, index, cell.value)}</button>
        </td>
      })}
      <td className="h-8 border-b border-l border-border bg-muted/60 p-0 text-center font-bold"><button type="button" onClick={() => onPick?.(label(node), node.rows, `row:${node.path.join("\u001f")}`)} className={`h-8 w-full px-2 tabular-nums ${picked === `row:${node.path.join("\u001f")}` ? "outline-2 -outline-offset-2 outline-foreground" : ""}`}>{totalText(node)}</button></td>
    </tr>)
    if (opened) node.children.forEach(addRow)
  }
  table.total.children.forEach(addRow)
  const headerDepth = table.headers.length
  return <div className="grid min-w-0 gap-2">
    {stat.by.length > 1 && <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      Déplier jusqu’à
      {stat.by.slice(0, -1).map((column, index) => <button key={column} type="button" aria-pressed={depth === index + 1 && !toggled.size} onClick={() => { setDepth(index + 1); setToggled(new Set()) }} className={`${mini} ${depth === index + 1 && !toggled.size ? "border-solid border-[#3b5c8a] text-foreground" : ""}`}>{stat.by[index + 1]}</button>)}
      <button type="button" onClick={() => { setDepth(stat.by.length); setToggled(new Set()) }} className={mini}>Tout déplier</button>
      <button type="button" onClick={() => { setDepth(0); setToggled(new Set()) }} className={mini}>Tout replier</button>
    </div>}
    <div className="max-h-[36rem] max-w-full overflow-auto rounded-xl border border-border/70" tabIndex={0} aria-label="Tableau croisé, défile dans les deux sens">
      <table className="border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            <th scope="col" rowSpan={Math.max(1, headerDepth)} className="sticky top-0 left-0 z-[4] min-w-48 border-r border-b border-border bg-[#f3eee3] px-2.5 py-1.5 text-left align-bottom font-semibold">
              <span className="block">{stat.by.join(" › ")}</span>
              {cols.length > 0 && <small className="block font-normal text-muted-foreground">{cols.join(" › ")}</small>}
            </th>
            {(table.headers[0] ?? []).map((header) => <HeaderCell key={`0:${header.key}`} header={header} rowSpan={header.leaf ? headerDepth : 1} top={0} hidden={table.hidden[0]} open={table.open[0]} onToggle={() => onToggle(`table|0|${cols[0]}`)} column={cols[0]} />)}
            <th scope="col" rowSpan={Math.max(1, headerDepth)} className="sticky top-0 z-[2] border-b border-l border-border bg-[#f3eee3] px-2 text-center font-bold">Total</th>
          </tr>
          {table.headers.slice(1).map((level, depthIndex) => <tr key={depthIndex}>{level.map((header, index) => <HeaderCell key={`${depthIndex + 1}:${index}:${header.key}`} header={header} rowSpan={1} top={1} hidden={table.hidden[depthIndex + 1]} open={table.open[depthIndex + 1]} onToggle={() => onToggle(`table|${depthIndex + 1}|${cols[depthIndex + 1]}`)} column={cols[depthIndex + 1]} />)}</tr>)}
        </thead>
        <tbody>{rowsBody}</tbody>
        <tfoot>
          <tr className="font-bold">
            <th scope="row" className="sticky bottom-0 left-0 z-[3] border-t-2 border-r border-border bg-[#f3eee3] py-1 pr-2 pl-2 text-left">Total général</th>
            {table.total.cells.map((cell, index) => <td key={index} className="sticky bottom-0 z-[1] h-8 border-t-2 border-border bg-[#f3eee3] px-1.5 text-center tabular-nums">{cell.value === null ? "·" : percent === "none" ? formatStatNumber(cell.value) : percent === "column" ? "100 %" : `${Math.round(percentOf(cell.value, grand) ?? 0)} %`}</td>)}
            <td className="sticky bottom-0 z-[1] h-8 border-t-2 border-l border-border bg-[#f3eee3] px-2 text-center tabular-nums">{percent === "none" || percent === "column" ? formatStatNumber(grand) : "100 %"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {leaves > 0 && <><span>peu</span><span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${heat(0).background}, ${heat(1).background})` }} /><span>beaucoup</span></>}
      {percent === "row" && <span>· chaque ligne fait 100 %</span>}
      {percent === "column" && <span>· chaque colonne fait 100 %</span>}
      {cols.map((column, level) => <MoreToggle key={column} open={table.open[level]} hidden={table.hidden[level]} column={column} onToggle={() => onToggle(`table|${level}|${column}`)} />)}
    </div>
  </div>
}

function HeaderCell({ header, rowSpan, top, hidden, open, onToggle, column }: { header: { key: string; label: string; span: number; revealed: boolean }; rowSpan: number; top: number; hidden: number; open: boolean; onToggle: () => void; column: string }) {
  return <th scope={header.span > 1 ? "colgroup" : "col"} colSpan={header.span} rowSpan={rowSpan} title={header.revealed ? `${statKeyLabel(header)} : sortie d’« Autres »` : statKeyLabel(header)}
    className={`sticky z-[2] max-w-32 truncate border-r border-b border-border/60 bg-[#f3eee3] px-1.5 py-1 text-center text-[11.5px] font-semibold text-muted-foreground ${top ? "top-7" : "top-0"} ${header.revealed ? "italic shadow-[inset_0_-3px_0_rgb(168_122_31_/_0.7)]" : ""}`}>
    {statKeyLabel(header)}
    {header.key === STAT_OTHERS && hidden > 0 && !open && <button type="button" onClick={onToggle} aria-label={`Déplier les ${hidden} autres valeurs de « ${column} »`} title={`Déplier les ${hidden} autres valeurs de « ${column} »`} className="ml-1 rounded-md border border-dashed border-[#a87a1f] bg-[#a87a1f]/10 px-1 text-[10.5px] font-bold text-foreground">▸ {hidden}</button>}
  </th>
}

/* ---------- La phrase ---------- */

function Sentence({ stat, onChange, columns, numeric, tabs, valuesOf }: {
  stat: StatDefinition
  onChange: (stat: StatDefinition) => void
  columns: string[]
  numeric: string[]
  tabs: string[]
  valuesOf: (column: string) => string[]
}) {
  const set = (changes: Partial<StatDefinition>) => onChange({ ...stat, ...changes })
  const where = stat.where ?? []
  const cols = stat.cols ?? []
  const used = new Set([...stat.by, ...cols])
  const free = (current?: string) => columns.filter((column) => column === current || !used.has(column))
  const options = (list: string[]) => list.map((column) => <option key={column} value={column}>{column}</option>)
  const setCondition = (index: number, changes: Partial<ViewCondition>) => set({ where: where.map((condition, at) => at === index ? { ...condition, ...changes } : condition) })
  const percents = percentChoices(stat)
  const level = (list: string[], index: number, key: "by" | "cols", label: string) => <span key={`${key}:${index}`} className="whitespace-nowrap">
    {index > 0 && <b className="mx-1 font-normal text-muted-foreground">›</b>}
    <ChipSelect label={label} value={list[index]} onChange={(value) => { const next = list.map((entry, at) => at === index ? value : entry); set(key === "by" ? { by: next } : { cols: next }) }}>{options(free(list[index]))}</ChipSelect>
    <button type="button" className={dropButton} aria-label="Retirer ce niveau" onClick={() => set(key === "by" ? { by: stat.by.filter((_, at) => at !== index), ...(stat.by.length === 1 ? { cols: [] } : {}) } : { cols: cols.filter((_, at) => at !== index) })}><X className="size-3.5" /></button>
  </span>
  return <div className="font-display text-[17px] leading-[2.15] [overflow-wrap:anywhere] sm:text-lg">
    <p>
      <ChipSelect label="Mesure" value={stat.measure} onChange={(value) => { const measure = value as StatDefinition["measure"]; set(measure === "count" ? { measure, field: undefined } : { measure, field: stat.field && numeric.includes(stat.field) ? stat.field : numeric[0] }) }}>
        {statMeasures.map((measure) => <option key={measure.value} value={measure.value} disabled={measure.numeric && !numeric.length}>{measure.label}</option>)}
      </ChipSelect>
      {stat.measure !== "count" && <ChipSelect label="Colonne mesurée" value={stat.field ?? ""} onChange={(field) => set({ field })}>{options(numeric)}</ChipSelect>}
      {" "}<b className="font-semibold">les lignes</b>{" "}
      {tabs.length > 1 && <ChipSelect label="Lignes de" value={stat.source ?? ""} onChange={(source) => set({ source: source || undefined })}>
        <option value="">de tout l’index</option>
        {tabs.map((tab) => <option key={tab} value={tab}>de l’onglet {tab}</option>)}
      </ChipSelect>}
      {where.map((condition, index) => {
        const operator = viewOperators.find((candidate) => candidate.value === condition.operator)
        const listId = `stat-values-${index}`
        return <span key={index} className="whitespace-normal">
          {" "}<b className="font-semibold">{index ? "et" : "où"}</b>{" "}
          <ChipSelect label="Colonne de la condition" value={condition.column} onChange={(column) => setCondition(index, { column, value: "" })}>{options(columns.includes(condition.column) ? columns : [condition.column, ...columns])}</ChipSelect>
          <ChipSelect label="Comparaison" value={condition.operator} onChange={(value) => setCondition(index, { operator: value as ViewCondition["operator"] })}>{viewOperators.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}</ChipSelect>
          {operator?.needsValue && <><input aria-label="Valeur" list={listId} value={condition.value} onChange={(event) => setCondition(index, { value: event.target.value })} className={`${chip} w-32`} placeholder="valeur" /><datalist id={listId}>{valuesOf(condition.column).map((value) => <option key={value} value={value} />)}</datalist></>}
          <button type="button" className={dropButton} aria-label="Retirer cette condition" onClick={() => set({ where: where.filter((_, at) => at !== index) })}><X className="size-3.5" /></button>
        </span>
      })}
      {" "}{where.length < STAT_LIMITS.conditions && <button type="button" className={mini} onClick={() => set({ where: [...where, { column: columns.find((column) => !numeric.includes(column)) ?? columns[0] ?? "", operator: "est", value: "" }] })}>+ condition</button>}
    </p>
    <p>
      <b className="font-semibold">{cols.length ? "en lignes" : "réparties par"}</b>{" "}
      {stat.by.length
        ? <>{stat.by.map((_, index) => level(stat.by, index, "by", `Niveau ${index + 1} des lignes`))}
          {stat.by.length < STAT_LIMITS.levels && free().length > 0 && <button type="button" className={mini} onClick={() => set({ by: [...stat.by, free()[0]] })}>+ niveau</button>}
          {!cols.length && free().length > 0 && <button type="button" className={mini} onClick={() => set({ cols: [free()[0]], form: "table" })}>+ en colonnes</button>}</>
        : <ChipSelect label="Réparties par" value="" onChange={(column) => set({ by: column ? [column] : [] })}><option value="">rien</option>{options(columns)}</ChipSelect>}
    </p>
    {cols.length > 0 && <p>
      <b className="font-semibold">en colonnes</b>{" "}
      {cols.map((_, index) => level(cols, index, "cols", `Niveau ${index + 1} des colonnes`))}
      {cols.length < STAT_LIMITS.columnLevels && free().length > 0 && <button type="button" className={mini} onClick={() => set({ cols: [...cols, free()[0]] })}>+ niveau</button>}
      {stat.form === "table" && <span className="font-sans text-[13px] text-muted-foreground whitespace-nowrap"> · <ChipSelect label="Valeurs gardées par niveau de colonnes" value={String(stat.top ?? 6)} onChange={(value) => set({ top: Number(value) })}>{tableTopChoices.map((choice) => <option key={choice} value={choice}>{choice ? `les ${choice}` : "toutes les"}</option>)}</ChipSelect> valeurs les plus fréquentes</span>}
    </p>}
    {percents.length > 1 && <p>
      <b className="font-semibold">afficher</b>{" "}
      <ChipSelect label="Afficher" value={stat.percent ?? "none"} onChange={(value) => set({ percent: value as StatDefinition["percent"] })}>{percents.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</ChipSelect>
    </p>}
  </div>
}

/* ---------- L'onglet ---------- */

// La phrase seule (sans nom ni épingle), dans l'ordre que lui donne le nettoyage : deux réglages égaux s'écrivent pareil.
const comparable = (stat: StatDefinition) => JSON.stringify(cleanStat({ ...stat, id: "x", title: "x", pinned: false }))

function startStat(columns: string[], data: StatData, numeric: string[]): StatDefinition {
  // Une première colonne à répartir : une liste (ses choix), sinon Type, sinon la première qui n'est pas un nombre.
  const column = columns.find((candidate) => data.orderOf(candidate).length > 1) ?? columns.find((candidate) => /^(type|catégorie|categorie)$/i.test(candidate)) ?? columns.find((candidate) => !numeric.includes(candidate) && !/^nom$/i.test(candidate)) ?? columns[0]
  return fitForm({ id: "", title: "", measure: "count", by: column ? [column] : [], form: "bars" })
}

export function IndexStats({ stats, pinnedOnly = false, onManage, rows, columns, tabs, valueOf, tabOf, nameOf, optionsOf, onOpen, canEdit, onSave }: IndexStatsProps) {
  const ordered = useMemo(() => pinnedFirst(stats), [stats])
  const data = useMemo<StatData>(() => ({
    rows, valueOf, tabOf,
    orderOf: (column) => column === TAB_PSEUDO && tabs.length > 1 && !optionsOf(column).length ? tabs : optionsOf(column).map((option) => option.value),
    colorOf: (column, value) => optionsOf(column).find((option) => option.value.toLocaleLowerCase("fr") === value.toLocaleLowerCase("fr"))?.color,
  }), [optionsOf, rows, tabOf, tabs, valueOf])
  const numeric = useMemo(() => numericColumns(columns, rows, valueOf), [columns, rows, valueOf])
  const [editing, setEditing] = useState<string | null>(() => ordered[0]?.id ?? null)
  const [draft, setDraft] = useState<StatDefinition>(() => ordered[0] ?? startStat(columns, data, numeric))
  const [title, setTitle] = useState(() => ordered[0]?.title ?? "")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [selection, setSelection] = useState<{ label: string; rows: string[]; id: string; draft: string } | null>(null)
  const [libFilter, setLibFilter] = useState<"all" | "pinned">("all")
  const [libQuery, setLibQuery] = useState("")
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [formHint, setFormHint] = useState("")
  const [toast, setToast] = useState<{ text: string; undo?: StatDefinition[] } | null>(null)

  const saved = editing ? stats.find((stat) => stat.id === editing) ?? null : null
  const shownTitle = title.trim() || autoStatTitle(draft)
  const dirty = !saved || comparable(saved) !== comparable(draft) || saved.title !== shownTitle
  const draftKey = comparable(draft)
  const picked = selection && selection.draft === draftKey ? selection : null
  // Les valeurs proposées dans les conditions : celles des colonnes qu'elles visent.
  const conditionColumns = (draft.where ?? []).map((condition) => condition.column).join("\u001f")
  const conditionValues = useMemo(() => new Map(conditionColumns.split("\u001f").filter(Boolean).map((column) => {
    const seen = new Map<string, string>()
    for (const row of rows) for (const value of cellParts(valueOf(row, column))) if (!seen.has(value.toLocaleLowerCase("fr"))) seen.set(value.toLocaleLowerCase("fr"), value)
    return [column, [...seen.values()].sort((left, right) => left.localeCompare(right, "fr", { numeric: true })).slice(0, 80)]
  })), [conditionColumns, rows, valueOf])
  const valuesOf = (column: string) => conditionValues.get(column) ?? []

  function flash(text: string, undo?: StatDefinition[]) {
    setToast({ text, undo })
    window.setTimeout(() => setToast((current) => current?.text === text ? null : current), undo ? 6000 : 3200)
  }

  async function persist(next: StatDefinition[], message: string, undo?: StatDefinition[]) {
    const cleaned = cleanStats(next)
    setPending(true); setError("")
    try {
      await onSave(cleaned)
      flash(message, undo)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Les statistiques n’ont pas pu être enregistrées.")
      return false
    } finally {
      setPending(false)
    }
  }

  function load(stat: StatDefinition | null) {
    setEditing(stat?.id ?? null)
    setDraft(stat ?? startStat(columns, data, numeric))
    setTitle(stat?.title ?? "")
    setFormHint("")
  }

  async function save(copy = false) {
    if (!canEdit) return
    const current = copy ? null : saved
    if (!current && stats.length >= STAT_LIMITS.stats) { setError(`${STAT_LIMITS.stats} statistiques au plus par onglet : supprime-en une d’abord.`); return }
    const id = current?.id ?? newStatId(stats)
    const entry: StatDefinition = { ...fitForm(draft), id, title: copy ? `${shownTitle} (copie)`.slice(0, STAT_LIMITS.title) : shownTitle }
    // Une copie ou une nouvelle n'est pas épinglée ; une mise à jour garde son épingle.
    delete entry.pinned
    if (current?.pinned) entry.pinned = true
    const next = current ? stats.map((stat) => stat.id === id ? entry : stat) : copy && saved ? stats.flatMap((stat) => stat.id === saved.id ? [stat, entry] : [stat]) : [entry, ...stats]
    if (await persist(next, current ? `« ${entry.title} » mise à jour.` : copy ? `Copie enregistrée : « ${entry.title} ».` : `« ${entry.title} » enregistrée.`)) {
      setEditing(id); setDraft(entry); setTitle(entry.title)
    }
  }

  async function togglePin(id: string) {
    const target = stats.find((stat) => stat.id === id)
    if (!target) return
    const next = stats.map((stat) => { if (stat.id !== id) return stat; const copy = { ...stat }; if (stat.pinned) delete copy.pinned; else copy.pinned = true; return copy })
    await persist(next, target.pinned ? `« ${target.title} » n’est plus épinglée.` : `« ${target.title} » épinglée en tête.`)
  }

  async function duplicate(id: string) {
    const target = stats.find((stat) => stat.id === id)
    if (!target) return
    if (stats.length >= STAT_LIMITS.stats) { setError(`${STAT_LIMITS.stats} statistiques au plus par onglet : supprime-en une d’abord.`); return }
    const copy: StatDefinition = { ...target, id: newStatId(stats), title: `${target.title} (copie)`.slice(0, STAT_LIMITS.title) }
    delete copy.pinned
    await persist(stats.flatMap((stat) => stat.id === id ? [stat, copy] : [stat]), `« ${target.title} » dupliquée.`)
  }

  async function remove(id: string) {
    const target = stats.find((stat) => stat.id === id)
    if (!target) return
    if (await persist(stats.filter((stat) => stat.id !== id), `« ${target.title} » supprimée.`, stats) && editing === id) setEditing(null)
  }

  async function rename(id: string, value: string) {
    setRenaming(null)
    const target = stats.find((stat) => stat.id === id)
    const name = value.replace(/\s+/g, " ").trim().slice(0, STAT_LIMITS.title)
    if (!target || !name || name === target.title) return
    if (await persist(stats.map((stat) => stat.id === id ? { ...stat, title: name } : stat), `Renommée : « ${name} ».`) && editing === id) setTitle(name)
  }

  const onToggle = (key: string) => setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const pick: PickRows = (label, list, id) => setSelection({ label, rows: list, id, draft: draftKey })
  const listed = ordered.filter((stat) => (libFilter === "all" || stat.pinned) && (!libQuery.trim() || `${stat.title} ${autoStatTitle(stat)}`.toLocaleLowerCase("fr").includes(libQuery.trim().toLocaleLowerCase("fr"))))
  const pinned = ordered.filter((stat) => stat.pinned)
  const concerned = picked?.rows ?? statRows(draft, rows, valueOf, tabOf)
  const uniqueConcerned = [...new Set(concerned)]

  const manage = onManage && <Button type="button" variant="outline" size="sm" onClick={onManage}><Pencil />Créer et épingler des stats</Button>
  if (pinnedOnly) return pinned.length
    ? <div className="grid gap-3">{manage && <div className="flex justify-end">{manage}</div>}<section aria-label="Statistiques épinglées" className="grid gap-3 lg:grid-cols-2">
      {pinned.map((stat) => <article key={stat.id} className="grid min-w-0 content-start gap-2.5 rounded-2xl border bg-card p-4">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"><Pin className="size-3 shrink-0 text-[#a87a1f]" /><span className="truncate">{stat.title}</span></span>
        <StatResult stat={stat} data={data} expanded={expanded} onToggle={onToggle} />
      </article>)}
    </section></div>
    : <div className="grid place-items-center gap-3 rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground"><p>Aucune statistique épinglée. Crée-les et épingle-les dans « Modifier › Stats ».</p>{manage}</div>

  return <div className="grid gap-4">
    {pinned.length > 0 && <section aria-label="Statistiques épinglées" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {pinned.map((stat) => <button key={stat.id} type="button" onClick={() => load(stat)} className={`grid min-w-0 content-start gap-2.5 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-[#3b5c8a] ${editing === stat.id ? "border-[#3b5c8a] shadow-[inset_3px_0_0_#3b5c8a]" : ""}`}>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"><Pin className="size-3 shrink-0 text-[#a87a1f]" /><span className="truncate">{stat.title}</span></span>
        <StatResult stat={stat} data={data} compact expanded={expanded} onToggle={onToggle} />
      </button>)}
    </section>}

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Constructeur de statistique" className="grid min-w-0 overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3.5 pb-3">
          <div className="grid min-w-0 flex-[1_1_18rem] gap-0.5">
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={STAT_LIMITS.title} placeholder={autoStatTitle(draft)} aria-label="Nom de la statistique" readOnly={!canEdit}
              onKeyDown={(event) => { if (event.key === "Enter" && canEdit) { event.preventDefault(); void save() } }}
              className="-ml-2 w-[calc(100%+0.5rem)] min-w-0 truncate rounded-lg border border-transparent bg-transparent px-2 py-0.5 font-display text-xl font-semibold placeholder:font-normal placeholder:text-muted-foreground placeholder:italic hover:border-border/60 focus:border-border focus:bg-background focus:outline-none" />
            {canEdit && <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite"><span className={`size-1.5 rounded-full ${!saved ? "bg-[#3b5c8a]" : dirty ? "bg-[#a87a1f]" : "bg-[#13917a]"}`} />{!saved ? "Nouvelle statistique" : dirty ? "Modifications non enregistrées" : "Enregistrée"}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => load(null)}><Plus />Nouvelle</Button>
            {canEdit && saved && <Button type="button" variant="outline" size="sm" aria-pressed={Boolean(saved.pinned)} disabled={pending} onClick={() => void togglePin(saved.id)} className={saved.pinned ? "border-[#a87a1f]/70 bg-[#a87a1f]/15" : ""}>{saved.pinned ? <PinOff /> : <Pin />}{saved.pinned ? "Épinglée" : "Épingler"}</Button>}
            {canEdit && saved && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void save(true)}><Copy />Copie</Button>}
            {canEdit && <Button type="button" size="sm" disabled={pending || (Boolean(saved) && !dirty)} onClick={() => void save()}>{pending ? <LoaderCircle className="animate-spin" /> : null}Enregistrer</Button>}
          </div>
        </div>
        <div className="border-y border-border/60 bg-background/45 px-4 py-2.5">
          <Sentence stat={draft} onChange={(next) => { setDraft(fitForm(next)); setFormHint("") }} columns={columns} numeric={numeric} tabs={tabs} valuesOf={valuesOf} />
        </div>
        <div className="flex flex-wrap items-center gap-1 px-4 pt-3" role="group" aria-label="Forme">
          {statForms.map((form) => {
            const problem = formProblem(draft, form.value)
            return <button key={form.value} type="button" aria-pressed={draft.form === form.value} aria-disabled={Boolean(problem)} title={problem ? `${form.label} : ${problem}` : form.label}
              onClick={() => { if (problem) { setFormHint(`${form.label} : ${problem}`); return } setFormHint(""); setDraft(fitForm({ ...draft, form: form.value })) }}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 pl-1 text-[12.5px] whitespace-nowrap ${draft.form === form.value ? "border-[#3b5c8a] bg-[#3b5c8a]/10 font-semibold text-foreground" : problem ? "border-dashed border-border/70 text-muted-foreground opacity-50" : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"}`}>
              <FormIcon form={form.value} />{form.label}
            </button>
          })}
        </div>
        {formHint && <p className="px-4 pt-1.5 text-xs text-muted-foreground" role="status">{formHint}</p>}
        <div className="min-w-0 px-4 pt-3 pb-4" aria-live="polite">
          <StatResult key={`${draft.form}|${draft.by.join("›")}|${(draft.cols ?? []).join("›")}`} stat={draft} data={data} expanded={expanded} onToggle={onToggle} onPick={pick} picked={picked?.id} onTop={(top) => setDraft(fitForm({ ...draft, top }))} />
        </div>
        <div className="grid gap-2 border-t border-border/60 bg-background/30 px-4 pt-3 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Lignes concernées</span>
            <span className="max-w-full rounded-full bg-muted px-2.5 py-0.5 text-xs [overflow-wrap:anywhere]">{picked?.label ?? (draft.where?.length ? "Lignes retenues" : "Toutes les lignes")} · {uniqueConcerned.length}</span>
            {picked && <button type="button" className={mini} onClick={() => setSelection(null)}>Toutes</button>}
          </div>
          <ul className="grid max-h-60 grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-1.5 overflow-auto pr-0.5">
            {uniqueConcerned.slice(0, 300).map((row) => <li key={row}><button type="button" onClick={() => onOpen(row)} className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1 text-left text-[13px] hover:bg-muted" title={`Ouvrir la fiche de « ${nameOf(row) || "Sans nom"} »`}>
              <span className="min-w-0"><span className="block truncate font-semibold">{nameOf(row) || "Sans nom"}</span>{tabs.length > 1 && <span className="block truncate text-xs text-muted-foreground">{tabOf(row)}</span>}</span><span className="text-muted-foreground" aria-hidden="true">›</span>
            </button></li>)}
            {!uniqueConcerned.length && <li className="text-sm text-muted-foreground">Aucune ligne.</li>}
          </ul>
          {uniqueConcerned.length > 300 && <p className="text-xs text-muted-foreground">… et {uniqueConcerned.length - 300} autres lignes.</p>}
        </div>
        {error && <p className="border-t border-destructive/25 bg-destructive/5 px-4 py-2 text-sm text-destructive" role="alert">{error}</p>}
      </section>

      <aside aria-labelledby="stats-library-title" className="grid min-w-0 gap-2.5 rounded-2xl border bg-card p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
        <h2 id="stats-library-title" className="px-1 font-display text-lg font-semibold">Enregistrées<span className="ml-1.5 font-sans text-xs font-semibold text-muted-foreground">{stats.length}</span></h2>
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="inline-flex rounded-lg border bg-background p-0.5" role="group" aria-label="Filtrer">
            {([["all", "Toutes", stats.length], ["pinned", "Épinglées", pinned.length]] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={libFilter === value} onClick={() => setLibFilter(value)} className={`rounded-md px-2 py-0.5 text-xs ${libFilter === value ? "bg-card font-semibold text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground"}`}>{label}<small className="ml-1 text-[11px] text-muted-foreground tabular-nums">{count}</small></button>)}
          </span>
          <label className="relative min-w-0 flex-[1_1_7rem]"><Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input type="search" value={libQuery} onChange={(event) => setLibQuery(event.target.value)} placeholder="Rechercher…" aria-label="Rechercher une statistique enregistrée" className="w-full rounded-lg border bg-background py-1 pr-2 pl-7 text-[13px]" /></label>
        </div>
        <ul className="grid min-h-0 content-start gap-0.5 overflow-auto" aria-label="Statistiques enregistrées">
          {listed.map((stat) => <li key={stat.id} className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-xl hover:bg-muted ${editing === stat.id ? "bg-[#3b5c8a]/10 shadow-[inset_3px_0_0_#3b5c8a]" : ""}`}>
            {renaming?.id === stat.id
              ? <input autoFocus value={renaming.value} maxLength={STAT_LIMITS.title} aria-label="Nouveau nom de la statistique" onChange={(event) => setRenaming({ id: stat.id, value: event.target.value })} onBlur={() => void rename(stat.id, renaming.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void rename(stat.id, renaming.value) } else if (event.key === "Escape") { event.preventDefault(); setRenaming(null) } }} className="col-span-2 m-1.5 min-w-0 rounded-lg border border-[#3b5c8a] bg-card px-2 py-1 text-[13.5px] font-semibold" />
              : <>
                <button type="button" onClick={() => load(stat)} title={`Ouvrir « ${stat.title} »`} className="grid min-w-0 grid-cols-[2.6rem_minmax(0,1fr)] items-center gap-x-2.5 rounded-xl py-1.5 pr-1 pl-2 text-left">
                  <span className="row-span-2 grid h-8 w-10 place-items-center rounded-lg border border-border/60 bg-background"><FormIcon form={stat.form} className="h-5 w-7" /></span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold"><span className="truncate">{stat.title}</span>{stat.pinned && <Pin className="size-3 shrink-0 text-[#a87a1f]" aria-label="épinglée" />}</span>
                  <span className="truncate text-xs text-muted-foreground">{statForms.find((form) => form.value === stat.form)?.label}{stat.title !== autoStatTitle(stat) ? ` · ${autoStatTitle(stat)}` : ""}</span>
                </button>
                {canEdit ? <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" aria-label={`Actions pour « ${stat.title} »`} disabled={pending} className="mr-1 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground data-[state=open]:bg-card data-[state=open]:shadow-[0_0_0_1px_var(--border)]"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuItem onSelect={() => load(stat)}><Pencil />Modifier</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setRenaming({ id: stat.id, value: stat.title })}><TextCursorInput />Renommer</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void duplicate(stat.id)}><Copy />Dupliquer</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void togglePin(stat.id)}>{stat.pinned ? <PinOff /> : <Pin />}{stat.pinned ? "Ne plus épingler" : "Épingler en tête"}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void remove(stat.id)}><Trash2 />Supprimer</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu> : <span />}
              </>}
          </li>)}
          {!listed.length && <li className="rounded-xl border border-dashed px-2 py-5 text-center text-[13px] text-muted-foreground">{libQuery.trim() ? `Aucune statistique ne contient « ${libQuery.trim()} ».` : libFilter === "pinned" ? "Aucune statistique épinglée." : "Aucune statistique enregistrée."}</li>}
        </ul>
      </aside>
    </div>

    {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-foreground px-3.5 py-2 text-[13px] text-background shadow-lg">
      <span>{toast.text}</span>
      {toast.undo && canEdit && <button type="button" className="rounded-md px-1.5 py-0.5 font-bold text-[#f0c46c] hover:underline" onClick={() => { const undo = toast.undo!; setToast(null); void persist(undo, "Suppression annulée.") }}>Annuler</button>}
    </div>}
  </div>
}
