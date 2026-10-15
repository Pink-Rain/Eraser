"use client"

/**
 * L'éditeur de cartes d'un onglet (« Modifier » › Cartes). Sous les onglets, le panneau des
 * cartes (`CardsPanel`) : la carte choisie dans une liste déroulante, l'étoile, et ce qu'on en
 * fait (nouvelle, dupliquer, preset, copier, retirer). Au centre, la carte choisie en quatre
 * pages : la carte (taille, forme, grille, couleurs), l'image, les blocs, la composition
 * (lignes et cases) ; à droite, l'aperçu en direct avec les vraies lignes de l'onglet. Un
 * clic sur un bloc de l'aperçu l'ouvre dans les réglages. Rien n'est écrit avant
 * « Enregistrer ».
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  GripVertical,
  Heading,
  Image as ImageIcon,
  LayoutGrid,
  LayoutTemplate,
  ListTree,
  Minus,
  Monitor,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Plus,
  RotateCcw,
  Smartphone,
  Sparkles,
  Square,
  Star,
  Tablet,
  Trash2,
  Type,
  X,
} from "lucide-react"

import { IndexCard, cardGridStyle, cardWidthRem, type CardRowSource } from "@/components/eraser/index-card"
import { Choice, ImageBoxControls, SettingsRow, Tabs } from "@/components/eraser/editor-controls"
import { useIndexSettings } from "@/components/eraser/index-windows"
import { CopyToTabsDialog, ManagePresetsDialog, NamePresetDialog, PreviewDialog, PreviewExpandButton, VariantsPanel } from "@/components/eraser/index-variants-panel"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  cardBlockTypes,
  cardId,
  cardPalette,
  cardRoles,
  cardStarters,
  DEFAULT_CARD_ACCENT,
  eraserCardPresets,
  blockBox,
  mediaBox,
  missingCardColumns,
  type CardAspect,
  type CardBlock,
  type CardBlockType,
  type CardCell,
  type CardColumn,
  type CardMediaPosition,
  type CardPart,
  type CardRow,
  type CardTemplate,
  type CardTone,
  type TabCards,
} from "@/lib/index-cards"
import { foldName, indexColumnKinds, normalizeSpec } from "@/lib/index-columns"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Petits contrôles
// ---------------------------------------------------------------------------

const label = "grid gap-1 text-[11px] font-semibold text-muted-foreground"
const group = "grid gap-2 rounded-xl border bg-card/60 p-2.5"
const groupTitle = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground"
const hintClass = "text-[11px] leading-4 text-muted-foreground"

/** Des boutons côte à côte, un seul choisi : plus rapide qu'une liste quand il y a peu de choix. */
function Segmented<T extends string>({ value, options, onChange, disabled, ariaLabel }: {
  value: T
  options: Array<{ value: T; label: string; icon?: ReactNode; title?: string }>
  onChange: (value: T) => void
  disabled?: boolean
  ariaLabel: string
}) {
  return <span className="inline-flex flex-wrap rounded-lg border bg-muted/30 p-0.5" role="radiogroup" aria-label={ariaLabel}>
    {options.map((option) => <button
      key={option.value}
      type="button"
      role="radio"
      aria-checked={value === option.value}
      disabled={disabled}
      title={option.title ?? option.label}
      onClick={() => onChange(option.value)}
      className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition disabled:opacity-50", value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
    >{option.icon}{option.label}</button>)}
  </span>
}

function Toggle({ checked, onChange, children, disabled, title }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; disabled?: boolean; title?: string }) {
  return <label className="flex cursor-pointer items-center gap-1.5 text-xs" title={title}><Checkbox checked={checked} disabled={disabled} onCheckedChange={(next) => onChange(next === true)} />{children}</label>
}

/** Un curseur avec son libellé et sa valeur écrite. */
function Range({ text, value, min, max, step = 1, format, onChange, disabled, title }: { text: string; value: number; min: number; max: number; step?: number; format?: (value: number) => string; onChange: (value: number) => void; disabled?: boolean; title?: string }) {
  return <label className={label} title={title}>
    <span className="flex items-center justify-between gap-2"><span>{text}</span><span className="font-normal tabular-nums">{format ? format(value) : String(value)}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="accent-primary" />
  </label>
}

const fr = (value: number, digits = 2) => value.toLocaleString("fr-FR", { maximumFractionDigits: digits })

/** Une colonne de l'onglet (avec son type), ou rien. */
function ColumnSelect({ value, columns, onChange, empty = "— Aucune —", disabled, ariaLabel, className }: {
  value: string | undefined
  columns: CardColumn[]
  onChange: (value: string | undefined) => void
  empty?: string | null
  disabled?: boolean
  ariaLabel: string
  className?: string
}) {
  const known = !value || columns.some((column) => foldName(column.header) === foldName(value))
  return <NativeSelect value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value || undefined)} className={cn("h-8 py-0 text-xs", !known && "border-destructive/60 text-destructive", className)} aria-label={ariaLabel}>
    {empty !== null && <NativeSelectOption value="">{empty}</NativeSelectOption>}
    {!known && value && <NativeSelectOption value={value}>{value} (absente)</NativeSelectOption>}
    {columns.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header} · {indexColumnKinds[normalizeSpec(column.spec).kind]?.label ?? ""}</NativeSelectOption>)}
  </NativeSelect>
}

/** Plusieurs colonnes, dans l'ordre : des étiquettes qu'on retire, et une liste pour en ajouter. */
function ColumnsPicker({ value, columns, onChange, disabled, ariaLabel }: { value: string[]; columns: CardColumn[]; onChange: (value: string[]) => void; disabled?: boolean; ariaLabel: string }) {
  const free = columns.filter((column) => !value.some((item) => foldName(item) === foldName(column.header)))
  const known = (header: string) => columns.some((column) => foldName(column.header) === foldName(header))
  return <div className="flex flex-wrap items-center gap-1">
    {value.map((header, index) => <span key={header} className={cn("inline-flex items-center gap-0.5 rounded-md border bg-background py-0.5 pl-1.5 pr-0.5 text-xs", !known(header) && "border-destructive/50 text-destructive line-through")}>
      {header}
      <button type="button" disabled={disabled || index === 0} onClick={() => { const next = [...value]; next.splice(index - 1, 0, next.splice(index, 1)[0]); onChange(next) }} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`Avancer ${header}`}><ChevronLeft className="size-3" /></button>
      <button type="button" disabled={disabled} onClick={() => onChange(value.filter((item) => item !== header))} className="rounded p-0.5 text-muted-foreground hover:text-destructive" aria-label={`Retirer ${header}`}><X className="size-3" /></button>
    </span>)}
    {free.length > 0 && <NativeSelect value="" disabled={disabled} onChange={(event) => { if (event.target.value) onChange([...value, event.target.value]) }} className="h-7 w-auto min-w-28 border-dashed py-0 pl-2 pr-8 text-[11px]" aria-label={ariaLabel}>
      <NativeSelectOption value="">+ Colonne…</NativeSelectOption>
      {free.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header}</NativeSelectOption>)}
    </NativeSelect>}
  </div>
}

