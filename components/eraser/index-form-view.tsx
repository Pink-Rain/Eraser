"use client"

import type { ReactNode } from "react"

import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexImage } from "@/components/eraser/index-image"
import { LayoutBlockView } from "@/components/eraser/index-layout-blocks"
import { DEFAULT_LAYOUT_ACCENT, FieldLabel, IndexLayoutView } from "@/components/eraser/index-layout-view"
import { IndexRichText } from "@/components/eraser/index-references"
import { foldName, isImageSource, normalizeSpec, parseGlyphValue, type IndexColumnSpec } from "@/lib/index-columns"
import { arrangeLayout, resolveLayoutColor, type IndexLayout, type LayoutBlock } from "@/lib/index-layouts"
import { cn } from "@/lib/utils"

type Column = { header: string; spec?: IndexColumnSpec }
type Item = { header: string; spec?: IndexColumnSpec; block?: LayoutBlock }

/**
 * Un formulaire de l'onglet dessiné en lecture, sur une ligne : ses sections, sa colonne
 * latérale, ses blocs, avec les valeurs de la ligne. C'est l'« élément » d'une vue quand
 * elle choisit un formulaire, et le panneau de détail (« afficher à côté », maître-détail).
 * Rien ne s'y modifie : la fiche reste le lieu de l'écriture.
 */
export function IndexFormView({ layout, columns, valueOf, accent, compact = false, row, className }: {
  layout: IndexLayout
  columns: Column[]
  /** La valeur (HTML) d'une colonne de la ligne. */
  valueOf: (header: string) => string
  /** La couleur d'accent de la ligne ; sinon celle de la mise en page. */
  accent?: string
  compact?: boolean
  /** La ligne (son index, son identifiant, son onglet) pour les blocs qui en ont besoin (inventaire, bouton). */
  row?: { index: string; id: string; tab: string }
  className?: string
}) {
  const plain = (header: string) => (valueOf(header) ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  const color = accent ?? resolveLayoutColor(layout.accent, DEFAULT_LAYOUT_ACCENT, plain)
  const items: Item[] = columns.map((column) => ({ header: column.header, spec: column.spec }))
  const arranged = arrangeLayout<Item>(layout, items, (item) => item.header, (field) => ({ header: field.column, block: field.block }))
  const specOf = (header: string) => columns.find((column) => foldName(column.header) === foldName(header))?.spec
  const render = (item: Item, field: Parameters<Parameters<typeof IndexLayoutView<Item>>[0]["render"]>[1]): ReactNode => {
    if (item.block) return <div className="grid gap-1">{!field.hideLabel && field.label && <FieldLabel field={field} fallback="" accent={color} readColumn={plain} className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground" />}<LayoutBlockView block={item.block} ctx={{ valueOf: plain, htmlOf: (header) => valueOf(header) ?? "", accent: color, compact, row }} /></div>
    const html = valueOf(item.header) ?? ""
    const text = plain(item.header)
    const spec = item.spec ?? specOf(item.header)
    const kind = spec ? normalizeSpec(spec).kind : undefined
    const picture = (kind === "file" && spec?.file?.accept === "image") || isImageSource(text)
    const glyph = kind === "glyph" ? parseGlyphValue(text) : null
    const label = <FieldLabel field={field} fallback={item.header} accent={color} readColumn={plain} className={cn("text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground")} />
    if (picture && text) return <div className="grid gap-1">{label}<span className={cn("block overflow-hidden rounded-xl", compact ? "max-w-40" : "max-w-64")}><IndexImage value={text.split(/\s+/)[0]} alt={item.header} className="h-auto w-full" /></span></div>
    if (glyph && (glyph.icon || glyph.emoji)) return <div className="grid gap-1">{label}<span style={{ color }}><IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} className="size-6" filled={Boolean(glyph.emoji)} /></span></div>
    return <div className="grid gap-0.5">
      {label}
      <div className={cn(field.large ? "font-display text-lg font-semibold leading-snug" : compact ? "text-xs leading-5" : "text-sm leading-6", "[&_a]:underline")}>{text ? <IndexRichText html={html} /> : <span className="text-muted-foreground/60">—</span>}</div>
    </div>
  }
  return <div className={cn("min-w-0", className)}>
    <IndexLayoutView
      compact={compact}
      accent={color}
      readColumn={plain}
      arranged={arranged}
      render={render}
      renderRest={(rest) => <div className={cn("grid content-start gap-3", compact ? "" : "md:grid-cols-2")}>{rest.filter((item) => plain(item.header)).map((item) => <div key={item.header}>{render(item, { column: item.header })}</div>)}</div>}
    />
  </div>
}
