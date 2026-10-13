"use client"

import { useState, type CSSProperties, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { resolveLayoutColor, type ArrangedLayout, type ArrangedSection, type LayoutField } from "@/lib/index-layouts"
import { cn } from "@/lib/utils"

const asideColumns: Record<"sm" | "md" | "lg", string> = {
  sm: "md:grid-cols-[11rem_minmax(0,1fr)]",
  md: "md:grid-cols-[14rem_minmax(0,1fr)]",
  lg: "md:grid-cols-[18rem_minmax(0,1fr)]",
}
const asideColumnsRight: Record<"sm" | "md" | "lg", string> = {
  sm: "md:grid-cols-[minmax(0,1fr)_11rem]",
  md: "md:grid-cols-[minmax(0,1fr)_14rem]",
  lg: "md:grid-cols-[minmax(0,1fr)_18rem]",
}

/**
 * Les colonnes d'une ligne de champs : chacun sa part de la ligne (sur 12), complétée d'un
 * vide quand la ligne n'est pas pleine (un champ « ½ » seul reste à moitié). Sur petit
 * écran, un champ par ligne.
 */
export function layoutRowStyle(fields: Array<Pick<LayoutField, "span">>, fallback = 6): CSSProperties {
  const spans = fields.map((field) => field.span ?? (fields.length === 1 ? 12 : fallback))
  const total = spans.reduce((sum, span) => sum + span, 0)
  const parts = spans.map((span) => `minmax(0,${span}fr)`)
  if (total < 12) parts.push(`minmax(0,${12 - total}fr)`)
  return { "--eraser-layout-cols": parts.join(" ") } as CSSProperties
}

export const layoutRowClass = "grid grid-cols-1 items-start gap-3 md:[grid-template-columns:var(--eraser-layout-cols)]"

/** Le survol : une colonne latérale plus étroite (la carte fait une vingtaine de rem). */
const compactAsideColumns: Record<"sm" | "md" | "lg", string> = {
  sm: "grid-cols-[4.5rem_minmax(0,1fr)]",
  md: "grid-cols-[6.5rem_minmax(0,1fr)]",
  lg: "grid-cols-[9rem_minmax(0,1fr)]",
}
const compactAsideColumnsRight: Record<"sm" | "md" | "lg", string> = {
  sm: "grid-cols-[minmax(0,1fr)_4.5rem]",
  md: "grid-cols-[minmax(0,1fr)_6.5rem]",
  lg: "grid-cols-[minmax(0,1fr)_9rem]",
}

/** La couleur d'accent d'une mise en page rangée, résolue pour la ligne affichée. */
export const DEFAULT_LAYOUT_ACCENT = "#927640"

/**
 * Une section rangée : nue, encadrée, teintée ou avec un bandeau coloré ; son titre avec son
 * icône ; repliable quand elle le demande. `columns` 2 ou 3 : ses lignes se répartissent en
 * colonnes égales.
 */
function SectionView<T>({ section, accent, compact, readColumn, children }: { section: ArrangedSection<T>; accent: string; compact: boolean; readColumn?: (column: string) => string; children: ReactNode }) {
  const [open, setOpen] = useState(!section.collapsed)
  const look = section.look ?? (section.framed ? "framed" : "plain")
  const color = resolveLayoutColor(section.color, accent, readColumn)
  const titleClass = cn("flex items-center gap-1.5 font-semibold uppercase tracking-[.14em]", compact ? "text-[10px]" : "text-xs")
  const title = section.title || section.icon
    ? <p className={cn(titleClass, look === "banner" ? "text-white" : "")} style={{ color: look === "banner" ? undefined : section.color || look === "tinted" ? color : undefined }}>
      {section.icon && <IndexIconGlyph icon={section.icon} className={compact ? "size-3" : "size-3.5"} filled={false} />}
      {section.title}
      {section.collapsible && <ChevronDown className={cn("ml-auto size-3.5 transition-transform", !open && "-rotate-90")} aria-hidden="true" />}
    </p>
    : null
  const header = title && section.collapsible
    ? <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={cn("-m-1 rounded-md p-1 text-left hover:bg-foreground/5", look === "banner" && "hover:bg-white/10")}>{title}</button>
    : title
  const body = open || !section.collapsible ? <div className={cn("grid min-w-0 content-start", compact ? "gap-2" : "gap-3", section.columns === 2 && "md:grid-cols-2", section.columns === 3 && "md:grid-cols-3")}>{children}</div> : null
  if (look === "banner") return <section className={cn("grid min-w-0 content-start overflow-hidden rounded-2xl border", compact ? "gap-2" : "gap-3")} style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}>
    <div className={cn("flex items-center", compact ? "px-2.5 py-1" : "px-3 py-1.5")} style={{ backgroundColor: color }}>{header}</div>
    {body && <div className={compact ? "px-2.5 pb-2.5" : "px-3 pb-3"}>{body}</div>}
  </section>
  const frame = look === "framed" ? "rounded-2xl border bg-muted/20" : look === "tinted" ? "rounded-2xl border" : ""
  const frameStyle: CSSProperties | undefined = look === "tinted" ? { backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)`, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` } : undefined
  return <section className={cn("grid min-w-0 content-start", compact ? "gap-2" : "gap-3", frame, frame && (compact ? "p-2.5" : "p-3"))} style={frameStyle}>
    {header}
    {body}
  </section>
}

