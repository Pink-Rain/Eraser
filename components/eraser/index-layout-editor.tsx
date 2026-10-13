"use client"

import { useMemo, useState, type DragEvent, type ReactNode } from "react"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Blocks, Bookmark, GripVertical, Heading, LayoutTemplate, Paintbrush, Palette, Plus, RotateCcw, Settings2, Sparkles, Star, Tag, Trash2, X } from "lucide-react"

import { IconPicker, IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexImage } from "@/components/eraser/index-image"
import { LayoutBlockView, layoutBlockSummary } from "@/components/eraser/index-layout-blocks"
import { DEFAULT_LAYOUT_ACCENT, IndexLayoutView } from "@/components/eraser/index-layout-view"
import { RichTextField } from "@/components/eraser/rich-text"
import { useIndexSettings } from "@/components/eraser/index-views"
import { Tabs } from "@/components/eraser/view-editor-controls"
import { IndexFormView } from "@/components/eraser/index-form-view"
import { hoverWidthClass, LayoutDetails } from "@/components/eraser/index-references"
import { PreviewDialog, PreviewExpandButton } from "@/components/eraser/index-view-panel"
import { hoverOf, rowDetails } from "@/lib/index-references-cells"
import type { ResolvedReference } from "@/lib/index-references"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cardPalette } from "@/lib/index-cards"
import { layoutStarters, type LayoutColumnInfo } from "@/lib/index-layout-defaults"
import { foldName, indexColumnKinds, isImageSource, isNameColumnSpec, normalizeSpec, parseGlyphValue, type IndexColumnSpec } from "@/lib/index-columns"
import {
  arrangeLayout,
  blockKey,
  layoutBlockKinds,
  layoutId,
  layoutSpans,
  resolveLayoutColor,
  type IndexLayout,
  type LayoutBlock,
  type LayoutBlockKind,
  type LayoutField,
  type LayoutKind,
  type LayoutSection,
  type LayoutSpan,
  type SectionLook,
} from "@/lib/index-layouts"
import { cn } from "@/lib/utils"

/** Où se trouve un champ : la colonne latérale, ou une ligne d'une section. */
type Place = { area: "aside" } | { area: "row"; section: number; row: number }

export type LayoutColumn = { header: string; spec: IndexColumnSpec }

const sameColumn = (left: string, right: string) => foldName(left) === foldName(right)

function fieldsAt(layout: IndexLayout, place: Place) {
  return place.area === "aside" ? layout.aside : layout.sections[place.section]?.rows[place.row]?.fields ?? []
}

function placeOf(layout: IndexLayout, column: string): { place: Place; index: number } | null {
  const aside = layout.aside.findIndex((field) => sameColumn(field.column, column))
  if (aside >= 0) return { place: { area: "aside" }, index: aside }
  for (const [section, entry] of layout.sections.entries()) {
    for (const [row, line] of entry.rows.entries()) {
      const index = line.fields.findIndex((field) => sameColumn(field.column, column))
      if (index >= 0) return { place: { area: "row", section, row }, index }
    }
  }
  return null
}

function withFields(layout: IndexLayout, place: Place, fields: LayoutField[]): IndexLayout {
  if (place.area === "aside") return { ...layout, aside: fields }
  return {
    ...layout,
    sections: layout.sections.map((section, sectionIndex) => sectionIndex !== place.section ? section : {
      ...section,
      rows: section.rows.map((row, rowIndex) => rowIndex !== place.row ? row : { ...row, fields }),
    }),
  }
}

function withoutColumn(layout: IndexLayout, column: string): { layout: IndexLayout; field: LayoutField | null } {
  const found = placeOf(layout, column)
  if (!found) return { layout, field: null }
  const fields = fieldsAt(layout, found.place)
  return { layout: withFields(layout, found.place, fields.filter((_, index) => index !== found.index)), field: fields[found.index] }
}

function samePlace(left: Place, right: Place) {
  return left.area === right.area && (left.area === "aside" || (right.area === "row" && left.section === right.section && left.row === right.row))
}

/**
 * Pose un champ à une place : à la fin, ou avant le champ qui y est n-ième (compté avant
 * de l'ôter d'où il était, s'il vient de la même ligne).
 */
function placeField(layout: IndexLayout, column: string, place: Place, position?: number, base?: LayoutField): IndexLayout {
  const found = placeOf(layout, column)
  const removed = withoutColumn(layout, column)
  const field: LayoutField = removed.field ?? base ?? { column }
  const fields = [...fieldsAt(removed.layout, place)]
  const shifted = position !== undefined && found && samePlace(found.place, place) && found.index < position ? position - 1 : position
  const at = shifted === undefined ? fields.length : Math.max(0, Math.min(fields.length, shifted))
  fields.splice(at, 0, place.area === "aside" ? { ...field, span: undefined } : field)
  return withFields(removed.layout, place, fields)
}

const smallLabel = "grid gap-1 text-[11px] font-semibold text-muted-foreground"
const group = "grid gap-2 rounded-xl border bg-muted/15 p-2.5"
const groupTitle = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground"

/** Une couleur : une pastille de la palette, une colonne Couleur (« {Couleur} »), ou aucune. */
function ColorPick({ value, onChange, columns, disabled, label, allowAccent = true }: { value?: string; onChange: (value: string | undefined) => void; columns?: string[]; disabled?: boolean; label: string; allowAccent?: boolean }) {
  const fromColumn = value?.startsWith("{") ? value.slice(1, -1) : ""
  return <span className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
    {allowAccent && <button type="button" disabled={disabled} onClick={() => onChange(undefined)} aria-pressed={!value} title="La couleur d’accent" className={cn("h-5 rounded-full border px-1.5 text-[10px]", !value && "ring-2 ring-primary ring-offset-1")}>accent</button>}
    {cardPalette.map((color) => <button key={color.value} type="button" disabled={disabled} title={color.label} aria-label={color.label} aria-pressed={value === color.value} onClick={() => onChange(color.value)} className={cn("size-5 rounded-full border", value === color.value && "ring-2 ring-primary ring-offset-1")} style={{ backgroundColor: color.value }} />)}
    <label className="relative size-5 cursor-pointer overflow-hidden rounded-full border" title="Autre couleur" style={{ background: value?.startsWith("#") && !cardPalette.some((color) => color.value === value) ? value : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
      <input type="color" disabled={disabled} value={value?.startsWith("#") ? value.slice(0, 7) : "#927640"} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="Autre couleur" />
    </label>
    {columns && columns.length > 0 && <NativeSelect disabled={disabled} value={fromColumn} onChange={(event) => onChange(event.target.value ? `{${event.target.value}}` : undefined)} className="h-6 w-auto py-0 pl-2 pr-7 text-[11px]" aria-label={`${label} : prise dans une colonne`}>
      <NativeSelectOption value="">…ou une colonne</NativeSelectOption>
      {columns.map((column) => <NativeSelectOption key={column} value={column}>{`{${column}}`}</NativeSelectOption>)}
    </NativeSelect>}
  </span>
}

function Segmented<T extends string>({ value, options, onChange, disabled, label }: { value: T; options: Array<{ value: T; label: string; title?: string }>; onChange: (value: T) => void; disabled?: boolean; label: string }) {
  return <span className="inline-flex rounded-lg border bg-background/60 p-0.5" role="radiogroup" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} disabled={disabled} title={option.title} onClick={() => onChange(option.value)} className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>)}
  </span>
}

