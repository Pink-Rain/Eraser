"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Crosshair, LoaderCircle, Plus, Search, X } from "lucide-react"

import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ClassSpell, SpellIndexKind } from "@/lib/class-content"
import { foldName, splitNames } from "@/lib/world-index-definitions"

export type SpellOption = Pick<ClassSpell, "id" | "name" | "category" | "type" | "effect" | "effectHtml" | "description" | "descriptionHtml" | "skills" | "distance" | "charges" | "tone"> & { source: SpellIndexKind }

const sourceLabels: Record<SpellIndexKind, string> = { classes: "Classe", creatures: "Créature" }

/**
 * Les sorts de un ou plusieurs index (« Sorts des classes », « Sorts des créatures »),
 * chargés une fois pour la fiche ouverte, triés par nom.
 */
export function useSpellOptions(sources: SpellIndexKind[]) {
  const key = sources.join(",")
  const [state, setState] = useState<{ key: string; options: SpellOption[] } | null>(null)
  useEffect(() => {
    let alive = true
    const kinds = key.split(",").filter(Boolean) as SpellIndexKind[]
    Promise.all(kinds.map((kind) => fetch(`/api/resources/class-index?index=${kind}`)
      .then((response) => response.json() as Promise<{ data?: { spells?: Omit<SpellOption, "source">[] } }>)
      .then((payload) => (payload.data?.spells ?? []).filter((spell) => spell.name).map((spell) => ({ ...spell, source: kind })))
      .catch(() => [] as SpellOption[])))
      .then((lists) => { if (alive) setState({ key, options: lists.flat().sort((left, right) => left.name.localeCompare(right.name, "fr")) }) })
    return () => { alive = false }
  }, [key])
  return { options: state?.key === key ? state.options : [], loading: state?.key !== key }
}

/** La fiche d'un sort choisi : tout ce que dit son index, sauf les classes. */
function SpellCard({ name, spell, showSource, onRemove }: { name: string; spell?: SpellOption; showSource: boolean; onRemove: () => void }) {
  const accent = spell?.tone.background || "var(--primary)"
  return <article className="relative rounded-xl border bg-card/80 p-3 pl-4 text-sm shadow-xs" style={{ borderLeft: `3px solid ${accent}` }}>
    <button type="button" onClick={onRemove} className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Retirer ${name}`}><X className="size-3.5" /></button>
    <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pr-7">
      <h4 className="font-display text-base font-semibold leading-tight">{spell?.name ?? name}</h4>
      {spell?.type && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: spell.tone.background, color: spell.tone.foreground }}>{spell.type}</span>}
      {spell && showSource && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{sourceLabels[spell.source]}</span>}
      {spell?.category === "actif" && <SpellChargeStars total={spell.charges} accent={accent} />}
    </header>
    {!spell && <p className="mt-1 text-xs text-muted-foreground">Ce sort n’est pas (ou plus) dans les index de sorts.</p>}
    {spell && (spell.effect || spell.description) && <div className="mt-2 grid gap-1 leading-6">
      {spell.effect && <div className="font-medium [&_a]:underline" dangerouslySetInnerHTML={{ __html: spell.effectHtml || spell.effect }} />}
      {spell.description && <div className="text-muted-foreground [&_a]:underline" dangerouslySetInnerHTML={{ __html: spell.descriptionHtml || spell.description }} />}
    </div>}
    {spell && (spell.skills.length > 0 || spell.distance) && <footer className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {spell.skills.length > 0 && <span className="font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</span>}
      {spell.distance && <span className="flex items-center gap-1"><Crosshair className="size-3" />Distance : {spell.distance}</span>}
    </footer>}
  </article>
}

/**
 * Sélecteur de sorts. `options` : ce qu'on peut ajouter ; `known` : tout ce qu'on sait
 * afficher (un sort déjà choisi dans un autre index garde sa fiche). La feuille garde
 * les noms séparés par des virgules, lisibles directement dans Sheets.
 */
export function SpellPicker({ label, icon, value, options, known = options, loading, onChange }: { label: string; icon: ReactNode; value: string; options: SpellOption[]; known?: SpellOption[]; loading: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selected = splitNames(value)
  const chosen = new Set(selected.map(foldName))
  // Deux index peuvent avoir un sort du même nom : le premier rencontré l'emporte.
  const byName = useMemo(() => {
    const map = new Map<string, SpellOption>()
    for (const spell of known) if (!map.has(foldName(spell.name))) map.set(foldName(spell.name), spell)
    return map
  }, [known])
  const mixed = new Set(options.map((spell) => spell.source)).size > 1
  const matches = options.filter((spell) => !chosen.has(foldName(spell.name)) && (!query.trim() || foldName(`${spell.name} ${spell.type}`).includes(foldName(query)))).slice(0, 80)

  return <section className="grid gap-2">
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">{icon}{label}{selected.length > 0 && <span className="font-normal normal-case tracking-normal">({selected.length})</span>}</p>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
        <PopoverTrigger asChild><Button type="button" variant="outline" size="sm"><Plus />Ajouter</Button></PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="end">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un sort…" className="h-8 pl-8" /></div>
          <div className="mt-2 max-h-64 overflow-y-auto">
            {loading && <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Chargement des sorts…</p>}
            {!loading && !matches.length && <p className="px-2 py-3 text-xs text-muted-foreground">Aucun sort ne correspond.</p>}
            {matches.map((spell) => <button key={`${spell.source}:${spell.id || spell.name}`} type="button" onClick={() => { onChange([...selected, spell.name].join(", ")); setQuery(""); setOpen(false) }} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
              <span className="truncate">{spell.name}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{mixed ? `${sourceLabels[spell.source]} · ` : ""}{spell.type || spell.category}</span>
            </button>)}
          </div>
        </PopoverContent>
      </Popover>
    </div>
    {selected.length
      ? <div className="grid gap-2 md:grid-cols-2">
          {selected.map((name) => <SpellCard key={name} name={name} spell={byName.get(foldName(name))} showSource={mixed} onRemove={() => onChange(selected.filter((item) => foldName(item) !== foldName(name)).join(", "))} />)}
        </div>
      : <p className="rounded-xl border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">Aucun sort pour l’instant.</p>}
  </section>
}