/** Les sections en onglets : une barre d'onglets (titre, icône), une section à la fois, la première ouverte. */
function SectionTabs<T>({ sections, accent, compact, render }: { sections: Array<ArrangedSection<T>>; accent: string; compact: boolean; render: (section: ArrangedSection<T>) => ReactNode }) {
  const [active, setActive] = useState(sections[0]?.id ?? "")
  const current = sections.find((section) => section.id === active) ?? sections[0]
  return <div className={cn("grid min-w-0 content-start", compact ? "gap-2" : "gap-3")}>
    <div role="tablist" className="flex flex-wrap gap-0 border-b">
      {sections.map((section, index) => <button key={section.id} type="button" role="tab" aria-selected={section.id === current?.id} onClick={() => setActive(section.id)} className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 font-semibold uppercase tracking-[.12em] transition", compact ? "h-7 px-2 text-[10px]" : "h-8 px-3 text-xs", section.id === current?.id ? "border-current" : "border-transparent text-muted-foreground hover:text-foreground")} style={section.id === current?.id ? { color: accent } : undefined}>
        {section.icon && <IndexIconGlyph icon={section.icon} className={compact ? "size-3" : "size-3.5"} filled={false} />}{section.title || `Section ${index + 1}`}
      </button>)}
    </div>
    {current && render(current)}
  </div>
}

/**
 * Une mise en page rangée (`arrangeLayout`) : la colonne latérale (à gauche ou à droite),
 * puis les sections et leurs lignes de champs, et enfin ce qui n'est pas placé. `render`
 * dessine un élément (un champ de la fiche, une case du survol, un bloc) ; `renderRest` les
 * éléments non placés. `readColumn` résout les couleurs lues dans une colonne (« {Couleur} »).
 */
export function IndexLayoutView<T>({ arranged, render, renderRest, restTitle = "Autres champs", compact = false, accent, readColumn }: {
  arranged: ArrangedLayout<T>
  render: (item: T, field: LayoutField) => ReactNode
  renderRest?: (items: T[]) => ReactNode
  restTitle?: string
  /** Survol : moins d'espace entre les sections, colonne latérale étroite. */
  compact?: boolean
  /** La couleur d'accent de la ligne (sinon celle de la mise en page, sinon l'or d'Eraser). */
  accent?: string
  readColumn?: (column: string) => string
}) {
  const gap = compact ? "gap-2.5" : "gap-4"
  const color = accent ?? resolveLayoutColor(arranged.accent, DEFAULT_LAYOUT_ACCENT, readColumn)
  const sectionBody = (section: ArrangedSection<T>) => <SectionView key={section.id} section={section} accent={color} compact={compact} readColumn={readColumn}>
    {section.rows.map((row) => <div key={row.id} className={layoutRowClass} style={layoutRowStyle(row.fields)}>
      {/* En colonne : un champ peut occuper toute la hauteur de sa ligne (une case à cocher s'aligne en bas). */}
      {row.fields.map((field) => <div key={field.column} className="flex min-w-0 flex-col self-stretch">{render(field.item, field)}</div>)}
    </div>)}
  </SectionView>
  const main = <div className={`grid min-w-0 content-start ${gap}`}>
    {arranged.tabs && arranged.sections.length > 1
      ? <SectionTabs sections={arranged.sections} accent={color} compact={compact} render={(section) => sectionBody({ ...section, title: undefined, icon: undefined, collapsible: undefined })} />
      : arranged.sections.map(sectionBody)}
    {arranged.rest.length > 0 && renderRest && <section className={`grid min-w-0 content-start ${compact ? "gap-2" : "gap-3"}`}>
      {arranged.sections.length > 0 && restTitle && <p className={`font-semibold uppercase tracking-[.14em] text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}>{restTitle}</p>}
      {renderRest(arranged.rest)}
    </section>}
  </div>
  if (!arranged.aside.length) return main
  const right = arranged.asideSide === "right"
  const columns = compact ? (right ? compactAsideColumnsRight : compactAsideColumns) : (right ? asideColumnsRight : asideColumns)
  const aside = <div className={cn("grid min-w-0 content-start", compact ? "gap-2" : "mx-auto w-full max-w-64 gap-3 md:max-w-none", right && "md:order-2")}>{arranged.aside.map((field) => <div key={field.column} className="min-w-0">{render(field.item, field)}</div>)}</div>
  return <div className={`grid ${compact ? `gap-3 ${columns[arranged.asideWidth]}` : `gap-5 ${columns[arranged.asideWidth]}`}`}>
    {/* Sur téléphone, la colonne latérale passe au-dessus : une image n'y prend pas tout l'écran. */}
    {aside}
    {main}
  </div>
}

/** Le grand format d'un champ « en grand » de la fiche (un nom, un titre). */
export const largeFieldClass = "[&_input]:h-11 [&_input]:font-display [&_input]:text-xl [&_input]:font-semibold [&_[contenteditable]]:font-display [&_[contenteditable]]:text-xl [&_[contenteditable]]:font-semibold"

/** Le libellé d'un champ placé : son texte (ou le nom de la colonne), son icône et sa couleur. */
export function FieldLabel({ field, fallback, accent, readColumn, className }: { field: Pick<LayoutField, "label" | "icon" | "color" | "hideLabel">; fallback: string; accent?: string; readColumn?: (column: string) => string; className?: string }) {
  if (field.hideLabel) return null
  const color = field.color ? resolveLayoutColor(field.color, accent ?? DEFAULT_LAYOUT_ACCENT, readColumn) : undefined
  return <span className={cn("flex items-center gap-1", className)} style={color ? { color } : undefined}>
    {field.icon && <IndexIconGlyph icon={field.icon} className="size-3.5" filled={false} />}
    {field.label || fallback}
  </span>
}