/** Un nouveau bloc, prêt à poser, rempli d'après les colonnes de l'onglet. */
function newBlock(kind: LayoutBlockKind, columns: LayoutColumn[]): LayoutBlock {
  const kindOf = (column: LayoutColumn) => normalizeSpec(column.spec).kind
  const numbers = columns.filter((column) => ["number", "gauge", "formula", "rollup"].includes(kindOf(column))).map((column) => column.header)
  const texts = columns.filter((column) => ["rich", "fixed"].includes(kindOf(column)) && !isNameColumnSpec(column.spec)).map((column) => column.header)
  switch (kind) {
    case "levels": return { kind: "levels", levels: texts.slice(0, 2).map((column, index) => ({ label: `Niveau ${index + 1}`, column })).concat(texts.length ? [] : [{ label: "Niveau 1", column: columns[0]?.header ?? "Description" }]) }
    case "tiles": return { kind: "tiles", columns: numbers.slice(0, 7).length ? numbers.slice(0, 7) : columns.slice(0, 3).map((column) => column.header), short: true }
    case "inventory": return { kind: "inventory", accept: "all", title: "Inventaire" }
    case "text": return { kind: "text", html: "<p>Un texte écrit dans la mise en page.</p>" }
    case "divider": return { kind: "divider" }
    case "button": return { kind: "button", label: "Ouvrir la fiche", action: "open-form" }
  }
}

/** Les réglages d'un bloc, selon son genre. */
function BlockSettings({ block, columns, onChange, disabled, forms }: { block: LayoutBlock; columns: LayoutColumn[]; onChange: (block: LayoutBlock) => void; disabled?: boolean; forms?: Array<{ id: string; name: string }> }) {
  const headers = columns.map((column) => column.header)
  const colorColumns = columns.filter((column) => normalizeSpec(column.spec).kind === "color").map((column) => column.header)
  const columnSelect = (value: string, onPick: (value: string) => void, label: string, empty = "— Aucune —") => <NativeSelect disabled={disabled} value={value} onChange={(event) => onPick(event.target.value)} className="h-7 w-full py-0 text-xs" aria-label={label}>
    <NativeSelectOption value="">{empty}</NativeSelectOption>
    {headers.map((header) => <NativeSelectOption key={header} value={header}>{header}</NativeSelectOption>)}
  </NativeSelect>
  switch (block.kind) {
    case "levels": return <div className="grid gap-2">
      <span className={smallLabel}>Les paliers, dans l’ordre</span>
      {block.levels.map((level, index) => <div key={index} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-1">
        <Input disabled={disabled} value={level.label} maxLength={40} onChange={(event) => onChange({ ...block, levels: block.levels.map((item, at) => at === index ? { ...item, label: event.target.value } : item) })} className="h-7 text-xs" aria-label="Nom du palier" />
        {columnSelect(level.column, (column) => onChange({ ...block, levels: block.levels.map((item, at) => at === index ? { ...item, column } : item) }), "Colonne du palier")}
        <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled || block.levels.length <= 1} onClick={() => onChange({ ...block, levels: block.levels.filter((_, at) => at !== index) })} aria-label="Retirer le palier"><X /></Button>
      </div>)}
      <div><Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={disabled || block.levels.length >= 6} onClick={() => onChange({ ...block, levels: [...block.levels, { label: `Niveau ${block.levels.length + 1}`, column: headers[0] ?? "" }] })}><Plus />Palier</Button></div>
      <label className={smallLabel}>Le niveau en cours est lu dans{columnSelect(block.current ?? "", (current) => onChange({ ...block, current: current || undefined }), "Colonne du niveau en cours", "— Jamais (tous pareils) —")}</label>
      <label className={smallLabel}>Texte sous les paliers (règles…){columnSelect(block.rules ?? "", (rules) => onChange({ ...block, rules: rules || undefined }), "Colonne des règles")}</label>
      {block.rules && <label className={smallLabel}>Son titre<Input disabled={disabled} value={block.rulesLabel ?? ""} maxLength={40} placeholder="Règles liées" onChange={(event) => onChange({ ...block, rulesLabel: event.target.value || undefined })} className="h-7 text-xs" /></label>}
    </div>
    case "tiles": return <div className="grid gap-2">
      <span className={smallLabel}>Les tuiles (une par colonne)</span>
      <div className="flex flex-wrap gap-1">
        {headers.map((header) => { const on = block.columns.includes(header); return <button key={header} type="button" disabled={disabled} aria-pressed={on} onClick={() => onChange({ ...block, columns: on ? block.columns.filter((item) => item !== header) : [...block.columns, header].slice(0, 12) })} className={cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>{header}</button> })}
      </div>
      {block.columns.length > 0 && <div className="grid gap-1">
        <span className={smallLabel}>La couleur de chaque tuile</span>
        {block.columns.map((column) => <div key={column} className="flex flex-wrap items-center gap-2 text-xs"><span className="w-28 truncate">{column}</span><ColorPick label={`Couleur de ${column}`} value={block.colors?.[column]} columns={colorColumns} disabled={disabled} onChange={(color) => { const colors = { ...(block.colors ?? {}) }; if (color) colors[column] = color; else delete colors[column]; onChange({ ...block, colors: Object.keys(colors).length ? colors : undefined }) }} /></div>)}
      </div>}
      <div className="flex flex-wrap items-center gap-3">
        <label className={smallLabel}>Tuiles par ligne<NativeSelect disabled={disabled} value={String(block.perRow ?? 0)} onChange={(event) => onChange({ ...block, perRow: Number(event.target.value) || undefined })} className="h-7 w-auto py-0 pl-2 pr-7 text-xs" aria-label="Tuiles par ligne"><NativeSelectOption value="0">Toutes</NativeSelectOption>{[2, 3, 4, 5, 6, 7, 8].map((count) => <NativeSelectOption key={count} value={String(count)}>{count}</NativeSelectOption>)}</NativeSelect></label>
        <label className="flex items-center gap-1.5 text-[11px]"><Checkbox disabled={disabled} checked={block.short !== false} onCheckedChange={(checked) => onChange({ ...block, short: checked === true ? undefined : false })} />Noms abrégés (FOR, DEX…)</label>
      </div>
    </div>
    case "inventory": return <div className="grid gap-2">
      <label className={smallLabel}>Titre<Input disabled={disabled} value={block.title ?? ""} maxLength={60} placeholder="Inventaire" onChange={(event) => onChange({ ...block, title: event.target.value || undefined })} className="h-7 text-xs" /></label>
      <span className={smallLabel}>Ce qu’il accepte<Segmented label="Ce que l’inventaire accepte" value={block.accept} disabled={disabled} onChange={(accept) => onChange({ ...block, accept })} options={[{ value: "all", label: "Tous les items" }, { value: "Armes", label: "Armes" }, { value: "Équipement", label: "Équipement" }, { value: "Esthétique", label: "Esthétique" }, { value: "Bourse", label: "Bourse" }]} /></span>
      <p className="text-[10px] leading-4 text-muted-foreground">Propre à chaque ligne. Un PNJ récupéré dans une campagne emporte une copie de son inventaire : ce qu’on y ajoute ensuite ne touche pas l’index.</p>
    </div>
    case "text": return <div className="grid gap-2">
      <RichTextField ariaLabel="Texte du bloc" value={block.html} minHeight="min-h-16" onCommit={(html) => onChange({ ...block, html })} disabled={disabled} />
      <span className={smallLabel}>Ton<Segmented label="Ton du texte" value={block.tone ?? "normal"} disabled={disabled} onChange={(tone) => onChange({ ...block, tone: tone === "normal" ? undefined : tone })} options={[{ value: "normal", label: "Normal" }, { value: "muted", label: "Discret" }, { value: "accent", label: "Accent" }, { value: "callout", label: "Encadré" }]} /></span>
    </div>
    case "divider": return <span className={smallLabel}>Style<Segmented label="Style du séparateur" value={block.style ?? "line"} disabled={disabled} onChange={(style) => onChange({ ...block, style: style === "line" ? undefined : style })} options={[{ value: "line", label: "Trait" }, { value: "ornament", label: "Ornement" }, { value: "space", label: "Espace" }]} /></span>
    case "button": return <div className="grid gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
        <label className={smallLabel}>Texte du bouton<Input disabled={disabled} value={block.label} maxLength={60} onChange={(event) => onChange({ ...block, label: event.target.value })} className="h-7 text-xs" /></label>
        <span className={smallLabel}>Icône<IconPicker icon={block.icon} disabled={disabled} allowNone onChange={(value) => onChange({ ...block, icon: value.icon || undefined })} /></span>
      </div>
      <span className={smallLabel}>Action<Segmented label="Action du bouton" value={block.action} disabled={disabled} onChange={(action) => onChange({ ...block, action })} options={[{ value: "open-form", label: "Ouvrir la fiche" }, { value: "open-page", label: "Une page" }, { value: "link", label: "Une adresse" }]} /></span>
      {block.action === "open-form" && forms && forms.length > 1 && <label className={smallLabel}>Formulaire<NativeSelect disabled={disabled} value={block.formId ?? ""} onChange={(event) => onChange({ ...block, formId: event.target.value || undefined })} className="h-7 py-0 text-xs"><NativeSelectOption value="">Le formulaire étoilé</NativeSelectOption>{forms.filter((form) => form.id !== "principal").map((form) => <NativeSelectOption key={form.id} value={form.id}>{form.name}</NativeSelectOption>)}</NativeSelect></label>}
      {block.action !== "open-form" && <label className={smallLabel}>Adresse <span className="font-normal">— « {"{ID}"} » et « {"{Colonne}"} » prennent les valeurs de la ligne</span><Input disabled={disabled} value={block.href ?? ""} maxLength={400} placeholder={block.action === "open-page" ? "/regles/une-page" : "https://…"} onChange={(event) => onChange({ ...block, href: event.target.value || undefined })} className="h-7 font-mono text-xs" /></label>}
      <span className={smallLabel}>Allure<Segmented label="Allure du bouton" value={block.tone ?? "default"} disabled={disabled} onChange={(tone) => onChange({ ...block, tone: tone === "default" ? undefined : tone })} options={[{ value: "default", label: "Discret" }, { value: "outline", label: "Contour" }, { value: "accent", label: "Couleur d’accent" }]} /></span>
    </div>
  }
}

