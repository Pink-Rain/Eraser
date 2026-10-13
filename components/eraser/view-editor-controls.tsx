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
export const settingsGroup = "grid gap-2 rounded-xl border bg-card/60 p-2.5"
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

/** Un choix avec son libellé au-dessus (les boutons passent à la ligne quand la place manque). */
export function Choice<T extends string>({ label, value, options, onChange, disabled, hint }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode; title?: string }>; onChange: (value: T) => void; disabled?: boolean; hint?: string }) {
  return <span className="grid min-w-0 content-start justify-items-start gap-1 text-[11px] font-semibold text-muted-foreground" title={hint}><span>{label}</span><Segmented ariaLabel={label} value={value} options={options} onChange={onChange} disabled={disabled} /></span>
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
  // Le libellé au-dessus, la liste sur toute la largeur : le nom de la colonne se lit en entier.
  return <label className="grid min-w-0 content-start gap-1 text-[11px] font-semibold text-muted-foreground [&_[data-slot=native-select-wrapper]]:w-full" title={hint}><span>{label}</span><ColumnSelect value={value} columns={columns} onChange={onChange} empty={empty} disabled={disabled} ariaLabel={label} className="w-full min-w-0" /></label>
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

/** De vrais onglets en haut d'une zone de réglages (Carte, Image, Blocs… ; Lignes, Sections…). */
export function Tabs<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>; onChange: (value: T) => void; ariaLabel: string }) {
  return <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-0 border-b">
    {options.map((option) => <button key={option.value} type="button" role="tab" aria-selected={value === option.value} onClick={() => onChange(option.value)} className={cn("-mb-px inline-flex h-8 items-center gap-1.5 border-b-2 px-3 text-xs font-semibold transition", value === option.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{option.icon}{option.label}</button>)}
  </div>
}

/** Une ligne de réglages : les contrôles côte à côte, qui passent à la ligne quand la place manque. */
export function SettingsRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-end gap-x-3 gap-y-2", className)}>{children}</div>
}

/** Un réglage : son libellé au-dessus, le contrôle dessous (sur toute la largeur s'il s'agit d'une liste). */
export function Inline({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return <label className={cn("grid min-w-0 content-start gap-1 text-[11px] font-semibold text-muted-foreground [&_[data-slot=native-select-wrapper]]:w-full", className)} title={hint}><span>{label}</span>{children}</label>
}

export type ImageBoxValue = { widthPct?: number; heightPct?: number; autoHeight?: boolean; linked?: boolean; edges?: Array<"top" | "bottom" | "left" | "right">; /** Sans fond ni cadre (image détourée). */ bare?: boolean }

/**
 * La taille d'une image, la même partout : largeur et hauteur en % (de la largeur de
 * l'élément), « auto » au bout du curseur de hauteur, le bouton lier / délier, les bords
 * auxquels l'image est collée. Une seule ligne de réglages.
 */
export function ImageBoxControls({ value, defaults, onChange, disabled, radius, onRadius, unit = "%", widthRange = [5, 100], heightRange = [5, 300], withEdges = true, withBare = true, edgeLabels }: {
  value: ImageBoxValue
  /** Ce qui s'affiche quand rien n'est réglé (déduit des anciens réglages). */
  defaults: { widthPct: number; heightPct?: number; autoHeight?: boolean; edges: Array<"top" | "bottom" | "left" | "right"> }
  onChange: (changes: Partial<ImageBoxValue>) => void
  disabled?: boolean
  /** L'arrondi des coins (px), sur la même ligne. */
  radius?: number
  onRadius?: (radiusPx: number) => void
  unit?: string
  widthRange?: [number, number]
  heightRange?: [number, number]
  withEdges?: boolean
  /** Le choix « fond » : avec (cadre et fond neutre) ou sans (image détourée, rien derrière). */
  withBare?: boolean
  edgeLabels?: Partial<Record<"top" | "bottom" | "left" | "right", string>>
}) {
  const width = value.widthPct ?? defaults.widthPct
  const auto = value.autoHeight ?? Boolean(defaults.autoHeight)
  const height = value.heightPct ?? defaults.heightPct ?? width
  const linked = value.linked ?? true
  const edges = value.edges ?? defaults.edges
  const [heightMin, heightMax] = heightRange
  const setWidth = (next: number) => onChange(linked && !auto ? { widthPct: next, heightPct: Math.max(heightMin, Math.min(heightMax, Math.round(height * next / Math.max(1, width)))) } : { widthPct: next })
  const setHeight = (next: number) => {
    if (next > heightMax) { onChange({ autoHeight: true }); return }
    onChange(linked ? { heightPct: next, autoHeight: false, widthPct: Math.max(widthRange[0], Math.min(widthRange[1], Math.round(width * next / Math.max(1, height)))) } : { heightPct: next, autoHeight: false })
  }
  const toggleEdge = (edge: "top" | "bottom" | "left" | "right") => onChange({ edges: edges.includes(edge) ? edges.filter((item) => item !== edge) : [...edges, edge] })
  const labels = { top: "haut", bottom: "bas", left: "gauche", right: "droite", ...edgeLabels }
  return <div className="grid gap-2">
    <SettingsRow>
      <button type="button" disabled={disabled} aria-pressed={linked} onClick={() => onChange({ linked: !linked })} title={linked ? "Liées : bouger un curseur bouge l’autre dans les mêmes proportions" : "Déliées : largeur et hauteur indépendantes"} className={cn("grid size-8 shrink-0 place-items-center rounded-md border text-base", linked ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>{linked ? "🔗" : "⛓️‍💥"}</button>
      <label className="grid min-w-32 flex-1 gap-0.5 text-[11px] font-semibold text-muted-foreground"><span className="flex justify-between"><span>Largeur</span><span className="font-normal tabular-nums">{width} {unit}</span></span><input type="range" min={widthRange[0]} max={widthRange[1]} step={1} value={width} disabled={disabled} onChange={(event) => setWidth(Number(event.target.value))} className="accent-primary" /></label>
      <label className="grid min-w-32 flex-1 gap-0.5 text-[11px] font-semibold text-muted-foreground"><span className="flex justify-between"><span>Hauteur</span><span className="font-normal tabular-nums">{auto ? "auto (celle de l’image)" : `${height} ${unit}`}</span></span><input type="range" min={heightMin} max={heightMax + 1} step={1} value={auto ? heightMax + 1 : height} disabled={disabled} onChange={(event) => setHeight(Number(event.target.value))} className="accent-primary" /></label>
      {onRadius && <label className="grid min-w-28 flex-1 gap-0.5 text-[11px] font-semibold text-muted-foreground"><span className="flex justify-between"><span>Arrondi</span><span className="font-normal tabular-nums">{radius ?? 0} px</span></span><input type="range" min={0} max={200} step={1} value={radius ?? 0} disabled={disabled} onChange={(event) => onRadius(Number(event.target.value))} className="accent-primary" /></label>}
    </SettingsRow>
    {(withEdges || withBare) && <SettingsRow>
      {withEdges && <>
        <span className="text-[11px] font-semibold text-muted-foreground" title="Un bord coché : l’image le touche et suit la taille de l’élément ; aucun : elle flotte avec une marge">Collée à</span>
        {(["top", "bottom", "left", "right"] as const).map((edge) => <Toggle key={edge} checked={edges.includes(edge)} onChange={() => toggleEdge(edge)} disabled={disabled}>{labels[edge]}</Toggle>)}
        <button type="button" disabled={disabled} onClick={() => onChange({ edges: [] })} className={cn("text-[11px]", edges.length ? "text-muted-foreground hover:text-foreground" : "font-semibold text-foreground")}>aucun</button>
      </>}
      {withBare && <span className={cn("flex items-center", withEdges && "ml-auto")}><Toggle checked={!value.bare} onChange={(checked) => onChange({ bare: checked ? undefined : true })} disabled={disabled} title="Coché : un fond neutre et un cadre derrière l’image. Décoché : rien derrière (image détourée, pictogramme).">Fond</Toggle></span>}
    </SettingsRow>}
  </div>
}
