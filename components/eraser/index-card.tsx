"use client"

/**
 * Le dessin d'une carte d'index (« Modifier » › Cartes) : sa forme, son image, sa couleur
 * d'accent et ses blocs, remplis avec une ligne. Le même composant sert à la grille de
 * cartes de l'index et à l'aperçu de l'éditeur, qui y choisit un bloc d'un clic.
 */
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { Check, ChevronDown, ChevronRight, ImageIcon, LayoutGrid, Pencil, Plus, Table2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

import { GaugeCell, IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexImage } from "@/components/eraser/index-image"
import { IndexRichText } from "@/components/eraser/index-references"
import { columnStyleCss, pillStyle } from "@/components/eraser/index-style"
import { characteristicShort, type CharacteristicName } from "@/lib/characteristics"
import {
  cardListValues,
  cardNumber,
  cardWidths,
  DEFAULT_CARD_ACCENT,
  isCardColor,
  plainCardText,
  readableListValue,
  type CardAspect,
  type CardBlock,
  type CardShape,
  type CardTemplate,
  type CardTextSize,
  type CardTone,
} from "@/lib/index-cards"
import { foldName, gaugeScaleOf, isCheckedValue, isImageSource, matchChoice, normalizeSpec, parseGaugeCell, parseGlyphValue, type IndexColumnSpec } from "@/lib/index-columns"
import { formatIndexNumber, parseIndexNumber } from "@/lib/index-numbers"
import { cn } from "@/lib/utils"

/** Une ligne vue par une carte : la valeur de chaque colonne (comme le tableau la montre) et son type. */
export type CardRowSource = {
  value: (header: string) => string
  spec: (header: string) => IndexColumnSpec | undefined
}

// ---------------------------------------------------------------------------
// Valeurs
// ---------------------------------------------------------------------------

/** Le texte d'une case sur une carte : un nombre formaté, une case cochée, une liste lisible. */
function cellText(row: CardRowSource, column: string) {
  const raw = row.value(column) ?? ""
  if (!raw.trim()) return ""
  const spec = row.spec(column)
  const kind = spec ? normalizeSpec(spec).kind : "rich"
  if (kind === "checkbox") return isCheckedValue(raw, spec?.emptyChecked) ? "Oui" : "Non"
  if (kind === "gauge") return parseGaugeCell(raw).count.trim()
  if (kind === "number" && spec?.number) {
    const parsed = parseIndexNumber(plainCardText(raw), spec.number)
    if (parsed) return formatIndexNumber(parsed, spec.number)
  }
  return readableListValue(plainCardText(raw))
}

/** La couleur d'une valeur dans une liste à couleurs (« Actif » en rouge…). */
function choiceColor(row: CardRowSource, column: string, value?: string) {
  const spec = row.spec(column)
  const options = spec?.options
  if (!options?.length) return undefined
  return matchChoice((value ?? plainCardText(row.value(column) ?? "")).trim(), options)?.color
}

/** La couleur d'accent de la carte pour une ligne : une colonne Couleur, un choix coloré, sinon la couleur choisie. */
export function cardAccent(card: CardTemplate, row: CardRowSource) {
  const column = card.accent?.column
  if (column) {
    const value = plainCardText(row.value(column) ?? "")
    if (value && isCardColor(value)) return value
    const color = choiceColor(row, column, cardListValues(value)[0])
    if (color && color !== "muted") return color
  }
  return card.accent?.color ?? DEFAULT_CARD_ACCENT
}

const textSizes: Record<CardTextSize, string> = { xs: "text-xs leading-5", sm: "text-sm leading-5", md: "text-base leading-6", lg: "text-lg leading-6", xl: "text-xl leading-7" }
const titleSizes: Record<CardTextSize, string> = { xs: "text-sm leading-5", sm: "text-[15px] leading-5", md: "text-base leading-tight", lg: "text-lg leading-tight", xl: "text-2xl leading-tight" }

/** Une couleur de texte en classes et style. `column` : le style imposé de la colonne et la couleur de son choix. */
function toneLook(value: CardTone | undefined, accent: string, row?: CardRowSource, column?: string, text?: string): { className: string; style: CSSProperties } {
  if (!value || value === "default") return { className: "", style: {} }
  if (value === "muted") return { className: "text-muted-foreground", style: {} }
  if (value === "accent") return { className: "", style: { color: accent } }
  if (value === "column") {
    if (!row || !column) return { className: "", style: {} }
    const spec = row.spec(column)
    const look = columnStyleCss(spec?.style)
    const color = choiceColor(row, column, text)
    return { className: look.className, style: { ...look.style, ...(color && color !== "muted" && !spec?.style?.color ? { color } : {}) } }
  }
  return { className: "", style: { color: value } }
}

function clampStyle(lines: number | undefined): CSSProperties {
  if (!lines) return {}
  return { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" }
}

const aspectClass = (aspect: CardAspect | undefined) => ({ aspectRatio: (aspect ?? "4/3").replace("/", " / ") }) as CSSProperties
const shapeClass = (shape: CardShape | undefined) => shape === "circle" ? "rounded-full" : shape === "rounded" ? "rounded-xl" : ""

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toLocaleUpperCase("fr") ?? "").join("")
}

