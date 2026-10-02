"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, Dices, LoaderCircle, Plus, Search, Undo2, X } from "lucide-react"

import { useWorldIndexVersion } from "@/components/eraser/index-cells"
import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexImage } from "@/components/eraser/index-image"
import { sanitizeRichText } from "@/components/eraser/rich-text"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { activeEffectsOf, isRolledEffect, stateDefinitionOf, type CharacterState, type StateDefinition, type StateEffect, type StatesCatalog } from "@/lib/character-states"
import { foldName } from "@/lib/index-columns"
import { operationLabel, rangeLabel } from "@/lib/state-change"
import { cn } from "@/lib/utils"

// Gardé d'une fiche à l'autre : l'index n'est relu qu'une fois par affichage de page.
let knownCatalog: StatesCatalog | null = null

/** L'Index des états, pour la fiche (lecture seule, joueurs compris). */
export function useStatesCatalog() {
  const [catalog, setCatalog] = useState<StatesCatalog | null>(knownCatalog)
  const [error, setError] = useState("")
  // Un état ou un effet modifié dans l'index (autre onglet, autre fenêtre) : la fiche relit.
  const version = useWorldIndexVersion("states")
  useEffect(() => {
    let active = true
    fetch(version ? "/api/states?fresh=1" : "/api/states", { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as { catalog?: StatesCatalog; error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return
        if (!response.ok || !payload.catalog) { setError(payload.error || "L’Index des états n’a pas pu être lu."); return }
        knownCatalog = payload.catalog
        setCatalog(payload.catalog)
        setError("")
      })
      .catch(() => { if (active) setError("L’Index des états n’a pas pu être lu.") })
    return () => { active = false }
  }, [version])
  return { catalog: catalog ?? { states: [], effects: [] }, loaded: Boolean(catalog), error }
}

const DEFAULT_COLOR = "#78716c"

/** La couleur d'un état posé : celle de son premier effet en vigueur, sinon celle de sa jauge. */
function stateColor(catalog: StatesCatalog, state: CharacterState, definition: StateDefinition | undefined) {
  return activeEffectsOf(catalog, state).find((effect) => /^#[0-9a-f]{3,8}$/i.test(effect.color))?.color || definition?.gauge.color || DEFAULT_COLOR
}

/** Ce que fait l'effet, en clair : « +10 », « =100 », « ≥1 », « 1d20 16-20 → -60 ». */
function changeLabel(effect: StateEffect) {
  const change = effect.operation ? operationLabel(effect.operation) : effect.changeText
  if (!effect.roll) return change
  return `${effect.roll.dice}${effect.roll.range ? ` ${rangeLabel(effect.roll.range)}` : ""}${change ? ` → ${change}` : ""}`
}

function EffectPills({ catalog, names }: { catalog: StatesCatalog; names: string[] }) {
  const effects = names.flatMap((name) => catalog.effects.filter((effect) => foldName(effect.name) === foldName(name)))
  if (!effects.length) return null
  return <div className="mt-1.5 flex flex-wrap gap-1">
    {effects.map((effect) => <span key={effect.name} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: `${effect.color || DEFAULT_COLOR}66`, backgroundColor: `${effect.color || DEFAULT_COLOR}14` }} title={effect.name}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: effect.color || DEFAULT_COLOR }} />
      {effect.targets.length ? effect.targets.join(", ") : effect.name}
      {(effect.operation || effect.changeText || effect.roll) && <b className={(effect.change !== null && effect.change < 0) || (effect.operation?.kind === "roll" && effect.operation.expression.startsWith("-")) ? "text-rose-600" : "text-emerald-700"}>{changeLabel(effect)}</b>}
    </span>)}
  </div>
}

/** Le détail d'un état, au survol : ses deux niveaux, leurs effets, ses règles. */
function StateDetails({ catalog, definition, level, color }: { catalog: StatesCatalog; definition: StateDefinition; level: 1 | 2 | 0; color: string }) {
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
    {([1, 2] as const).slice(0, definition.levels).map((rank) => <div key={rank} className={cn("rounded-xl border px-3 py-2 text-xs leading-5 transition", level === rank ? "bg-background shadow-sm" : "bg-muted/25 opacity-75")} style={{ borderColor: level === rank ? `${color}88` : undefined }}>
      <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.14em]" style={{ color: level === rank ? color : undefined }}>
        Niveau {rank}{level === rank && <span className="rounded-full px-1.5 py-px text-[9px] text-white" style={{ backgroundColor: color }}>en cours</span>}
      </p>
      {definition.descriptionHtml[rank - 1]
        ? <div className="[&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(definition.descriptionHtml[rank - 1]) }} />
        : <p className="text-muted-foreground">Pas de description.</p>}
      <EffectPills catalog={catalog} names={definition.effects[rank - 1]} />
    </div>)}
    {definition.rulesHtml && <div className="rounded-xl border border-dashed px-3 py-2 text-xs leading-5">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Règles liées</p>
      <div className="[&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(definition.rulesHtml) }} />
    </div>}
  </div>
}

