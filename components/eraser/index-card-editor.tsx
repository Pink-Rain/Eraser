"use client"

/**
 * L'éditeur de cartes d'un onglet (« Modifier » › Cartes). À gauche, les cartes de
 * l'onglet ; au milieu, la carte choisie : sa forme, son image, ses couleurs, puis ses
 * blocs ; à droite, l'aperçu en direct avec les vraies lignes de l'onglet. Un clic sur
 * un bloc de l'aperçu l'ouvre dans les réglages. Rien n'est écrit avant « Enregistrer ».
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import {
  AlignCenter,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Bookmark,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  GripVertical,
  Heading,
  Image as ImageIcon,
  LayoutGrid,
  ListTree,
  Minus,
  PanelLeft,
  PanelRight,
  PanelTop,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Star,
  Trash2,
  Type,
  X,
} from "lucide-react"

import { IndexCard, cardGridStyle, type CardRowSource } from "@/components/eraser/index-card"
import { useIndexSettings } from "@/components/eraser/index-views"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  cardAspects,
  cardBlockTypes,
  cardId,
  cardPalette,
  cardRoles,
  cardStarters,
  cardWidths,
  DEFAULT_CARD_ACCENT,
  missingCardColumns,
  type CardAspect,
  type CardBlock,
  type CardBlockType,
  type CardColumn,
  type CardMediaPosition,
  type CardPart,
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
const group = "grid gap-3 rounded-xl border bg-card/60 p-3"
const groupTitle = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground"

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
  </span>
}

const sizeOptions = [{ value: "xs", label: "XS" }, { value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }] as const
const alignOptions = [{ value: "left", label: "", icon: <AlignLeft className="size-3.5" />, title: "À gauche" }, { value: "center", label: "", icon: <AlignCenter className="size-3.5" />, title: "Centré" }] as const

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
}

const blockLabel = (type: CardBlockType) => cardBlockTypes.find((entry) => entry.value === type)?.label ?? type

/** Ce que le bloc montre, en quelques mots, dans la liste des blocs. */
function blockSummary(block: CardBlock) {
  switch (block.type) {
    case "line": return (block.parts ?? []).map((part) => `${part.prefix ?? ""}${part.column}${part.suffix ?? ""}`).join(block.separator ?? " · ") || "Aucune colonne"
    case "pills": case "stats": case "details": return (block.columns ?? []).join(", ") || "Aucune colonne"
    case "divider": return ""
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
      <span className={label}>Alignement<Segmented ariaLabel="Alignement" value={block.align ?? "left"} options={[...alignOptions, { value: "right", label: "Droite" }]} onChange={(align) => set({ align: align === "left" ? undefined : align })} disabled={disabled} /></span>
    </div>
    <span className={label}>Couleur<ToneSwatches value={block.tone} onChange={(tone) => set({ tone })} disabled={disabled} allowColumn={block.type !== "line"} /></span>
    <div className="flex flex-wrap gap-3">
      <Toggle checked={Boolean(block.bold)} onChange={(bold) => set({ bold: bold || undefined })} disabled={disabled}>Gras</Toggle>
      <Toggle checked={Boolean(block.italic)} onChange={(italic) => set({ italic: italic || undefined })} disabled={disabled}>Italique</Toggle>
      {block.type !== "title" && <Toggle checked={Boolean(block.caps)} onChange={(caps) => set({ caps: caps || undefined })} disabled={disabled}>Petites capitales</Toggle>}
    </div>
  </>
  const clamp = (choices: number[]) => <span className={label}>Lignes au plus<Segmented ariaLabel="Nombre de lignes" value={String(block.clamp ?? 0)} options={choices.map((value) => ({ value: String(value), label: value ? String(value) : "Tout" }))} onChange={(value) => set({ clamp: Number(value) || undefined })} disabled={disabled} /></span>

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
          <span className={label}>Alignement<Segmented ariaLabel="Alignement" value={block.align ?? "left"} options={[...alignOptions]} onChange={(align) => set({ align: align === "left" ? undefined : align })} disabled={disabled} /></span>
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
        <p className="text-[11px] text-muted-foreground">Les caractéristiques s’abrègent d’elles-mêmes (FOR, DEX…), les autres colonnes par leurs trois premières lettres.</p>
      </div>
    case "image":
      return <div className="grid gap-3">
        <label className={label}>Colonne (image ou icône)<ColumnSelect value={block.column} columns={columns} onChange={(column) => set({ column })} disabled={disabled} ariaLabel="Colonne de l’image" /></label>
        <span className={label}>Format<AspectPicker value={block.aspect ?? "1/1"} onChange={(aspect) => set({ aspect })} disabled={disabled} /></span>
        <div className="flex flex-wrap gap-3">
          <span className={label}>Image<Segmented ariaLabel="Recadrage" value={block.fit ?? "cover"} options={[{ value: "cover", label: "Remplit" }, { value: "contain", label: "Entière" }]} onChange={(fit) => set({ fit })} disabled={disabled} /></span>
          <span className={label}>Forme<Segmented ariaLabel="Forme" value={block.shape ?? "rect"} options={[{ value: "rect", label: "Carrée" }, { value: "rounded", label: "Arrondie" }, { value: "circle", label: "Ronde" }]} onChange={(shape) => set({ shape: shape === "rect" ? undefined : shape })} disabled={disabled} /></span>
        </div>
        <label className={label}>Largeur : {block.width ?? 100} %<input type="range" min={15} max={100} step={5} value={block.width ?? 100} disabled={disabled} onChange={(event) => set({ width: Number(event.target.value) })} className="accent-primary" /></label>
      </div>
    case "value":
      return <div className="grid gap-3">
        <label className={label}>Colonne<ColumnSelect value={block.column} columns={columns} onChange={(column) => set({ column })} disabled={disabled} ariaLabel="Colonne" /></label>
        <p className="text-[11px] text-muted-foreground">La valeur s’affiche selon le type de la colonne : jauge en icônes, icône, case cochée, couleur, galerie d’images, pastilles…</p>
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
      return <p className="text-[11px] text-muted-foreground">Un trait fin, à la couleur de l’accent.</p>
  }
}

