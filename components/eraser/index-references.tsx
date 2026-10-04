"use client"

/**
 * Les références à une ligne d'index dans un texte, posées par le menu « { » de
 * l'éditeur : hors des tableaux, « {État:Sérénité} » devient le nom actuel de la ligne,
 * mis en forme, avec son détail au survol ; « {État:Sérénité:Type} » devient la valeur
 * de la case, dans le style de sa colonne, sans survol. Le texte enregistré ne change pas :
 * la ligne est retrouvée par son identifiant, même renommée.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

import { useWorldIndexVersion } from "@/components/eraser/index-cells"
import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexImage } from "@/components/eraser/index-image"
import { useResolvedReferences } from "@/components/eraser/reference-store"
import { richTextRendering, sanitizeRichText } from "@/components/eraser/rich-text"
import { columnStyleCss, pillStyle } from "@/components/eraser/index-style"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import type { StateDefinition, StatesCatalog } from "@/lib/character-states"
import { foldName, matchChoice, parseGlyphValue, type ColumnStyle } from "@/lib/index-columns"
import { parseReferenceHref, referenceKey, referenceNameFromLabel, type ReferenceRequest, type ResolvedLayout, type ResolvedLayoutField, type ResolvedReference } from "@/lib/index-references"
import type { LayoutSpan } from "@/lib/index-layouts"
import { IndexLayoutView } from "@/components/eraser/index-layout-view"
import { objectIconImage } from "@/lib/object-icons"
import { cn } from "@/lib/utils"
import type { WeaponModifierRef } from "@/lib/weapon-modifiers"

export const DEFAULT_STATE_COLOR = "#78716c"

// ---------------------------------------------------------------------------
// Lecture des index cités (une fois par page, relue quand l'index change)
// ---------------------------------------------------------------------------

// Gardé d'une page à l'autre ; une seule lecture à la fois, quel que soit le nombre de
// textes affichés. Relu au plus toutes les 30 secondes, ou tout de suite si l'index change.
let knownCatalog: StatesCatalog | null = null
let catalogReadAt = 0
let catalogRequest: Promise<StatesRead> | null = null

type StatesRead = { catalog?: StatesCatalog; error?: string }

function loadStates(fresh: boolean): Promise<StatesRead> {
  if (!fresh && knownCatalog && Date.now() - catalogReadAt < 30_000) return Promise.resolve({ catalog: knownCatalog })
  if (!fresh && catalogRequest) return catalogRequest
  const request = fetch(fresh ? "/api/states?fresh=1" : "/api/states", { cache: "no-store" })
    .then(async (response): Promise<StatesRead> => {
      const payload = (await response.json().catch(() => ({}))) as { catalog?: StatesCatalog; error?: string }
      if (!response.ok || !payload.catalog) return { error: payload.error || "L’Index des états n’a pas pu être lu." }
      knownCatalog = payload.catalog
      catalogReadAt = Date.now()
      return { catalog: payload.catalog }
    })
    .catch((): StatesRead => ({ error: "L’Index des états n’a pas pu être lu." }))
    .finally(() => { if (catalogRequest === request) catalogRequest = null })
  catalogRequest = request
  return request
}

/** L'Index des états, pour la fiche et les textes qui citent un état (lecture seule, joueurs compris). */
export function useStatesCatalog(enabled = true) {
  const [catalog, setCatalog] = useState<StatesCatalog | null>(knownCatalog)
  const [error, setError] = useState("")
  // Un état ou un effet modifié dans l'index (autre onglet, autre fenêtre) : relu.
  const version = useWorldIndexVersion("states")
  useEffect(() => {
    if (!enabled) return
    let active = true
    void loadStates(version > 0).then((result) => {
      if (!active) return
      if (result.catalog) { setCatalog(result.catalog); setError("") }
      else setError(result.error ?? "")
    })
    return () => { active = false }
  }, [enabled, version])
  return { catalog: catalog ?? { states: [], effects: [] }, loaded: Boolean(catalog), error }
}

