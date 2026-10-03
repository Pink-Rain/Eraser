"use client"

/**
 * Les états, attributs et matériaux cités entre accolades dans un texte d'index
 * (« Applique {Empoisonnement} », « Attribut {Lourde} ») : hors des tableaux, le nom
 * s'affiche avec sa mise en forme, et son détail au survol. Le texte écrit dans la
 * feuille ne change pas.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

import { useWorldIndexVersion } from "@/components/eraser/index-cells"
import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexImage } from "@/components/eraser/index-image"
import { richTextRendering, sanitizeRichText } from "@/components/eraser/rich-text"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import type { StateDefinition, StatesCatalog } from "@/lib/character-states"
import { foldName } from "@/lib/index-columns"
import { cn } from "@/lib/utils"
import { isCitableModifier, type WeaponModifierRef } from "@/lib/weapon-modifiers"

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
function useWeaponModifiers(enabled: boolean) {
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
        ? <IndexRichText html={definition.descriptionHtml[rank - 1]} className="[&_a]:underline" />
        : <p className="text-muted-foreground">Pas de description.</p>}
    </div>)}
    {definition.rulesHtml && <div className="rounded-xl border border-dashed px-3 py-2 text-xs leading-5">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Règles liées</p>
      <IndexRichText html={definition.rulesHtml} className="[&_a]:underline" />
    </div>}
  </div>
}

/** Le détail d'un attribut ou d'un matériau : type, description, chance et charges. */
function ModifierDetails({ modifier, color }: { modifier: WeaponModifierRef; color: string }) {
  const chance = modifier.number.trim()
  return <div className="grid gap-2">
    <div>
      <p className="font-display text-lg font-semibold leading-tight" style={{ color }}><ModifierName modifier={modifier} color={color} /></p>
      {modifier.type && <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{modifier.type}</p>}
    </div>
    {modifier.descriptionHtml
      ? <IndexRichText html={modifier.descriptionHtml} className="text-xs leading-5 [&_a]:underline" />
      : <p className="text-xs text-muted-foreground">Pas de description.</p>}
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <span className="rounded-full border px-2 py-0.5" style={{ borderColor: `${color}55` }}><span className="font-semibold">Chance :</span> {chance ? `${chance.replace(/\s*%$/, "")} %` : "normale"}</span>
      {modifier.charges.trim() && <span className="rounded-full border px-2 py-0.5" style={{ borderColor: `${color}55` }}><span className="font-semibold">Charges :</span> {modifier.charges}</span>}
    </div>
  </div>
}

// ---------------------------------------------------------------------------
// Le nom cité, dans le texte
// ---------------------------------------------------------------------------

/** Le nom avec sa propre mise en forme (celle de la case Nom de l'index), sinon dans sa couleur. */
function FormattedName({ name, html, color }: { name: string; html?: string; color: string }) {
  if (html) return <span className="[&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }} />
  return <span style={{ color }}>{name}</span>
}

function ModifierName({ modifier, color }: { modifier: WeaponModifierRef; color: string }) {
  return <FormattedName name={modifier.name} html={modifier.nameHtml} color={color} />
}

const chipClass = "inline cursor-help rounded-sm font-semibold underline decoration-dotted decoration-1 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

function StateChip({ definition }: { definition: StateDefinition }) {
  const color = definition.gauge.color || DEFAULT_STATE_COLOR
  return <HoverCard openDelay={180} closeDelay={80}>
    <HoverCardTrigger asChild>
      <span tabIndex={0} className={chipClass} style={{ textDecorationColor: `${color}99` } as CSSProperties}>
        <span className="mr-0.5 inline-flex translate-y-[2px]" style={{ color }}><IndexIconGlyph icon={definition.gauge.icon || "clock"} emoji={definition.gauge.emoji} className="size-[1em]" filled={false} /></span>
        <FormattedName name={definition.name} html={definition.nameHtml} color={color} />
      </span>
    </HoverCardTrigger>
    <HoverCardContent side="top" align="start" className="w-80 rounded-2xl p-3.5 text-foreground" style={{ borderColor: `${color}55` }}>
      <StateDetails definition={definition} level={0} color={color} />
    </HoverCardContent>
  </HoverCard>
}

