"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"
import { ExternalLink, FileText, PenLine } from "lucide-react"

import { CharacterInventory } from "@/components/eraser/character-inventory"
import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexRichText } from "@/components/eraser/index-references"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { characteristicShort, type CharacteristicName } from "@/lib/characteristics"
import { foldName } from "@/lib/index-columns"
import { resolveLayoutColor, type LayoutBlock } from "@/lib/index-layouts"
import { referenceHref } from "@/lib/index-references"
import { cn } from "@/lib/utils"

/**
 * Ce qu'un bloc lit de la ligne où il est posé : ses cases (texte et mise en forme), la
 * couleur d'accent, la ligne elle-même (pour un inventaire ou un bouton), et, dans une fiche
 * modifiable, de quoi écrire dans une case (les tuiles de caractéristiques).
 */
export type LayoutBlockContext = {
  valueOf: (column: string) => string
  htmlOf?: (column: string) => string
  accent: string
  /** Survol : plus serré. */
  compact?: boolean
  /** La ligne (son index, son identifiant, son onglet) : un inventaire lui appartient, un bouton l'ouvre. */
  row?: { index: string; id: string; tab?: string; name?: string }
  /** Le niveau en cours (bloc Paliers), quand la page le sait (un état posé sur une fiche). */
  level?: number
  /** Fiche modifiable : écrire dans une case. */
  onChange?: (column: string, value: string) => void
  /** Ouvrir un formulaire de la ligne (bouton). */
  openForm?: (formId?: string) => void
  /** L'adresse de l'inventaire d'une ligne (sinon, celle d'office). */
  inventoryEndpoint?: (row: { index: string; id: string }) => string
  /** Aperçu dans l'éditeur : un inventaire ne se charge pas, un bouton ne fait rien. */
  preview?: boolean
}

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()

/** « 2 », « 2|skull|#b9504e », « Niveau 2 » : le nombre qu'une case contient. */
function levelNumber(value: string) {
  const match = value.trim().match(/(\d+)/)
  return match ? Number(match[1]) : 0
}

/** Les paliers d'une ligne : chaque niveau et son texte, le niveau en cours mis en avant, les règles dessous. */
function LevelsBlock({ block, ctx }: { block: Extract<LayoutBlock, { kind: "levels" }>; ctx: LayoutBlockContext }) {
  const color = ctx.accent
  const current = ctx.level ?? (block.current ? levelNumber(ctx.valueOf(block.current)) : 0)
  const levels = block.levels.map((level, index) => ({ ...level, rank: index + 1, html: ctx.htmlOf?.(level.column) ?? ctx.valueOf(level.column) })).filter((level) => { const text = plain(level.html); return text && text !== "/" })
  const rules = block.rules ? (ctx.htmlOf?.(block.rules) ?? ctx.valueOf(block.rules)) : ""
  const text = ctx.compact ? "text-xs leading-5" : "text-sm leading-6"
  if (!levels.length && !plain(rules)) return <p className={cn(text, "text-muted-foreground")}>Pas de description.</p>
  return <div className={cn("grid", ctx.compact ? "gap-2" : "gap-2.5")}>
    {levels.map((level) => <div key={level.column} className={cn("rounded-xl border px-3 py-2 transition", text, current === level.rank ? "bg-background shadow-sm" : current ? "bg-muted/25 opacity-75" : "bg-background/60")} style={{ borderColor: current === level.rank ? `${color}88` : current ? undefined : `${color}44` }}>
      <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.14em]" style={{ color: current === level.rank || !current ? color : undefined }}>
        {level.label}{current === level.rank && <span className="rounded-full px-1.5 py-px text-[9px] text-white" style={{ backgroundColor: color }}>en cours</span>}
      </p>
      <IndexRichText html={level.html} self={ctx.row ? { index: ctx.row.index, id: ctx.row.id } : undefined} className="[&_a]:underline [&_p]:m-0" />
    </div>)}
    {plain(rules) && <div className={cn("rounded-xl border border-dashed px-3 py-2", text)}>
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{block.rulesLabel || "Règles liées"}</p>
      <IndexRichText html={rules} self={ctx.row ? { index: ctx.row.index, id: ctx.row.id } : undefined} className="[&_a]:underline [&_p]:m-0" />
    </div>}
  </div>
}