function AspectPicker({ value, onChange, disabled }: { value: string; onChange: (value: CardAspect) => void; disabled?: boolean }) {
  return <span className="flex flex-wrap gap-1">
    {cardAspects.map((aspect) => {
      const [w, h] = aspect.value.split("/").map(Number)
      const scale = 18 / Math.max(w, h)
      return <button key={aspect.value} type="button" disabled={disabled} title={aspect.label} aria-label={aspect.label} aria-pressed={value === aspect.value} onClick={() => onChange(aspect.value)} className={cn("grid h-8 min-w-8 place-items-center rounded-md border px-1", value === aspect.value ? "border-primary bg-primary/10" : "hover:bg-muted")}>
        <span className="block rounded-[2px] border border-current opacity-70" style={{ width: Math.max(6, w * scale), height: Math.max(4, h * scale) }} />
      </button>
    })}
  </span>
}

// ---------------------------------------------------------------------------
// L'éditeur d'une carte
// ---------------------------------------------------------------------------

const mediaLayouts: Array<{ value: CardMediaPosition | "none"; label: string; icon: ReactNode }> = [
  { value: "top", label: "En haut", icon: <PanelTop className="size-3.5" /> },
  { value: "left", label: "À gauche", icon: <PanelLeft className="size-3.5" /> },
  { value: "right", label: "À droite", icon: <PanelRight className="size-3.5" /> },
  { value: "background", label: "En fond", icon: <ImageIcon className="size-3.5" /> },
  { value: "none", label: "Sans", icon: <X className="size-3.5" /> },
]