/**
 * Le constructeur de mise en page d'un onglet : la fiche (et le formulaire d'ajout), ou le
 * survol d'une ligne citée. On range les colonnes et les blocs (paliers, tuiles,
 * inventaire, texte, bouton…) dans une colonne latérale et dans des sections faites de
 * lignes ; chaque champ a sa largeur, chaque section son allure et sa couleur. Glisser un
 * champ le déplace ; les flèches font de même au clavier. L'aperçu, à droite, montre la
 * première ligne de l'onglet. Le point de départ est toujours la mise en page réellement
 * utilisée (celle réglée, celle d'Eraser, ou l'automatique écrite d'après les colonnes).
 */
export function IndexLayoutEditor({ kind, columns, value, source = "saved", onChange, onReset, sample = {}, samples, resetLabel, disabled = false, forms, sampleRow, eraserStarters }: {
  kind: LayoutKind
  /** Les colonnes que la mise en page peut placer. */
  columns: LayoutColumn[]
  value: IndexLayout
  /** D'où vient la mise en page affichée : réglée, celle d'Eraser, ou l'automatique. */
  source?: "saved" | "eraser" | "automatic"
  onChange: (layout: IndexLayout) => void
  /** Oublier la mise en page réglée (retour à celle d'Eraser, ou à l'automatique). */
  onReset?: () => void
  /** Une ligne de l'onglet (en-tête → texte), pour l'aperçu. */
  sample?: Record<string, string>
  /** Les premières lignes de l'onglet, pour l'aperçu en grand (on passe de l'une à l'autre). */
  samples?: Array<Record<string, string>>
  resetLabel?: string
  disabled?: boolean
  /** Les formulaires de l'onglet (un bouton « Ouvrir la fiche » en choisit un). */
  forms?: Array<{ id: string; name: string }>
  /** La ligne de l'aperçu (son identifiant, son onglet). */
  sampleRow?: { index: string; id: string; tab: string }
  /** Les formes d'Eraser pour cet onglet (fiche de créature, survol d'un état…), proposées en formes de base. */
  eraserStarters?: Array<{ key: string; label: string; hint: string; layout: IndexLayout }>
}) {
  // La colonne qu'on glisse (le texte du glisser la porte aussi, pour un dépôt d'ailleurs).
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // Le champ dont on ouvre les réglages (libellé, icône, couleur ; ou les réglages d'un bloc).
  const [editing, setEditing] = useState<string | null>(null)
  // Les deux pages de l'éditeur : la mise en page (colonnes, sections), et l'apparence (accent, en-tête du survol).
  const [page, setPage] = useState<"layout" | "look">("layout")
  const [starting, setStarting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const hover = kind === "hover"
  const layout = value
  const placed = useMemo(() => new Set([...layout.aside, ...layout.sections.flatMap((section) => section.rows.flatMap((row) => row.fields))].map((field) => foldName(field.column))), [layout])
  const unplaced = columns.filter((column) => !placed.has(foldName(column.header)))
  const specOf = (header: string) => columns.find((column) => sameColumn(column.header, header))?.spec
  const known = (header: string) => columns.some((column) => sameColumn(column.header, header))
  const colorColumns = columns.filter((column) => normalizeSpec(column.spec).kind === "color" || /^couleur/i.test(column.header)).map((column) => column.header)
  const set = (next: IndexLayout) => onChange(next)

  const dropProps = (place: Place, key: string) => ({
    onDragOver: (event: DragEvent) => { if (!dragging || disabled) return; event.preventDefault(); setOver(key) },
    onDragLeave: () => setOver((current) => current === key ? null : current),
    onDrop: (event: DragEvent) => { event.preventDefault(); setOver(null); const column = dragging ?? event.dataTransfer.getData("text/plain"); setDragging(null); if (column) set(placeField(layout, column, place)) },
  })

  const addRow = (section: number, fields: LayoutField[] = []) => set({ ...layout, sections: layout.sections.map((entry, index) => index !== section ? entry : { ...entry, rows: [...entry.rows, { id: layoutId(), fields }] }) })
  const updateSection = (section: number, changes: Partial<LayoutSection>) => set({ ...layout, sections: layout.sections.map((entry, index) => index === section ? { ...entry, ...changes } : entry) })
  const moveSection = (section: number, delta: number) => {
    const target = section + delta
    if (target < 0 || target >= layout.sections.length) return
    const sections = [...layout.sections]
    const [moved] = sections.splice(section, 1)
    sections.splice(target, 0, moved)
    set({ ...layout, sections })
  }
  const moveRow = (section: number, row: number, delta: number) => {
    const rows = [...layout.sections[section].rows]
    const target = row + delta
    if (target < 0 || target >= rows.length) return
    const [moved] = rows.splice(row, 1)
    rows.splice(target, 0, moved)
    updateSection(section, { rows })
  }
  /** Ajoute une colonne non placée (ou un bloc neuf) : à la ligne donnée, sinon à la dernière ligne (créée au besoin). */
  const addField = (field: LayoutField, place?: Place) => {
    const column = field.column
    if (place) return set(placeField(layout, column, place, undefined, { span: 6, ...field }))
    const lastSection = layout.sections.length - 1
    if (lastSection < 0) return set({ ...layout, sections: [{ id: layoutId(), rows: [{ id: layoutId(), fields: [{ span: 12, ...field }] }] }] })
    const rows = layout.sections[lastSection].rows
    const lastRow = rows[rows.length - 1]
    const used = lastRow?.fields.reduce((sum, item) => sum + (item.span ?? 6), 0) ?? 12
    if (lastRow && used + 6 <= 12 && !field.block) return set(placeField(layout, column, { area: "row", section: lastSection, row: rows.length - 1 }, undefined, { span: 6, ...field }))
    addRow(lastSection, [{ span: 12, ...field }])
  }
  const addBlock = (kindValue: LayoutBlockKind, place?: Place) => {
    const key = blockKey()
    addField({ column: key, block: newBlock(kindValue, columns), span: 12, hideLabel: true }, place)
    setEditing(key)
  }
  /** Un champ passe à la ligne d'avant ou d'après (une nouvelle ligne au bout de la section). */
  const shiftRow = (column: string, delta: number) => {
    const found = placeOf(layout, column)
    if (!found || found.place.area !== "row") return
    const { section, row } = found.place
    const rows = layout.sections[section].rows
    const target = row + delta
    if (target < 0) return
    if (target >= rows.length) {
      const removed = withoutColumn(layout, column)
      return set({ ...removed.layout, sections: removed.layout.sections.map((entry, index) => index !== section ? entry : { ...entry, rows: [...entry.rows, { id: layoutId(), fields: removed.field ? [removed.field] : [] }] }) })
    }
    set(placeField(layout, column, { area: "row", section, row: target }))
  }
  const updateField = (column: string, changes: Partial<LayoutField>) => {
    const found = placeOf(layout, column)
    if (!found) return
    set(withFields(layout, found.place, fieldsAt(layout, found.place).map((field, index) => index === found.index ? { ...field, ...changes } : field)))
  }

  const blockPalette = (place?: Place) => <Popover>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-7 border border-dashed text-[11px] text-muted-foreground" disabled={disabled} title="Un bloc : paliers, tuiles, inventaire, texte, séparateur, bouton"><Blocks className="size-3.5" />Bloc</Button></PopoverTrigger>
    <PopoverContent align="start" className="w-80 p-1.5">
      {layoutBlockKinds.filter((entry) => hover ? entry.hover : entry.form).map((entry) => <button key={entry.value} type="button" onClick={() => addBlock(entry.value, place)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
        <span className="min-w-0"><span className="block text-sm font-medium">{entry.label}</span><span className="block text-[11px] leading-4 text-muted-foreground">{entry.hint}</span></span>
      </button>)}
    </PopoverContent>
  </Popover>

  const chip = (field: LayoutField, place: Place, index: number, count: number) => {
    const spec = specOf(field.column)
    const isBlock = Boolean(field.block)
    const missing = !isBlock && !known(field.column)
    const open = editing === field.column
    const title = isBlock ? layoutBlockKinds.find((entry) => entry.value === field.block!.kind)?.label ?? "Bloc" : field.column
    return <div
      key={field.column}
      draggable={!disabled}
      onDragStart={(event) => { setDragging(field.column); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", field.column) }}
      onDragEnd={() => { setDragging(null); setOver(null) }}
      onDragOver={(event) => { if (dragging && dragging !== field.column && !disabled) { event.preventDefault(); event.stopPropagation() } }}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setOver(null); const column = dragging; setDragging(null); if (column && column !== field.column) set(placeField(layout, column, place, index)) }}
      className={cn("group/chip relative flex min-w-0 items-center gap-1 rounded-lg border px-1.5 py-1 text-xs shadow-xs", missing ? "border-destructive/40 bg-destructive/5" : isBlock ? "border-primary/40 bg-primary/5" : "bg-background", open && "ring-2 ring-primary/50")}
      // Sa part de la ligne, comme dans la fiche : un champ « ½ » seul n'en prend que la moitié.
      style={place.area === "row" ? { flex: `0 1 calc(${field.span ?? 6} / 12 * 100% - 0.375rem)`, minWidth: "7.5rem" } : undefined}
      title={missing ? "Cette colonne n’existe plus dans l’onglet : elle sera ignorée." : isBlock ? layoutBlockSummary(field.block!) : spec ? indexColumnKinds[normalizeSpec(spec).kind].label : undefined}
    >
      <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden="true" />
      {isBlock && <Blocks className="size-3 shrink-0 text-primary" aria-hidden="true" />}
      {field.icon && <IndexIconGlyph icon={field.icon} className="size-3 shrink-0" filled={false} />}
      <span className={cn("min-w-0 flex-1 truncate font-medium", field.large && "font-display text-sm", missing && "line-through")} style={field.color && !field.color.startsWith("{") ? { color: resolveLayoutColor(field.color, DEFAULT_LAYOUT_ACCENT) } : undefined}>{isBlock ? `${title} · ${layoutBlockSummary(field.block!)}` : field.label || field.column}</span>
      {place.area === "row" && <NativeSelect disabled={disabled} value={String(field.span ?? 6)} onChange={(event) => updateField(field.column, { span: Number(event.target.value) as LayoutSpan })} className="h-6 w-[4.5rem] py-0 pl-2 pr-7 text-xs" aria-label={`Largeur de ${title}`} title="Largeur sur la ligne">
        {layoutSpans.map((span) => <NativeSelectOption key={span.value} value={String(span.value)} title={span.label}>{span.short}</NativeSelectOption>)}
      </NativeSelect>}
      {!isBlock && (field.large || field.hideLabel) && <span className="flex shrink-0 gap-0.5 text-muted-foreground">{field.large && <Heading className="size-3" aria-label="En grand" />}{field.hideLabel && <Tag className="size-3" aria-label="Sans nom de colonne" />}</span>}
      {/* Les gestes du champ, dans une petite barre qui flotte au-dessus au survol : le champ reste compact.
          Tant que les réglages sont ouverts, la barre reste affichée : la fenêtre s'ancre dessus, elle ne doit pas disparaître quand la souris part. */}
      <span className={cn("absolute -top-3.5 right-1 z-20 hidden items-center rounded-md border bg-popover px-0.5 shadow-md group-hover/chip:flex group-focus-within/chip:flex", open && "flex")}>
        <Popover open={open} onOpenChange={(next) => setEditing(next ? field.column : null)}>
          <PopoverTrigger asChild><Button type="button" variant={open ? "secondary" : "ghost"} size="icon-xs" disabled={disabled} title={isBlock ? "Réglages du bloc" : "Libellé, icône, couleur"} aria-label="Réglages">{isBlock ? <Settings2 /> : <Paintbrush />}</Button></PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-3">
            {isBlock
              ? <BlockSettings block={field.block!} columns={columns} disabled={disabled} forms={forms} onChange={(block) => updateField(field.column, { block })} />
              : <div className="grid gap-2">
                <label className={smallLabel}>Libellé au-dessus du champ<Input disabled={disabled} value={field.label ?? ""} maxLength={60} placeholder={field.column} onChange={(event) => updateField(field.column, { label: event.target.value || undefined })} className="h-7 text-xs" /></label>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={smallLabel}>Icône<IconPicker icon={field.icon} disabled={disabled} allowNone onChange={(value) => updateField(field.column, { icon: value.icon || undefined })} /></span>
                  <label className="flex items-center gap-1.5 text-[11px]"><Checkbox disabled={disabled} checked={Boolean(field.hideLabel)} onCheckedChange={(checked) => updateField(field.column, { hideLabel: checked === true || undefined })} />Sans libellé</label>
                  <label className="flex items-center gap-1.5 text-[11px]"><Checkbox disabled={disabled} checked={Boolean(field.large)} onCheckedChange={(checked) => updateField(field.column, { large: checked === true || undefined })} />En grand (un nom, un titre)</label>
                </div>
                <span className={smallLabel}>Couleur du libellé<ColorPick label="Couleur du libellé" value={field.color} columns={colorColumns} disabled={disabled} onChange={(color) => updateField(field.column, { color })} /></span>
              </div>}
          </PopoverContent>
        </Popover>
        <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === 0} onClick={() => set(placeField(layout, field.column, place, index - 1))} title="Vers la gauche (ou le haut)" aria-label="Avancer"><ArrowLeft /></Button>
        <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === count - 1} onClick={() => set(placeField(layout, field.column, place, index + 2))} title="Vers la droite (ou le bas)" aria-label="Reculer"><ArrowRight /></Button>
        {place.area === "row" && <>
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || place.row === 0} onClick={() => shiftRow(field.column, -1)} title="À la ligne d’avant" aria-label="Ligne d’avant"><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} onClick={() => shiftRow(field.column, 1)} title="À la ligne d’après (une nouvelle ligne au bout)" aria-label="Ligne d’après"><ArrowDown /></Button>
        </>}
        <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => set(withoutColumn(layout, field.column).layout)} title={isBlock ? "Retirer le bloc" : "Retirer de la mise en page"} aria-label={`Retirer ${title}`}><X /></Button>
      </span>
    </div>
  }

  const addSelect = (place: Place, label: string) => <span className="flex items-center gap-1">
    {unplaced.length > 0 && <NativeSelect disabled={disabled} value="" onChange={(event) => { if (event.target.value) addField({ column: event.target.value }, place) }} className="h-7 w-auto min-w-28 border-dashed py-0 pl-2 pr-8 text-[11px]" aria-label={label}>
      <NativeSelectOption value="">+ Champ…</NativeSelectOption>
      {unplaced.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header}</NativeSelectOption>)}
    </NativeSelect>}
    {blockPalette(place)}
  </span>

  // La couleur d'accent résolue sur la première ligne : les sections de la page la montrent.
  const readColumn = (column: string) => (sample[column] ?? sample[columns.find((item) => sameColumn(item.header, column))?.header ?? ""] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const accent = resolveLayoutColor(layout.accent, DEFAULT_LAYOUT_ACCENT, readColumn)
  const sourceLabel = source === "eraser" ? "forme d’Eraser" : source === "automatic" ? "affichage automatique" : "réglée à la main"

  return <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
    <div className="grid content-start gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Tabs ariaLabel="Pages de l’éditeur" value={page} onChange={setPage} options={[{ value: "layout", label: "Mise en page", icon: <LayoutTemplate className="size-3.5" /> }, { value: "look", label: "Apparence", icon: <Palette className="size-3.5" /> }]} />
        <span className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="rounded-full border px-2 py-0.5">{sourceLabel}</span>
          {source === "saved" && onReset && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-[11px]" disabled={disabled} onClick={onReset}><RotateCcw className="size-3" />{resetLabel ?? "Revenir à l’affichage d’Eraser"}</Button>}
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={disabled} onClick={() => setStarting(true)} title="Repartir d’une forme de base, remplie avec les colonnes de cet onglet"><Sparkles className="size-3.5" />Forme de base</Button>
        </span>
      </div>

      {page === "look" && <div className={cn(group, "sm:grid-cols-2")}>
        <span className={smallLabel}>Couleur d’accent <span className="font-normal">— titres de sections, séparateurs, boutons</span><ColorPick label="Couleur d’accent" value={layout.accent} columns={colorColumns} disabled={disabled} allowAccent={false} onChange={(accent) => set({ ...layout, accent })} /></span>
        <span className={cn(smallLabel, "self-end")}><label className="flex items-center gap-1.5 pb-1.5 text-[11px]"><Checkbox disabled={disabled} checked={Boolean(layout.tabs)} onCheckedChange={(checked) => set({ ...layout, tabs: checked === true || undefined })} />Sections en onglets <span className="font-normal text-muted-foreground">— une section à la fois, la colonne latérale reste</span></label></span>
        {hover && <div className="grid gap-2 sm:col-span-2">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <label className={smallLabel}>Sous-titre
              <NativeSelect disabled={disabled} value={layout.subtitle ?? ""} onChange={(event) => set({ ...layout, subtitle: event.target.value || undefined })} className="h-8 py-0 text-xs">
                <NativeSelectOption value="">Automatique (Type, onglet)</NativeSelectOption>
                {columns.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <label className={smallLabel}>Icône devant le nom
              <NativeSelect disabled={disabled} value={layout.icon ?? ""} onChange={(event) => set({ ...layout, icon: event.target.value || undefined })} className="h-8 py-0 text-xs">
                <NativeSelectOption value="">Aucune</NativeSelectOption>
                {columns.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <span className={smallLabel}>Largeur<Segmented label="Largeur du survol" value={layout.width ?? "md"} disabled={disabled} onChange={(width) => set({ ...layout, width: width === "md" ? undefined : width })} options={[{ value: "sm", label: "Étroit" }, { value: "md", label: "Normal" }, { value: "lg", label: "Large" }]} /></span>
            <label className="flex items-center gap-1.5 self-center pt-3 text-[11px]"><Checkbox disabled={disabled} checked={Boolean(layout.nameInAccent)} onCheckedChange={(checked) => set({ ...layout, nameInAccent: checked === true || undefined })} />Nom à la couleur de l’accent</label>
          </div>
          {/* Le médaillon en tête : rien d'office ; « Ajouter un médaillon » le pose, avec sa colonne (image ou icône, au choix de la case), sa taille, rond, teinté. */}
          {!layout.medallion && !layout.tint && !layout.image
            ? <div><Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={disabled} onClick={() => set({ ...layout, medallion: { size: 44 } })}><Plus />Ajouter un médaillon</Button></div>
            : (() => {
              const medallion = layout.medallion ?? { ...(layout.image ? { column: layout.image } : {}), ...(layout.tint ? { tint: true } : {}), size: 44 }
              const update = (changes: Partial<NonNullable<IndexLayout["medallion"]>>) => set({ ...layout, image: undefined, tint: undefined, medallion: { ...medallion, ...changes } })
              return <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-lg border border-dashed bg-background/40 p-2">
                <label className={smallLabel}>Médaillon
                  <NativeSelect disabled={disabled} value={medallion.column ?? ""} onChange={(event) => update({ column: event.target.value || undefined })} className="h-8 py-0 text-xs">
                    <NativeSelectOption value="">Image ou icône de la ligne (automatique)</NativeSelectOption>
                    {columns.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header}</NativeSelectOption>)}
                  </NativeSelect>
                </label>
                <label className="grid min-w-28 gap-0.5 text-[11px] font-semibold text-muted-foreground"><span className="flex justify-between"><span>Taille</span><span className="font-normal tabular-nums">{medallion.size ?? 44} px</span></span><input type="range" min={20} max={160} step={2} value={medallion.size ?? 44} disabled={disabled} onChange={(event) => update({ size: Number(event.target.value) })} className="accent-primary" /></label>
                <label className="flex items-center gap-1.5 pb-1.5 text-[11px]"><Checkbox disabled={disabled} checked={Boolean(medallion.round)} onCheckedChange={(checked) => update({ round: checked === true || undefined })} />Rond</label>
                <span className={smallLabel}>Fond<Segmented label="Fond du médaillon" value={medallion.tint ? "accent" : medallion.bare ? "none" : "neutral"} disabled={disabled} onChange={(fond) => update({ tint: fond === "accent" || undefined, bare: fond === "none" || undefined })} options={[{ value: "neutral", label: "Neutre", title: "Un cadre et un fond discret" }, { value: "accent", label: "Accent", title: "Un médaillon à la couleur de l’accent" }, { value: "none", label: "Aucun", title: "Rien derrière : une image détourée, un pictogramme" }]} /></span>
                <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => set({ ...layout, image: undefined, tint: undefined, medallion: undefined })} aria-label="Retirer le médaillon" title="Retirer le médaillon"><X /></Button>
              </div>
            })()}
          {/* La bannière : une image en travers au-dessus du nom. */}
          {!layout.banner
            ? <div><Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={disabled} onClick={() => set({ ...layout, banner: { column: columns.find((column) => normalizeSpec(column.spec).kind === "file" || /image|portrait|banni|illustration/i.test(column.header))?.header, height: 110 } })}><Plus />Ajouter une bannière</Button></div>
            : <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-lg border border-dashed bg-background/40 p-2">
              <label className={smallLabel}>Bannière
                <NativeSelect disabled={disabled} value={layout.banner.column ?? ""} onChange={(event) => set({ ...layout, banner: { ...layout.banner, column: event.target.value || undefined } })} className="h-8 py-0 text-xs">
                  <NativeSelectOption value="">— Choisir une colonne image —</NativeSelectOption>
                  {columns.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <label className="grid min-w-28 gap-0.5 text-[11px] font-semibold text-muted-foreground"><span className="flex justify-between"><span>Hauteur</span><span className="font-normal tabular-nums">{layout.banner.height ?? 110} px</span></span><input type="range" min={40} max={400} step={5} value={layout.banner.height ?? 110} disabled={disabled} onChange={(event) => set({ ...layout, banner: { ...layout.banner, height: Number(event.target.value) } })} className="accent-primary" /></label>
              <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => set({ ...layout, banner: undefined })} aria-label="Retirer la bannière" title="Retirer la bannière"><X /></Button>
            </div>}
        </div>}
      </div>}

      {page === "layout" && <>

      <div className={`grid gap-2 rounded-xl border p-3 ${over === "aside" ? "border-primary bg-primary/5" : "bg-muted/10"}`} {...dropProps({ area: "aside" }, "aside")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold">Colonne latérale <span className="font-normal text-muted-foreground">— portrait, image, icône…</span></p>
          <span className="flex flex-wrap items-center gap-2">
            <Segmented label="Côté de la colonne latérale" value={layout.asideSide ?? "left"} disabled={disabled} onChange={(asideSide) => set({ ...layout, asideSide: asideSide === "left" ? undefined : asideSide })} options={[{ value: "left", label: "À gauche" }, { value: "right", label: "À droite" }]} />
            <NativeSelect disabled={disabled} value={layout.asideWidth ?? "md"} onChange={(event) => set({ ...layout, asideWidth: event.target.value as IndexLayout["asideWidth"] })} className="h-7 w-auto py-0 pl-2 pr-8 text-[11px]" aria-label="Largeur de la colonne latérale">
              <NativeSelectOption value="sm">Étroite</NativeSelectOption>
              <NativeSelectOption value="md">Moyenne</NativeSelectOption>
              <NativeSelectOption value="lg">Large</NativeSelectOption>
            </NativeSelect>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {layout.aside.map((field, index) => chip(field, { area: "aside" }, index, layout.aside.length))}
          {!layout.aside.length && <span className="text-[11px] text-muted-foreground">Vide : glisse un champ ici, ou</span>}
          {addSelect({ area: "aside" }, "Ajouter à la colonne latérale")}
        </div>
      </div>

      {layout.sections.map((section, sectionIndex) => {
        const look: SectionLook = section.look ?? (section.framed ? "framed" : "plain")
        const color = resolveLayoutColor(section.color, accent, readColumn)
        return <div key={section.id} className={cn("grid gap-2 rounded-xl border p-3", look === "plain" ? "bg-background/40" : "bg-muted/25")} style={look !== "plain" ? { borderColor: `${color}66` } : undefined}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1"><IconPicker icon={section.icon} disabled={disabled} allowNone onChange={(value) => updateSection(sectionIndex, { icon: value.icon || undefined })} /></span>
            <Input disabled={disabled} value={section.title ?? ""} onChange={(event) => updateSection(sectionIndex, { title: event.target.value || undefined })} placeholder={`Section ${sectionIndex + 1} — titre (facultatif)`} className="h-8 min-w-40 flex-1 text-xs font-semibold" style={section.title && look !== "plain" ? { color } : undefined} />
            <Segmented label="Allure de la section" value={look} disabled={disabled} onChange={(next) => updateSection(sectionIndex, { look: next === "plain" ? undefined : next, framed: undefined })} options={[{ value: "plain", label: "Nue" }, { value: "framed", label: "Encadrée" }, { value: "tinted", label: "Teintée" }, { value: "banner", label: "Bandeau" }]} />
            <Segmented label="Colonnes de la section" value={String(section.columns ?? 1)} disabled={disabled} onChange={(next) => updateSection(sectionIndex, { columns: next === "1" ? undefined : Number(next) as 2 | 3 })} options={[{ value: "1", label: "1 col.", title: "Les lignes se suivent" }, { value: "2", label: "2 col." }, { value: "3", label: "3 col." }]} />
            <label className="flex items-center gap-1.5 text-[11px]"><Checkbox disabled={disabled} checked={Boolean(section.collapsible)} onCheckedChange={(checked) => updateSection(sectionIndex, { collapsible: checked === true || undefined, collapsed: checked === true ? section.collapsed : undefined })} />Repliable</label>
            {section.collapsible && <label className="flex items-center gap-1.5 text-[11px]"><Checkbox disabled={disabled} checked={Boolean(section.collapsed)} onCheckedChange={(checked) => updateSection(sectionIndex, { collapsed: checked === true || undefined })} />Fermée d’emblée</label>}
            <span className="ml-auto flex">
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)} aria-label="Monter la section"><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || sectionIndex === layout.sections.length - 1} onClick={() => moveSection(sectionIndex, 1)} aria-label="Descendre la section"><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => set({ ...layout, sections: layout.sections.filter((_, index) => index !== sectionIndex) })} title="Supprimer la section (ses champs redeviennent libres)" aria-label="Supprimer la section"><Trash2 /></Button>
            </span>
          </div>
          {(look !== "plain" || section.color) && <span className={smallLabel}>Couleur de la section<ColorPick label="Couleur de la section" value={section.color} columns={colorColumns} disabled={disabled} onChange={(next) => updateSection(sectionIndex, { color: next })} /></span>}
          {section.rows.map((row, rowIndex) => {
            const key = `${section.id}:${row.id}`
            const used = row.fields.reduce((sum, field) => sum + (field.span ?? 6), 0)
            return <div key={row.id} className={`group/row flex items-start gap-1.5 rounded-lg border border-dashed p-1.5 ${over === key ? "border-primary bg-primary/5" : "border-border/70"}`} {...dropProps({ area: "row", section: sectionIndex, row: rowIndex }, key)}>
              <span className="mt-1.5 w-5 shrink-0 text-center text-[10px] text-muted-foreground" title={used > 12 ? "La ligne dépasse : les champs se partagent la place" : `${used}/12 de la ligne`}>{rowIndex + 1}</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {row.fields.map((field, index) => chip(field, { area: "row", section: sectionIndex, row: rowIndex }, index, row.fields.length))}
                {!row.fields.length && <span className="px-1 text-[11px] text-muted-foreground">Ligne vide : glisse un champ ici, ou</span>}
                {addSelect({ area: "row", section: sectionIndex, row: rowIndex }, `Ajouter à la ligne ${rowIndex + 1}`)}
              </div>
              <span className="flex shrink-0 opacity-50 group-hover/row:opacity-100">
                <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || rowIndex === 0} onClick={() => moveRow(sectionIndex, rowIndex, -1)} aria-label="Monter la ligne"><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || rowIndex === section.rows.length - 1} onClick={() => moveRow(sectionIndex, rowIndex, 1)} aria-label="Descendre la ligne"><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => updateSection(sectionIndex, { rows: section.rows.filter((_, index) => index !== rowIndex) })} title="Supprimer la ligne (ses champs redeviennent libres)" aria-label="Supprimer la ligne"><Trash2 /></Button>
              </span>
            </div>
          })}
          <div><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => addRow(sectionIndex)}><Plus />Ligne</Button></div>
        </div>
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => set({ ...layout, sections: [...layout.sections, { id: layoutId(), rows: [{ id: layoutId(), fields: [] }] }] })}><Plus />Section</Button>
        {blockPalette()}
      </div>

      <div className="grid gap-2 rounded-xl border bg-muted/10 p-3">
        <p className="text-xs font-semibold">Champs non placés <span className="font-normal text-muted-foreground">— glisse-les dans une ligne, ou clique pour les ajouter à la fin</span></p>
        <div className="flex flex-wrap gap-1.5">
          {unplaced.map((column) => <button
            key={column.header}
            type="button"
            draggable={!disabled}
            disabled={disabled}
            onDragStart={(event) => { setDragging(column.header); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column.header) }}
            onDragEnd={() => { setDragging(null); setOver(null) }}
            onClick={() => addField({ column: column.header })}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed bg-background px-2 py-1 text-xs hover:border-primary hover:text-primary"
            title={`${indexColumnKinds[normalizeSpec(column.spec).kind].label} — cliquer pour l’ajouter`}
          ><Plus className="size-3" />{column.header}</button>)}
          {!unplaced.length && <span className="text-[11px] text-muted-foreground">Toutes les colonnes sont placées.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="text-muted-foreground">Les colonnes non placées (et celles ajoutées plus tard) :</span>
          <label className="flex items-center gap-1.5"><input type="radio" disabled={disabled} checked={(layout.rest ?? (hover ? "hide" : "show")) === "show"} onChange={() => set({ ...layout, rest: "show" })} />s’affichent à la suite</label>
          <label className="flex items-center gap-1.5"><input type="radio" disabled={disabled} checked={(layout.rest ?? (hover ? "hide" : "show")) === "hide"} onChange={() => set({ ...layout, rest: "hide" })} />sont masquées</label>
        </div>
      </div>
      </>}
    </div>

    {starting && <LayoutStarterDialog kind={kind} columns={columns} sample={sample} sampleRow={sampleRow} eraserStarters={eraserStarters} onPick={(picked) => { set(picked); setStarting(false); setPage("layout") }} onClose={() => setStarting(false)} />}

    <aside className="grid content-start gap-2 rounded-xl border bg-card/70 p-3 xl:sticky xl:top-0 xl:self-start">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Aperçu</p>
        <PreviewExpandButton onClick={() => setExpanded(true)} />
      </div>
      <LayoutPreview kind={kind} layout={layout} columns={columns} sample={sample} sampleRow={sampleRow} />
    </aside>
    {expanded && <LayoutLivePreview kind={kind} layout={layout} columns={columns} samples={samples?.length ? samples : [sample]} index={sampleRow?.index ?? ""} tab={sampleRow?.tab ?? ""} onClose={() => setExpanded(false)} />}
  </div>
}