/** Une couleur de texte : normale, discrète, l'accent, celle de la colonne, ou une teinte. */
function ToneSwatches({ value, onChange, allowColumn = true, disabled, compact = false }: { value: CardTone | undefined; onChange: (value: CardTone | undefined) => void; allowColumn?: boolean; disabled?: boolean; compact?: boolean }) {
  const current = value ?? "default"
  const named: Array<{ value: CardTone; label: string; swatch: ReactNode }> = [
    { value: "default", label: "Normale", swatch: <span className="size-3.5 rounded-full border bg-foreground" /> },
    { value: "muted", label: "Discrète", swatch: <span className="size-3.5 rounded-full border bg-muted-foreground/50" /> },
    { value: "accent", label: "Accent de la carte", swatch: <span className="size-3.5 rounded-full border bg-[conic-gradient(#927640,#397f88,#b3261e,#927640)]" /> },
    ...(allowColumn ? [{ value: "column" as CardTone, label: "Celle de la colonne (style, couleurs de la liste)", swatch: <Columns3 className="size-3.5" /> }] : []),
  ]
  return <span className="flex flex-wrap items-center gap-1">
    {named.map((entry) => <button key={entry.value} type="button" disabled={disabled} title={entry.label} aria-label={entry.label} aria-pressed={current === entry.value} onClick={() => onChange(entry.value === "default" ? undefined : entry.value)} className={cn("grid size-6 place-items-center rounded-md border", current === entry.value ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted")}>{entry.swatch}</button>)}
    {!compact && <span className="mx-0.5 h-4 w-px bg-border" />}
    {(compact ? cardPalette.slice(0, 6) : cardPalette).map((color) => <button key={color.value} type="button" disabled={disabled} title={color.label} aria-label={color.label} aria-pressed={current === color.value} onClick={() => onChange(color.value)} className={cn("size-5 rounded-full border", current === color.value && "ring-2 ring-primary ring-offset-1")} style={{ backgroundColor: color.value }} />)}
    {!compact && <FreeColor value={current.startsWith("#") && !cardPalette.some((color) => color.value === current) ? current : undefined} onChange={onChange} disabled={disabled} />}
  </span>
}

/** Une couleur libre (pipette), en plus de la palette : marquée quand elle est choisie. */
function FreeColor({ value, onChange, disabled }: { value: string | undefined; onChange: (value: string) => void; disabled?: boolean }) {
  return <label title="Une couleur libre" className={cn("relative grid size-6 cursor-pointer place-items-center overflow-hidden rounded-full border bg-[conic-gradient(#e11d48,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#e11d48)]", value && "ring-2 ring-primary ring-offset-1", disabled && "pointer-events-none opacity-50")} style={value ? { background: value } : undefined}>
    <span className="sr-only">Couleur libre</span>
    <input type="color" disabled={disabled} value={value ?? "#927640"} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
  </label>
}

const sizeOptions = [{ value: "xs", label: "XS" }, { value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }] as const
const alignOptions = [{ value: "left", label: "", icon: <AlignLeft className="size-3.5" />, title: "À gauche" }, { value: "center", label: "", icon: <AlignCenter className="size-3.5" />, title: "Centré" }] as const
const alignOptionsRight = [...alignOptions, { value: "right", label: "", icon: <AlignRight className="size-3.5" />, title: "À droite" }] as const

/** Les proportions (largeur ÷ hauteur) d'un format nommé. */
function aspectRatioOf(aspect: CardAspect | undefined, fallback = 4 / 3) {
  if (!aspect) return Math.round(fallback * 100) / 100
  const [w, h] = aspect.split("/").map(Number)
  return Math.round((w / h) * 100) / 100
}

const shapeStarters: Array<{ key: string; label: string; ratio: number; w: number; h: number }> = [
  { key: "square", label: "Carré", ratio: 1, w: 16, h: 16 },
  { key: "vertical", label: "Rectangle vertical", ratio: 0.75, w: 12, h: 16 },
  { key: "horizontal", label: "Rectangle horizontal", ratio: 1.5, w: 18, h: 12 },
]

/**
 * La forme d'une image (ou d'une zone) : trois formes de départ, puis les curseurs des
 * proportions et de l'arrondi des coins. Un format nommé (« 4:3 ») se lit en proportions.
 */
function ShapeControls({ ratio, aspect, radiusPx, defaultRadius = 0, onChange, disabled, withRatio = true }: { ratio: number | undefined; aspect?: CardAspect; radiusPx: number | undefined; defaultRadius?: number; onChange: (changes: { ratio?: number; radiusPx?: number }) => void; disabled?: boolean; withRatio?: boolean }) {
  const current = ratio ?? aspectRatioOf(aspect, 1)
  return <div className="grid gap-2">
    {withRatio && <span className={label}>Forme de départ
      <span className="flex flex-wrap gap-1">
        {shapeStarters.map((shape) => <button key={shape.key} type="button" disabled={disabled} title={shape.label} aria-label={shape.label} aria-pressed={Math.abs(current - shape.ratio) < 0.02} onClick={() => onChange({ ratio: shape.ratio })} className={cn("grid h-9 min-w-10 place-items-center rounded-md border px-1.5", Math.abs(current - shape.ratio) < 0.02 ? "border-primary bg-primary/10" : "hover:bg-muted")}>
          <span className="block rounded-[2px] border border-current opacity-70" style={{ width: shape.w, height: shape.h }} />
        </button>)}
      </span>
    </span>}
    {withRatio && <Range text="Proportions (largeur ÷ hauteur)" value={current} min={0.3} max={4} step={0.05} format={(value) => value < 0.98 ? `${fr(value)} · plus haute que large` : value > 1.02 ? `${fr(value)} · plus large que haute` : "carrée"} onChange={(value) => onChange({ ratio: value })} disabled={disabled} />}
    <Range text="Arrondi des coins" value={radiusPx ?? defaultRadius} min={0} max={200} step={1} format={(value) => `${value} px`} onChange={(value) => onChange({ radiusPx: value })} disabled={disabled} />
  </div>
}

// ---------------------------------------------------------------------------
// Les blocs
// ---------------------------------------------------------------------------

const blockIcons: Record<CardBlockType, ReactNode> = {
  title: <Heading className="size-3.5" />,
  line: <Minus className="size-3.5" />,
  text: <Type className="size-3.5" />,
  pills: <span className="text-[10px] font-bold">◉</span>,
  field: <span className="text-[10px] font-bold">a:b</span>,
  bar: <span className="text-[10px] font-bold">▬</span>,
  stats: <LayoutGrid className="size-3.5" />,
  image: <ImageIcon className="size-3.5" />,
  value: <Square className="size-3.5" />,
  details: <ListTree className="size-3.5" />,
  divider: <span className="text-[10px] font-bold">—</span>,
  zone: <span className="block size-3 rounded-sm bg-current opacity-70" />,
  space: <span className="text-[10px] font-bold">␣</span>,
}

const blockLabel = (type: CardBlockType) => cardBlockTypes.find((entry) => entry.value === type)?.label ?? type
const zoneLabels = { block: "Aplat", line: "Trait", pill: "Pastille", dot: "Point" } as const

/** Ce que le bloc montre, en quelques mots, dans la liste des blocs. */
function blockSummary(block: CardBlock): string {
  switch (block.type) {
    case "line": return (block.parts ?? []).map((part) => `${part.prefix ?? ""}${part.column}${part.suffix ?? ""}`).join(block.separator ?? " · ") || "Aucune colonne"
    case "pills": case "stats": case "details": return (block.columns ?? []).join(", ") || "Aucune colonne"
    case "divider": return ""
    case "zone": return zoneLabels[block.zone ?? "block"]
    case "space": return `${block.height ?? 12} px`
    default: return block.column ?? "Aucune colonne"
  }
}

/** Un nouveau bloc, avec la colonne qui lui va le mieux dans l'onglet. */
function newBlock(type: CardBlockType, columns: CardColumn[]): CardBlock {
  const roles = cardRoles(columns)
  const id = cardId("b")
  switch (type) {
    case "title": return { id, type, column: roles.name, size: "lg", font: "display" }
    case "line": return { id, type, parts: roles.choices.slice(0, 2).map((column) => ({ column })), separator: " · ", size: "xs", tone: "muted" }
    case "text": return { id, type, column: roles.description, clamp: 3, size: "sm" }
    case "pills": return { id, type, columns: roles.choices.slice(0, 2) }
    case "field": return { id, type, column: roles.numbers[0] ?? roles.choices[0] }
    case "bar": return { id, type, column: roles.numbers[0], showValue: true, max: 10 }
    case "stats": return { id, type, columns: roles.numbers.slice(0, 7) }
    case "image": return { id, type, column: roles.image ?? roles.glyph, aspect: "1/1", fit: "contain", width: 70 }
    case "value": return { id, type, column: columns[0]?.header, showLabel: true }
    case "details": return { id, type, label: "Notes", columns: roles.texts.slice(0, 2) }
    case "divider": return { id, type }
    case "zone": return { id, type, zone: "block", height: 6, width: 40 }
    case "space": return { id, type, height: 12 }
  }
}

function PartEditor({ part, columns, onChange, onRemove, onMove, first, last, disabled }: { part: CardPart; columns: CardColumn[]; onChange: (part: CardPart) => void; onRemove: () => void; onMove: (delta: number) => void; first: boolean; last: boolean; disabled?: boolean }) {
  return <div className="grid gap-1.5 rounded-lg border bg-background/60 p-2">
    <div className="flex items-center gap-1">
      <ColumnSelect value={part.column} columns={columns} empty={null} onChange={(column) => column && onChange({ ...part, column })} disabled={disabled} ariaLabel="Colonne du morceau" className="min-w-0 flex-1" />
      <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || first} onClick={() => onMove(-1)} aria-label="Avancer le morceau"><ArrowUp /></Button>
      <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || last} onClick={() => onMove(1)} aria-label="Reculer le morceau"><ArrowDown /></Button>
      <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={onRemove} aria-label="Retirer le morceau"><X /></Button>
    </div>
    <div className="grid grid-cols-2 gap-1.5">
      <Input value={part.prefix ?? ""} disabled={disabled} onChange={(event) => onChange({ ...part, prefix: event.target.value || undefined })} placeholder="Avant (« rang »)" className="h-7 text-xs" aria-label="Texte avant la valeur" />
      <Input value={part.suffix ?? ""} disabled={disabled} onChange={(event) => onChange({ ...part, suffix: event.target.value || undefined })} placeholder="Après (« PO »)" className="h-7 text-xs" aria-label="Texte après la valeur" />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <ToneSwatches compact value={part.tone} onChange={(tone) => onChange({ ...part, tone })} disabled={disabled} />
      <Toggle checked={Boolean(part.bold)} onChange={(bold) => onChange({ ...part, bold: bold || undefined })} disabled={disabled}>Gras</Toggle>
      <Toggle checked={Boolean(part.italic)} onChange={(italic) => onChange({ ...part, italic: italic || undefined })} disabled={disabled}>Italique</Toggle>
    </div>
  </div>
}

/** Les réglages d'un bloc : seulement ceux de son type. */
function BlockSettings({ block, columns, onChange, disabled }: { block: CardBlock; columns: CardColumn[]; onChange: (block: CardBlock) => void; disabled?: boolean }) {
  const set = (changes: Partial<CardBlock>) => onChange({ ...block, ...changes })
  const textStyle = (withFont: boolean) => <>
    <div className="flex flex-wrap items-end gap-3">
      <span className={label}>Taille<Segmented ariaLabel="Taille du texte" value={block.size ?? (block.type === "title" ? "md" : "sm")} options={[...sizeOptions]} onChange={(size) => set({ size })} disabled={disabled} /></span>
      {withFont && <span className={label}>Police<Segmented ariaLabel="Police" value={block.font ?? (block.type === "title" ? "display" : "sans")} options={[{ value: "display", label: "Titre" }, { value: "sans", label: "Texte" }]} onChange={(font) => set({ font })} disabled={disabled} /></span>}
      <span className={label}>Alignement<Segmented ariaLabel="Alignement" value={block.align ?? "left"} options={[...alignOptionsRight]} onChange={(align) => set({ align: align === "left" ? undefined : align })} disabled={disabled} /></span>
    </div>
    <span className={label}>Couleur<ToneSwatches value={block.tone} onChange={(tone) => set({ tone })} disabled={disabled} allowColumn={block.type !== "line"} /></span>
    <div className="flex flex-wrap gap-3">
      {block.type !== "title" && <Toggle checked={Boolean(block.bold)} onChange={(bold) => set({ bold: bold || undefined })} disabled={disabled}>Gras</Toggle>}
      <Toggle checked={Boolean(block.italic)} onChange={(italic) => set({ italic: italic || undefined })} disabled={disabled}>Italique</Toggle>
      {block.type !== "title" && <Toggle checked={Boolean(block.caps)} onChange={(caps) => set({ caps: caps || undefined })} disabled={disabled}>Petites capitales</Toggle>}
    </div>
  </>
  // Un titre sans réglage est coupé à 2 lignes (index-card.tsx) : « Tout » s'y enregistre 0.
  const clampFallback = block.type === "title" ? 2 : 0
  const clamp = (choices: number[]) => <span className={label}>Lignes au plus<Segmented ariaLabel="Nombre de lignes" value={String(block.clamp ?? clampFallback)} options={choices.map((value) => ({ value: String(value), label: value ? String(value) : "Tout" }))} onChange={(value) => set({ clamp: Number(value) === clampFallback ? undefined : Number(value) })} disabled={disabled} /></span>

  switch (block.type) {
    case "title":
      return <div className="grid gap-3">
        <label className={label}>Colonne<ColumnSelect value={block.column} columns={columns} onChange={(column) => set({ column })} disabled={disabled} ariaLabel="Colonne du titre" /></label>
        {textStyle(true)}
        {clamp([1, 2, 0])}
        <span className={label}>Pastilles après le titre (type, rang…)<ColumnsPicker value={block.badges ?? []} columns={columns} onChange={(badges) => set({ badges: badges.length ? badges : undefined })} disabled={disabled} ariaLabel="Pastilles après le titre" /></span>
      </div>
    case "line": {
      const parts = block.parts ?? []
      const setParts = (next: CardPart[]) => set({ parts: next })
      return <div className="grid gap-3">
        <div className="grid gap-1.5">
          <span className={label}>Morceaux de la ligne <span className="font-normal">— une valeur vide est sautée, avec son texte avant/après</span></span>
          {parts.map((part, index) => <PartEditor key={`${part.column}:${index}`} part={part} columns={columns} disabled={disabled} first={index === 0} last={index === parts.length - 1}
            onChange={(next) => setParts(parts.map((item, at) => at === index ? next : item))}
            onRemove={() => setParts(parts.filter((_, at) => at !== index))}
            onMove={(delta) => { const next = [...parts]; const [moved] = next.splice(index, 1); next.splice(index + delta, 0, moved); setParts(next) }} />)}
          <NativeSelect value="" disabled={disabled} onChange={(event) => { if (event.target.value) setParts([...parts, { column: event.target.value }]) }} className="h-8 w-auto border-dashed py-0 text-xs" aria-label="Ajouter un morceau">
            <NativeSelectOption value="">+ Ajouter une colonne à la ligne…</NativeSelectOption>
            {columns.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <span className={label}>Entre les morceaux
          <span className="flex flex-wrap items-center gap-1">
            {[" · ", " • ", ", ", " / ", " — ", "   "].map((separator) => <button key={separator} type="button" disabled={disabled} onClick={() => set({ separator })} className={cn("h-7 min-w-9 rounded-md border px-2 font-mono text-xs", (block.separator ?? " · ") === separator ? "border-primary bg-primary/10" : "hover:bg-muted")} title={separator.trim() ? `« ${separator.trim()} »` : "Des espaces"}>{separator.trim() || "␣"}</button>)}
            <Input value={block.separator ?? " · "} disabled={disabled} onChange={(event) => set({ separator: event.target.value })} className="h-7 w-20 font-mono text-xs" aria-label="Séparateur personnalisé" />
          </span>
        </span>
        {textStyle(true)}
        {clamp([1, 2, 0])}
      </div>
    }
    case "text":
      return <div className="grid gap-3">
        <label className={label}>Colonne<ColumnSelect value={block.column} columns={columns} onChange={(column) => set({ column })} disabled={disabled} ariaLabel="Colonne du texte" /></label>
        {clamp([2, 3, 4, 6, 0])}
        {textStyle(false)}
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={Boolean(block.quote)} onChange={(quote) => set({ quote: quote || undefined })} disabled={disabled}>Trait d’accent à gauche (citation)</Toggle>
          <Toggle checked={Boolean(block.showLabel)} onChange={(showLabel) => set({ showLabel: showLabel || undefined })} disabled={disabled}>Écrire le nom de la colonne</Toggle>
          {block.showLabel && <Input value={block.label ?? ""} disabled={disabled} onChange={(event) => set({ label: event.target.value || undefined })} placeholder={block.column ?? "Libellé"} className="h-7 w-40 text-xs" aria-label="Libellé" />}
        </div>
      </div>
    case "pills":
      return <div className="grid gap-3">
        <span className={label}>Colonnes<ColumnsPicker value={block.columns ?? []} columns={columns} onChange={(next) => set({ columns: next })} disabled={disabled} ariaLabel="Colonnes en pastilles" /></span>
        <span className={label}>Style<Segmented ariaLabel="Style des pastilles" value={block.pill ?? "soft"} options={[{ value: "soft", label: "Douces" }, { value: "solid", label: "Pleines" }, { value: "outline", label: "Contour" }]} onChange={(pill) => set({ pill: pill === "soft" ? undefined : pill })} disabled={disabled} /></span>
        <span className={label}>Couleur<ToneSwatches value={block.tone ?? "column"} onChange={(tone) => set({ tone: tone === "column" ? undefined : tone })} disabled={disabled} /></span>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={Boolean(block.stacked)} onChange={(stacked) => set({ stacked: stacked || undefined })} disabled={disabled}>Une par ligne</Toggle>
          <span className={label}>Alignement<Segmented ariaLabel="Alignement" value={block.align ?? "left"} options={[...alignOptionsRight]} onChange={(align) => set({ align: align === "left" ? undefined : align })} disabled={disabled} /></span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={Boolean(block.showLabel)} onChange={(showLabel) => set({ showLabel: showLabel || undefined, label: showLabel ? block.label || (block.columns ?? [])[0] : block.label })} disabled={disabled}>Un titre au-dessus</Toggle>
          {block.showLabel && <Input value={block.label ?? ""} disabled={disabled} onChange={(event) => set({ label: event.target.value || undefined })} placeholder="Traits, Mots-clés…" className="h-7 w-40 text-xs" aria-label="Titre des pastilles" />}
        </div>
      </div>
    case "field":
      return <div className="grid gap-3">
        <label className={label}>Colonne<ColumnSelect value={block.column} columns={columns} onChange={(column) => set({ column })} disabled={disabled} ariaLabel="Colonne" /></label>
        <label className={label}>Libellé<Input value={block.label ?? ""} disabled={disabled} onChange={(event) => set({ label: event.target.value || undefined })} placeholder={block.column ?? "Le nom de la colonne"} className="h-8 text-xs" /></label>
        <span className={label}>Couleur de la valeur<ToneSwatches value={block.tone ?? "column"} onChange={(tone) => set({ tone: tone === "column" ? undefined : tone })} disabled={disabled} /></span>
      </div>
    case "bar":
      return <div className="grid gap-3">
        <label className={label}>Valeur (un nombre)<ColumnSelect value={block.column} columns={columns} onChange={(column) => set({ column })} disabled={disabled} ariaLabel="Colonne de la valeur" /></label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={label}>Maximum fixe<Input type="number" min={1} value={block.max ?? ""} disabled={disabled || Boolean(block.maxColumn)} onChange={(event) => set({ max: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} placeholder="100" className="h-8 text-xs" /></label>
          <label className={label}>…ou lu dans une colonne<ColumnSelect value={block.maxColumn} columns={columns} onChange={(maxColumn) => set({ maxColumn })} disabled={disabled} ariaLabel="Colonne du maximum" empty="— Maximum fixe —" /></label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={label}>Libellé<Input value={block.label ?? ""} disabled={disabled} onChange={(event) => set({ label: event.target.value || undefined })} placeholder="PV, Finition…" className="h-8 text-xs" /></label>
          <label className={label}>Unité (sans maximum)<Input value={block.unit ?? ""} disabled={disabled} onChange={(event) => set({ unit: event.target.value || undefined })} placeholder="%" className="h-8 text-xs" /></label>
        </div>
        <Toggle checked={Boolean(block.showValue)} onChange={(showValue) => set({ showValue: showValue || undefined })} disabled={disabled}>Écrire la valeur (« 18 / 24 »)</Toggle>
        <span className={label}>Couleur de la barre<ToneSwatches value={block.tone ?? "accent"} allowColumn={false} onChange={(tone) => set({ tone: tone === "accent" ? undefined : tone })} disabled={disabled} /></span>
      </div>
    case "stats":
      return <div className="grid gap-3">
        <span className={label}>Colonnes (une tuile chacune)<ColumnsPicker value={block.columns ?? []} columns={columns} onChange={(next) => set({ columns: next })} disabled={disabled} ariaLabel="Colonnes en tuiles" /></span>
        <p className={hintClass}>Les caractéristiques s’abrègent d’elles-mêmes (FOR, DEX…), les autres colonnes par leurs trois premières lettres.</p>
      </div>
    case "image": {
      const box = blockBox(block)
      return <div className="grid gap-2">
        <SettingsRow>
          <label className={cn(label, "min-w-40 flex-1")}>Colonne (image ou icône)<ColumnSelect value={block.column} columns={columns} onChange={(column) => set({ column })} disabled={disabled} ariaLabel="Colonne de l’image" /></label>
          <Choice label="Image" value={block.fit ?? "cover"} options={[{ value: "cover", label: "Remplit" }, { value: "contain", label: "Entière" }]} onChange={(fit) => set({ fit })} disabled={disabled} />
          <span className="self-end pb-1.5"><Toggle checked={block.shape === "circle"} onChange={(circle) => set({ shape: circle ? "circle" : undefined })} disabled={disabled}>Ronde</Toggle></span>
        </SettingsRow>
        <ImageBoxControls value={{ widthPct: block.widthPct, heightPct: block.heightPct, autoHeight: block.autoHeight, linked: block.linked, edges: block.edges, bare: block.bare }} defaults={box} onChange={(changes) => set(changes)} disabled={disabled} radius={block.radiusPx ?? (block.shape === "rounded" ? 12 : 0)} onRadius={(radiusPx) => set({ radiusPx })} edgeLabels={{ top: "haut (1er bloc)", bottom: "bas (dernier bloc)" }} />
      </div>
    }
    case "value":
      return <div className="grid gap-3">
        <label className={label}>Colonne<ColumnSelect value={block.column} columns={columns} onChange={(column) => set({ column })} disabled={disabled} ariaLabel="Colonne" /></label>
        <p className={hintClass}>La valeur s’affiche selon le type de la colonne : jauge en icônes, icône, case cochée, couleur, galerie d’images, pastilles…</p>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={Boolean(block.showLabel)} onChange={(showLabel) => set({ showLabel: showLabel || undefined })} disabled={disabled}>Écrire le nom de la colonne</Toggle>
          {block.showLabel && <Input value={block.label ?? ""} disabled={disabled} onChange={(event) => set({ label: event.target.value || undefined })} placeholder={block.column ?? "Libellé"} className="h-7 w-40 text-xs" aria-label="Libellé" />}
        </div>
      </div>
    case "details":
      return <div className="grid gap-3">
        <label className={label}>Titre du repli<Input value={block.label ?? ""} disabled={disabled} onChange={(event) => set({ label: event.target.value || undefined })} placeholder="Détails" className="h-8 text-xs" /></label>
        <span className={label}>Textes cachés dedans<ColumnsPicker value={block.columns ?? []} columns={columns} onChange={(next) => set({ columns: next })} disabled={disabled} ariaLabel="Colonnes du repli" /></span>
        <Toggle checked={Boolean(block.open)} onChange={(open) => set({ open: open || undefined })} disabled={disabled}>Déplié d’emblée</Toggle>
      </div>
    case "divider":
      return <p className={hintClass}>Un trait fin, à la couleur de l’accent.</p>
    case "zone": {
      const zone = block.zone ?? "block"
      return <div className="grid gap-3">
        <span className={label}>Dessin<Segmented ariaLabel="Dessin de la zone" value={zone} options={[{ value: "block", label: "Aplat" }, { value: "line", label: "Trait" }, { value: "pill", label: "Pastille" }, { value: "dot", label: "Point" }]} onChange={(next) => set({ zone: next, radiusPx: undefined })} disabled={disabled} /></span>
        <span className={label}>Couleur<ToneSwatches value={block.tone ?? "accent"} allowColumn={false} onChange={(tone) => set({ tone: tone === "accent" ? undefined : tone })} disabled={disabled} /></span>
        <Range text={zone === "dot" ? "Taille" : "Hauteur"} value={block.height ?? (zone === "line" ? 2 : zone === "dot" ? 10 : 24)} min={1} max={zone === "line" ? 12 : 400} step={1} format={(value) => `${value} px`} onChange={(height) => set({ height })} disabled={disabled} />
        {zone !== "dot" && <Range text="Largeur" value={block.width ?? 100} min={10} max={100} step={5} format={(value) => `${value} %`} onChange={(width) => set({ width })} disabled={disabled} />}
        {zone !== "dot" && <ShapeControls withRatio={false} ratio={undefined} radiusPx={block.radiusPx} defaultRadius={zone === "pill" ? 999 : zone === "line" ? 1 : 6} onChange={(changes) => set(changes)} disabled={disabled} />}
        {(block.width ?? 100) < 100 && <span className={label}>Place<Segmented ariaLabel="Place de la zone" value={block.align ?? "left"} options={[...alignOptionsRight]} onChange={(align) => set({ align: align === "left" ? undefined : align })} disabled={disabled} /></span>}
        <p className={hintClass}>Pour composer : un trait sous un titre, une pastille de couleur à côté d’un nom, un aplat qui sépare deux zones de la carte…</p>
      </div>
    }
    case "space":
      return <div className="grid gap-3">
        <Range text="Hauteur" value={block.height ?? 12} min={1} max={400} step={1} format={(value) => `${value} px`} onChange={(height) => set({ height })} disabled={disabled} />
        <p className={hintClass}>De l’air entre deux blocs, ou pour pousser le reste vers le bas de la carte.</p>
      </div>
  }
}

// ---------------------------------------------------------------------------
// Les blocs : la liste et leurs réglages
// ---------------------------------------------------------------------------

function BlocksPage({ card, columns, selectedBlock, onSelectBlock, onChange, disabled }: { card: CardTemplate; columns: CardColumn[]; selectedBlock: string | null; onSelectBlock: (id: string | null) => void; onChange: (card: CardTemplate) => void; disabled?: boolean }) {
  const set = (changes: Partial<CardTemplate>) => onChange({ ...card, ...changes })
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const missing = new Set(missingCardColumns(card, columns.map((column) => column.header)).map(foldName))
  const container = useRef<HTMLDivElement | null>(null)
  // Un bloc choisi (dans l'aperçu, par exemple) : ses réglages viennent sous les yeux.
  useEffect(() => {
    if (!selectedBlock) return
    const frame = window.requestAnimationFrame(() => container.current?.querySelector(`[data-block-row="${CSS.escape(selectedBlock)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }))
    return () => window.cancelAnimationFrame(frame)
  }, [selectedBlock])

  const updateBlock = (next: CardBlock) => set({ blocks: card.blocks.map((block) => block.id === next.id ? next : block) })
  const moveBlock = (id: string, delta: number) => {
    const at = card.blocks.findIndex((block) => block.id === id)
    const target = at + delta
    if (at < 0 || target < 0 || target >= card.blocks.length) return
    const blocks = [...card.blocks]
    const [moved] = blocks.splice(at, 1)
    blocks.splice(target, 0, moved)
    set({ blocks })
  }
  const dropOn = (targetId: string) => {
    if (!dragging || dragging === targetId) return
    const blocks = [...card.blocks]
    const from = blocks.findIndex((block) => block.id === dragging)
    const [moved] = blocks.splice(from, 1)
    blocks.splice(blocks.findIndex((block) => block.id === targetId), 0, moved)
    set({ blocks })
  }
  const addBlock = (type: CardBlockType) => {
    const block = newBlock(type, columns)
    const at = selectedBlock ? card.blocks.findIndex((entry) => entry.id === selectedBlock) + 1 : card.blocks.length
    const blocks = [...card.blocks]
    blocks.splice(at <= 0 ? blocks.length : at, 0, block)
    set({ blocks })
    onSelectBlock(block.id)
    setAdding(false)
  }
  const removeBlock = (id: string) => {
    // Retiré de la carte, et de la case où il était posé.
    set({ blocks: card.blocks.filter((entry) => entry.id !== id), ...(card.rows ? { rows: card.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, blocks: cell.blocks.filter((item) => item !== id) })) })) } : {}) })
    if (selectedBlock === id) onSelectBlock(null)
  }
  const placed = new Set((card.rows ?? []).flatMap((row) => row.cells.flatMap((cell) => cell.blocks)))

  return <div ref={container} className={group}>
    <div className="flex items-center justify-between gap-2">
      <p className={groupTitle}><ListTree className="size-3.5" />Les blocs de la carte</p>
      <Popover open={adding} onOpenChange={setAdding}>
        <PopoverTrigger asChild><Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={disabled || card.blocks.length >= 24}><Plus />Ajouter un bloc</Button></PopoverTrigger>
        <PopoverContent align="end" className="max-h-[70svh] w-80 overflow-y-auto p-1.5">
          {cardBlockTypes.map((entry) => <button key={entry.value} type="button" onClick={() => addBlock(entry.value)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground">{blockIcons[entry.value]}</span>
            <span className="min-w-0"><span className="block text-sm font-medium">{entry.label}</span><span className="block text-[11px] leading-4 text-muted-foreground">{entry.hint}</span></span>
          </button>)}
        </PopoverContent>
      </Popover>
    </div>
    <p className={hintClass}>De haut en bas, sauf les blocs posés dans une case de la composition (marqués <LayoutTemplate className="inline size-3" />). Clique sur un bloc pour le régler, glisse-le par sa poignée pour le déplacer.</p>
    {!card.blocks.length && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Aucun bloc : ajoute un titre, une ligne, un texte…</p>}
    <div className="grid gap-1.5">
      {card.blocks.map((block, index) => {
        const selected = block.id === selectedBlock
        const absent = [block.column, ...(block.columns ?? []), ...(block.parts ?? []).map((part) => part.column), ...(block.badges ?? []), block.maxColumn].filter((column): column is string => Boolean(column)).filter((column) => missing.has(foldName(column)))
        return <div
          key={block.id}
          data-block-row={block.id}
          onDragOver={(event: DragEvent) => { if (dragging && !disabled) { event.preventDefault(); setOver(block.id) } }}
          onDragLeave={() => setOver((current) => current === block.id ? null : current)}
          onDrop={(event) => { event.preventDefault(); dropOn(block.id); setDragging(null); setOver(null) }}
          className={cn("rounded-lg border bg-background/70 transition", selected ? "border-primary shadow-sm" : "hover:border-primary/40", over === block.id && "ring-2 ring-primary/50")}
        >
          <div className="flex items-center gap-1 px-1.5 py-1">
            <span draggable={!disabled} onDragStart={(event) => { setDragging(block.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", block.id) }} onDragEnd={() => { setDragging(null); setOver(null) }} className="cursor-grab p-0.5 text-muted-foreground/60" aria-label="Glisser pour déplacer"><GripVertical className="size-3.5" /></span>
            <button type="button" onClick={() => onSelectBlock(selected ? null : block.id)} className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left" aria-expanded={selected}>
              <span className="grid size-6 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground">{blockIcons[block.type]}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-xs font-semibold">{blockLabel(block.type)}{placed.has(block.id) && <LayoutTemplate className="size-3 text-muted-foreground" aria-label="Posé dans une case" />}</span>
                {blockSummary(block) && <span className={cn("block truncate text-[11px]", absent.length ? "text-destructive" : "text-muted-foreground")} title={absent.length ? `Colonne absente de l’onglet : ${absent.join(", ")} (sautée)` : undefined}>{blockSummary(block)}</span>}
              </span>
            </button>
            <span className="flex shrink-0">
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === 0} onClick={() => moveBlock(block.id, -1)} aria-label="Monter le bloc"><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === card.blocks.length - 1} onClick={() => moveBlock(block.id, 1)} aria-label="Descendre le bloc"><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || card.blocks.length >= 24} onClick={() => { const copy = { ...block, id: cardId("b") }; const blocks = [...card.blocks]; blocks.splice(index + 1, 0, copy); set({ blocks }); onSelectBlock(copy.id) }} aria-label="Dupliquer le bloc" title="Dupliquer"><Copy /></Button>
              <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => removeBlock(block.id)} aria-label="Retirer le bloc" title="Retirer"><Trash2 /></Button>
            </span>
          </div>
          {selected && <div className="border-t px-3 py-3"><BlockSettings block={block} columns={columns} onChange={updateBlock} disabled={disabled} /></div>}
        </div>
      })}
    </div>
  </div>
}

// ---------------------------------------------------------------------------
// La composition : des lignes de cases où poser les blocs
// ---------------------------------------------------------------------------

const rowStarters: Array<{ key: string; label: string; cells: Array<Pick<CardCell, "width" | "align" | "valign">> }> = [
  { key: "full", label: "Pleine largeur", cells: [{ width: "fill" }] },
  { key: "two", label: "Gauche + droite", cells: [{ width: "fill" }, { width: "fill", align: "right" }] },
  { key: "three", label: "Gauche · centre · droite", cells: [{ width: "fill" }, { width: "fill", align: "center" }, { width: "fill", align: "right" }] },
  { key: "lead", label: "Petit à gauche + le reste", cells: [{ width: "auto", valign: "center" }, { width: "fill" }] },
  { key: "trail", label: "Le reste + petit à droite", cells: [{ width: "fill" }, { width: "auto", align: "right", valign: "center" }] },
]

function CompositionPage({ card, selectedBlock, onSelectBlock, onChange, disabled }: { card: CardTemplate; selectedBlock: string | null; onSelectBlock: (id: string | null) => void; onChange: (card: CardTemplate) => void; disabled?: boolean }) {
  const rows = card.rows ?? []
  const setRows = (next: CardRow[]) => onChange({ ...card, rows: next.length ? next : undefined })
  const byId = new Map(card.blocks.map((block) => [block.id, block]))
  const placed = new Set(rows.flatMap((row) => row.cells.flatMap((cell) => cell.blocks)))
  const free = card.blocks.filter((block) => !placed.has(block.id))
  const updateRow = (id: string, changes: Partial<CardRow>) => setRows(rows.map((row) => row.id === id ? { ...row, ...changes } : row))
  const updateCell = (rowId: string, cellId: string, changes: Partial<CardCell>) => setRows(rows.map((row) => row.id === rowId ? { ...row, cells: row.cells.map((cell) => cell.id === cellId ? { ...cell, ...changes } : cell) } : row))
  const moveRow = (id: string, delta: number) => {
    const at = rows.findIndex((row) => row.id === id)
    const target = at + delta
    if (at < 0 || target < 0 || target >= rows.length) return
    const next = [...rows]
    const [moved] = next.splice(at, 1)
    next.splice(target, 0, moved)
    setRows(next)
  }
  const addRow = (starter: typeof rowStarters[number]) => setRows([...rows, { id: cardId("r"), cells: starter.cells.map((cell) => ({ id: cardId("k"), blocks: [], ...cell })) }])
  const widthMode = (cell: CardCell) => cell.width === "auto" ? "auto" : typeof cell.width === "number" ? "percent" : "fill"

  return <div className="grid gap-3">
    <div className={group}>
      <p className={groupTitle}><LayoutTemplate className="size-3.5" />Composition</p>
      <p className={hintClass}>Sans composition, les blocs s’empilent de haut en bas. Ajoute des lignes, puis pose les blocs dans leurs cases : un nom à gauche et un rang à droite, une ligne pleine largeur, trois colonnes… Les blocs qui ne sont posés nulle part suivent, empilés sous les lignes.</p>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] font-semibold text-muted-foreground">Ajouter une ligne :</span>
        {rowStarters.map((starter) => <Button key={starter.key} type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={disabled || rows.length >= 24} onClick={() => addRow(starter)}><Plus />{starter.label}</Button>)}
      </div>
    </div>
    {rows.map((row, index) => <div key={row.id} className={cn(group, "gap-2")}>
      <div className="flex flex-wrap items-center gap-2">
        <p className={groupTitle}>Ligne {index + 1}</p>
        <span className={cn(label, "ml-auto flex-row items-center gap-1.5")}>Espace entre les cases<Segmented ariaLabel="Espace entre les cases" value={row.gap ?? "md"} options={[{ value: "none", label: "Aucun" }, { value: "sm", label: "Petit" }, { value: "md", label: "Moyen" }, { value: "lg", label: "Grand" }]} onChange={(gap) => updateRow(row.id, { gap: gap === "md" ? undefined : gap })} disabled={disabled} /></span>
        <span className="flex">
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === 0} onClick={() => moveRow(row.id, -1)} aria-label="Monter la ligne"><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === rows.length - 1} onClick={() => moveRow(row.id, 1)} aria-label="Descendre la ligne"><ArrowDown /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || row.cells.length >= 6} onClick={() => updateRow(row.id, { cells: [...row.cells, { id: cardId("k"), blocks: [], width: "fill" }] })} aria-label="Ajouter une case" title="Une case de plus"><Plus /></Button>
          <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => setRows(rows.filter((entry) => entry.id !== row.id))} aria-label="Retirer la ligne" title="Retirer la ligne (ses blocs restent dans la carte)"><Trash2 /></Button>
        </span>
      </div>
      <div className="grid gap-2 md:grid-flow-col md:auto-cols-fr">
        {row.cells.map((cell, cellIndex) => <div key={cell.id} className="grid content-start gap-1.5 rounded-lg border border-dashed bg-background/50 p-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Case {cellIndex + 1}</span>
            <Button type="button" variant="ghost" size="icon-xs" className="ml-auto text-destructive" disabled={disabled || row.cells.length <= 1} onClick={() => updateRow(row.id, { cells: row.cells.filter((entry) => entry.id !== cell.id) })} aria-label="Retirer la case"><X /></Button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Segmented ariaLabel="Largeur de la case" value={widthMode(cell)} options={[{ value: "fill", label: "Le reste", title: "Se partage la place avec les autres cases « le reste »" }, { value: "auto", label: "Ajustée", title: "La taille de ce qu’elle contient" }, { value: "percent", label: "%" }]} onChange={(mode) => updateCell(row.id, cell.id, { width: mode === "fill" ? undefined : mode === "auto" ? "auto" : 50 })} disabled={disabled} />
            {typeof cell.width === "number" && <Input type="number" min={5} max={100} value={cell.width} disabled={disabled} onChange={(event) => updateCell(row.id, cell.id, { width: Math.max(5, Math.min(100, Number(event.target.value) || 5)) })} className="h-7 w-16 text-xs" aria-label="Largeur en pourcentage" />}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Segmented ariaLabel="Alignement horizontal" value={cell.align ?? "left"} options={[...alignOptionsRight]} onChange={(align) => updateCell(row.id, cell.id, { align: align === "left" ? undefined : align })} disabled={disabled} />
            <Segmented ariaLabel="Alignement vertical" value={cell.valign ?? "top"} options={[{ value: "top", label: "Haut" }, { value: "center", label: "Milieu" }, { value: "bottom", label: "Bas" }]} onChange={(valign) => updateCell(row.id, cell.id, { valign: valign === "top" ? undefined : valign })} disabled={disabled} />
          </div>
          <div className="grid gap-1">
            {cell.blocks.map((id) => {
              const block = byId.get(id)
              if (!block) return null
              return <div key={id} className={cn("flex items-center gap-1 rounded-md border bg-card px-1.5 py-1", selectedBlock === id && "border-primary")}>
                <button type="button" onClick={() => onSelectBlock(id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title="Régler ce bloc">
                  <span className="grid size-5 shrink-0 place-items-center rounded border text-muted-foreground">{blockIcons[block.type]}</span>
                  <span className="min-w-0 truncate text-xs"><b>{blockLabel(block.type)}</b>{blockSummary(block) && <span className="text-muted-foreground"> · {blockSummary(block)}</span>}</span>
                </button>
                <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} onClick={() => updateCell(row.id, cell.id, { blocks: cell.blocks.filter((item) => item !== id) })} aria-label="Sortir le bloc de la case" title="Sortir de la case (le bloc reste dans la carte)"><X /></Button>
              </div>
            })}
            {free.length > 0 && <NativeSelect value="" disabled={disabled} onChange={(event) => { if (event.target.value) updateCell(row.id, cell.id, { blocks: [...cell.blocks, event.target.value] }) }} className="h-7 border-dashed py-0 text-[11px]" aria-label="Poser un bloc dans la case">
              <NativeSelectOption value="">+ Poser un bloc…</NativeSelectOption>
              {free.map((block) => <NativeSelectOption key={block.id} value={block.id}>{blockLabel(block.type)}{blockSummary(block) ? ` · ${blockSummary(block)}` : ""}</NativeSelectOption>)}
            </NativeSelect>}
            {!cell.blocks.length && !free.length && <p className="text-[10px] text-muted-foreground">Tous les blocs sont déjà posés : ajoute-en dans « Blocs ».</p>}
          </div>
        </div>)}
      </div>
    </div>)}
    {rows.length > 0 && free.length > 0 && <p className={hintClass}>Non posés, empilés sous les lignes : {free.map((block) => blockLabel(block.type)).join(", ")}.</p>}
  </div>
}

// ---------------------------------------------------------------------------
// La carte : sa taille, sa forme, sa grille, ses couleurs
// ---------------------------------------------------------------------------

const radiusOf = { sm: 8, md: 16, lg: 22 } as const

function CardPage({ card, columns, onChange, disabled }: { card: CardTemplate; columns: CardColumn[]; onChange: (card: CardTemplate) => void; disabled?: boolean }) {
  const set = (changes: Partial<CardTemplate>) => onChange({ ...card, ...changes })
  const accentColumns = columns.filter((column) => { const spec = normalizeSpec(column.spec); return spec.kind === "color" || ((spec.kind === "choice" || spec.kind === "linked-choice") && (spec.options ?? []).some((option) => option.color)) || /couleur|color/i.test(column.header) })
  const list = card.width === "full" && !card.widthRem
  const widthRem = cardWidthRem(card)
  const shape = card.ratio === undefined ? "free" : shapeStarters.find((starter) => Math.abs(starter.ratio - card.ratio!) < 0.02)?.key ?? "custom"
  return <div className="grid gap-3">
    <div className={group}>
      <p className={groupTitle}><LayoutGrid className="size-3.5" />Taille de la carte</p>
      {/* Comme une image : lier / délier, largeur, hauteur (« contenu » au bout du curseur), arrondi, sur une ligne. */}
      {(() => {
        const linked = card.sizeLinked ?? card.ratio !== undefined
        const heightRem = card.ratio ? widthRem / card.ratio : card.minHeightPx ? card.minHeightPx / 16 : null
        const HEIGHT_MAX = 60
        const setWidth = (value: number) => set({ widthRem: value, width: undefined })
        const setHeight = (value: number) => {
          if (value > HEIGHT_MAX) { set({ ratio: undefined, minHeightPx: undefined }); return }
          if (linked) set({ ratio: Math.round(widthRem / value * 100) / 100, minHeightPx: undefined })
          else set({ minHeightPx: Math.round(value * 16), ratio: undefined })
        }
        const toggleLinked = () => {
          if (linked) set({ sizeLinked: undefined, ...(card.ratio ? { minHeightPx: Math.round(widthRem / card.ratio * 16), ratio: undefined } : {}) })
          else set({ sizeLinked: true, ...(heightRem ? { ratio: Math.round(widthRem / heightRem * 100) / 100, minHeightPx: undefined } : {}) })
        }
        return <SettingsRow>
          <Segmented ariaLabel="Place dans la grille" value={list ? "list" : "grid"} options={[{ value: "grid", label: "Grille", icon: <LayoutGrid className="size-3.5" /> }, { value: "list", label: "Une par ligne", icon: <ListTree className="size-3.5" /> }]} onChange={(value) => value === "list" ? set({ width: "full", widthRem: undefined, grid: undefined }) : set({ width: "md", widthRem: card.widthRem ?? 15 })} disabled={disabled} />
          <button type="button" disabled={disabled} aria-pressed={linked} onClick={toggleLinked} title={linked ? "Liées : la hauteur suit la largeur (proportions fixes)" : "Déliées : la hauteur est une hauteur minimale, la largeur celle de la grille"} className={cn("grid size-8 shrink-0 place-items-center rounded-md border text-base", linked ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>{linked ? "🔗" : "⛓️‍💥"}</button>
          {!list && <span className="min-w-32 flex-1"><Range text="Largeur" value={widthRem} min={6} max={48} step={0.5} format={(value) => `${fr(value, 1)} rem`} onChange={setWidth} disabled={disabled} title="La grille met autant de cartes de cette largeur que la place le permet ; elles s’élargissent pour remplir la ligne." /></span>}
          <span className="min-w-32 flex-1"><Range text="Hauteur" value={heightRem ?? HEIGHT_MAX + 1} min={4} max={HEIGHT_MAX + 1} step={0.5} format={(value) => value > HEIGHT_MAX ? "contenu" : `${fr(value, 1)} rem${linked ? "" : " au moins"}`} onChange={setHeight} disabled={disabled} title="Au bout du curseur : la hauteur du contenu. Liée : les proportions de la carte ; déliée : une hauteur minimale." /></span>
          <span className="min-w-24 flex-1"><Range text="Arrondi" value={card.radiusPx ?? radiusOf[card.radius ?? "md"]} min={0} max={64} step={1} format={(value) => `${value} px`} onChange={(radiusPx) => set({ radiusPx })} disabled={disabled} /></span>
        </SettingsRow>
      })()}
      <SettingsRow>
        <span className={label}>Formes rapides
          <span className="flex flex-wrap gap-1">
            <button type="button" disabled={disabled} aria-pressed={shape === "free"} onClick={() => set({ ratio: undefined, minHeightPx: undefined, sizeLinked: undefined })} className={cn("h-8 rounded-md border px-2 text-xs", shape === "free" ? "border-primary bg-primary/10" : "hover:bg-muted")} title="La carte prend la hauteur de son contenu">Libre</button>
            {shapeStarters.map((starter) => <button key={starter.key} type="button" disabled={disabled} title={starter.label} aria-label={starter.label} aria-pressed={shape === starter.key} onClick={() => set({ ratio: starter.ratio, minHeightPx: undefined, sizeLinked: true })} className={cn("grid h-8 min-w-9 place-items-center rounded-md border px-1.5", shape === starter.key ? "border-primary bg-primary/10" : "hover:bg-muted")}>
              <span className="block rounded-[2px] border border-current opacity-70" style={{ width: starter.w * 0.8, height: starter.h * 0.8 }} />
            </button>)}
          </span>
        </span>
        {!list && <>
          <span className="min-w-28 flex-1"><Range text="Au plus, par ligne" value={card.grid?.max ?? 0} min={0} max={8} step={1} format={(value) => value ? `${value}` : "libre"} onChange={(value) => set({ grid: { ...card.grid, max: value || undefined } })} disabled={disabled} title="Sur un grand écran, les cartes ne se multiplient pas au-delà : elles s’élargissent." /></span>
          <Choice label="Téléphone" value={String(card.grid?.phone ?? 1)} options={[{ value: "1", label: "1 / ligne" }, { value: "2", label: "2 / ligne" }]} onChange={(value) => set({ grid: { ...card.grid, phone: value === "2" ? 2 : undefined } })} disabled={disabled} />
        </>}
      </SettingsRow>
      <div className="flex flex-wrap gap-3">
        <span className={label}>Contenu<Segmented ariaLabel="Alignement du contenu" value={card.align ?? "left"} options={[...alignOptions]} onChange={(align) => set({ align: align === "left" ? undefined : align })} disabled={disabled} /></span>
        <span className={label}>Espacement<Segmented ariaLabel="Espacement" value={card.density ?? "normal"} options={[{ value: "compact", label: "Serré" }, { value: "normal", label: "Normal" }, { value: "airy", label: "Aéré" }]} onChange={(density) => set({ density: density === "normal" ? undefined : density })} disabled={disabled} /></span>
      </div>
    </div>

    <div className={group}>
      <p className={groupTitle}><Sparkles className="size-3.5" />Couleur et cadre</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}>Couleur d’accent prise dans<ColumnSelect value={card.accent?.column} columns={accentColumns.length ? accentColumns : columns} onChange={(column) => set({ accent: { ...card.accent, column } })} disabled={disabled} ariaLabel="Colonne de la couleur d’accent" empty="— Une couleur fixe —" /></label>
        <span className={label}>{card.accent?.column ? "Sinon (case vide)" : "Couleur fixe"}
          <span className="flex flex-wrap items-center gap-1">{cardPalette.map((color) => <button key={color.value} type="button" disabled={disabled} title={color.label} aria-label={color.label} aria-pressed={(card.accent?.color ?? DEFAULT_CARD_ACCENT) === color.value} onClick={() => set({ accent: { ...card.accent, color: color.value } })} className={cn("size-5 rounded-full border", (card.accent?.color ?? DEFAULT_CARD_ACCENT) === color.value && "ring-2 ring-primary ring-offset-1")} style={{ backgroundColor: color.value }} />)}
            <FreeColor value={card.accent?.color && !cardPalette.some((color) => color.value === card.accent?.color) ? card.accent.color : undefined} onChange={(color) => set({ accent: { ...card.accent, color } })} disabled={disabled} /></span>
        </span>
      </div>
      <SettingsRow>
        <Choice label="Bordure" value={card.border ?? "subtle"} options={[{ value: "none", label: "Aucune" }, { value: "subtle", label: "Fine" }, { value: "accent", label: "Accent" }, { value: "left", label: "Liseré gauche" }, { value: "top", label: "Liseré haut" }]} onChange={(border) => set({ border: border === "subtle" ? undefined : border })} disabled={disabled} />
        <Choice label="Fond" value={card.surface ?? "card"} options={[{ value: "card", label: "Carte" }, { value: "tint", label: "Teinté" }, { value: "glow", label: "Lueur" }, { value: "plain", label: "Transparent" }]} onChange={(surface) => set({ surface: surface === "card" ? undefined : surface })} disabled={disabled} />
      </SettingsRow>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Toggle checked={Boolean(card.band)} onChange={(band) => set({ band: band || undefined })} disabled={disabled}>Liseré d’accent {card.media?.position === "top" ? "sous l’image" : "en haut"}</Toggle>
        <Toggle checked={Boolean(card.shadow)} onChange={(shadow) => set({ shadow: shadow || undefined })} disabled={disabled}>Ombre colorée</Toggle>
        <Toggle checked={Boolean(card.lift)} onChange={(lift) => set({ lift: lift || undefined })} disabled={disabled}>Se soulève au survol</Toggle>
        <Toggle checked={Boolean(card.chevron)} onChange={(chevron) => set({ chevron: chevron || undefined })} disabled={disabled} title="Une petite flèche « › » à droite de la carte, purement décorative : elle signale que la carte s’ouvre (comme une ligne de liste). Elle n’a pas de comportement propre.">Flèche « › » à droite</Toggle>
      </div>
      <label className={label}>Pastille dans le coin (« Nouveau », un rang…)<ColumnSelect value={card.corner} columns={columns} onChange={(corner) => set({ corner })} disabled={disabled} ariaLabel="Colonne de la pastille du coin" /></label>
    </div>
  </div>
}

// ---------------------------------------------------------------------------
// L'image principale
// ---------------------------------------------------------------------------

const mediaLayouts: Array<{ value: CardMediaPosition | "none"; label: string; icon: ReactNode }> = [
  { value: "top", label: "En haut", icon: <PanelTop className="size-3.5" /> },
  { value: "bottom", label: "En bas", icon: <PanelBottom className="size-3.5" /> },
  { value: "left", label: "À gauche", icon: <PanelLeft className="size-3.5" /> },
  { value: "right", label: "À droite", icon: <PanelRight className="size-3.5" /> },
  { value: "background", label: "En fond", icon: <ImageIcon className="size-3.5" /> },
  { value: "none", label: "Sans", icon: <X className="size-3.5" /> },
]

function ImagePage({ card, columns, onChange, disabled }: { card: CardTemplate; columns: CardColumn[]; onChange: (card: CardTemplate) => void; disabled?: boolean }) {
  const set = (changes: Partial<CardTemplate>) => onChange({ ...card, ...changes })
  const roles = useMemo(() => cardRoles(columns), [columns])
  const media = card.media
  const position = media?.position ?? "none"
  const setMedia = (changes: Partial<NonNullable<CardTemplate["media"]>>) => {
    const column = changes.column ?? media?.column ?? roles.image ?? roles.glyph ?? columns[0]?.header
    if (!column) return
    set({ media: { position: "top", ...media, ...changes, column } })
  }
  const box = media ? mediaBox(media) : null
  return <div className={group}>
    <SettingsRow>
      <label className={label}>Emplacement
        <NativeSelect value={position} disabled={disabled} onChange={(event) => { const value = event.target.value as CardMediaPosition | "none"; if (value === "none") set({ media: undefined }); else setMedia({ position: value, edges: undefined, widthPct: undefined, heightPct: undefined }) }} className="h-8 py-0 text-xs">
          {mediaLayouts.map((entry) => <NativeSelectOption key={entry.value} value={entry.value}>{entry.label}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      {media && <label className={cn(label, "min-w-40 flex-1")}>Colonne (image ou icône)<ColumnSelect value={media.column} columns={columns} empty={null} onChange={(column) => column && setMedia({ column })} disabled={disabled} ariaLabel="Colonne de l’image principale" /></label>}
      {media && position !== "background" && <Choice label="Image" value={media.fit ?? "cover"} options={[{ value: "cover", label: "Remplit" }, { value: "contain", label: "Entière" }]} onChange={(fit) => setMedia({ fit })} disabled={disabled} />}
      {media && position !== "background" && <Choice label="Fond" value={media.tint ? "accent" : media.bare ? "none" : "neutral"} options={[{ value: "neutral", label: "Neutre" }, { value: "accent", label: "Accent" }, { value: "none", label: "Aucun" }]} onChange={(fond) => setMedia({ tint: fond === "accent" || undefined, bare: fond === "none" || undefined })} disabled={disabled} />}
      {media && <span className="flex items-center gap-3 self-end pb-1.5">
        <Toggle checked={media.shape === "circle"} onChange={(circle) => setMedia({ shape: circle ? "circle" : undefined })} disabled={disabled}>Ronde</Toggle>
      </span>}
    </SettingsRow>
    {media && box && position !== "background" && <ImageBoxControls
      value={{ widthPct: media.widthPct, heightPct: media.heightPct, autoHeight: media.autoHeight, linked: media.linked, edges: media.edges }}
      defaults={box}
      onChange={(changes) => setMedia(changes)}
      disabled={disabled}
      radius={media.radiusPx ?? (media.shape === "rounded" ? 12 : 0)}
      onRadius={(radiusPx) => setMedia({ radiusPx })}
      withBare={false}
    />}
    {/* En fond, l'image couvre toute la carte : seule sa hauteur (en % de la largeur) se règle. */}
    {media && position === "background" && <Range text="Hauteur de la carte" value={media.heightPct ?? mediaBox({ ...media, widthPct: 100 }).heightPct ?? 75} min={20} max={200} format={(value) => `${value} % de la largeur`} onChange={(heightPct) => setMedia({ heightPct })} disabled={disabled} />}
  </div>
}

// ---------------------------------------------------------------------------
// L'aperçu
// ---------------------------------------------------------------------------

function sampleSource(sample: Record<string, string> | undefined, columns: CardColumn[]): CardRowSource {
  const specs = new Map(columns.map((column) => [foldName(column.header), column.spec]))
  const values = new Map(Object.entries(sample ?? {}).map(([header, value]) => [foldName(header), value]))
  return {
    value: (header) => values.get(foldName(header)) ?? "",
    spec: (header) => specs.get(foldName(header)),
  }
}

/**
 * Des lignes pour l'aperçu : les premières de l'onglet ; sans ligne, une ligne
 * d'exemple qui écrit le nom de chaque colonne.
 */
function previewSamples(samples: Array<Record<string, string>>, columns: CardColumn[]) {
  const filled = samples.filter((sample) => Object.values(sample).some((value) => value.trim()))
  if (filled.length) return filled
  return [Object.fromEntries(columns.map((column) => [column.header, normalizeSpec(column.spec).kind === "number" ? "12" : column.header]))]
}

const screens = { phone: "22rem", tablet: "40rem", desktop: "100%" } as const

function CardPreview({ card, columns, samples, selectedBlock, onSelectBlock }: { card: CardTemplate; columns: CardColumn[]; samples: Array<Record<string, string>>; selectedBlock: string | null; onSelectBlock: (id: string) => void }) {
  const rows = useMemo(() => previewSamples(samples, columns), [columns, samples])
  const [at, setAt] = useState(0)
  const [grid, setGrid] = useState(false)
  const [screen, setScreen] = useState<keyof typeof screens>("desktop")
  const [expanded, setExpanded] = useState(false)
  const index = Math.min(at, rows.length - 1)
  const rem = cardWidthRem(card)
  return <aside className="grid min-w-0 content-start gap-2 rounded-xl border bg-muted/20 p-3 lg:min-h-0 lg:overflow-auto">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-1"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Aperçu en direct</p><PreviewExpandButton onClick={() => setExpanded(true)} /></span>
      <span className="flex items-center gap-1">
        {rows.length > 1 && !grid && <>
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => setAt(index - 1)} aria-label="Ligne précédente"><ChevronLeft /></Button>
          <span className="text-[11px] tabular-nums text-muted-foreground">{index + 1} / {rows.length}</span>
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === rows.length - 1} onClick={() => setAt(index + 1)} aria-label="Ligne suivante"><ChevronRight /></Button>
        </>}
        <Button type="button" variant={grid ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setGrid(!grid)} title="Toutes les lignes, dans la grille : pour voir combien de cartes tiennent par ligne"><LayoutGrid />{grid ? "Une" : "Grille"}</Button>
      </span>
    </div>
    {grid && <Segmented ariaLabel="Largeur d’écran simulée" value={screen} options={[{ value: "phone", label: "", icon: <Smartphone className="size-3.5" />, title: "Téléphone" }, { value: "tablet", label: "", icon: <Tablet className="size-3.5" />, title: "Tablette" }, { value: "desktop", label: "", icon: <Monitor className="size-3.5" />, title: "Toute la largeur" }]} onChange={setScreen} />}
    {grid
      ? <div className={cn("grid items-start gap-2", screen === "phone" && card.grid?.phone !== 2 && "!grid-cols-1", screen === "phone" && card.grid?.phone === 2 && "!grid-cols-2")} style={{ ...cardGridStyle(card), maxWidth: screens[screen] }}>
        {(rows.length > 1 ? rows : [rows[0], rows[0], rows[0]]).map((sample, position) => <IndexCard key={position} card={card} row={sampleSource(sample, columns)} />)}
      </div>
      : <div className="mx-auto w-full" style={card.width === "full" && !card.widthRem ? undefined : { maxWidth: `${rem + 2}rem` }}>
        <IndexCard card={card} row={sampleSource(rows[index], columns)} selectedBlock={selectedBlock} onSelectBlock={onSelectBlock} />
      </div>}
    <p className="text-[10px] leading-4 text-muted-foreground">Clique sur un bloc de l’aperçu pour le régler. Un bloc vide pour cette ligne reste en pointillés ici, et disparaît sur la vraie carte.</p>
    {expanded && <CardsLivePreview card={card} columns={columns} rows={rows} onClose={() => setExpanded(false)} />}
  </aside>
}

/** L'aperçu en grand : les cartes de toutes les lignes, dans la grille de la vue « Cartes », sur l'écran choisi. */
function CardsLivePreview({ card, columns, rows, onClose }: { card: CardTemplate; columns: CardColumn[]; rows: Array<Record<string, string>>; onClose: () => void }) {
  const [screen, setScreen] = useState<keyof typeof screens>("desktop")
  return <PreviewDialog
    title={`Aperçu de « ${card.name} »`}
    description="Comme dans la vue « Cartes » de l’index, sur les lignes de l’onglet. Un bloc vide pour une ligne n’y apparaît pas."
    tools={<Segmented ariaLabel="Largeur d’écran simulée" value={screen} options={[{ value: "phone", label: "", icon: <Smartphone className="size-3.5" />, title: "Téléphone" }, { value: "tablet", label: "", icon: <Tablet className="size-3.5" />, title: "Tablette" }, { value: "desktop", label: "", icon: <Monitor className="size-3.5" />, title: "Toute la largeur" }]} onChange={setScreen} />}
    onClose={onClose}
  >
    <div className={cn("mx-auto grid items-start gap-3", screen === "phone" && card.grid?.phone !== 2 && "!grid-cols-1", screen === "phone" && card.grid?.phone === 2 && "!grid-cols-2")} style={{ ...cardGridStyle(card), maxWidth: screens[screen] }}>
      {rows.map((sample, position) => <IndexCard key={position} card={card} row={sampleSource(sample, columns)} />)}
    </div>
  </PreviewDialog>
}

// ---------------------------------------------------------------------------
// Nouvelle carte : les cartes d'Eraser pour cet index, les formes de départ, les presets
// ---------------------------------------------------------------------------

export function NewCardDialog({ columns, samples, builtins, onPick, onClose, title = "Nouvelle carte", builtinsLabel = "Les cartes d’Eraser pour cet index", builtinsHint = "Celle qu’Eraser affiche déjà pour ces lignes, refaite avec le moteur de cartes." }: { columns: CardColumn[]; samples: Array<Record<string, string>>; builtins: CardTemplate[]; onPick: (card: CardTemplate) => void; onClose: () => void; title?: string; builtinsLabel?: string; builtinsHint?: string }) {
  const { cardPresets, deleteCardPreset } = useIndexSettings("")
  const rows = useMemo(() => previewSamples(samples, columns), [columns, samples])
  const source = sampleSource(rows[0], columns)
  const starters = useMemo(() => cardStarters.map((starter) => ({ key: starter.key, label: starter.label, hint: starter.hint, card: starter.build(columns) })), [columns])
  // Les cartes des pages d'Eraser (classe de Règles › Classes, campagne de l'accueil…), à reprendre dans n'importe quel index.
  const eraserCards = useMemo(() => eraserCardPresets().filter((entry) => !builtins.some((card) => card.id === entry.card.id)), [builtins])
  const tile = (key: string, title: string, hint: string, card: CardTemplate, extra?: ReactNode) => <div key={key} className="group relative grid content-start gap-2 rounded-xl border bg-card/70 p-2.5 transition hover:border-primary hover:shadow-md">
    <button type="button" onClick={() => onPick({ ...card, id: cardId() })} className="grid content-start gap-2 text-left">
      <span className="pointer-events-none grid max-h-56 min-h-28 place-items-center overflow-hidden rounded-lg bg-muted/30 p-2">
        <span className="w-full origin-top scale-[0.8]" style={{ maxWidth: card.width === "full" && !card.widthRem ? undefined : `${cardWidthRem(card)}rem` }}><IndexCard card={card} row={source} /></span>
      </span>
      <span><span className="block text-sm font-semibold">{title}</span><span className="block text-[11px] leading-4 text-muted-foreground">{hint}</span></span>
    </button>
    {extra}
  </div>
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-[min(94vw,1100px)]">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
        <DialogDescription>Un point de départ, rempli avec les colonnes de cet onglet et ses vraies lignes. Tout se change ensuite : la taille, l’image, les blocs, la composition.</DialogDescription>
      </DialogHeader>
      {builtins.length > 0 && <section className="grid gap-2">
        <p className={groupTitle}><Star className="size-3.5" />{builtinsLabel}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{builtins.map((card) => tile(card.id, card.name, builtinsHint, card))}</div>
      </section>}
      <section className="grid gap-2">
        <p className={groupTitle}><Sparkles className="size-3.5" />Formes de départ</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{starters.map((starter) => tile(starter.key, starter.label, starter.hint, starter.card))}</div>
      </section>
      {eraserCards.length > 0 && <section className="grid gap-2">
        <p className={groupTitle}><Star className="size-3.5" />Les cartes des autres pages d’Eraser</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{eraserCards.map((entry) => tile(`eraser:${entry.card.id}`, `${entry.card.name} (${entry.label})`, "La carte qu’Eraser montre dans cet index-là. Les colonnes absentes ici restent vides.", entry.card))}</div>
      </section>}
      <section className="grid gap-2">
        <p className={groupTitle}><Bookmark className="size-3.5" />Presets enregistrés</p>
        {cardPresets.length
          ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cardPresets.map((preset) => tile(preset.id, preset.name, `Enregistré le ${new Date(preset.updatedAt).toLocaleDateString("fr-FR")}. Les colonnes absentes ici restent vides.`, { ...preset.card, name: preset.name },
            <Button type="button" variant="ghost" size="icon-xs" className="absolute right-1.5 top-1.5 text-destructive opacity-0 group-hover:opacity-100" onClick={() => void deleteCardPreset(preset.id)} aria-label={`Supprimer le preset ${preset.name}`} title="Supprimer le preset"><Trash2 /></Button>))}</div>
          : <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Aucun preset pour l’instant : « Preset » dans le panneau des cartes garde une carte pour la reprendre dans n’importe quel index.</p>}
      </section>
    </DialogContent>
  </Dialog>
}

// ---------------------------------------------------------------------------
// Le panneau des cartes (sous les onglets) et l'éditeur de la carte choisie
// ---------------------------------------------------------------------------

/** Une copie d'une carte, avec de nouveaux identifiants (blocs, lignes et cases compris). */
export function duplicateCard(card: CardTemplate, name = card.name): CardTemplate {
  const ids = new Map(card.blocks.map((block) => [block.id, cardId("b")]))
  return {
    ...card,
    id: cardId(),
    name,
    blocks: card.blocks.map((block) => ({ ...block, id: ids.get(block.id)! })),
    ...(card.rows ? { rows: card.rows.map((row) => ({ ...row, id: cardId("r"), cells: row.cells.map((cell) => ({ ...cell, id: cardId("k"), blocks: cell.blocks.flatMap((id) => ids.has(id) ? [ids.get(id)!] : []) })) })) } : {}),
  }
}

export function pickedCard(value: TabCards, selected: string | null) {
  return value.cards.find((entry) => entry.id === selected) ?? value.cards.find((entry) => entry.id === value.defaultId) ?? value.cards[0] ?? null
}

/**
 * Le panneau des cartes d'un onglet, sous la liste des onglets : la carte choisie (liste
 * déroulante, l'étoile pour celle montrée d'abord), son nom, et ce qu'on en fait.
 */
export function CardsPanel({ tabName, columns, value, builtin, builtins, samples, otherTabs, selected, onSelect, onChange, onCopyTo, onReset, disabled = false }: {
  tabName: string
  columns: CardColumn[]
  value: TabCards
  builtin: boolean
  builtins: CardTemplate[]
  samples: Array<Record<string, string>>
  otherTabs: Array<{ id: string; name: string }>
  selected: string | null
  onSelect: (id: string | null) => void
  onChange: (value: TabCards) => void
  onCopyTo: (tabIds: string[], card: CardTemplate) => void
  onReset?: () => void
  disabled?: boolean
}) {
  const { cardPresets, saveCardPreset, deleteCardPreset } = useIndexSettings("")
  const [dialog, setDialog] = useState<"new" | "preset" | "copy" | "manage" | null>(null)
  const card = pickedCard(value, selected)
  const defaultId = value.defaultId && value.cards.some((entry) => entry.id === value.defaultId) ? value.defaultId : value.cards[0]?.id ?? ""
  const setCards = (cards: CardTemplate[], extra: Partial<TabCards> = {}) => onChange({ ...value, ...extra, cards, ...(extra.defaultId === undefined && value.defaultId && !cards.some((entry) => entry.id === value.defaultId) ? { defaultId: undefined } : {}) })
  const addCard = (next: CardTemplate) => { setCards([...value.cards, next]); onSelect(next.id); setDialog(null) }
  const moveCard = (delta: number) => {
    if (!card) return
    const at = value.cards.findIndex((entry) => entry.id === card.id)
    const target = at + delta
    if (at < 0 || target < 0 || target >= value.cards.length) return
    const cards = [...value.cards]
    const [moved] = cards.splice(at, 1)
    cards.splice(target, 0, moved)
    setCards(cards)
  }
  return <>
    <VariantsPanel
      title={`Cartes de « ${tabName} »`}
      icon={LayoutGrid}
      noun="carte"
      items={value.cards.map((entry) => ({ id: entry.id, name: entry.name }))}
      selectedId={card?.id ?? ""}
      starredId={defaultId}
      onSelect={(id) => onSelect(id || null)}
      onStar={(id) => onChange({ ...value, defaultId: id })}
      starHint="la carte montrée d’abord"
      onRename={(id, name) => setCards(value.cards.map((entry) => entry.id === id ? { ...entry, name } : entry))}
      onMove={moveCard}
      onNew={() => setDialog("new")}
      newHint="Nouvelle carte : une carte d’Eraser, une forme de départ ou un preset"
      onDuplicate={() => { if (card) addCard(duplicateCard(card, `${card.name} (copie)`)) }}
      onRemove={() => { if (!card) return; const cards = value.cards.filter((entry) => entry.id !== card.id); setCards(cards); onSelect(cards[0]?.id ?? null) }}
      full={value.cards.length >= 12}
      empty={<p className="rounded-lg border border-dashed p-2 text-center text-[11px] text-muted-foreground">Aucune carte : cet onglet s’affiche en tableau seulement. « + » en crée une.</p>}
      presets={cardPresets.map((preset) => ({ id: preset.id, name: preset.name }))}
      onApplyPreset={(id) => {
        const preset = cardPresets.find((entry) => entry.id === id)
        // La carte choisie prend la forme du preset ; elle garde sa place et son nom.
        if (preset && card) setCards(value.cards.map((entry) => entry.id === card.id ? { ...duplicateCard(preset.card), id: card.id, name: card.name } : entry))
      }}
      onSavePreset={card ? () => setDialog("preset") : undefined}
      savePresetHint="Crée d’abord une carte"
      onCopy={otherTabs.length ? () => setDialog("copy") : undefined}
      copyHint={otherTabs.length ? "Copier cette carte vers d’autres onglets…" : "Cet index n’a pas d’autre onglet"}
      onManagePresets={cardPresets.length ? () => setDialog("manage") : undefined}
      disabled={disabled}
      footer={<>
        {builtin && value.cards.length > 0 && <p className="rounded-lg bg-primary/5 px-2 py-1.5 text-[10px] leading-4 text-muted-foreground"><Star className="mr-1 inline size-3 text-[#c9a227]" />Les cartes qu’Eraser affiche déjà pour cet index. Modifie-les librement : elles sont enregistrées pour tout le monde à « Enregistrer ».</p>}
        {!builtin && onReset && builtins.length > 0 && <Button type="button" variant="ghost" size="sm" className="h-7 justify-start text-[11px] text-muted-foreground" disabled={disabled} onClick={onReset}><RotateCcw />Revenir aux cartes d’Eraser</Button>}
      </>}
    />
    {dialog === "new" && <NewCardDialog columns={columns} samples={samples} builtins={builtins} onPick={addCard} onClose={() => setDialog(null)} />}
    {dialog === "preset" && card && <NamePresetDialog
      title="Enregistrer la carte en preset"
      description="Le preset garde la forme, la composition et les blocs, avec les noms de colonnes. Appliqué ailleurs, une colonne absente est simplement sautée."
      initialName={card.name}
      existing={cardPresets}
      onSave={(name, id) => saveCardPreset({ id, name, card })}
      onClose={() => setDialog(null)}
    />}
    {dialog === "copy" && card && <CopyToTabsDialog
      title={`Copier « ${card.name} » vers d’autres onglets`}
      description="La carte s’ajoute aux cartes de chaque onglet choisi (rien n’est remplacé)."
      tabs={otherTabs}
      onCopy={(ids) => { onCopyTo(ids, card); setDialog(null) }}
      onClose={() => setDialog(null)}
    />}
    {dialog === "manage" && <ManagePresetsDialog
      title="Presets de cartes"
      description="Communs à tous les index. Supprimer un preset ne change aucune carte."
      presets={cardPresets.map((preset) => ({ id: preset.id, name: preset.name, hint: `Enregistré le ${new Date(preset.updatedAt).toLocaleDateString("fr-FR")}` }))}
      onRename={(id, name) => { const preset = cardPresets.find((entry) => entry.id === id); return preset ? saveCardPreset({ id, name, card: preset.card }) : Promise.resolve() }}
      onDelete={deleteCardPreset}
      onClose={() => setDialog(null)}
    />}
  </>
}

type CardPageKey = "card" | "image" | "blocks" | "composition"

const cardPages: Array<{ value: CardPageKey; label: string; icon: ReactNode }> = [
  { value: "card", label: "Carte", icon: <Square className="size-3.5" /> },
  { value: "image", label: "Image", icon: <ImageIcon className="size-3.5" /> },
  { value: "blocks", label: "Blocs", icon: <ListTree className="size-3.5" /> },
  { value: "composition", label: "Composition", icon: <LayoutTemplate className="size-3.5" /> },
]

/** L'éditeur de la carte choisie : ses réglages en pages, et l'aperçu en direct. */
export function IndexCardEditor({ tabName, columns, value, builtins, samples, selected, onSelect, onChange, disabled = false }: {
  tabName: string
  columns: CardColumn[]
  /** Les cartes de l'onglet (brouillon). */
  value: TabCards
  /** Les cartes qu'Eraser avait déjà pour cet index (proposées dans « Nouvelle carte »). */
  builtins: CardTemplate[]
  samples: Array<Record<string, string>>
  selected: string | null
  onSelect: (id: string | null) => void
  onChange: (value: TabCards) => void
  disabled?: boolean
}) {
  const [creating, setCreating] = useState(false)
  const card = pickedCard(value, selected)
  const updateCard = (next: CardTemplate) => onChange({ ...value, cards: value.cards.map((entry) => entry.id === next.id ? next : entry) })

  if (!card) return <div className="grid place-items-center rounded-xl border border-dashed p-10 text-center">
    <div className="grid max-w-sm gap-3">
      <LayoutGrid className="mx-auto size-8 text-primary/50" />
      <p className="font-display text-xl font-semibold">Montrer « {tabName} » en cartes</p>
      <p className="text-sm text-muted-foreground">Une carte, c’est une taille, une image, une couleur, des blocs (titre, lignes, texte, pastilles, jauge…) et une composition libre. Pars d’une carte d’Eraser ou d’une forme toute prête, remplie avec les colonnes de l’onglet.</p>
      <div><Button type="button" disabled={disabled} onClick={() => setCreating(true)}><Plus />Créer une carte</Button></div>
    </div>
    {creating && <NewCardDialog columns={columns} samples={samples} builtins={builtins} onPick={(next) => { onChange({ ...value, cards: [...value.cards, next] }); onSelect(next.id); setCreating(false) }} onClose={() => setCreating(false)} />}
  </div>

  return <SingleCardEditor key={card.id} card={card} columns={columns} samples={samples} onChange={updateCard} disabled={disabled} />
}

/**
 * Une carte, réglée : ses quatre pages (carte, image, blocs, composition) à gauche, l'aperçu en
 * direct à droite, chacun avec sa barre de défilement. « Modifier › Cartes » s'en sert pour la
 * carte choisie, et les vues pour leur élément sur mesure.
 */
export function SingleCardEditor({ card, columns, samples, onChange, disabled = false }: { card: CardTemplate; columns: CardColumn[]; samples: Array<Record<string, string>>; onChange: (card: CardTemplate) => void; disabled?: boolean }) {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null)
  const [page, setPage] = useState<CardPageKey>("card")
  const selectBlock = (id: string | null) => { setSelectedBlock(id); if (id) setPage("blocks") }
  return <div className="grid min-h-0 gap-3 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
    <section className="grid min-w-0 content-start gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
      <Tabs ariaLabel="Réglages de la carte" value={page} options={cardPages} onChange={setPage} />
      {page === "card" && <CardPage card={card} columns={columns} onChange={onChange} disabled={disabled} />}
      {page === "image" && <ImagePage card={card} columns={columns} onChange={onChange} disabled={disabled} />}
      {page === "blocks" && <BlocksPage card={card} columns={columns} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} onChange={onChange} disabled={disabled} />}
      {page === "composition" && <CompositionPage card={card} selectedBlock={selectedBlock} onSelectBlock={selectBlock} onChange={onChange} disabled={disabled} />}
    </section>
    <CardPreview card={card} columns={columns} samples={samples} selectedBlock={selectedBlock} onSelectBlock={selectBlock} />
  </div>
}
