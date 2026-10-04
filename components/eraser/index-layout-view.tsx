"use client"

import type { CSSProperties, ReactNode } from "react"

import type { ArrangedLayout, LayoutField } from "@/lib/index-layouts"

const asideColumns: Record<"sm" | "md" | "lg", string> = {
  sm: "md:grid-cols-[11rem_minmax(0,1fr)]",
  md: "md:grid-cols-[14rem_minmax(0,1fr)]",
  lg: "md:grid-cols-[18rem_minmax(0,1fr)]",
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

/**
 * Une mise en page rangée (`arrangeLayout`) : la colonne latérale, puis les sections et
 * leurs lignes de champs, et enfin ce qui n'est pas placé. `render` dessine un élément (un
 * champ de la fiche, une case du survol) ; `renderRest` les éléments non placés.
 */
export function IndexLayoutView<T>({ arranged, render, renderRest, restTitle = "Autres champs", compact = false }: {
  arranged: ArrangedLayout<T>
  render: (item: T, field: LayoutField) => ReactNode
  renderRest?: (items: T[]) => ReactNode
  restTitle?: string
  /** Survol : moins d'espace entre les sections, colonne latérale étroite. */
  compact?: boolean
}) {
  const gap = compact ? "gap-2.5" : "gap-4"
  const main = <div className={`grid min-w-0 content-start ${gap}`}>
    {arranged.sections.map((section) => <section key={section.id} className={`grid min-w-0 content-start ${compact ? "gap-2" : "gap-3"} ${section.framed ? `rounded-2xl border bg-muted/20 ${compact ? "p-2.5" : "p-3"}` : ""}`}>
      {section.title && <p className={`font-semibold uppercase tracking-[.14em] text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}>{section.title}</p>}
      {section.rows.map((row) => <div key={row.id} className={layoutRowClass} style={layoutRowStyle(row.fields)}>
        {row.fields.map((field) => <div key={field.column} className="min-w-0">{render(field.item, field)}</div>)}
      </div>)}
    </section>)}
    {arranged.rest.length > 0 && renderRest && <section className={`grid min-w-0 content-start ${compact ? "gap-2" : "gap-3"}`}>
      {arranged.sections.length > 0 && restTitle && <p className={`font-semibold uppercase tracking-[.14em] text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}>{restTitle}</p>}
      {renderRest(arranged.rest)}
    </section>}
  </div>
  if (!arranged.aside.length) return main
  return <div className={`grid ${compact ? `gap-3 ${compactAsideColumns[arranged.asideWidth]}` : `gap-5 ${asideColumns[arranged.asideWidth]}`}`}>
    <div className={`grid min-w-0 content-start ${compact ? "gap-2" : "gap-3"}`}>{arranged.aside.map((field) => <div key={field.column} className="min-w-0">{render(field.item, field)}</div>)}</div>
    {main}
  </div>
}

/** Le grand format d'un champ « en grand » de la fiche (un nom, un titre). */
export const largeFieldClass = "[&_input]:h-11 [&_input]:font-display [&_input]:text-xl [&_input]:font-semibold [&_[contenteditable]]:font-display [&_[contenteditable]]:text-xl [&_[contenteditable]]:font-semibold"