/** L'aperçu d'une mise en page sur la première ligne de l'onglet : l'en-tête du survol (médaillon, bannière, nom, sous-titre), puis les sections. */
function LayoutPreview({ kind, layout, columns, sample = {}, sampleRow }: { kind: LayoutKind; layout: IndexLayout; columns: LayoutColumn[]; sample?: Record<string, string>; sampleRow?: { index: string; id: string; tab: string } }) {
  const hover = kind === "hover"
  const previewItems = columns.map((column) => ({ header: column.header, text: (sample[column.header] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), html: sample[column.header] ?? "" }))
  type PreviewItem = (typeof previewItems)[number] & { block?: LayoutBlock }
  const preview = arrangeLayout<PreviewItem>(layout, previewItems, (item) => item.header, (field) => ({ header: field.column, text: "", html: "", block: field.block }))
  const readColumn = (column: string) => previewItems.find((item) => sameColumn(item.header, column))?.text ?? ""
  const htmlOf = (column: string) => previewItems.find((item) => sameColumn(item.header, column))?.html ?? ""
  const accent = resolveLayoutColor(layout.accent, DEFAULT_LAYOUT_ACCENT, readColumn)
  const previewField = (item: PreviewItem, field: LayoutField): ReactNode => item.block
    ? <div className="grid gap-0.5">{!field.hideLabel && field.label && <span className="text-[10px] font-semibold text-muted-foreground">{field.label}</span>}<LayoutBlockView block={item.block} ctx={{ valueOf: readColumn, htmlOf, accent, compact: hover, preview: true, row: sampleRow }} /></div>
    : <div className="grid gap-0.5">
      {!field.hideLabel && <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground" style={field.color ? { color: resolveLayoutColor(field.color, accent, readColumn) } : undefined}>{field.icon && <IndexIconGlyph icon={field.icon} className="size-3" filled={false} />}{field.label || item.header}</span>}
      <span className={cn("block min-h-6 truncate rounded-md border bg-background/70 px-1.5 py-1", field.large ? "font-display text-sm font-semibold" : "text-[11px]")}>{item.text || <span className="text-muted-foreground/60">—</span>}</span>
    </div>
  const bannerValue = layout.banner?.column ? readColumn(layout.banner.column) : ""
  return <div className="grid gap-2">
      {hover && bannerValue && isImageSource(bannerValue) && <div className="-mx-3 -mt-2 overflow-hidden rounded-t-lg" style={{ height: Math.round((layout.banner?.height ?? 110) * 0.6) }}><IndexImage value={bannerValue} alt="" className="size-full object-cover" /></div>}
      {hover && (() => {
        const medallion = layout.medallion ?? (layout.tint ? { tint: true, size: 40 } : layout.image ? { column: layout.image, size: 44 } : undefined)
        const value = medallion?.column ? readColumn(medallion.column) : ""
        const glyph = value && !isImageSource(value) ? parseGlyphValue(value) : null
        const size = medallion?.size ?? 44
        return <div className="flex items-center gap-2">
          {medallion && <span className={cn("grid shrink-0 place-items-center overflow-hidden", medallion.round ? "rounded-full" : "rounded-lg", medallion.tint ? "text-white" : "border bg-muted/40 text-muted-foreground")} style={{ width: size, height: size, ...(medallion.tint ? { background: `radial-gradient(circle at 35% 30%, ${accent}, ${accent}cc 60%, #1d140c 140%)` } : {}) }}>
            {value && isImageSource(value) ? <IndexImage value={value} alt="" className="size-full object-cover" /> : glyph && (glyph.icon || glyph.emoji) ? <IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className="size-[50%]" /> : <span className="text-[10px]">{medallion.column ? "—" : "auto"}</span>}
          </span>}
          <span className="min-w-0"><span className="block truncate font-display text-sm font-semibold" style={layout.nameInAccent ? { color: accent } : undefined}>{layout.icon && readColumn(layout.icon) && <IndexIconGlyph icon={readColumn(layout.icon)} className="mr-1 inline size-3.5" filled={false} />}{previewItems.find((item) => columns.find((column) => column.header === item.header && isNameColumnSpec(column.spec)))?.text || "Nom de la ligne"}</span><span className="block truncate text-[9px] uppercase tracking-[.14em] text-muted-foreground">{layout.subtitle ? readColumn(layout.subtitle) || layout.subtitle : "Type"}</span></span>
        </div>
      })()}
      <IndexLayoutView
        compact
        accent={accent}
        readColumn={readColumn}
        arranged={{ ...preview, rest: (layout.rest ?? (hover ? "hide" : "show")) === "hide" ? [] : preview.rest }}
        render={(item, field) => previewField(item, field)}
        renderRest={(rest) => <div className="grid gap-2 md:grid-cols-2">{rest.map((item) => <div key={item.header}>{previewField(item, { column: item.header })}</div>)}</div>}
      />
  </div>
}

/**
 * L'aperçu en grand, avec son vrai rendu sur les lignes de l'onglet : la fiche telle qu'elle
 * se lit (le formulaire en lecture des pages et des vues), ou la carte du survol telle qu'elle
 * s'ouvre sur une citation « { » (construite par le même code que celui du serveur).
 */
function LayoutLivePreview({ kind, layout, columns, samples, index, tab, onClose }: { kind: LayoutKind; layout: IndexLayout; columns: LayoutColumn[]; samples: Array<Record<string, string>>; index: string; tab: string; onClose: () => void }) {
  const [at, setAt] = useState(0)
  const position = Math.min(at, samples.length - 1)
  const sample = samples[position] ?? {}
  const valueOf = (header: string) => Object.entries(sample).find(([name]) => sameColumn(name, header))?.[1] ?? ""
  const row = { index, id: valueOf("ID"), tab }
  const hover = kind === "hover"
  const tools = samples.length > 1 && <span className="flex items-center gap-1 text-xs text-muted-foreground">
    <Button type="button" variant="outline" size="icon-sm" disabled={position === 0} onClick={() => setAt(position - 1)} aria-label="Ligne précédente"><ArrowLeft /></Button>
    <span className="min-w-14 text-center tabular-nums">Ligne {position + 1} / {samples.length}</span>
    <Button type="button" variant="outline" size="icon-sm" disabled={position === samples.length - 1} onClick={() => setAt(position + 1)} aria-label="Ligne suivante"><ArrowRight /></Button>
  </span>
  return <PreviewDialog title={hover ? "Aperçu du survol" : "Aperçu du formulaire"} description={hover ? "Tel qu’il s’ouvre au survol d’une ligne citée avec « { », sur les lignes de l’onglet." : "Tel qu’il se lit, sur les lignes de l’onglet (la fiche y ajoute ses champs à remplir)."} tools={tools} onClose={onClose}>
    {hover
      ? <HoverLivePreview layout={layout} columns={columns} sample={sample} row={row} />
      : <div className="mx-auto max-w-5xl rounded-2xl border bg-card p-5 shadow-sm"><IndexFormView layout={layout} columns={columns} valueOf={valueOf} row={row} /></div>}
  </PreviewDialog>
}

/** La carte du survol d'une ligne, comme à côté d'une citation « { ». */
function HoverLivePreview({ layout, columns, sample, row }: { layout: IndexLayout; columns: LayoutColumn[]; sample: Record<string, string>; row: { index: string; id: string; tab: string } }) {
  // Toutes les colonnes de la ligne, comme sur le serveur (le survol ne propose pas la colonne du nom, mais il la lit).
  const headers = [...new Set([...Object.keys(sample), ...columns.map((column) => column.header)])]
  const html = headers.map((header) => sample[header] ?? Object.entries(sample).find(([name]) => sameColumn(name, header))?.[1] ?? "")
  const values = html.map((value) => value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
  const named = columns.find((column) => isNameColumnSpec(column.spec))?.header
  const nameAt = Math.max(0, named ? headers.indexOf(named) : headers.findIndex((header) => /^nom\b/i.test(header.trim())))
  const table = { tab: row.tab, headers, columns: headers, name: nameAt, specs: new Map(columns.map((column) => [foldName(column.header), column.spec])), rows: [] }
  const source = { id: row.id, name: values[nameAt] ?? "", values, html }
  const details = rowDetails(table, source)
  const resolved = hoverOf(layout, table, source, () => false)
  const reference: ResolvedReference = { index: row.index, id: row.id, tab: row.tab, name: source.name || "Nom de la ligne", ...(html[nameAt] && /<[a-z]/i.test(html[nameAt]) ? { nameHtml: html[nameAt] } : {}), ...details }
  return <div className="grid min-h-64 place-items-center rounded-xl bg-muted/30 p-6">
    <div className={cn(hoverWidthClass(resolved), "rounded-2xl border bg-popover p-3.5 text-popover-foreground shadow-lg")} style={reference.color ? { borderColor: `${reference.color}55` } : undefined}>
      <LayoutDetails reference={reference} layout={resolved} color={reference.color} depth={0} />
    </div>
  </div>
}

/**
 * « Forme de base » : les formes d'Eraser pour cet onglet, les formes de départ génériques
 * (remplies avec ses colonnes) et les presets enregistrés, chacune en vignette avec son aperçu
 * sur une vraie ligne. En choisir une remplace la mise en page affichée (tout se modifie après).
 */
function LayoutStarterDialog({ kind, columns, sample, sampleRow, eraserStarters = [], onPick, onClose }: { kind: LayoutKind; columns: LayoutColumn[]; sample?: Record<string, string>; sampleRow?: { index: string; id: string; tab: string }; eraserStarters?: Array<{ key: string; label: string; hint: string; layout: IndexLayout }>; onPick: (layout: IndexLayout) => void; onClose: () => void }) {
  const { layoutPresets } = useIndexSettings("")
  const presets = layoutPresets.filter((preset) => preset.kind === kind)
  const infos: LayoutColumnInfo[] = columns
  const starters = useMemo(() => layoutStarters.filter((starter) => starter.kind === kind).map((starter) => ({ key: starter.key, label: starter.label, hint: starter.hint, layout: starter.build(infos) })), [infos, kind])
  const tile = (key: string, title: string, hint: string, layout: IndexLayout) => <button key={key} type="button" onClick={() => onPick(layout)} className="group grid content-start gap-2 rounded-xl border bg-card/70 p-2.5 text-left transition hover:border-primary hover:shadow-md">
    <span className="pointer-events-none block max-h-56 min-h-24 overflow-hidden rounded-lg bg-muted/30 p-2"><span className="block origin-top-left scale-[0.78]" style={{ width: "128%" }}><LayoutPreview kind={kind} layout={layout} columns={columns} sample={sample} sampleRow={sampleRow} /></span></span>
    <span><span className="block text-sm font-semibold">{title}</span><span className="block text-[11px] leading-4 text-muted-foreground">{hint}</span></span>
  </button>
  const what = kind === "form" ? "fiche" : "survol"
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-[min(94vw,1100px)]">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">Forme de base {kind === "form" ? "de la fiche" : "du survol"}</DialogTitle>
        <DialogDescription>Un point de départ, rempli avec les colonnes de cet onglet et sa première ligne. Tout se mélange et se modifie ensuite ; la mise en page affichée est remplacée.</DialogDescription>
      </DialogHeader>
      {eraserStarters.length > 0 && <section className="grid gap-2">
        <p className={groupTitle}><Star className="size-3.5" />{kind === "form" ? "La fiche d’Eraser pour cet onglet" : "Le survol d’Eraser pour cet onglet"}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{eraserStarters.map((starter) => tile(starter.key, starter.label, starter.hint, starter.layout))}</div>
      </section>}
      <section className="grid gap-2">
        <p className={groupTitle}><Sparkles className="size-3.5" />Formes de départ</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{starters.map((starter) => tile(starter.key, starter.label, starter.hint, starter.layout))}</div>
      </section>
      <section className="grid gap-2">
        <p className={groupTitle}><Bookmark className="size-3.5" />Presets enregistrés</p>
        {presets.length
          ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{presets.map((preset) => tile(preset.id, preset.name, `Enregistré le ${new Date(preset.updatedAt).toLocaleDateString("fr-FR")}. Les colonnes absentes ici sont sautées.`, preset.layout))}</div>
          : <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Aucun preset pour l’instant : « Preset » dans le panneau garde {kind === "form" ? "une fiche" : "un survol"} pour {what === "fiche" ? "la" : "le"} reprendre dans n’importe quel index.</p>}
      </section>
    </DialogContent>
  </Dialog>
}