/** Des tuiles de valeurs (FOR, DEX…), chacune de sa couleur ; dans une fiche modifiable, on y écrit. */
function TilesBlock({ block, ctx }: { block: Extract<LayoutBlock, { kind: "tiles" }>; ctx: LayoutBlockContext }) {
  const short = (column: string) => characteristicShort[column as CharacteristicName] ?? (foldName(column) === "rapidite" ? "VIT" : foldName(column) === "vie totale" ? "VIE" : column.slice(0, 3).toLocaleUpperCase("fr"))
  const perRow = block.perRow ?? Math.min(7, block.columns.length)
  return <div className={cn("grid", ctx.compact ? "gap-1" : "gap-2")} style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(perRow, block.columns.length, ctx.compact ? 4 : 12))}, minmax(0, 1fr))` }}>
    {block.columns.map((column) => {
      const color = resolveLayoutColor(block.colors?.[column], ctx.accent, ctx.valueOf)
      const value = plain(ctx.valueOf(column))
      const label = block.short === false ? column : short(column)
      if (ctx.onChange && !ctx.preview) return <label key={column} className="grid gap-1 rounded-xl border p-2 text-center text-[11px] font-semibold" style={{ backgroundColor: `${color}14`, borderColor: `${color}55`, borderTopWidth: 2, borderTopColor: color }} title={column}>
        <span className="truncate" style={{ color }}>{block.short ? label : column}</span>
        <Input value={value} onChange={(event) => ctx.onChange!(column, event.target.value)} inputMode="numeric" className="h-9 bg-background/70 text-center text-base font-semibold" aria-label={column} />
      </label>
      return <div key={column} title={column} className={cn("min-w-0 rounded-lg border text-center", ctx.compact ? "px-1 py-1" : "px-1 py-1.5")} style={{ backgroundColor: `${color}14`, borderColor: `${color}55` }}>
        <span className="block truncate text-[9px] font-bold tracking-wider" style={{ color }}>{label}</span>
        <span className={cn("block truncate font-semibold tabular-nums", ctx.compact ? "text-xs" : "text-sm")}>{value || "—"}</span>
      </div>
    })}
  </div>
}

/** L'inventaire d'une ligne : son sac (tout), ou une seule famille d'items. */
function InventoryBlock({ block, ctx }: { block: Extract<LayoutBlock, { kind: "inventory" }>; ctx: LayoutBlockContext }) {
  // Ouvert d'office dans une fiche modifiable seulement. Dans une liste, un kanban ou un survol,
  // chaque ligne montrée chargeait le sien (et préparait son contenant dans Google) : il s'ouvre au clic.
  const [opened, setOpened] = useState(!ctx.preview && Boolean(ctx.onChange) && !ctx.compact)
  if (!ctx.row?.id || ctx.preview) return <div className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
    {block.title || "Inventaire"} · {block.accept === "all" ? "tous les items" : `seulement : ${block.accept}`}{ctx.preview ? " (aperçu)" : " — enregistre d’abord la ligne"}
  </div>
  const endpoint = ctx.inventoryEndpoint ? ctx.inventoryEndpoint(ctx.row) : `/api/resources/row-inventory?index=${encodeURIComponent(ctx.row.index)}&id=${encodeURIComponent(ctx.row.id)}&accept=${encodeURIComponent(block.accept)}`
  if (!opened) return <Button type="button" variant="outline" size="sm" onClick={() => setOpened(true)}>Ouvrir {block.title || "l’inventaire"}</Button>
  return <div className="grid gap-2">
    {block.title && <p className="text-xs font-semibold text-muted-foreground">{block.title}{block.accept !== "all" && <span className="font-normal"> · {block.accept} seulement</span>}</p>}
    {block.accept === "all"
      ? <CharacterInventory characterId={ctx.row.id} endpoint={endpoint} mode="npc" />
      : <CharacterInventory characterId={ctx.row.id} endpoint={endpoint} mode="character" categories={[block.accept]} />}
  </div>
}

/** Un texte écrit dans la mise en page. */
function TextBlock({ block, ctx }: { block: Extract<LayoutBlock, { kind: "text" }>; ctx: LayoutBlockContext }) {
  if (!plain(block.html)) return null
  const tone = block.tone ?? "normal"
  const base = ctx.compact ? "text-xs leading-5" : "text-sm leading-6"
  if (tone === "callout") return <div className={cn("rounded-xl border px-3 py-2", base)} style={{ borderColor: `${ctx.accent}55`, backgroundColor: `${ctx.accent}10` }}><IndexRichText html={block.html} className="[&_p]:m-0" /></div>
  return <IndexRichText html={block.html} className={cn(base, tone === "muted" && "text-muted-foreground", tone === "accent" && "font-semibold", "[&_p]:m-0")} style={tone === "accent" ? { color: ctx.accent } : undefined} />
}

/** Un séparateur : un trait (de sa couleur), un ornement au milieu (une icône ou des caractères), ou un peu d'air. */
function DividerBlock({ block, ctx }: { block: Extract<LayoutBlock, { kind: "divider" }>; ctx: LayoutBlockContext }) {
  if (block.style === "space") return <div className={ctx.compact ? "h-2" : "h-4"} aria-hidden="true" />
  // Sans couleur choisie : l'accent, adouci comme avant ; une couleur choisie se montre telle quelle.
  const color = block.color ? resolveLayoutColor(block.color, ctx.accent, ctx.valueOf) : ctx.accent
  const line = block.color ? `color-mix(in srgb, ${color} 70%, transparent)` : `color-mix(in srgb, ${color} 33%, transparent)`
  if (block.style === "ornament") return <div className="flex items-center gap-2" style={{ color }} aria-hidden="true">
    <span className="h-px flex-1" style={{ backgroundColor: line }} />
    {block.icon
      ? <IndexIconGlyph icon={block.icon} className={ctx.compact ? "size-3.5" : "size-4"} filled={false} />
      : <span className={cn("whitespace-pre leading-none", block.ornament ? (ctx.compact ? "text-xs" : "text-sm") : "text-[10px]")}>{block.ornament || "✦"}</span>}
    <span className="h-px flex-1" style={{ backgroundColor: line }} />
  </div>
  return <hr className="border-t" style={{ borderColor: block.color ? line : `color-mix(in srgb, ${ctx.accent} 25%, var(--border))` }} />
}

/** Un bouton : ouvre la fiche de la ligne (un de ses formulaires), une page, ou une adresse. */
function ButtonBlock({ block, ctx }: { block: Extract<LayoutBlock, { kind: "button" }>; ctx: LayoutBlockContext }) {
  const variant = block.tone === "outline" ? "outline" : block.tone === "accent" ? "default" : "secondary"
  const style = block.tone === "accent" ? { backgroundColor: ctx.accent, borderColor: ctx.accent } : undefined
  const icon = block.icon ? <IndexIconGlyph icon={block.icon} className="size-4" filled={false} /> : block.action === "open-form" ? <PenLine /> : block.action === "link" ? <ExternalLink /> : <FileText />
  // Dans une fiche : le formulaire s'ouvre sur place. Ailleurs (un survol) : un lien vers la ligne, qui ouvre sa fiche.
  if (block.action === "open-form" && (ctx.openForm || ctx.preview || !ctx.row?.id)) return <Button type="button" variant={variant} size="sm" style={style} disabled={ctx.preview || !ctx.openForm} onClick={() => ctx.openForm?.(block.formId)}>{icon}{block.label}</Button>
  if (block.action === "open-form") return <Button asChild variant={variant} size="sm" style={style}><Link href={referenceHref({ index: ctx.row!.index, id: ctx.row!.id })} prefetch={false}>{icon}{block.label}</Link></Button>
  const href = (block.href ?? "").replace(/\{ID\}/gi, encodeURIComponent(ctx.row?.id ?? "")).replace(/\{([^{}]+)\}/g, (_, column: string) => encodeURIComponent(plain(ctx.valueOf(column.trim()))))
  if (!href || ctx.preview) return <Button type="button" variant={variant} size="sm" style={style} disabled>{icon}{block.label}</Button>
  const external = /^https?:\/\//i.test(href)
  return <Button asChild variant={variant} size="sm" style={style}>{external ? <a href={href} target="_blank" rel="noreferrer">{icon}{block.label}</a> : <Link href={href} prefetch={false}>{icon}{block.label}</Link>}</Button>
}

/** Un bloc d'une mise en page, rempli avec la ligne affichée. */
export function LayoutBlockView({ block, ctx }: { block: LayoutBlock; ctx: LayoutBlockContext }): ReactNode {
  switch (block.kind) {
    case "levels": return <LevelsBlock block={block} ctx={ctx} />
    case "tiles": return <TilesBlock block={block} ctx={ctx} />
    case "inventory": return <InventoryBlock block={block} ctx={ctx} />
    case "text": return <TextBlock block={block} ctx={ctx} />
    case "divider": return <DividerBlock block={block} ctx={ctx} />
    case "button": return <ButtonBlock block={block} ctx={ctx} />
  }
}

/** Le résumé d'un bloc, pour une liste (l'éditeur). */
export function layoutBlockSummary(block: LayoutBlock) {
  switch (block.kind) {
    case "levels": return block.levels.map((level) => level.label).join(" · ") || "Paliers"
    case "tiles": return block.columns.join(", ")
    case "inventory": return block.accept === "all" ? "Tous les items" : `${block.accept} seulement`
    case "text": return plain(block.html).slice(0, 60) || "Texte"
    case "divider": return block.style === "space" ? "Espace" : block.style === "ornament" ? "Ornement" : "Trait"
    case "button": return block.label
  }
}