let knownModifiers: WeaponModifierRef[] | null = null
let modifiersRequest: Promise<WeaponModifierRef[]> | null = null

function loadModifiers(fresh: boolean) {
  if (!fresh && knownModifiers) return Promise.resolve(knownModifiers)
  if (!fresh && modifiersRequest) return modifiersRequest
  modifiersRequest = fetch(fresh ? "/api/weapon-modifiers?fresh=1" : "/api/weapon-modifiers", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : { modifiers: [] })
    .then((payload: { modifiers?: WeaponModifierRef[] }) => { knownModifiers = payload.modifiers ?? []; return knownModifiers })
    .catch(() => { modifiersRequest = null; return [] as WeaponModifierRef[] })
  return modifiersRequest
}

/** Les attributs et matériaux d'« Armes - Modificateurs ». */
export function useWeaponModifiers(enabled: boolean) {
  const [modifiers, setModifiers] = useState<WeaponModifierRef[] | null>(knownModifiers)
  const version = useWorldIndexVersion("weapon-modifiers")
  useEffect(() => {
    if (!enabled) return
    let active = true
    void loadModifiers(version > 0).then((loaded) => { if (active) setModifiers(loaded) })
    return () => { active = false }
  }, [enabled, version])
  return modifiers
}

// ---------------------------------------------------------------------------
// Les détails au survol
// ---------------------------------------------------------------------------

/**
 * Le détail d'un état : la description de ses niveaux et ses règles (pas les lignes de
 * l'onglet Effets). `level` 0 : aucun niveau en cours, les deux sont montrés pareil.
 */
export function StateDetails({ definition, level, color }: { definition: StateDefinition; level: 1 | 2 | 0; color: string }) {
  return <div className="grid gap-2.5">
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-white shadow-sm" style={{ background: `radial-gradient(circle at 35% 30%, ${color}, ${color}cc 60%, #1d140c 140%)` }}>
        <IndexImage value={definition.image} alt="" className="size-full object-cover" fallback={<IndexIconGlyph icon={definition.gauge.icon || "clock"} emoji={definition.gauge.emoji} className="size-5" stroke={color} />} />
      </span>
      <div className="min-w-0">
        <p className="font-display text-lg font-semibold leading-tight" style={{ color }}>{definition.name}</p>
        {definition.type && <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{definition.type}</p>}
      </div>
    </div>
    {([1, 2] as const).slice(0, definition.levels).map((rank) => <div key={rank} className={cn("rounded-xl border px-3 py-2 text-xs leading-5 transition", level === rank ? "bg-background shadow-sm" : level ? "bg-muted/25 opacity-75" : "bg-background/60")} style={{ borderColor: level === rank ? `${color}88` : level ? undefined : `${color}44` }}>
      <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.14em]" style={{ color: level === rank || !level ? color : undefined }}>
        Niveau {rank}{level === rank && <span className="rounded-full px-1.5 py-px text-[9px] text-white" style={{ backgroundColor: color }}>en cours</span>}
      </p>
      {definition.descriptionHtml[rank - 1]
        ? <IndexRichText html={definition.descriptionHtml[rank - 1]} self={{ index: "states", id: definition.id }} className="[&_a]:underline" />
        : <p className="text-muted-foreground">Pas de description.</p>}
    </div>)}
    {definition.rulesHtml && <div className="rounded-xl border border-dashed px-3 py-2 text-xs leading-5">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Règles liées</p>
      <IndexRichText html={definition.rulesHtml} self={{ index: "states", id: definition.id }} className="[&_a]:underline" />
    </div>}
  </div>
}

/**
 * Le détail d'un attribut, d'un matériau ou d'une rune : son nom et sa description. Son
 * icône y prend la couleur de sa colonne Couleur.
 */
