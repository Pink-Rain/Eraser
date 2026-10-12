"use client"

/**
 * Les petits contrôles partagés par les éditeurs de vues (Modifier › Liste, Kanban…) : un
 * choix à quelques boutons, une case, un curseur, une couleur, une icône, une colonne, des
 * colonnes dans l'ordre. Le même dessin que les ateliers des cartes et des formulaires.
 */
import type { ReactNode } from "react"
import { AlignCenter, AlignLeft, AlignRight, ChevronLeft, X } from "lucide-react"

import { IconPicker, IndexIconGlyph } from "@/components/eraser/index-gauge"
import { Checkbox } from "@/components/ui/checkbox"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { parseGlyphValue } from "@/lib/index-columns"
import { viewPalette } from "@/lib/index-view-layouts"
import { cn } from "@/lib/utils"

export const fieldLabel = "grid gap-1 text-[11px] font-semibold text-muted-foreground"
export const settingsGroup = "grid gap-3 rounded-xl border bg-card/60 p-3"
export const settingsTitle = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground"
export const hintText = "text-[11px] leading-4 text-muted-foreground"

export function Segmented<T extends string>({ value, options, onChange, disabled, ariaLabel }: {
  value: T
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode; title?: string }>
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

/** Un choix avec son libellé au-dessus. */
export function Choice<T extends string>({ label, value, options, onChange, disabled, hint }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode; title?: string }>; onChange: (value: T) => void; disabled?: boolean; hint?: string }) {
  return <span className={fieldLabel} title={hint}>{label}<Segmented ariaLabel={label} value={value} options={options} onChange={onChange} disabled={disabled} /></span>
}

export function Toggle({ checked, onChange, children, disabled, title }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; disabled?: boolean; title?: string }) {
  return <label className="flex cursor-pointer items-center gap-1.5 text-xs" title={title}><Checkbox checked={checked} disabled={disabled} onCheckedChange={(next) => onChange(next === true)} />{children}</label>
}

/** Un curseur avec son libellé et sa valeur écrite. */
export function Range({ text, value, min, max, step = 1, format, onChange, disabled, title }: { text: string; value: number; min: number; max: number; step?: number; format?: (value: number) => string; onChange: (value: number) => void; disabled?: boolean; title?: string }) {
  return <label className={fieldLabel} title={title}>
    <span className="flex items-center justify-between gap-2"><span>{text}</span><span className="font-normal tabular-nums">{format ? format(value) : String(value)}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="accent-primary" />
  </label>
}

export const fr = (value: number, digits = 2) => value.toLocaleString("fr-FR", { maximumFractionDigits: digits })