/**
 * Les états d'un personnage, sous son portrait et son token : en ajouter (un ou
 * plusieurs), choisir leur niveau d'un clic sur la jauge, les retirer. Le survol montre
 * les descriptions des niveaux, leurs effets et les règles liées.
 */
/** Le résultat d'un effet lancé depuis la fiche : réussi ou non, le détail, de quoi annuler. */
export type StateRollOutcome = { hit: boolean; lines: string[]; undo?: () => void }

export function CharacterStatesPanel({ states, autoStates = [], catalog, loaded, error, onChange, onRoll, disabled = false }: {
  states: CharacterState[]
  /** Coma, Mort : posés d'après la vie, ni retirables ni réglables à la main. */
  autoStates?: CharacterState[]
  catalog: StatesCatalog
  loaded: boolean
  error: string
  onChange: (states: CharacterState[]) => void
  /** Lance un effet (jet, dés) et écrit son résultat dans la fiche. */
  onRoll?: (effect: StateEffect) => StateRollOutcome
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // Le dernier lancer de chaque état, affiché sous lui jusqu'au suivant.
  const [outcomes, setOutcomes] = useState<Record<string, { effect: string; outcome: StateRollOutcome; undone?: boolean }>>({})
  const groups = useMemo(() => {
    const folded = foldName(query)
    const taken = new Set([...states, ...autoStates].map((state) => foldName(state.name)))
    const shown = catalog.states.filter((state) => !taken.has(foldName(state.name)) && (!folded || foldName(`${state.name} ${state.type}`).includes(folded)))
    const byType = new Map<string, StateDefinition[]>()
    for (const state of shown) byType.set(state.type || "Autres", [...(byType.get(state.type || "Autres") ?? []), state])
    return [...byType.entries()]
  }, [autoStates, catalog.states, query, states])

  function add(definition: StateDefinition) {
    onChange([...states, { id: definition.id, name: definition.name, level: 1 }])
    setOpen(false)
    setQuery("")
  }

  return <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
    <div className="flex items-center gap-2">
      <p className="flex flex-1 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground"><Activity className="size-3.5" />États</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" disabled={disabled} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-50" aria-label="Ajouter un état"><Plus className="size-3" />Ajouter</button>
        </PopoverTrigger>
        {open && <PopoverContent align="start" className="w-72 p-2">
          <div className="relative mb-2"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Effrayé, Brûlure, Poison…" className="h-8 pl-8 text-xs" /></div>
          <div className="max-h-72 overflow-y-auto">
            {!loaded && !error && <p className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Lecture de l’Index des états…</p>}
            {error && <p className="py-4 text-center text-xs text-destructive">{error}</p>}
            {loaded && !groups.length && <p className="py-4 text-center text-xs text-muted-foreground">{catalog.states.length ? "Aucun état de ce nom." : "L’Index des états est vide."}</p>}
            {groups.map(([type, list]) => <div key={type} className="mb-1.5">
              <p className="px-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{type}</p>
              {list.map((definition) => <button key={definition.id} type="button" onClick={() => add(definition)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted">
                <span className="flex size-5 shrink-0 items-center justify-center" style={{ color: definition.gauge.color || DEFAULT_COLOR }}><IndexIconGlyph icon={definition.gauge.icon || "clock"} emoji={definition.gauge.emoji} className="size-4" filled={false} /></span>
                <span className="min-w-0 flex-1 truncate font-medium">{definition.name}</span>
                {definition.levels === 2 && <span className="text-[9px] text-muted-foreground">2 niv.</span>}
              </button>)}
            </div>)}
          </div>
        </PopoverContent>}
      </Popover>
    </div>
    {[...states, ...autoStates].map((state) => {
      const automatic = autoStates.includes(state)
      const definition = stateDefinitionOf(catalog, state)
      const color = stateColor(catalog, state, definition)
      const levels = definition?.levels ?? 2
      const level = Math.min(state.level, levels) as 1 | 2
      const rolled = onRoll ? activeEffectsOf(catalog, state).filter(isRolledEffect) : []
      const last = outcomes[state.name]
      return <div key={state.name} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1"><HoverCard openDelay={180} closeDelay={80}>
        <HoverCardTrigger asChild>
          {/* Un nom long passe à la ligne ; s'il manque encore de place, les boutons descendent
              sous le nom : la ligne grandit en hauteur, jamais en largeur. */}
          <div className="group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-l-4 bg-background/50 px-2 py-1.5" style={{ borderLeftColor: color }}>
            <span className="min-w-[min(min-content,100%)] flex-1 basis-16 break-words text-xs font-semibold leading-tight" style={{ color }}>{state.name}</span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
            {automatic && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground" title="Posé tout seul d’après les points de vie">Auto</span>}
            {/* Un bouton par effet à lancer (jet, dés) : le résultat s'écrit dans la fiche. */}
            {rolled.map((effect) => <button key={effect.name} type="button" disabled={disabled} onClick={() => setOutcomes((current) => ({ ...current, [state.name]: { effect: effect.name, outcome: onRoll!(effect) } }))} className="inline-flex shrink-0 items-center gap-0.5 rounded-md border px-1 py-0.5 text-[10px] font-semibold transition hover:bg-muted disabled:opacity-50" style={{ color, borderColor: `${color}55` }} title={`Lancer : ${effect.name}${effect.roll ? ` (${effect.roll.dice})` : ""}`} aria-label={`Lancer ${effect.name}`}><Dices className="size-3" />{rolled.length > 1 ? effect.name : effect.roll?.dice ?? ""}</button>)}
            {!automatic && <span className="flex items-center gap-0.5" style={{ color }} role="group" aria-label={`Niveau de ${state.name} : ${level} sur ${levels}`}>
              {Array.from({ length: levels }, (_, index) => <button key={index} type="button" disabled={disabled} onClick={() => onChange(states.map((candidate) => candidate === state ? { ...candidate, level: (index + 1) as 1 | 2 } : candidate))} className={cn("inline-flex rounded-sm p-0.5 transition hover:scale-110", index < level ? "opacity-100" : "opacity-30 hover:opacity-60")} aria-label={`Niveau ${index + 1}`} title={`Niveau ${index + 1}`}>
                <IndexIconGlyph icon={definition?.gauge.icon || "clock"} emoji={definition?.gauge.emoji} filled={index < level} stroke={definition?.gauge.strokeColor} className="size-4" />
              </button>)}
            </span>}
            {!automatic && <button type="button" disabled={disabled} onClick={() => onChange(states.filter((candidate) => candidate !== state))} className="rounded-full p-0.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100" aria-label={`Retirer ${state.name}`} title="Retirer cet état"><X className="size-3" /></button>}
            </span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent side="right" align="start" className="w-80 rounded-2xl p-3.5" style={{ borderColor: `${color}55` }}>
          {definition
            ? <StateDetails catalog={catalog} definition={definition} level={level} color={color} />
            : <p className="text-xs text-muted-foreground">« {state.name} » n’est plus dans l’Index des états : il reste posé, sans effet.</p>}
        </HoverCardContent>
      </HoverCard>
      {last && <div className={cn("ml-2 rounded-lg border-l-2 bg-background/40 px-2 py-1 text-[11px] leading-4", last.undone && "opacity-50")} style={{ borderLeftColor: last.outcome.hit ? color : "#a8a29e" }}>
        <p className="flex items-center gap-1 font-semibold" style={{ color: last.outcome.hit ? color : undefined }}><Dices className="size-3" />{last.effect}{last.undone && <span className="font-normal text-muted-foreground"> · annulé</span>}</p>
        {last.outcome.lines.map((line, index) => <p key={index} className="tabular-nums text-muted-foreground [overflow-wrap:anywhere]">{line}</p>)}
        {last.outcome.undo && !last.undone && <button type="button" onClick={() => { last.outcome.undo?.(); setOutcomes((current) => ({ ...current, [state.name]: { ...last, undone: true } })) }} className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"><Undo2 className="size-3" />Annuler</button>}
      </div>}
      </div>
    })}
  </div>
}