function ModifierDetails({ modifier, color }: { modifier: WeaponModifierRef; color: string }) {
  return <div className="grid gap-2">
    <p className="font-display text-lg font-semibold leading-tight" style={{ color }}><ModifierIcon modifier={modifier} color={modifier.color || undefined} /><FormattedName name={modifier.name} html={modifier.nameHtml} color={color} /></p>
    {modifier.descriptionHtml
      ? <IndexRichText html={modifier.descriptionHtml} self={modifier.id ? { index: "weapon-modifiers", id: modifier.id } : undefined} className="text-xs leading-5 [&_a]:underline" />
      : <p className="text-xs text-muted-foreground">Pas de description.</p>}
  </div>
}

// ---------------------------------------------------------------------------
// Le nom cité, dans le texte
// ---------------------------------------------------------------------------

/** Le nom avec sa propre mise en forme (celle de la case Nom de l'index), sinon dans sa couleur. */
function FormattedName({ name, html, color }: { name: string; html?: string; color?: string }) {
  if (html) return <span className="[&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }} />
  return <span style={color ? { color } : undefined}>{name}</span>
}

/**
 * La première couleur écrite dans un nom mis en forme : son icône la reprend, pour être de
 * la couleur du mot qu'elle précède.
 */
function firstHtmlColor(html?: string) {
  return html?.match(/color:\s*(#[0-9a-f]{3,8})\b/i)?.[1]
}

/**
 * La petite icône d'un modificateur (colonne Icône), devant son nom : de la couleur du
 * texte, ou de `color`. Un émoji garde ses couleurs.
 */
function ModifierIcon({ modifier, color }: { modifier: WeaponModifierRef; color?: string }) {
  const look = parseGlyphValue(modifier.icon ?? "")
  if (!look.icon && !look.emoji) return null
  return <span className="mr-1 inline-flex translate-y-[0.12em]" style={color ? { color } : undefined}><IndexIconGlyph icon={look.icon} emoji={look.emoji} className="size-[1em]" filled={Boolean(look.emoji)} /></span>
}

/** Le nom cité dans un texte : son icône a la couleur du mot (sa mise en forme, sinon sa couleur). */
function ModifierName({ modifier, color }: { modifier: WeaponModifierRef; color: string }) {
  return <span style={{ color }}><ModifierIcon modifier={modifier} color={firstHtmlColor(modifier.nameHtml)} /><FormattedName name={modifier.name} html={modifier.nameHtml} color={color} /></span>
}

/**
 * L'icône d'un objet (colonne Icône, ou celle qu'Eraser lui choisit) teintée d'une couleur :
 * son dessin sert de pochoir. Sans couleur, l'image telle quelle.
 */
function ObjectGlyph({ object, name, color, className = "size-[1em]" }: { object: NonNullable<ResolvedReference["object"]>; name: string; color?: string; className?: string }) {
  const image = objectIconImage(object.icon, name, object.type, object.subtype)
  if (!image) {
    const emoji = object.icon.trim()
    return emoji && !emoji.startsWith("=") ? <span aria-hidden="true" className="leading-none">{emoji}</span> : null
  }
  // eslint-disable-next-line @next/next/no-img-element
  if (!color) return <img src={image.src} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} className={cn("inline-block object-contain", className)} />
  const mask = `url("${image.src.replace(/"/g, "%22")}") center / contain no-repeat`
  return <span aria-hidden="true" className={cn("inline-block", className)} style={{ backgroundColor: color, mask, WebkitMask: mask }} />
}

const chipClass = "inline cursor-help rounded-sm font-semibold underline decoration-dotted decoration-1 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

/**
 * Le style imposé à la colonne Nom de l'index de la ligne citée : le nom le prend, à la
 * place de la mise en forme de sa case, comme dans le tableau. Son icône en prend la couleur.
 */
function nameLook(style: ColumnStyle | undefined) {
  if (!style) return null
  const css = columnStyleCss(style)
  const color = style.color === "muted" ? "var(--muted-foreground)" : style.color || undefined
  return { className: css.className, style: css.style, color }
}

function StateChip({ definition, nameStyle }: { definition: StateDefinition; nameStyle?: ColumnStyle }) {
  const color = definition.gauge.color || DEFAULT_STATE_COLOR
  const look = nameLook(nameStyle)
  return <HoverCard openDelay={180} closeDelay={80}>
    <HoverCardTrigger asChild>
      <span tabIndex={0} className={cn(chipClass, look && "font-normal", look?.className)} style={{ textDecorationColor: `${color}99`, ...look?.style } as CSSProperties}>
        <span className="mr-0.5 inline-flex translate-y-[2px]" style={{ color: look ? look.color : firstHtmlColor(definition.nameHtml) ?? color }}><IndexIconGlyph icon={definition.gauge.icon || "clock"} emoji={definition.gauge.emoji} className="size-[1em]" filled={false} /></span>
        {look ? <span>{definition.name}</span> : <FormattedName name={definition.name} html={definition.nameHtml} color={color} />}
      </span>
    </HoverCardTrigger>
    <HoverCardContent side="top" align="start" className="w-80 rounded-2xl p-3.5 text-foreground" style={{ borderColor: `${color}55` }}>
      <StateDetails definition={definition} level={0} color={color} />
    </HoverCardContent>
  </HoverCard>
}

function ModifierChip({ modifier, nameStyle }: { modifier: WeaponModifierRef; nameStyle?: ColumnStyle }) {
  const color = modifier.color || "#7f5a3a"
  const look = nameLook(nameStyle)
  return <HoverCard openDelay={180} closeDelay={80}>
    <HoverCardTrigger asChild>
      <span tabIndex={0} className={cn(chipClass, look && "font-normal", look?.className)} style={{ textDecorationColor: `${color}99`, ...look?.style } as CSSProperties}>
        {look ? <span style={look.color ? { color: look.color } : undefined}><ModifierIcon modifier={modifier} />{modifier.name}</span> : <ModifierName modifier={modifier} color={color} />}
      </span>
    </HoverCardTrigger>
    <HoverCardContent side="top" align="start" className="w-72 rounded-2xl p-3.5 text-foreground" style={{ borderColor: `${color}55` }}>
      <ModifierDetails modifier={modifier} color={color} />
    </HoverCardContent>
  </HoverCard>
}

// ---------------------------------------------------------------------------
// Le texte
// ---------------------------------------------------------------------------

/** Une citation trouvée dans le texte : un lien de référence, ou « {Colonne} » de la ligne même. */
type Citation = { request: ReferenceRequest; label: string; raw: string; self: boolean }

/** Les liens de référence posés par le menu « { » (le lien seul, sans autre balise autour). */
const referenceAnchor = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
/** « {Prix} », « {Valeur 2} » : une case de la ligne dont on affiche le texte. */
const selfPlaceholder = /\{\s*([^{}<>\n:]{1,60}?)\s*\}/g

function plainLabel(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim()
}

/** Au-delà, une référence citée dans une case citée s'affiche sans être relue (une ligne qui se cite elle-même). */
const MAX_DEPTH = 3

/** Une ligne qui n'existe plus : son dernier nom connu, barré. */
function MissingReference({ label }: { label: string }) {
  return <span className="text-muted-foreground line-through decoration-dotted" title="Cette ligne n’existe plus dans son index.">{label}</span>
}

/**
 * Le détail d'une ligne d'un index sans affichage propre : son image ou son icône (de la
 * couleur de sa colonne Couleur), son type, sa description.
 */
function RowDetails({ reference, color, depth }: { reference: ResolvedReference; color?: string; depth: number }) {
  const look = parseGlyphValue(reference.icon ?? "")
  const glyph = Boolean(look.icon || look.emoji)
  return <div className="grid gap-2">
    <div className="flex items-start gap-3">
      {(reference.image || glyph || reference.object) && <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40" style={color ? { color } : undefined}>
        {reference.image
          ? <IndexImage value={reference.image} alt="" className="size-full object-cover" fallback={<IndexIconGlyph icon={look.icon || "file-text"} emoji={look.emoji} className="size-5" filled={false} />} />
          : reference.object && !glyph
            ? <ObjectGlyph object={reference.object} name={reference.name} color={color} className="size-8" />
            : <IndexIconGlyph icon={look.icon} emoji={look.emoji} className="size-5" filled={Boolean(look.emoji)} />}
      </span>}
      <div className="min-w-0">
        <p className="font-display text-lg font-semibold leading-tight" style={color ? { color } : undefined}><FormattedName name={reference.name} html={reference.nameHtml} color={color} /></p>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{reference.type || reference.tab}</p>
      </div>
    </div>
    {reference.descriptionHtml
      ? <IndexRichText html={reference.descriptionHtml} self={{ index: reference.index, id: reference.id }} depth={depth + 1} className="text-xs leading-5 [&_a]:underline" />
      : <p className="text-xs text-muted-foreground">Pas de description.</p>}
  </div>
}

/** Une case du survol réglé dans « Modifier » : une image, une couleur, une icône, ou sa valeur. */
function LayoutValue({ reference, field, depth }: { reference: ResolvedReference; field: ResolvedLayoutField; depth: number }) {
  const kind = field.look?.kind
  if (kind === "file") {
    const files = field.value.split(/\n+/).map((item) => item.trim()).filter(Boolean)
    return <span className="flex flex-wrap gap-1.5">{files.slice(0, 6).map((file) => <IndexImage key={file} value={file} alt={field.column} className={`${field.large ? "aspect-[4/5] w-full" : "size-14"} rounded-lg border object-cover`} fallback={<a href={file} target="_blank" rel="noreferrer" className="truncate text-xs underline">{file.split("/").pop()}</a>} />)}</span>
  }
  if (kind === "color") return <span className="inline-flex items-center gap-1.5 font-mono text-[11px]"><span className="size-3.5 rounded-full border" style={{ backgroundColor: field.value }} />{field.value}</span>
  if (kind === "glyph") { const look = parseGlyphValue(field.value); return <IndexIconGlyph icon={look.icon} emoji={look.emoji} className="size-5" filled={Boolean(look.emoji)} /> }
  if (kind === "checkbox") return <span>{/^(oui|vrai|true|x|1|yes)$/i.test(field.value.trim()) ? "✓ Oui" : "✗ Non"}</span>
  return <CellValue reference={{ ...reference, column: field.column, value: field.value, valueHtml: field.valueHtml, look: field.look }} depth={depth} />
}

/**
 * Le survol d'une ligne selon sa mise en page (« Modifier » › Mise en page › Survol) : en
 * tête l'image et le sous-titre choisis, puis ses cases rangées en sections et en lignes.
 */
function LayoutDetails({ reference, layout, color, depth }: { reference: ResolvedReference; layout: ResolvedLayout; color?: string; depth: number }) {
  const look = parseGlyphValue(reference.icon ?? "")
  const image = layout.image || reference.image
  const wrap = (fields: ResolvedLayoutField[]) => fields.map((field) => ({ ...field, span: field.span as LayoutSpan | undefined, item: field }))
  const arranged = {
    aside: wrap(layout.aside),
    asideWidth: layout.asideWidth ?? "md",
    sections: layout.sections.map((section) => ({ ...section, rows: section.rows.map((row) => ({ id: row.id, fields: wrap(row.fields) })) })),
    rest: [] as ResolvedLayoutField[],
  }
  return <div className="grid gap-2.5">
    <div className="flex items-start gap-3">
      {(image || look.icon || look.emoji) && <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40" style={color ? { color } : undefined}>
        {image ? <IndexImage value={image} alt="" className="size-full object-cover" fallback={<IndexIconGlyph icon={look.icon || "file-text"} emoji={look.emoji} className="size-5" filled={false} />} /> : <IndexIconGlyph icon={look.icon} emoji={look.emoji} className="size-5" filled={Boolean(look.emoji)} />}
      </span>}
      <div className="min-w-0">
        <p className="font-display text-lg font-semibold leading-tight" style={color ? { color } : undefined}><FormattedName name={reference.name} html={reference.nameHtml} color={color} /></p>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{layout.subtitle || reference.type || reference.tab}</p>
      </div>
    </div>
    <IndexLayoutView compact arranged={arranged} render={(field) => <div className="grid gap-0.5">
      {!field.hideLabel && <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{field.column}</p>}
      <div className={field.large ? "font-display text-base font-semibold leading-snug" : "text-xs leading-5 [&_a]:underline"}><LayoutValue reference={reference} field={field} depth={depth} /></div>
    </div>} />
  </div>
}

/**
 * Le nom d'une ligne citée, dans le style de la colonne Nom de son index, avec son détail
 * au survol. Son icône a la couleur du mot.
 */
function RowChip({ reference, depth }: { reference: ResolvedReference; depth: number }) {
  const color = reference.color
  const look = parseGlyphValue(reference.icon ?? "")
  const nameCss = columnStyleCss(reference.nameStyle)
  const styleColor = reference.nameStyle?.color && reference.nameStyle.color !== "muted" ? reference.nameStyle.color : undefined
  const wordColor = reference.nameStyle ? styleColor ?? (reference.nameStyle.color === "muted" ? "var(--muted-foreground)" : undefined) : firstHtmlColor(reference.nameHtml) ?? color
  return <HoverCard openDelay={180} closeDelay={80}>
    <HoverCardTrigger asChild>
      <span tabIndex={0} className={cn(chipClass, reference.nameStyle && "font-normal", nameCss.className)} style={{ ...nameCss.style, ...(color ? { textDecorationColor: `${color}99` } : {}) } as CSSProperties}>
        {(look.icon || look.emoji)
          ? <span className="mr-0.5 inline-flex translate-y-[2px]" style={wordColor ? { color: wordColor } : undefined}><IndexIconGlyph icon={look.icon} emoji={look.emoji} className="size-[1em]" filled={Boolean(look.emoji)} /></span>
          : reference.object && <span className="mr-0.5 inline-flex translate-y-[2px]"><ObjectGlyph object={reference.object} name={reference.name} color={wordColor ?? "currentColor"} /></span>}
        {reference.nameStyle ? <span>{reference.name}</span> : <FormattedName name={reference.name} html={reference.nameHtml} color={color} />}
      </span>
    </HoverCardTrigger>
    <HoverCardContent side="top" align="start" collisionPadding={12} className={`${reference.layout ? "max-h-[min(34rem,75vh)] w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto" : "w-80"} rounded-2xl p-3.5 text-foreground`} style={color ? { borderColor: `${color}55` } : undefined}>
      {reference.layout ? <LayoutDetails reference={reference} layout={reference.layout} color={color} depth={depth} /> : <RowDetails reference={reference} color={color} depth={depth} />}
    </HoverCardContent>
  </HoverCard>
}

/** Retire les couleurs écrites dans une case quand sa colonne impose la sienne. */
function withoutColors(html: string) {
  return html.replace(/<span style="color:[^"]*">/gi, "<span>")
}

/**
 * La valeur d'une case citée, sans survol, dans le style imposé de sa colonne. Les choix
 * d'une liste prennent leur couleur (si la colonne n'impose pas la sienne) ; un texte
 * garde sa mise en forme, et les références qu'il contient sont affichées à leur tour.
 */
function CellValue({ reference, depth }: { reference: ResolvedReference; depth: number }) {
  const look = reference.look ?? {}
  const css = columnStyleCss(look.style)
  if (look.kind === "choice" || look.kind === "linked-choice" || look.options?.length) {
    const pieces = (reference.value ?? "").split(/(\s*[,;|\n]\s*)/)
    return <span className={css.className} style={css.style}>{pieces.map((piece, index) => {
      if (index % 2) return <span key={index}>{piece.includes("|") ? " | " : ", "}</span>
      const value = piece.trim()
      if (!value) return null
      const color = !look.style?.color && look.options ? matchChoice(value, look.options)?.color : undefined
      return <span key={index} className={color ? "font-medium" : undefined} style={color ? { color } : undefined}>{value}</span>
    })}</span>
  }
  const html = reference.valueHtml?.trim() ?? ""
  if (!html) return null
  return <IndexRichText as="span" html={look.style?.color ? withoutColors(html) : html} self={{ index: reference.index, id: reference.id }} depth={depth + 1} className={css.className} style={css.style} />
}

function Cited({ citation, value, depth, states, modifiers }: { citation: Citation; value: ResolvedReference | null | undefined; depth: number; states: StateDefinition[]; modifiers: WeaponModifierRef[] | null }) {
  const name = referenceNameFromLabel(citation.label)
  // Pas encore lue : le dernier nom connu (rien pour « {Prix} », qui ne doit pas clignoter).
  if (value === undefined) return citation.self ? null : <span>{name}</span>
  if (!value) return citation.self ? <span>{citation.raw}</span> : <MissingReference label={name} />
  if (citation.request.column) return <CellValue reference={value} depth={depth} />
  if (value.index === "states") {
    const definition = states.find((candidate) => candidate.id === value.id) ?? states.find((candidate) => foldName(candidate.name) === foldName(value.name))
    if (definition) return <StateChip definition={definition} nameStyle={value.nameStyle} />
  }
  if (value.index === "weapon-modifiers") {
    const modifier = modifiers?.find((candidate) => candidate.id === value.id) ?? modifiers?.find((candidate) => foldName(candidate.name) === foldName(value.name))
    if (modifier) return <ModifierChip modifier={modifier} nameStyle={value.nameStyle} />
  }
  return <RowChip reference={value} depth={depth} />
}

/**
 * Un texte d'index affiché hors tableau. `html` est la case mise en forme (ou son texte) ;
 * `fill` remplace d'abord les accolades propres à la ligne (« {Valeur 2} » d'un objet).
 *
 * Les références posées par le menu « { » s'affichent avec le nom actuel de leur ligne
 * (avec son détail au survol) ou la valeur de la case citée (sans survol, dans le style
 * de sa colonne). `self` : la ligne dont vient le texte, pour que « {Prix} » y affiche sa
 * propre case. Une accolade qui ne nomme aucune colonne reste écrite telle quelle.
 */
export function IndexRichText({ html, fill, self, depth = 0, className = "", as = "div", style }: { html: string; fill?: (html: string) => string; self?: { index: string; id: string }; depth?: number; className?: string; as?: "div" | "span"; style?: CSSProperties }) {
  const filled = useMemo(() => { const safe = sanitizeRichText(html); return fill ? fill(safe) : safe }, [fill, html])
  const selfIndex = self?.index ?? ""
  const selfId = self?.id ?? ""
  const { marked, citations } = useMemo(() => {
    const found: Citation[] = []
    if (depth > MAX_DEPTH) return { marked: filled, citations: found }
    let marked = filled.includes("/reference/") ? filled.replace(referenceAnchor, (match, href: string, label: string) => {
      const reference = parseReferenceHref(href)
      if (!reference) return match
      found.push({ request: { ...reference, name: referenceNameFromLabel(plainLabel(label)) }, label: plainLabel(label), raw: match, self: false })
      return `<span data-eraser-ref="${found.length - 1}"></span>`
    }) : filled
    if (selfIndex && selfId && marked.includes("{")) {
      marked = marked.replace(selfPlaceholder, (match, column: string) => {
        const name = plainLabel(column)
        if (!name) return match
        found.push({ request: { index: selfIndex, id: selfId, column: name }, label: name, raw: plainLabel(match), self: true })
        return `<span data-eraser-ref="${found.length - 1}"></span>`
      })
    }
    return { marked, citations: found }
  }, [depth, filled, selfId, selfIndex])
  const requests = useMemo(() => citations.map((citation) => citation.request), [citations])
  const values = useResolvedReferences(requests)
  const citesStates = citations.some((citation) => citation.request.index === "states" && !citation.request.column)
  const citesModifiers = citations.some((citation) => citation.request.index === "weapon-modifiers" && !citation.request.column)
  const { catalog } = useStatesCatalog(citesStates)
  const modifiers = useWeaponModifiers(citesModifiers)
  const [targets, setTargets] = useState<HTMLElement[]>([])
  // Les citations sont dessinées dans des emplacements du texte : sa mise en forme (gras,
  // couleur, listes) reste celle de la case. Relus à chaque nouveau texte.
  const attach = useCallback((node: HTMLElement | null) => {
    // Un détachement (nouveau rendu) ne vide rien : seul le texte posé compte.
    if (!node) return
    const next = citations.length ? [...node.querySelectorAll<HTMLElement>(":scope [data-eraser-ref]")].filter((element) => element.closest("[data-eraser-text]") === node) : []
    setTargets((current) => current.length === next.length && current.every((element, index) => element === next[index]) ? current : next)
  }, [citations])
  // Le même objet tant que le texte ne change pas : React réécrirait sinon tout le texte
  // à chaque rendu, et les citations posées dedans disparaîtraient.
  const inner = useMemo(() => ({ __html: marked }), [marked])
  const Tag = as
  return <>
    <Tag ref={attach as never} data-eraser-text="" className={cn(richTextRendering, "[&_input]:pointer-events-none", className)} style={style} dangerouslySetInnerHTML={inner} />
    {targets.map((target) => {
      const citation = citations[Number(target.dataset.eraserRef)]
      if (!citation) return null
      return createPortal(<Cited citation={citation} value={values.get(referenceKey(citation.request))} depth={depth} states={catalog.states} modifiers={modifiers} />, target, target.dataset.eraserRef)
    })}
  </>
}

/**
 * Des attributs, matériaux ou runes (« Lourde, Acier trempé »), avec leur nom et leur
 * description au survol (aux couleurs de leur ligne d'« Armes - Modificateurs »).
 * `look` absent : une pastille à la couleur de la ligne (matériaux, runes). `look`
 * donné : du texte dans le style de la colonne de l'objet (attributs), sans étiquette.
 * Un nom absent de l'index s'affiche sans survol.
 */
export function ModifierPills({ names, look, iconColor }: { names: string[]; look?: { className: string; style: CSSProperties }; /** Pastilles : la couleur de leur icône (celle de leur colonne dans l'objet). */ iconColor?: string }) {
  const modifiers = useWeaponModifiers(names.length > 0)
  const byName = useMemo(() => new Map((modifiers ?? []).map((modifier) => [foldName(modifier.name), modifier])), [modifiers])
  return <>{names.map((name, index) => {
    const modifier = byName.get(foldName(name))
    // Dans le style d'une colonne : du texte, séparé par des virgules, sans étiquette.
    const shape = look ? cn("whitespace-normal break-words [overflow-wrap:anywhere]", look.className) : pillClass
    const style = look ? look.style : pillStyle(modifier?.color) ?? undefined
    const comma = look && index > 0 ? ", " : null
    if (!modifier) return <span key={`${name}:${index}`}>{comma}<span className={shape} style={style}>{name}</span></span>
    const color = modifier.color || "#7f5a3a"
    return <span key={`${name}:${index}`}>{comma}<HoverCard openDelay={180} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span tabIndex={0} className={cn(shape, !look && "font-medium", "cursor-help outline-none focus-visible:ring-2 focus-visible:ring-ring/50")} style={style}><ModifierIcon modifier={modifier} color={look ? undefined : iconColor} />{modifier.name}</span>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72 rounded-2xl p-3.5 text-foreground" style={{ borderColor: `${color}55` }}>
        <ModifierDetails modifier={modifier} color={color} />
      </HoverCardContent>
    </HoverCard></span>
  })}</>
}

export const pillClass = "inline-block max-w-full whitespace-normal break-words rounded-full border border-foreground/25 bg-muted/40 px-2 py-0.5 text-[11px] leading-4 [overflow-wrap:anywhere]"