/**
 * Une image de carte : une image (importée ou par adresse), une icône, un symbole. Sans
 * rien : un fond à la couleur de l'accent avec les initiales, ou un pictogramme discret.
 */
function CardPicture({ row, column, accent, fit = "cover", shape, tint = false, alt, initials, className = "", style }: {
  row: CardRowSource
  column: string
  accent: string
  fit?: "cover" | "contain"
  shape?: CardShape
  tint?: boolean
  alt: string
  initials: string
  className?: string
  style?: CSSProperties
}) {
  const [failed, setFailed] = useState("")
  const raw = (row.value(column) ?? "").trim()
  const spec = row.spec(column)
  const kind = spec ? normalizeSpec(spec).kind : undefined
  const first = raw.split(/\n+/).map((item) => item.trim()).filter(Boolean)[0] ?? ""
  const glyph = kind === "glyph" ? parseGlyphValue(raw) : null
  const background: CSSProperties = tint
    ? { background: `radial-gradient(circle at 35% 30%, ${accent}, color-mix(in srgb, ${accent} 78%, #1d140c) 60%, #1d140c 130%)`, color: "#fffaf0" }
    : { backgroundColor: `color-mix(in srgb, ${accent} 10%, var(--muted))`, color: accent }
  const box = cn("relative flex shrink-0 items-center justify-center overflow-hidden", shapeClass(shape), className)
  if (glyph && (glyph.icon || glyph.emoji)) return <span className={box} style={{ ...background, ...style }}><IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className="size-[55%]" filled={Boolean(glyph.emoji) || tint} /></span>
  const fallback = initials
    ? <span className="font-display text-[1.15em] font-semibold opacity-80" aria-hidden="true">{initials}</span>
    : <ImageIcon className="size-1/3 max-h-8 max-w-8 opacity-40" aria-hidden="true" />
  return <span className={box} style={{ ...background, ...style }}>
    {first && isImageSource(first) && failed !== first
      // eslint-disable-next-line @next/next/no-img-element -- images d'index : adresses importées ou externes, servies telles quelles
      ? <img src={first} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(first)} ref={(node) => { if (node?.complete && node.naturalWidth === 0) setFailed(first) }} className={cn("size-full", fit === "contain" ? "object-contain p-[6%]" : "object-cover", shapeClass(shape))} />
      : first && !isImageSource(first) ? <IndexImage value={first} alt={alt} className="text-[2em]" fallback={fallback} /> : fallback}
  </span>
}

// ---------------------------------------------------------------------------
// Blocs
// ---------------------------------------------------------------------------

type BlockContext = { card: CardTemplate; row: CardRowSource; accent: string; onImage: boolean; name: string }

function Pill({ value, color, variant = "soft" }: { value: string; color?: string; variant?: CardBlock["pill"] }) {
  const tint = color && color !== "muted" ? color : undefined
  const style: CSSProperties | undefined = !tint
    ? undefined
    : variant === "solid" ? { backgroundColor: tint, color: "#fffaf0", borderColor: tint }
      : variant === "outline" ? { color: tint, borderColor: tint, backgroundColor: "transparent" }
        : pillStyle(tint)
  return <span className="inline-block max-w-full whitespace-normal break-words rounded-full border border-foreground/15 bg-muted/40 px-2 py-0.5 text-[11px] font-medium leading-4 [overflow-wrap:anywhere]" style={style}>{value}</span>
}