/** Une couleur : aucune (l'accent d'Eraser ou celle de la ligne), une pastille de la palette, ou une couleur libre. */
export function ColorSwatches({ value, onChange, disabled, none = "Aucune", ariaLabel }: { value: string | undefined; onChange: (value: string | undefined) => void; disabled?: boolean; none?: string | null; ariaLabel: string }) {
  const custom = value && !viewPalette.includes(value) ? value : undefined
  return <span className="flex flex-wrap items-center gap-1" role="group" aria-label={ariaLabel}>
    {none !== null && <button type="button" disabled={disabled} aria-pressed={!value} onClick={() => onChange(undefined)} className={cn("h-5 rounded-full border px-1.5 text-[10px]", !value ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted")}>{none}</button>}
    {viewPalette.map((color) => <button key={color} type="button" disabled={disabled} aria-label={color} aria-pressed={value === color} onClick={() => onChange(color)} className={cn("size-5 rounded-full border", value === color && "ring-2 ring-primary ring-offset-1")} style={{ backgroundColor: color }} />)}
    <label title="Une couleur libre" className={cn("relative grid size-6 cursor-pointer place-items-center overflow-hidden rounded-full border", custom && "ring-2 ring-primary ring-offset-1", disabled && "pointer-events-none opacity-50")} style={{ background: custom ?? "conic-gradient(#e11d48,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#e11d48)" }}>
      <span className="sr-only">Couleur libre</span>
      <input type="color" disabled={disabled} value={custom ?? "#927640"} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
    </label>
  </span>
}

/** Une icône (nom d'icône ou émoji), ou aucune. */
export function IconPick({ value, onChange, disabled, label }: { value: string | undefined; onChange: (value: string | undefined) => void; disabled?: boolean; label?: string }) {
  const glyph = parseGlyphValue(value ?? "")
  return <span className="flex items-center gap-1.5">
    {value && <IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className="size-4" />}
    <IconPicker icon={glyph.icon} emoji={glyph.emoji} disabled={disabled} allowNone onChange={(next) => onChange(next.emoji?.trim() || next.icon || undefined)} />
    {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
  </span>
}

/** Une colonne de l'onglet, ou rien. */
export function ColumnSelect({ value, columns, onChange, empty = "— Aucune —", disabled, ariaLabel, className }: { value: string | undefined; columns: string[]; onChange: (value: string | undefined) => void; empty?: string | null; disabled?: boolean; ariaLabel: string; className?: string }) {
  const known = !value || columns.includes(value)
  return <NativeSelect value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value || undefined)} className={cn("h-8 py-0 text-xs", !known && "border-destructive/60 text-destructive", className)} aria-label={ariaLabel}>
    {empty !== null && <NativeSelectOption value="">{empty}</NativeSelectOption>}
    {!known && value && <NativeSelectOption value={value}>{value} (absente)</NativeSelectOption>}
    {columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}
  </NativeSelect>
}

export function ColumnField({ label, value, columns, onChange, empty, disabled, hint }: { label: string; value: string | undefined; columns: string[]; onChange: (value: string | undefined) => void; empty?: string | null; disabled?: boolean; hint?: string }) {
  return <label className={fieldLabel} title={hint}>{label}<ColumnSelect value={value} columns={columns} onChange={onChange} empty={empty} disabled={disabled} ariaLabel={label} /></label>
}

/** Plusieurs colonnes, dans l'ordre : des étiquettes qu'on retire ou avance, et une liste pour en ajouter. */
export function ColumnsPicker({ value, columns, onChange, disabled, ariaLabel, max = 8 }: { value: string[]; columns: string[]; onChange: (value: string[]) => void; disabled?: boolean; ariaLabel: string; max?: number }) {
  const free = columns.filter((column) => !value.includes(column))
  return <div className="flex flex-wrap items-center gap-1">
    {value.map((header, index) => <span key={header} className={cn("inline-flex items-center gap-0.5 rounded-md border bg-background py-0.5 pl-1.5 pr-0.5 text-xs", !columns.includes(header) && "border-destructive/50 text-destructive line-through")}>
      {header}
      <button type="button" disabled={disabled || index === 0} onClick={() => { const next = [...value]; next.splice(index - 1, 0, next.splice(index, 1)[0]); onChange(next) }} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`Avancer ${header}`}><ChevronLeft className="size-3" /></button>
      <button type="button" disabled={disabled} onClick={() => onChange(value.filter((item) => item !== header))} className="rounded p-0.5 text-muted-foreground hover:text-destructive" aria-label={`Retirer ${header}`}><X className="size-3" /></button>
    </span>)}
    {free.length > 0 && value.length < max && <NativeSelect value="" disabled={disabled} onChange={(event) => { if (event.target.value) onChange([...value, event.target.value]) }} className="h-7 w-auto min-w-28 border-dashed py-0 pl-2 pr-8 text-[11px]" aria-label={ariaLabel}>
      <NativeSelectOption value="">+ Colonne…</NativeSelectOption>
      {free.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}
    </NativeSelect>}
  </div>
}

export const alignOptions = [
  { value: "left", label: "", icon: <AlignLeft className="size-3.5" />, title: "À gauche" },
  { value: "center", label: "", icon: <AlignCenter className="size-3.5" />, title: "Centré" },
  { value: "right", label: "", icon: <AlignRight className="size-3.5" />, title: "À droite" },
] as const

export const densityOptions = [{ value: "compact", label: "Serré" }, { value: "normal", label: "Normal" }, { value: "airy", label: "Aéré" }] as const
export const sizeOptions = [{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }] as const
export const radiusOptions = [{ value: "sm", label: "Fins" }, { value: "md", label: "Ronds" }, { value: "lg", label: "Très ronds" }] as const
export const imageShapeOptions = [{ value: "square", label: "Carrée" }, { value: "rounded", label: "Arrondie" }, { value: "circle", label: "Ronde" }] as const
export const fieldStyleOptions = [{ value: "inline", label: "En ligne" }, { value: "labels", label: "Libellés" }, { value: "pills", label: "Pastilles" }, { value: "stacked", label: "Empilées" }] as const
export const accentOptions = [{ value: "border", label: "Liseré" }, { value: "tint", label: "Teinte" }, { value: "dot", label: "Point" }, { value: "title", label: "Nom coloré" }, { value: "none", label: "Rien" }] as const