function ModifierChip({ modifier }: { modifier: WeaponModifierRef }) {
  const color = modifier.color || "#7f5a3a"
  return <HoverCard openDelay={180} closeDelay={80}>
    <HoverCardTrigger asChild>
      <span tabIndex={0} className={chipClass} style={{ textDecorationColor: `${color}99` } as CSSProperties}>
        <ModifierName modifier={modifier} color={color} />
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

const placeholder = /\{\s*([^{}<>\n]{1,60}?)\s*\}/g

type Reference = { kind: "state"; definition: StateDefinition } | { kind: "modifier"; modifier: WeaponModifierRef }

/**
 * Un texte d'index affiché hors tableau. `html` est la case mise en forme (ou son texte) ;
 * `fill` remplace d'abord les accolades propres à la ligne (« {Valeur} » d'un objet).
 * Les accolades qui restent et qui nomment un état, un attribut ou un matériau
 * deviennent ce nom mis en forme, avec son détail au survol. Une accolade inconnue reste
 * écrite telle quelle.
 */
export function IndexRichText({ html, fill, className = "", as = "div", style }: { html: string; fill?: (html: string) => string; className?: string; as?: "div" | "span"; style?: CSSProperties }) {
  const filled = useMemo(() => { const safe = sanitizeRichText(html); return fill ? fill(safe) : safe }, [fill, html])
  const cites = filled.includes("{")
  const { catalog, loaded } = useStatesCatalog(cites)
  const modifiers = useWeaponModifiers(cites)
  const { marked, references } = useMemo(() => {
    const found: Reference[] = []
    if (!cites || (!loaded && !modifiers)) return { marked: filled, references: found }
    const states = new Map(catalog.states.map((definition) => [foldName(definition.name), definition]))
    const citable = new Map((modifiers ?? []).filter((modifier) => isCitableModifier(modifier.type)).map((modifier) => [foldName(modifier.name), modifier]))
    const marked = filled.replace(placeholder, (match, name: string) => {
      const key = foldName(name.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'"))
      const definition = states.get(key)
      const modifier = definition ? undefined : citable.get(key)
      if (!definition && !modifier) return match
      found.push(definition ? { kind: "state", definition } : { kind: "modifier", modifier: modifier! })
      return `<span data-eraser-ref="${found.length - 1}"></span>`
    })
    return { marked, references: found }
  }, [catalog, cites, filled, loaded, modifiers])
  const [targets, setTargets] = useState<HTMLElement[]>([])
  // Les noms cités sont dessinés dans des emplacements du texte : sa mise en forme (gras,
  // couleur, listes) reste celle de la case. Relus à chaque nouveau texte.
  const attach = useCallback((node: HTMLElement | null) => {
    // Un détachement (nouveau rendu) ne vide rien : seul le texte posé compte.
    if (!node) return
    const next = references.length ? [...node.querySelectorAll<HTMLElement>("[data-eraser-ref]")] : []
    setTargets((current) => current.length === next.length && current.every((element, index) => element === next[index]) ? current : next)
  }, [references])
  // Le même objet tant que le texte ne change pas : React réécrirait sinon tout le texte
  // à chaque rendu, et les noms posés dedans disparaîtraient.
  const inner = useMemo(() => ({ __html: marked }), [marked])
  const Tag = as
  return <>
    <Tag ref={attach as never} className={cn(richTextRendering, "[&_input]:pointer-events-none", className)} style={style} dangerouslySetInnerHTML={inner} />
    {targets.map((target) => {
      const reference = references[Number(target.dataset.eraserRef)]
      if (!reference) return null
      return createPortal(reference.kind === "state" ? <StateChip definition={reference.definition} /> : <ModifierChip modifier={reference.modifier} />, target, target.dataset.eraserRef)
    })}
  </>
}

/**
 * Des noms d'attributs ou de matériaux (« Lourde, Assommante ») : ceux qui sont dans
 * « Armes - Modificateurs » s'affichent mis en forme, avec leur détail au survol.
 */
export function CitedModifierNames({ names }: { names: string[] }) {
  const modifiers = useWeaponModifiers(names.length > 0)
  const byName = useMemo(() => new Map((modifiers ?? []).map((modifier) => [foldName(modifier.name), modifier])), [modifiers])
  return <>{names.map((name, index) => {
    const modifier = byName.get(foldName(name))
    return <span key={`${name}:${index}`}>{index > 0 && ", "}{modifier ? <ModifierChip modifier={modifier} /> : name}</span>
  })}</>
}