function CardSettings({ card, columns, selectedBlock, onSelectBlock, onChange, disabled }: {
  card: CardTemplate
  columns: CardColumn[]
  selectedBlock: string | null
  onSelectBlock: (id: string | null) => void
  onChange: (card: CardTemplate) => void
  disabled?: boolean
}) {
  const set = (changes: Partial<CardTemplate>) => onChange({ ...card, ...changes })
  const roles = useMemo(() => cardRoles(columns), [columns])
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const accentColumns = columns.filter((column) => { const spec = normalizeSpec(column.spec); return spec.kind === "color" || ((spec.kind === "choice" || spec.kind === "linked-choice") && (spec.options ?? []).some((option) => option.color)) || /couleur|color/i.test(column.header) })
  const missing = new Set(missingCardColumns(card, columns.map((column) => column.header)).map(foldName))
  // Un bloc choisi (dans l'aperçu, par exemple) : ses réglages viennent sous les yeux.
  const container = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!selectedBlock) return
    const frame = window.requestAnimationFrame(() => container.current?.querySelector(`[data-block-row="${CSS.escape(selectedBlock)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }))
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
  const mediaPosition = card.media?.position ?? "none"
  const setMedia = (changes: Partial<NonNullable<CardTemplate["media"]>>) => {
    const column = changes.column ?? card.media?.column ?? roles.image ?? roles.glyph ?? columns[0]?.header
    if (!column) return
    set({ media: { position: "top", aspect: "4/3", fit: "cover", ...card.media, ...changes, column } })
  }

  return <div ref={container} className="grid content-start gap-3">
    <div className={group}>
      <label className={label}>Nom de la carte<Input value={card.name} disabled={disabled} onChange={(event) => set({ name: event.target.value })} className="h-9 text-sm font-semibold" maxLength={60} /></label>
    </div>

    <div className={group}>
      <p className={groupTitle}><ImageIcon className="size-3.5" />Image principale</p>
      <Segmented ariaLabel="Place de l’image" value={mediaPosition} options={mediaLayouts} disabled={disabled} onChange={(value) => value === "none" ? set({ media: undefined }) : setMedia({ position: value, ...(value === "left" || value === "right" ? { size: card.media?.size ?? "md", aspect: card.media?.position === "top" || card.media?.position === "background" ? "1/1" : card.media?.aspect } : {}), ...(value === "background" ? { aspect: card.media?.aspect ?? "4/3" } : {}) })} />
      {card.media && <>
        <label className={label}>Colonne (image, portrait, icône)<ColumnSelect value={card.media.column} columns={columns} empty={null} onChange={(column) => column && setMedia({ column })} disabled={disabled} ariaLabel="Colonne de l’image principale" /></label>
        <span className={label}>Format<AspectPicker value={card.media.aspect ?? "4/3"} onChange={(aspect) => setMedia({ aspect })} disabled={disabled} /></span>
        <div className="flex flex-wrap gap-3">
          <span className={label}>Image<Segmented ariaLabel="Recadrage" value={card.media.fit ?? "cover"} options={[{ value: "cover", label: "Remplit" }, { value: "contain", label: "Entière" }]} onChange={(fit) => setMedia({ fit })} disabled={disabled} /></span>
          <span className={label}>Forme<Segmented ariaLabel="Forme de l’image" value={card.media.shape ?? "rect"} options={[{ value: "rect", label: "Carrée" }, { value: "rounded", label: "Arrondie" }, { value: "circle", label: "Ronde" }]} onChange={(shape) => setMedia({ shape: shape === "rect" ? undefined : shape })} disabled={disabled} /></span>
          {(card.media.position === "left" || card.media.position === "right") && <span className={label}>Largeur<Segmented ariaLabel="Largeur de l’image" value={card.media.size ?? "md"} options={[{ value: "xs", label: "XS" }, { value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }]} onChange={(size) => setMedia({ size })} disabled={disabled} /></span>}
        </div>
        <Toggle checked={Boolean(card.media.tint)} onChange={(tint) => setMedia({ tint: tint || undefined })} disabled={disabled} title="Une icône (succès, état) sur un médaillon coloré ; une image absente, sur la couleur de la ligne">Fond à la couleur de l’accent (médaillon)</Toggle>
      </>}
    </div>

    <div className={group}>
      <p className={groupTitle}><LayoutGrid className="size-3.5" />Forme et place dans la grille</p>
      <span className={label}>Largeur d’une carte<Segmented ariaLabel="Largeur de la carte" value={card.width ?? "md"} options={cardWidths.map((width) => ({ value: width.value, label: ({ xs: "XS", sm: "S", md: "M", lg: "L", xl: "XL", full: "Liste" } as const)[width.value], title: width.label }))} onChange={(width) => set({ width })} disabled={disabled} /></span>
      <div className="flex flex-wrap gap-3">
        <span className={label}>Contenu<Segmented ariaLabel="Alignement du contenu" value={card.align ?? "left"} options={[...alignOptions]} onChange={(align) => set({ align: align === "left" ? undefined : align })} disabled={disabled} /></span>
        <span className={label}>Espacement<Segmented ariaLabel="Espacement" value={card.density ?? "normal"} options={[{ value: "compact", label: "Serré" }, { value: "normal", label: "Normal" }, { value: "airy", label: "Aéré" }]} onChange={(density) => set({ density: density === "normal" ? undefined : density })} disabled={disabled} /></span>
        <span className={label}>Coins<Segmented ariaLabel="Arrondi des coins" value={card.radius ?? "md"} options={[{ value: "sm", label: "Fins" }, { value: "md", label: "Ronds" }, { value: "lg", label: "Très ronds" }]} onChange={(radius) => set({ radius: radius === "md" ? undefined : radius })} disabled={disabled} /></span>
      </div>
    </div>

    <div className={group}>
      <p className={groupTitle}><Sparkles className="size-3.5" />Couleur et cadre</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}>Couleur d’accent prise dans<ColumnSelect value={card.accent?.column} columns={accentColumns.length ? accentColumns : columns} onChange={(column) => set({ accent: { ...card.accent, column } })} disabled={disabled} ariaLabel="Colonne de la couleur d’accent" empty="— Une couleur fixe —" /></label>
        <span className={label}>{card.accent?.column ? "Sinon (case vide)" : "Couleur fixe"}
          <span className="flex flex-wrap gap-1">{cardPalette.map((color) => <button key={color.value} type="button" disabled={disabled} title={color.label} aria-label={color.label} aria-pressed={(card.accent?.color ?? DEFAULT_CARD_ACCENT) === color.value} onClick={() => set({ accent: { ...card.accent, color: color.value } })} className={cn("size-5 rounded-full border", (card.accent?.color ?? DEFAULT_CARD_ACCENT) === color.value && "ring-2 ring-primary ring-offset-1")} style={{ backgroundColor: color.value }} />)}</span>
        </span>
      </div>
      <span className={label}>Bordure<Segmented ariaLabel="Bordure" value={card.border ?? "subtle"} options={[{ value: "none", label: "Aucune" }, { value: "subtle", label: "Fine" }, { value: "accent", label: "Accent" }, { value: "left", label: "Liseré à gauche" }, { value: "top", label: "Liseré en haut" }]} onChange={(border) => set({ border: border === "subtle" ? undefined : border })} disabled={disabled} /></span>
      <span className={label}>Fond<Segmented ariaLabel="Fond" value={card.surface ?? "card"} options={[{ value: "card", label: "Carte" }, { value: "tint", label: "Teinté" }, { value: "glow", label: "Lueur" }, { value: "plain", label: "Transparent" }]} onChange={(surface) => set({ surface: surface === "card" ? undefined : surface })} disabled={disabled} /></span>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Toggle checked={Boolean(card.band)} onChange={(band) => set({ band: band || undefined })} disabled={disabled}>Liseré d’accent {card.media?.position === "top" ? "sous l’image" : "en haut"}</Toggle>
        <Toggle checked={Boolean(card.shadow)} onChange={(shadow) => set({ shadow: shadow || undefined })} disabled={disabled}>Ombre colorée</Toggle>
        <Toggle checked={Boolean(card.lift)} onChange={(lift) => set({ lift: lift || undefined })} disabled={disabled}>Se soulève au survol</Toggle>
        <Toggle checked={Boolean(card.chevron)} onChange={(chevron) => set({ chevron: chevron || undefined })} disabled={disabled}>Flèche à droite</Toggle>
      </div>
      <label className={label}>Pastille dans le coin (« Nouveau », un rang…)<ColumnSelect value={card.corner} columns={columns} onChange={(corner) => set({ corner })} disabled={disabled} ariaLabel="Colonne de la pastille du coin" /></label>
    </div>

    <div className={group}>
      <div className="flex items-center justify-between gap-2">
        <p className={groupTitle}><ListTree className="size-3.5" />Contenu, de haut en bas</p>
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger asChild><Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={disabled}><Plus />Ajouter un bloc</Button></PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-1.5">
            {cardBlockTypes.map((entry) => <button key={entry.value} type="button" onClick={() => addBlock(entry.value)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground">{blockIcons[entry.value]}</span>
              <span className="min-w-0"><span className="block text-sm font-medium">{entry.label}</span><span className="block text-[11px] leading-4 text-muted-foreground">{entry.hint}</span></span>
            </button>)}
          </PopoverContent>
        </Popover>
      </div>
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
                  <span className="block text-xs font-semibold">{blockLabel(block.type)}</span>
                  {blockSummary(block) && <span className={cn("block truncate text-[11px]", absent.length ? "text-destructive" : "text-muted-foreground")} title={absent.length ? `Colonne absente de l’onglet : ${absent.join(", ")} (sautée)` : undefined}>{blockSummary(block)}</span>}
                </span>
              </button>
              <span className="flex shrink-0">
                <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === 0} onClick={() => moveBlock(block.id, -1)} aria-label="Monter le bloc"><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === card.blocks.length - 1} onClick={() => moveBlock(block.id, 1)} aria-label="Descendre le bloc"><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} onClick={() => { const copy = { ...block, id: cardId("b") }; const blocks = [...card.blocks]; blocks.splice(index + 1, 0, copy); set({ blocks }); onSelectBlock(copy.id) }} aria-label="Dupliquer le bloc" title="Dupliquer"><Copy /></Button>
                <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => { set({ blocks: card.blocks.filter((entry) => entry.id !== block.id) }); if (selected) onSelectBlock(null) }} aria-label="Retirer le bloc" title="Retirer"><Trash2 /></Button>
              </span>
            </div>
            {selected && <div className="border-t px-3 py-3"><BlockSettings block={block} columns={columns} onChange={updateBlock} disabled={disabled} /></div>}
          </div>
        })}
      </div>
    </div>
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

function CardPreview({ card, columns, samples, selectedBlock, onSelectBlock }: { card: CardTemplate; columns: CardColumn[]; samples: Array<Record<string, string>>; selectedBlock: string | null; onSelectBlock: (id: string) => void }) {
  const rows = useMemo(() => previewSamples(samples, columns), [columns, samples])
  const [at, setAt] = useState(0)
  const [grid, setGrid] = useState(false)
  const index = Math.min(at, rows.length - 1)
  const width = cardWidths.find((entry) => entry.value === (card.width ?? "md"))
  return <aside className="grid content-start gap-2 rounded-xl border bg-muted/20 p-3 xl:sticky xl:top-0 xl:max-h-[calc(94svh-14rem)] xl:self-start xl:overflow-y-auto">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Aperçu en direct</p>
      <span className="flex items-center gap-1">
        {rows.length > 1 && !grid && <>
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => setAt(index - 1)} aria-label="Ligne précédente"><ChevronLeft /></Button>
          <span className="text-[11px] tabular-nums text-muted-foreground">{index + 1} / {rows.length}</span>
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === rows.length - 1} onClick={() => setAt(index + 1)} aria-label="Ligne suivante"><ChevronRight /></Button>
        </>}
        {rows.length > 1 && <Button type="button" variant={grid ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setGrid(!grid)}><LayoutGrid />{grid ? "Une" : "Toutes"}</Button>}
      </span>
    </div>
    {grid
      ? <div className="grid items-start gap-2" style={cardGridStyle({ ...card, width: card.width === "full" ? "full" : "xs" })}>
        {rows.map((sample, position) => <IndexCard key={position} card={card} row={sampleSource(sample, columns)} />)}
      </div>
      : <div className="mx-auto w-full" style={width && width.rem ? { maxWidth: `${width.rem + 2}rem` } : undefined}>
        <IndexCard card={card} row={sampleSource(rows[index], columns)} selectedBlock={selectedBlock} onSelectBlock={onSelectBlock} />
      </div>}
    <p className="text-[10px] leading-4 text-muted-foreground">Clique sur un bloc de l’aperçu pour le régler. Un bloc vide pour cette ligne reste en pointillés ici, et disparaît sur la vraie carte.</p>
  </aside>
}

// ---------------------------------------------------------------------------
// Nouvelle carte : formes de départ, cartes d'Eraser, presets
// ---------------------------------------------------------------------------

function NewCardDialog({ columns, samples, builtins, onPick, onClose }: { columns: CardColumn[]; samples: Array<Record<string, string>>; builtins: CardTemplate[]; onPick: (card: CardTemplate) => void; onClose: () => void }) {
  const { cardPresets, deleteCardPreset } = useIndexSettings("")
  const rows = useMemo(() => previewSamples(samples, columns), [columns, samples])
  const source = sampleSource(rows[0], columns)
  const starters = useMemo(() => cardStarters.map((starter) => ({ key: starter.key, label: starter.label, hint: starter.hint, card: starter.build(columns) })), [columns])
  const tile = (key: string, title: string, hint: string, card: CardTemplate, extra?: ReactNode) => <div key={key} className="group relative grid content-start gap-2 rounded-xl border bg-card/70 p-2.5 transition hover:border-primary hover:shadow-md">
    <button type="button" onClick={() => onPick({ ...card, id: cardId() })} className="grid content-start gap-2 text-left">
      <span className="pointer-events-none grid max-h-56 min-h-28 place-items-center overflow-hidden rounded-lg bg-muted/30 p-2">
        <span className="w-full origin-top scale-[0.8]" style={{ maxWidth: card.width === "full" ? undefined : `${(cardWidths.find((entry) => entry.value === card.width)?.rem ?? 15)}rem` }}><IndexCard card={card} row={source} /></span>
      </span>
      <span><span className="block text-sm font-semibold">{title}</span><span className="block text-[11px] leading-4 text-muted-foreground">{hint}</span></span>
    </button>
    {extra}
  </div>
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-[min(94vw,1100px)]">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">Nouvelle carte</DialogTitle>
        <DialogDescription>Choisis un point de départ : il est rempli avec les colonnes de cet onglet et ses vraies lignes. Tout se change ensuite.</DialogDescription>
      </DialogHeader>
      {builtins.length > 0 && <section className="grid gap-2">
        <p className={groupTitle}><Star className="size-3.5" />Les cartes d’Eraser pour cet index</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{builtins.map((card) => tile(card.id, card.name, "Celle qu’Eraser affichait déjà, refaite avec le moteur de cartes.", card))}</div>
      </section>}
      <section className="grid gap-2">
        <p className={groupTitle}><Sparkles className="size-3.5" />Formes de départ</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{starters.map((starter) => tile(starter.key, starter.label, starter.hint, starter.card))}</div>
      </section>
      <section className="grid gap-2">
        <p className={groupTitle}><Bookmark className="size-3.5" />Presets enregistrés</p>
        {cardPresets.length
          ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cardPresets.map((preset) => tile(preset.id, preset.name, `Enregistré le ${new Date(preset.updatedAt).toLocaleDateString("fr-FR")}.`, { ...preset.card, name: preset.name },
            <Button type="button" variant="ghost" size="icon-xs" className="absolute right-1.5 top-1.5 text-destructive opacity-0 group-hover:opacity-100" onClick={() => void deleteCardPreset(preset.id)} aria-label={`Supprimer le preset ${preset.name}`} title="Supprimer le preset"><Trash2 /></Button>))}</div>
          : <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Aucun preset pour l’instant : « Enregistrer en preset » garde une carte pour la reprendre dans n’importe quel index.</p>}
      </section>
    </DialogContent>
  </Dialog>
}

function SavePresetDialog({ card, onClose }: { card: CardTemplate; onClose: () => void }) {
  const { cardPresets, saveCardPreset } = useIndexSettings("")
  const [name, setName] = useState(card.name)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const same = cardPresets.find((preset) => preset.name.toLocaleLowerCase("fr") === name.trim().toLocaleLowerCase("fr"))
  async function save() {
    setPending(true); setError("")
    try { await saveCardPreset({ id: same?.id, name, card }); onClose() } catch (caught) { setError(caught instanceof Error ? caught.message : "Le preset n’a pas pu être enregistré.") }
    setPending(false)
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Enregistrer la carte en preset</DialogTitle>
        <DialogDescription>Le preset garde la forme et les blocs, avec les noms de colonnes. Appliqué ailleurs, une colonne absente est simplement sautée (et signalée ici).</DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Nom du preset" />
        {same && <p className="text-xs text-muted-foreground">Un preset porte déjà ce nom : il sera remplacé.</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button type="submit" disabled={pending || !name.trim()}><BookmarkPlus />{same ? "Remplacer" : "Enregistrer"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}

function CopyDialog({ card, tabs, onCopy, onClose }: { card: CardTemplate; tabs: Array<{ id: string; name: string }>; onCopy: (ids: string[]) => void; onClose: () => void }) {
  const [chosen, setChosen] = useState<string[]>([])
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Copier « {card.name} » vers d’autres onglets</DialogTitle>
        <DialogDescription>La carte s’ajoute aux cartes de chaque onglet choisi (rien n’est remplacé).</DialogDescription>
      </DialogHeader>
      <div className="grid max-h-72 gap-1 overflow-y-auto">
        {tabs.map((tab) => <label key={tab.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"><Checkbox checked={chosen.includes(tab.id)} onCheckedChange={(checked) => setChosen((current) => checked === true ? [...current, tab.id] : current.filter((id) => id !== tab.id))} />{tab.name}</label>)}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
        <Button type="button" disabled={!chosen.length} onClick={() => onCopy(chosen)}><Copy />Copier</Button>
      </div>
    </DialogContent>
  </Dialog>
}

// ---------------------------------------------------------------------------
// L'éditeur des cartes d'un onglet
// ---------------------------------------------------------------------------

export function IndexCardEditor({ tabName, columns, value, builtin, builtins, samples, otherTabs, onChange, onCopyTo, onReset, disabled = false }: {
  tabName: string
  columns: CardColumn[]
  /** Les cartes de l'onglet (brouillon). */
  value: TabCards
  /** Ce sont les cartes d'Eraser, pas encore enregistrées pour cet onglet. */
  builtin: boolean
  /** Les cartes qu'Eraser avait déjà pour cet index (proposées dans « Nouvelle carte »). */
  builtins: CardTemplate[]
  samples: Array<Record<string, string>>
  otherTabs: Array<{ id: string; name: string }>
  onChange: (value: TabCards) => void
  onCopyTo: (tabIds: string[], card: CardTemplate) => void
  /** Revenir aux cartes d'Eraser (efface les cartes enregistrées de l'onglet). */
  onReset?: () => void
  disabled?: boolean
}) {
  const [selected, setSelected] = useState<string | null>(value.cards[0]?.id ?? null)
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null)
  const [dialog, setDialog] = useState<"new" | "preset" | "copy" | null>(null)
  const card = value.cards.find((entry) => entry.id === selected) ?? value.cards[0] ?? null
  const defaultId = value.defaultId && value.cards.some((entry) => entry.id === value.defaultId) ? value.defaultId : value.cards[0]?.id

  const setCards = (cards: CardTemplate[], extra: Partial<TabCards> = {}) => onChange({ ...value, ...extra, cards, ...(extra.defaultId === undefined && value.defaultId && !cards.some((entry) => entry.id === value.defaultId) ? { defaultId: undefined } : {}) })
  const updateCard = (next: CardTemplate) => setCards(value.cards.map((entry) => entry.id === next.id ? next : entry))
  const addCard = (next: CardTemplate) => { setCards([...value.cards, next]); setSelected(next.id); setSelectedBlock(null); setDialog(null) }
  const moveCard = (id: string, delta: number) => {
    const at = value.cards.findIndex((entry) => entry.id === id)
    const target = at + delta
    if (at < 0 || target < 0 || target >= value.cards.length) return
    const cards = [...value.cards]
    const [moved] = cards.splice(at, 1)
    cards.splice(target, 0, moved)
    setCards(cards)
  }

  return <div className="grid items-start gap-3 xl:grid-cols-[13rem_minmax(0,1fr)_minmax(18rem,24rem)]">
    <aside className="grid min-w-0 content-start gap-2 xl:sticky xl:top-0 xl:self-start">
      <div className="grid gap-1 rounded-xl border bg-muted/20 p-2">
        <p className={cn(groupTitle, "px-1")}>Cartes de « {tabName} »</p>
        {value.cards.map((entry, index) => <div key={entry.id} className={cn("group flex items-center gap-1 rounded-lg px-1", entry.id === card?.id ? "bg-primary/10" : "hover:bg-muted/60")}>
          <button type="button" onClick={() => { setSelected(entry.id); setSelectedBlock(null) }} className="min-w-0 flex-1 truncate py-1.5 pl-1 text-left text-sm" title={entry.name}>{entry.name}</button>
          <Button type="button" variant="ghost" size="icon-xs" className={cn(entry.id === defaultId ? "text-[#c9a227]" : "opacity-0 group-hover:opacity-100")} disabled={disabled} onClick={() => onChange({ ...value, defaultId: entry.id })} title={entry.id === defaultId ? "Carte montrée d’abord" : "Montrer cette carte d’abord"} aria-label="Carte par défaut"><Star fill={entry.id === defaultId ? "currentColor" : "none"} /></Button>
          <span className="flex opacity-0 group-hover:opacity-100">
            <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === 0} onClick={() => moveCard(entry.id, -1)} aria-label="Monter la carte"><ArrowUp /></Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === value.cards.length - 1} onClick={() => moveCard(entry.id, 1)} aria-label="Descendre la carte"><ArrowDown /></Button>
          </span>
        </div>)}
        {!value.cards.length && <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Aucune carte : cet onglet s’affiche en tableau seulement.</p>}
        <Button type="button" size="sm" className="mt-1" disabled={disabled || value.cards.length >= 12} onClick={() => setDialog("new")}><Plus />Nouvelle carte</Button>
      </div>
      {card && <div className="grid gap-1 rounded-xl border bg-muted/20 p-2">
        <p className={cn(groupTitle, "px-1")}>Cette carte</p>
        <Button type="button" variant="ghost" size="sm" className="justify-start" disabled={disabled || value.cards.length >= 12} onClick={() => addCard({ ...card, id: cardId(), name: `${card.name} (copie)`, blocks: card.blocks.map((block) => ({ ...block, id: cardId("b") })) })}><Copy />Dupliquer</Button>
        <Button type="button" variant="ghost" size="sm" className="justify-start" disabled={disabled} onClick={() => setDialog("preset")}><BookmarkPlus />Enregistrer en preset</Button>
        <Button type="button" variant="ghost" size="sm" className="justify-start" disabled={disabled || !otherTabs.length} onClick={() => setDialog("copy")} title={otherTabs.length ? undefined : "Cet index n’a pas d’autre onglet"}><Copy />Copier vers un onglet…</Button>
        <Button type="button" variant="ghost" size="sm" className="justify-start text-destructive hover:text-destructive" disabled={disabled} onClick={() => { const cards = value.cards.filter((entry) => entry.id !== card.id); setCards(cards); setSelected(cards[0]?.id ?? null); setSelectedBlock(null) }}><Trash2 />Retirer la carte</Button>
      </div>}
      {builtin && value.cards.length > 0 && <p className="rounded-lg bg-primary/5 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground"><Star className="mr-1 inline size-3 text-[#c9a227]" />Les cartes qu’Eraser avait déjà pour cet index. Modifie-les librement : elles sont enregistrées pour tout le monde à « Enregistrer ».</p>}
      {!builtin && onReset && builtins.length > 0 && <Button type="button" variant="ghost" size="sm" className="justify-start text-xs text-muted-foreground" disabled={disabled} onClick={onReset}><RotateCcw />Revenir aux cartes d’Eraser</Button>}
    </aside>

    {card
      ? <>
        <section className="min-w-0"><CardSettings key={card.id} card={card} columns={columns} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} onChange={updateCard} disabled={disabled} /></section>
        <CardPreview card={card} columns={columns} samples={samples} selectedBlock={selectedBlock} onSelectBlock={(id) => setSelectedBlock(id)} />
      </>
      : <div className="grid place-items-center rounded-xl border border-dashed p-10 text-center xl:col-span-2">
        <div className="grid max-w-sm gap-3">
          <LayoutGrid className="mx-auto size-8 text-primary/50" />
          <p className="font-display text-xl font-semibold">Montrer « {tabName} » en cartes</p>
          <p className="text-sm text-muted-foreground">Une carte, c’est une image, une couleur, un cadre et des blocs (titre, lignes, texte, pastilles, jauge…). Pars d’une forme toute prête, remplie avec les colonnes de l’onglet.</p>
          <div><Button type="button" disabled={disabled} onClick={() => setDialog("new")}><Plus />Créer une carte</Button></div>
        </div>
      </div>}

    {dialog === "new" && <NewCardDialog columns={columns} samples={samples} builtins={builtins} onPick={addCard} onClose={() => setDialog(null)} />}
    {dialog === "preset" && card && <SavePresetDialog card={card} onClose={() => setDialog(null)} />}
    {dialog === "copy" && card && <CopyDialog card={card} tabs={otherTabs} onClose={() => setDialog(null)} onCopy={(ids) => { onCopyTo(ids, card); setDialog(null) }} />}
  </div>
}