/**
 * Les pastilles d'une ou plusieurs colonnes. Couleur « accent » ou un code : toutes de cette
 * couleur ; sinon chaque valeur prend la couleur de sa liste (neutre sans couleur).
 */
function pillsOf(ctx: BlockContext, columns: string[], variant: CardBlock["pill"], tone: CardTone | undefined) {
  const forced = tone === "accent" ? ctx.accent : tone && tone.startsWith("#") ? tone : undefined
  return columns.flatMap((column) => {
    const values = cardListValues(cellText(ctx.row, column))
    return values.map((value) => <Pill key={`${column}:${value}`} value={value} color={forced ?? (tone === "muted" ? undefined : choiceColor(ctx.row, column, value))} variant={variant} />)
  })
}

function BlockBody({ block, ctx }: { block: CardBlock; ctx: BlockContext }): ReactNode {
  const { row, accent } = ctx
  const align = block.align ?? (ctx.card.align === "center" ? "center" : undefined)
  const alignClass = align === "center" ? "text-center justify-center" : align === "right" ? "text-right justify-end" : ""
  const base = (size: CardTextSize | undefined, fallback: CardTextSize) => textSizes[size ?? fallback]
  const flags = cn(block.bold && "font-semibold", block.italic && "italic", block.caps && "uppercase tracking-[.12em] text-[10px]")
  switch (block.type) {
    case "title": {
      if (!block.column) return null
      const raw = row.value(block.column) ?? ""
      const name = cellText(row, block.column)
      if (!name) return null
      const look = toneLook(block.tone, accent, row, block.column, name)
      const badges = block.badges?.length ? pillsOf(ctx, block.badges, "soft", "column") : []
      const rich = /<[a-z][^>]*>/i.test(raw) && (!block.tone || block.tone === "column")
      return <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", alignClass)}>
        <h3 className={cn(block.font === "sans" ? "font-sans" : "font-display", "min-w-0 font-semibold tracking-[-0.01em]", titleSizes[block.size ?? "md"], block.italic && "italic", look.className)} style={{ ...look.style, ...clampStyle(block.clamp ?? 2) }}>
          {rich ? <IndexRichText as="span" html={raw} className="[&_p]:inline" /> : name}
        </h3>
        {badges}
      </div>
    }
    case "line": {
      const pieces = (block.parts ?? []).flatMap((part) => {
        const value = cellText(row, part.column)
        if (!value) return []
        const look = toneLook(part.tone, accent, row, part.column, value)
        return [<span key={part.column} className={cn(part.bold && "font-semibold", part.italic && "italic", look.className)} style={look.style}>{part.prefix}{value}{part.suffix}</span>]
      })
      if (!pieces.length) return null
      const look = toneLook(block.tone, accent)
      const separator = block.separator ?? " · "
      return <p className={cn(base(block.size, "sm"), block.font === "display" && "font-display", flags, alignClass, look.className, "min-w-0 break-words [overflow-wrap:anywhere]")} style={{ ...look.style, ...clampStyle(block.clamp) }}>
        {pieces.map((piece, index) => <span key={index}>{index > 0 && <span className="whitespace-pre opacity-70">{separator}</span>}{piece}</span>)}
      </p>
    }
    case "text": {
      if (!block.column) return null
      const html = row.value(block.column) ?? ""
      const plain = plainCardText(html)
      if (!plain) return null
      // Une liste gardée en JSON (« ["Lame"] ») s'écrit lisiblement.
      const listed = /^[[{]/.test(plain) ? readableListValue(plain) : null
      const look = toneLook(block.tone, accent, row, block.column)
      return <div className={cn("grid min-w-0 gap-0.5", block.quote && "border-l-2 pl-2.5")} style={block.quote ? { borderColor: accent } : undefined}>
        {block.showLabel && <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{block.label || block.column}</p>}
        <div className={cn(base(block.size, "sm"), flags, alignClass, look.className, "min-w-0 break-words [overflow-wrap:anywhere] [&_p]:m-0")} style={{ ...look.style, ...clampStyle(block.clamp) }}>
          {listed !== null ? listed : <IndexRichText html={html} className="[&_p+p]:mt-1" />}
        </div>
      </div>
    }
    case "pills": {
      const pills = pillsOf(ctx, block.columns ?? [], block.pill, block.tone)
      if (!pills.length) return null
      return <div className="grid gap-1">
        {block.showLabel && block.label && <p className={cn("text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground", alignClass)}>{block.label}</p>}
        <div className={cn("flex min-w-0 flex-wrap gap-1", block.stacked && "flex-col", block.stacked ? (align === "center" ? "items-center" : align === "right" ? "items-end" : "items-start") : alignClass)}>{pills}</div>
      </div>
    }
    case "field": {
      if (!block.column) return null
      const value = cellText(row, block.column)
      if (!value) return null
      const look = toneLook(block.tone ?? "column", accent, row, block.column, value)
      return <div className={cn("flex min-w-0 items-baseline gap-2", base(block.size, "xs"))}>
        <span className="shrink-0 text-muted-foreground">{block.label || block.column}</span>
        <span className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-foreground/20" aria-hidden="true" />
        <span className={cn("min-w-0 text-right font-semibold", look.className)} style={look.style}>{value}</span>
      </div>
    }
    case "bar": {
      if (!block.column) return null
      const current = cardNumber(cellText(row, block.column))
      if (current === null) return null
      const spec = row.spec(block.column)
      const gaugeMax = spec?.gauge && gaugeScaleOf(spec.gauge) === "column" ? spec.gauge.max : undefined
      const max = block.maxColumn ? cardNumber(cellText(row, block.maxColumn)) : block.max ?? gaugeMax ?? null
      const ratio = max && max > 0 ? Math.max(0, Math.min(1, current / max)) : Math.max(0, Math.min(1, current / 100))
      const color = block.tone && block.tone !== "accent" && block.tone !== "default" ? toneLook(block.tone, accent).style.color as string | undefined ?? accent : accent
      const shown = max ? `${current} / ${max}` : `${current}${block.unit ?? ""}`
      return <div className="grid min-w-0 gap-1">
        {(block.label || block.showValue) && <div className="flex items-baseline justify-between gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
          <span className="truncate">{block.label ?? ""}</span>
          {block.showValue && <span className="shrink-0 normal-case tracking-normal tabular-nums text-foreground">{block.unit && !max ? `${current}${block.unit}` : shown}</span>}
        </div>}
        <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, var(--muted))` }}><div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: color }} /></div>
      </div>
    }
    case "stats": {
      const tiles = (block.columns ?? []).flatMap((column) => {
        const value = cellText(row, column)
        if (!value) return []
        const short = characteristicShort[column as CharacteristicName] ?? (foldName(column) === "rapidite" ? "VIT" : foldName(column) === "vie totale" ? "VIE" : column.slice(0, 3).toLocaleUpperCase("fr"))
        return [<div key={column} title={column} className="min-w-0 rounded-lg border border-border px-1 py-1 text-center" style={{ backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 30%, transparent)` }}>
          <span className="block truncate text-[9px] font-bold tracking-wider" style={{ color: accent }}>{short}</span>
          <span className="block truncate text-sm font-semibold tabular-nums">{value}</span>
        </div>]
      })
      if (!tiles.length) return null
      return <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(7, tiles.length)}, minmax(0, 1fr))` }}>{tiles}</div>
    }
    case "image": {
      if (!block.column) return null
      if (!(row.value(block.column) ?? "").trim()) return null
      return <div className={cn("flex", align === "center" || ctx.card.align === "center" ? "justify-center" : align === "right" ? "justify-end" : "")}>
        <CardPicture row={row} column={block.column} accent={accent} fit={block.fit} shape={block.shape} alt={block.column} initials="" className="w-full" style={{ ...aspectClass(block.aspect ?? "1/1"), width: `${block.width ?? 100}%` }} />
      </div>
    }
    case "value": {
      if (!block.column) return null
      const raw = row.value(block.column) ?? ""
      if (!raw.trim()) return null
      const spec = row.spec(block.column)
      const kind = spec ? normalizeSpec(spec).kind : "rich"
      const label = block.showLabel ? <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{block.label || block.column}</p> : null
      let body: ReactNode
      if (kind === "gauge" && spec?.gauge) {
        const settings = spec.gauge
        body = <div className="pointer-events-none -mx-2"><GaugeCell label={block.column} value={raw} settings={settings} maxValue={gaugeScaleOf(settings) === "from-column" && settings.maxColumn ? cardNumber(row.value(settings.maxColumn) ?? "") : undefined} disabled onChange={() => undefined} /></div>
      } else if (kind === "glyph") {
        const glyph = parseGlyphValue(raw)
        body = <span style={{ color: spec?.glyph?.color ?? accent }}><IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className="size-6" filled={spec?.glyph?.filled ?? Boolean(glyph.emoji)} /></span>
      } else if (kind === "checkbox") {
        const checked = isCheckedValue(raw, spec?.emptyChecked)
        body = <span className="inline-flex items-center gap-1 text-sm font-medium">{checked ? <Check className="size-4" style={{ color: accent }} /> : <X className="size-4 text-muted-foreground" />}{checked ? "Oui" : "Non"}</span>
      } else if (kind === "color") {
        body = <span className="inline-flex items-center gap-1.5 font-mono text-xs"><span className="size-4 rounded-full border" style={{ backgroundColor: raw.trim() }} />{raw.trim()}</span>
      } else if (kind === "file") {
        const files = raw.split(/\n+/).map((item) => item.trim()).filter(Boolean)
        body = <div className="flex flex-wrap gap-1.5">{files.slice(0, 8).map((file) => <IndexImage key={file} value={file} alt={block.column ?? ""} className="size-14 rounded-lg border object-cover" fallback={<span className="truncate text-xs underline">{file.split("/").pop()}</span>} />)}</div>
      } else if (["choice", "linked-choice", "tab-sort", "spells", "lookup"].includes(kind)) {
        body = <div className="flex flex-wrap gap-1">{pillsOf(ctx, [block.column], "soft", "column")}</div>
      } else if (/<[a-z][^>]*>/i.test(raw)) {
        body = <IndexRichText html={raw} className={cn(base(block.size, "sm"), "[&_p]:m-0")} />
      } else {
        const look = toneLook(block.tone ?? "column", accent, row, block.column, raw)
        body = <span className={cn(base(block.size, "sm"), flags, look.className)} style={look.style}>{cellText(row, block.column)}</span>
      }
      return <div className={cn("grid min-w-0 gap-0.5", alignClass)}>{label}{body}</div>
    }
    case "divider":
      return <hr className="border-t" style={{ borderColor: `color-mix(in srgb, ${accent} 25%, var(--border))` }} />
    case "details": {
      const columns = (block.columns ?? []).filter((column) => plainCardText(row.value(column) ?? ""))
      if (!columns.length) return null
      return <DetailsBlock label={block.label || "Détails"} open={block.open} accent={accent}>
        {columns.map((column) => <section key={column} className="grid gap-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{column}</p>
          <IndexRichText html={row.value(column) ?? ""} className="text-xs leading-5 [&_p]:m-0" />
        </section>)}
      </DetailsBlock>
    }
  }
}

/** Des détails repliables : les déplier n'ouvre pas la fiche de la ligne. */
function DetailsBlock({ label, open: initial = false, accent, children }: { label: string; open?: boolean; accent: string; children: ReactNode }) {
  const [open, setOpen] = useState(initial)
  return <div className="-mx-1 rounded-lg border" style={{ borderColor: `color-mix(in srgb, ${accent} 22%, var(--border))` }} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <button type="button" className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs font-semibold" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {label}<ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
    </button>
    {open && <div className="grid gap-2 border-t px-2.5 py-2">{children}</div>}
  </div>
}

// ---------------------------------------------------------------------------
// La carte
// ---------------------------------------------------------------------------

const radiusClass = { sm: "rounded-lg", md: "rounded-2xl", lg: "rounded-[1.35rem]" } as const
const paddingClass = { compact: "p-2.5 gap-1", normal: "p-3.5 gap-1.5", airy: "p-5 gap-2.5" } as const
const sideWidths = { xs: "w-12", sm: "w-20", md: "w-28", lg: "w-40" } as const

/** Le nom de la ligne (initiales d'une image absente, texte de l'image). */
function nameOf(card: CardTemplate, row: CardRowSource) {
  const title = card.blocks.find((block) => block.type === "title" && block.column)
  return title?.column ? cellText(row, title.column) : ""
}

export const IndexCard = memo(function IndexCard({ card, row, onOpen, href, selectedBlock, onSelectBlock, className }: {
  card: CardTemplate
  row: CardRowSource
  /** Ouvre la ligne (sa fiche, sa page). */
  onOpen?: () => void
  /** L'adresse de la ligne (clic du milieu, nouvel onglet). */
  href?: string
  /** Éditeur : le bloc choisi est entouré, un clic sur un bloc le choisit. */
  selectedBlock?: string | null
  onSelectBlock?: (id: string) => void
  className?: string
}) {
  const accent = cardAccent(card, row)
  const name = nameOf(card, row)
  const media = card.media && (row.value(card.media.column) !== undefined) ? card.media : undefined
  const onImage = media?.position === "background"
  const ctx: BlockContext = { card, row, accent, onImage, name }
  const density = card.density ?? "normal"
  const editing = Boolean(onSelectBlock)

  const blocks = card.blocks.map((block) => {
    const body = <BlockBody block={block} ctx={ctx} />
    if (!editing) return <div key={block.id} className="min-w-0">{body}</div>
    // Dans l'éditeur, un bloc vide pour cette ligne reste visible (et cliquable) en pointillés.
    return <div
      key={block.id}
      data-card-block={block.id}
      onClick={(event) => { event.stopPropagation(); onSelectBlock?.(block.id) }}
      className={cn("relative min-w-0 cursor-pointer rounded-md outline-offset-2 transition-[outline-color]", selectedBlock === block.id ? "outline outline-2 outline-primary" : "outline outline-1 outline-transparent hover:outline-primary/40")}
    >
      {body ?? <span className="block rounded-md border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground">{blockPlaceholder(block)}</span>}
    </div>
  })

  const border = card.border ?? "subtle"
  const surface = card.surface ?? "card"
  const shell: CSSProperties = {
    ...(border === "accent" ? { borderColor: `color-mix(in srgb, ${accent} 45%, transparent)` } : {}),
    ...(border === "left" ? { borderLeftColor: accent } : {}),
    ...(border === "top" ? { borderTopColor: accent } : {}),
    ...(surface === "tint" ? { backgroundColor: `color-mix(in srgb, ${accent} 8%, var(--card))` } : {}),
    ...(surface === "glow" ? { backgroundImage: `linear-gradient(150deg, color-mix(in srgb, ${accent} 18%, transparent), color-mix(in srgb, ${accent} 4%, transparent) 45%, transparent 75%)` } : {}),
    ...(card.shadow ? { boxShadow: `0 12px 35px color-mix(in srgb, ${accent} 14%, transparent)` } : {}),
  }
  const open = onOpen && !editing ? onOpen : undefined
  const interactive = Boolean(open)
  const handleKey = (event: KeyboardEvent) => { if (open && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open() } }
  const handleClick = (event: MouseEvent) => {
    if (!open) return
    // Ctrl/Cmd + clic, clic du milieu : la ligne dans un nouvel onglet, comme un lien.
    if (href && (event.ctrlKey || event.metaKey)) { window.open(href, "_blank", "noopener"); return }
    open()
  }

  const body = <div className={cn("relative flex min-w-0 flex-1 flex-col", paddingClass[density], card.align === "center" && "items-stretch text-center", onImage && "justify-end text-white [&_.text-muted-foreground]:text-white/75")}>
    {blocks}
  </div>

  const pictureFor = (extra: string, style?: CSSProperties) => media ? <CardPicture row={row} column={media.column} accent={accent} fit={media.fit} shape={media.shape} tint={media.tint} alt={name} initials={initialsOf(name)} className={extra} style={style} /> : null
  const band = card.band ? <div className="h-1 w-full shrink-0" style={{ backgroundColor: accent }} /> : null
  const corner = card.corner ? (() => {
    const value = cellText(row, card.corner!)
    if (!value) return null
    const color = choiceColor(row, card.corner!, value)
    return <span className="absolute right-2 top-2 z-10 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.14em] text-white shadow-sm" style={{ backgroundColor: color && color !== "muted" ? color : accent }}>{value}</span>
  })() : null
  const chevron = card.chevron ? <ChevronRight className="mr-2 size-4 shrink-0 self-center text-muted-foreground/60" aria-hidden="true" /> : null

  let content: ReactNode
  if (media?.position === "top") {
    content = <>{pictureFor(cn("w-full", media.shape === "circle" && "mx-auto mt-3 w-1/2"), aspectClass(media.aspect))}{band}{body}</>
  } else if (media?.position === "left" || media?.position === "right") {
    const side = pictureFor(cn(sideWidths[media.size ?? "md"], "self-start", media.shape && media.shape !== "rect" && (density === "compact" ? "m-2" : "m-3")), aspectClass(media.aspect ?? "1/1"))
    content = <>{band}<div className={cn("flex min-w-0 flex-1", media.position === "right" && "flex-row-reverse")}>{side}{body}{chevron}</div></>
  } else if (onImage && media) {
    content = <div className="relative grid min-w-0 flex-1" style={aspectClass(media.aspect ?? "4/3")}>
      {pictureFor("absolute inset-0 size-full")}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      {body}
    </div>
  } else {
    content = <>{band}<div className="flex min-w-0 flex-1">{body}{chevron}</div></>
  }

  const shellClass = cn(
    "group/card relative flex min-w-0 flex-col overflow-hidden text-left text-card-foreground",
    radiusClass[card.radius ?? "md"],
    border === "none" ? "border-0" : "border border-border",
    border === "left" && "border-l-4",
    border === "top" && "border-t-4",
    surface === "plain" ? "bg-transparent" : "bg-card/90",
    interactive && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    interactive && card.lift && "transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgb(67_50_31/0.14)]",
    interactive && !card.lift && "transition-colors hover:bg-accent/40",
    className,
  )
  return <article
    className={shellClass}
    style={shell}
    role={interactive ? "button" : undefined}
    tabIndex={interactive ? 0 : undefined}
    aria-label={interactive ? `Ouvrir ${name || "la ligne"}` : undefined}
    onClick={handleClick}
    onAuxClick={href && interactive ? (event) => { if (event.button === 1) window.open(href, "_blank", "noopener") } : undefined}
    onKeyDown={handleKey}
    data-tab-href={href}
    data-tab-label={href ? name : undefined}
  >
    {corner}
    {content}
  </article>
})

function blockPlaceholder(block: CardBlock) {
  const columns = [block.column, ...(block.columns ?? []), ...(block.parts ?? []).map((part) => part.column)].filter(Boolean)
  const label = { title: "Titre", line: "Ligne", text: "Texte", pills: "Pastilles", field: "Libellé : valeur", bar: "Barre", stats: "Tuiles", image: "Image", value: "Valeur", divider: "Séparateur", details: "Détails" }[block.type]
  return columns.length ? `${label} : ${columns.join(", ")} (vide ici)` : `${label} : choisis une colonne`
}

// ---------------------------------------------------------------------------
// La grille de cartes
// ---------------------------------------------------------------------------

/** Les colonnes de la grille pour une largeur de carte. */
export function cardGridStyle(card: CardTemplate): CSSProperties {
  const width = card.width ?? "md"
  if (width === "full") return { gridTemplateColumns: "minmax(0, 1fr)" }
  const rem = cardWidths.find((entry) => entry.value === width)?.rem ?? 15
  return { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${rem}rem), 1fr))` }
}

const PAGE = 60

/**
 * Les lignes affichées (recherche, filtres et tri compris) en cartes. Les cartes se
 * dessinent par paquets de 60 en descendant : un index de mille lignes reste fluide.
 */
export function IndexCardGrid({ card, cardOf, rows, rowSource, onOpen, hrefOf, empty }: {
  card: CardTemplate
  /** La vue « Tout » : chaque ligne avec la carte de son onglet (sinon `card`). */
  cardOf?: (rowKey: string) => CardTemplate
  rows: Array<{ key: string }>
  rowSource: (rowKey: string) => CardRowSource
  onOpen: (rowKey: string) => void
  hrefOf?: (rowKey: string) => string | undefined
  empty: ReactNode
}) {
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement | null>(null)
  const visible = useMemo(() => rows.slice(0, limit), [limit, rows])
  const more = rows.length > limit
  useEffect(() => {
    const node = sentinel.current
    if (!node || !more) return
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setLimit((current) => current + PAGE) }, { rootMargin: "600px 0px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [more])
  if (!rows.length) return <div className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">{empty}</div>
  return <div className="grid gap-3">
    <div className={cn("grid items-start", card.width === "full" ? "gap-1.5" : "gap-3")} style={cardGridStyle(card)}>
      {visible.map((row) => <IndexCard key={row.key} card={cardOf?.(row.key) ?? card} row={rowSource(row.key)} onOpen={() => onOpen(row.key)} href={hrefOf?.(row.key)} />)}
    </div>
    {more && <div ref={sentinel} className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
      {visible.length} / {rows.length} cartes
      <button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setLimit((current) => current + PAGE * 4)}>Afficher la suite</button>
    </div>}
  </div>
}

// ---------------------------------------------------------------------------
// La bascule Tableau / Cartes d'un index
// ---------------------------------------------------------------------------

export type IndexDisplay = "table" | "cards"
export const isIndexDisplay = (value: unknown): value is IndexDisplay => value === "table" || value === "cards"
export const isCardChoice = (value: unknown): value is string => typeof value === "string"

/**
 * Au-dessus de l'index : tableau ou cartes et, en cartes, la carte montrée (s'il y en a
 * plusieurs) et l'accès à leur réglage.
 */
export function IndexDisplayControls({ display, onDisplay, cards, card, onPick, onEdit, disabled = false }: {
  display: IndexDisplay
  onDisplay: (display: IndexDisplay) => void
  cards: CardTemplate[]
  card: CardTemplate | null
  onPick: (id: string) => void
  /** Ouvre « Modifier » › Cartes. Absent : pas de bouton. */
  onEdit?: () => void
  disabled?: boolean
}) {
  return <span className="flex flex-wrap items-center gap-1.5">
    <span className="inline-flex rounded-lg border bg-muted/30 p-0.5" role="radiogroup" aria-label="Affichage de l’index">
      {([["table", Table2, "Tableau"], ["cards", LayoutGrid, "Cartes"]] as const).map(([value, Icon, label]) => <button
        key={value}
        type="button"
        role="radio"
        aria-checked={display === value}
        onClick={() => onDisplay(value)}
        className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition", display === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
      ><Icon className="size-4" />{label}</button>)}
    </span>
    {display === "cards" && cards.length > 1 && <NativeSelect value={card?.id ?? ""} onChange={(event) => onPick(event.target.value)} className="h-9 w-auto min-w-40 text-sm" aria-label="Carte montrée">
      {cards.map((entry) => <NativeSelectOption key={entry.id} value={entry.id}>{entry.name}</NativeSelectOption>)}
    </NativeSelect>}
    {display === "cards" && onEdit && <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={disabled} title="Créer et régler les cartes de cet onglet (Modifier › Cartes)">{cards.length ? <Pencil /> : <Plus />}{cards.length ? "Régler les cartes" : "Créer une carte"}</Button>}
  </span>
}

/** Un onglet sans carte : l'invitation à en créer une. */
export function NoCardsYet({ tabName, onCreate }: { tabName: string; onCreate?: () => void }) {
  return <div className="grid place-items-center rounded-xl border border-dashed px-5 py-12 text-center">
    <div className="grid max-w-md gap-2">
      <LayoutGrid className="mx-auto size-8 text-primary/50" />
      <p className="font-display text-xl font-semibold">Pas encore de carte pour « {tabName} »</p>
      <p className="text-sm text-muted-foreground">Une carte montre chaque ligne avec son image, sa couleur et ses informations choisies. Pars d’une forme toute prête : elle se remplit avec les colonnes de l’onglet.</p>
      {onCreate && <div><Button type="button" onClick={onCreate}><Plus />Créer une carte</Button></div>}
    </div>
  </div>
}
