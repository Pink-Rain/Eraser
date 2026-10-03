"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Anvil, Check, ChevronsUpDown, Dices, Flame, Gem, Link2, LoaderCircle, Plus, RotateCcw, Search, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChoicePicker, LinkedChoicePicker } from "@/components/eraser/index-cells"
import { useCharacterCatalog } from "@/components/eraser/use-character-catalog"
import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexRichText, useWeaponModifiers } from "@/components/eraser/index-references"
import { RichTextField } from "@/components/eraser/rich-text"
import { drawWeaponModifier, modifierChance, type WeaponModifierRef } from "@/lib/weapon-modifiers"
import { objectColumnSpec, parseGlyphValue } from "@/lib/index-columns"
import {
  buildItemModifierTargets,
  isFromSource,
  itemAttachmentLabels,
  itemOverrideKeys,
  modifierSource,
  sameItemField,
  serializeItemLinks,
  type ItemAttachmentKind,
  type ItemOverrideKey,
  type ItemOverrides,
  formatModifierAmount,
  itemModifierAspectLabels,
  itemModifierTargetLabel,
  joinModifierTarget,
  parseModifierAmount,
  splitModifierTarget,
  type ItemModifier,
  type ItemModifierAspect,
} from "@/lib/item-modifiers"

function normalized(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").trim()
}

/**
 * Les cibles possibles, d'après l'Index des caractéristiques et compétences. La liste
 * ne propose que les cibles de base : les seuils critiques d’une caractéristique ou
 * d’une compétence se choisissent ensuite, avec les boutons sous la cible.
 */
function useModifierTargets() {
  const catalog = useCharacterCatalog()
  return useMemo(() => {
    const all = buildItemModifierTargets(catalog)
    const base = all.filter((target) => target.kind !== "critique")
    return { byId: new Map(all.map((target) => [target.id, target])), base, groups: [...new Set(base.map((target) => target.group))] }
  }, [catalog])
}
const aspects: ItemModifierAspect[] = ["stat", "reussite", "echec"]
const aspectTones: Record<ItemModifierAspect, string> = {
  stat: "border-primary/40 bg-primary/10 text-primary",
  reussite: "border-emerald-500/40 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
  echec: "border-rose-500/40 bg-rose-500/12 text-rose-600 dark:text-rose-300",
}

function AspectPicker({ value, onChange }: { value: ItemModifierAspect; onChange: (aspect: ItemModifierAspect) => void }) {
  return <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Ce que l’objet modifie">
    {aspects.map((aspect) => <button
      key={aspect}
      type="button"
      role="radio"
      aria-checked={value === aspect}
      onClick={() => onChange(aspect)}
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${value === aspect ? aspectTones[aspect] : "border-transparent text-muted-foreground hover:bg-accent/60"}`}
    >{itemModifierAspectLabels[aspect]}</button>)}
  </div>
}

function TargetPicker({ value, onChange }: { value: string; onChange: (target: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const search = normalized(query)
  const { byId, base: baseTargets, groups: targetGroups } = useModifierTargets()
  const matches = useMemo(
    () => baseTargets.filter((target) => !search || normalized(`${target.label} ${target.group}`).includes(search)),
    [baseTargets, search],
  )
  const selected = byId.get(value)
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setQuery("") }}>
    <PopoverTrigger asChild>
      <button type="button" className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-background/55 px-3 text-left text-sm shadow-sm hover:bg-accent/45">
        <span className={`min-w-0 flex-1 truncate ${value ? "" : "text-muted-foreground"}`}>{selected?.label || (value ? itemModifierTargetLabel(value) : "Choisir…")}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Caractéristique, compétence…" className="h-8 border-0 bg-muted/45 pl-8 text-sm shadow-none" />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {targetGroups.map((group) => {
          const groupMatches = matches.filter((target) => target.group === group)
          if (!groupMatches.length) return null
          return <div key={group} className="mb-1">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
            {groupMatches.map((target) => <button
              key={target.id}
              type="button"
              onClick={() => { onChange(target.id); setOpen(false) }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${target.id === value ? "bg-accent/55" : ""}`}
            >
              <span className={`min-w-0 flex-1 truncate ${target.kind === "caracteristique" ? "font-semibold" : ""}`}>{target.label}</span>
              {target.id === value && <Check className="size-3.5 shrink-0 text-primary" />}
            </button>)}
          </div>
        })}
        {!matches.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucune caractéristique ni compétence ne correspond.</p>}
      </div>
    </PopoverContent>
  </Popover>
}


/** Les champs d'un exemplaire, dans l'ordre du formulaire. */
const fieldLabels: Record<ItemOverrideKey, string> = {
  skill: "Compétence",
  value: "Valeur",
  distance: "Distance",
  action: "Action",
  reload: "Rechargement",
  attributes: "Attributs",
  materials: "Matériaux",
  runes: "Runes",
}

const skillSource = objectColumnSpec("Compétence", []).source!
const actionOptions = objectColumnSpec("Action", []).options ?? []

function splitNames(value: string) {
  return value.split(/\s*[,;\n]\s*/).map((part) => part.trim()).filter(Boolean)
}

/** Les trois familles de modificateurs, leur champ, leur couleur d'accent et leur façon d'être cherchées. */
const modifierFamilies: Array<{ kind: ItemAttachmentKind; key: "attributes" | "materials" | "runes"; label: string; singular: string; tone: string; icon: typeof Sparkles; dice: boolean }> = [
  { kind: "attribut", key: "attributes", label: "Attributs", singular: "un attribut", tone: "#b7791f", icon: Sparkles, dice: true },
  { kind: "materiau", key: "materials", label: "Matériaux", singular: "un matériau", tone: "#285f8f", icon: Gem, dice: true },
  { kind: "rune", key: "runes", label: "Runes", singular: "une rune", tone: "#6b4c9a", icon: Flame, dice: false },
]

/** Un champ : son titre coloré quand il diffère de l'Index des objets, et de quoi y revenir. */
function ForgeField({ label, changed, base, onReset, className = "", children }: { label: string; changed: boolean; base: string; onReset: () => void; className?: string; children: ReactNode }) {
  return <div className={`min-w-0 ${className}`}>
    <div className="mb-1 flex min-h-4 items-center justify-between gap-2">
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${changed ? "text-primary" : "text-muted-foreground"}`}>{label}{changed && <span className="ml-1 inline-block size-1.5 rounded-full bg-primary align-middle" />}</span>
      {changed && <button type="button" onClick={onReset} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary" title={`Dans l’Index des objets : ${base.trim() || "vide"}`}><RotateCcw className="size-3" />Index</button>}
    </div>
    {children}
  </div>
}

const boxed = "rounded-md border bg-background/70"

/**
 * Les compétences liées d'un objet, d'un attribut, d'un matériau ou d'une rune : le même
 * principe partout, une valeur et sa cible. `compact` : un bouton tant qu'il n'y en a aucune.
 */
function LinksEditor({ links, onChange, tone, compact = false }: { links: ItemModifier[]; onChange: (links: ItemModifier[]) => void; tone: string; compact?: boolean }) {
  const { byId } = useModifierTargets()
  const update = (index: number, changes: Partial<ItemModifier>) => onChange(links.map((entry, position) => position === index ? { ...entry, ...changes } : entry))
  const add = () => onChange([...links, { value: "", target: "" }])
  if (compact && !links.length) return <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground" style={{ borderColor: `${tone}66` }}><Link2 className="size-3" style={{ color: tone }} />Lier une compétence</button>
  return <div className="grid gap-1.5">
    {links.map((entry, index) => {
      const { baseId, aspect } = splitModifierTarget(entry.target)
      const target = byId.get(baseId)
      const hasCritical = target ? target.kind === "caracteristique" || target.kind === "competence" : /^(?:carac|comp):/.test(baseId)
      const amount = parseModifierAmount(entry.value)
      return <div key={index} className="grid grid-cols-[3.75rem_minmax(0,1fr)_1.75rem] items-start gap-x-1.5 gap-y-1">
        <Input value={entry.value} onChange={(event) => update(index, { value: event.target.value })} placeholder="+2" className={`h-8 px-1 text-center text-sm font-semibold tabular-nums ${entry.value.trim() ? amount < 0 ? "text-rose-600" : "text-emerald-700" : ""}`} aria-label={`Modificateur ${index + 1}`} />
        <TargetPicker value={baseId} onChange={(next) => update(index, { target: joinModifierTarget(next, aspect) })} />
        <button type="button" onClick={() => onChange(links.filter((_, position) => position !== index))} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Retirer le lien ${index + 1}`}><X className="size-3.5" /></button>
        {hasCritical && <div className="col-start-2 col-end-4"><AspectPicker value={aspect} onChange={(next) => update(index, { target: joinModifierTarget(baseId, next) })} /></div>}
      </div>
    })}
    <button type="button" onClick={add} className="inline-flex w-fit items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"><Plus className="size-3" style={{ color: tone }} />Lier une compétence</button>
  </div>
}

/** Le texte d'une ligne d'« Armes - Modificateurs » qu'une recherche compare. */
function searchText(modifier: WeaponModifierRef, kind: ItemAttachmentKind) {
  // Une rune se cherche par son sous-type et son nombre (« Feu 2 ») ; sans colonne Sous-type, par son nom.
  if (kind === "rune") return modifier.subtype ? `${modifier.subtype} ${modifier.number}` : `${modifier.name} ${modifier.number}`
  return modifier.name
}

/** Une famille de modificateurs : le dé, la recherche, puis une carte par modificateur posé. */
function ModifierFamily({ family, names, modifiers, links, onNames, onLinks }: {
  family: (typeof modifierFamilies)[number]
  names: string[]
  modifiers: WeaponModifierRef[] | null
  links: ItemModifier[]
  onNames: (names: string[]) => void
  onLinks: (links: ItemModifier[]) => void
}) {
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const [rolled, setRolled] = useState("")
  const ofKind = useMemo(() => (modifiers ?? []).filter((modifier) => normalized(modifier.type).startsWith(normalized(itemAttachmentLabels[family.kind].singular))), [family.kind, modifiers])
  const installed = new Set(names.map(normalized))
  const free = ofKind.filter((modifier) => !installed.has(normalized(modifier.name)))
  const words = normalized(query).split(/\s+/).filter(Boolean)
  const results = words.length ? free.filter((modifier) => words.every((word) => normalized(searchText(modifier, family.kind)).includes(word))).slice(0, 8) : []
  const Icon = family.icon
  function add(name: string) {
    onNames([...names, name])
    setQuery("")
    setHighlight(0)
  }
  function roll() {
    const drawn = drawWeaponModifier(free)
    if (!drawn) return
    add(drawn.name)
    setRolled(drawn.name)
  }
  function remove(name: string) {
    onNames(names.filter((entry) => normalized(entry) !== normalized(name)))
    onLinks(links.filter((link) => !isFromSource(link, family.kind, name)))
  }
  return <section className="rounded-xl border bg-background/40 p-3" style={{ borderColor: `${family.tone}40`, backgroundImage: `linear-gradient(135deg, ${family.tone}0d, transparent 45%)` }}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex size-6 items-center justify-center rounded-md text-white" style={{ backgroundColor: family.tone }}><Icon className="size-3.5" /></span>
      <h3 className="font-display text-sm font-semibold" style={{ color: family.tone }}>{family.label}</h3>
      {family.dice && <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={!free.length} onClick={roll} title={`Tirer ${family.singular} au hasard : le Nombre est son % de chance, vide c’est la chance normale`} style={{ borderColor: `${family.tone}55`, color: family.tone }}><Dices className="size-3.5" />Tirer</Button>}
      <div className="relative min-w-40 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setHighlight(0) }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((current) => Math.min(results.length - 1, current + 1)) }
            if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((current) => Math.max(0, current - 1)) }
            if (event.key === "Enter") { event.preventDefault(); const choice = results[highlight]; if (choice) add(choice.name); else if (query.trim() && family.kind !== "rune") add(query.trim()) }
            if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); setQuery("") }
          }}
          placeholder={family.kind === "rune" ? "Sous-type et nombre : Feu 2" : `Chercher ${family.singular}…`}
          className="h-8 pl-8 text-sm"
          aria-label={`Chercher ${family.singular}`}
        />
        {results.length > 0 && <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-popover p-1 shadow-xl">
          {results.map((modifier, index) => <button key={modifier.id || modifier.name} type="button" onMouseEnter={() => setHighlight(index)} onClick={() => add(modifier.name)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${index === highlight ? "bg-accent" : ""}`}>
            <span className="inline-flex size-4 items-center justify-center" style={{ color: modifier.color || family.tone }}><IndexIconGlyph icon={parseGlyphValue(modifier.icon).icon || "sparkles"} emoji={parseGlyphValue(modifier.icon).emoji} className="size-3.5" filled={Boolean(parseGlyphValue(modifier.icon).emoji)} /></span>
            {family.kind === "rune" && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{[modifier.subtype, modifier.number].filter(Boolean).join(" · ") || "—"}</span>}
            <span className="min-w-0 flex-1 truncate font-medium" style={{ color: modifier.color || undefined }}>{modifier.name}</span>
            {family.kind !== "rune" && modifierChance(modifier) !== null && <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{modifierChance(modifier)} %</span>}
          </button>)}
        </div>}
      </div>
    </div>
    {names.length > 0 ? <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
      {names.map((name) => {
        const modifier = ofKind.find((candidate) => normalized(candidate.name) === normalized(name)) ?? (modifiers ?? []).find((candidate) => normalized(candidate.name) === normalized(name))
        const color = modifier?.color || family.tone
        const look = parseGlyphValue(modifier?.icon ?? "")
        const own = links.filter((link) => isFromSource(link, family.kind, name))
        return <article key={name} className={`rounded-lg border border-l-4 bg-background/80 p-2.5 shadow-sm transition ${rolled === name ? "ring-2 ring-offset-1" : ""}`} style={{ borderColor: `${color}40`, borderLeftColor: color, ...(rolled === name ? { ["--tw-ring-color" as string]: `${color}88` } : {}) }}>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${color}1f`, color }}><IndexIconGlyph icon={look.icon || "sparkles"} emoji={look.emoji} className="size-3.5" filled={Boolean(look.emoji)} /></span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold leading-tight" style={{ color }}>{modifier?.name ?? name}{family.kind === "rune" && modifier && (modifier.subtype || modifier.number) && <span className="text-[10px] font-medium text-muted-foreground">{[modifier.subtype, modifier.number].filter(Boolean).join(" · ")}</span>}</p>
              {modifier?.descriptionHtml
                ? <IndexRichText html={modifier.descriptionHtml} self={modifier.id ? { index: "weapon-modifiers", id: modifier.id } : undefined} className="mt-0.5 text-xs leading-5 text-foreground/80 [&_a]:underline" />
                : <p className="mt-0.5 text-xs text-muted-foreground">{modifier ? "Pas de description." : "Absent d’« Armes - Modificateurs »."}</p>}
            </div>
            <button type="button" onClick={() => remove(name)} className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Retirer ${name}`}><X className="size-3.5" /></button>
          </div>
          <div className="mt-2 border-t pt-2" style={{ borderColor: `${color}26` }}>
            <LinksEditor compact tone={color} links={own} onChange={(next) => onLinks([...links.filter((link) => !isFromSource(link, family.kind, name)), ...next.map((link) => ({ ...link, from: modifierSource(family.kind, name) }))])} />
          </div>
        </article>
      })}
    </div> : <p className="mt-2 text-xs text-muted-foreground">Aucun pour l’instant.</p>}
  </section>
}

/** Monté seulement à l’ouverture : le brouillon repart de l'exemplaire enregistré à chaque fois. */
function ItemModifierForm({ base, effective, modifiers, effectHtml, pending, onSave, onSaveEffect, onClose }: { base: ItemOverrides; effective: ItemOverrides; modifiers: ItemModifier[]; effectHtml: string; pending: boolean; onSave: (serialized: string) => Promise<boolean>; onSaveEffect?: (html: string) => Promise<boolean>; onClose: () => void }) {
  const [links, setLinks] = useState<ItemModifier[]>(modifiers)
  const [fields, setFields] = useState<Record<ItemOverrideKey, string>>(() => Object.fromEntries(itemOverrideKeys.map((key) => [key, effective[key] ?? ""])) as Record<ItemOverrideKey, string>)
  const [effect, setEffect] = useState(effectHtml)
  const weaponModifiers = useWeaponModifiers(true)
  const setField = (key: ItemOverrideKey, value: string) => setFields((current) => ({ ...current, [key]: value }))
  const changed = (key: ItemOverrideKey) => !sameItemField(key, fields[key], base[key])
  const field = (key: ItemOverrideKey, input: ReactNode, className = "") => <ForgeField key={key} label={fieldLabels[key]} changed={changed(key)} base={base[key] ?? ""} onReset={() => setField(key, base[key] ?? "")} className={className}>{input}</ForgeField>
  // Les liens de l'objet lui-même : ceux qui ne viennent d'aucun attribut, matériau ou rune.
  const ownLinks = links.filter((link) => !link.from)

  async function save() {
    // Seul ce qui diffère de l'Index des objets est gardé : le reste suit l'index.
    const overrides: ItemOverrides = Object.fromEntries(itemOverrideKeys.filter(changed).map((key) => [key, fields[key].trim()]))
    // Un lien dont l'attribut, le matériau ou la rune a été retiré part avec lui.
    const kept = links.filter((link) => !link.from || modifierFamilies.some((family) => splitNames(fields[family.key]).some((name) => isFromSource(link, family.kind, name))))
    if (onSaveEffect && effect !== effectHtml && !(await onSaveEffect(effect))) return
    if (await onSave(serializeItemLinks(kept, [], overrides))) onClose()
  }

  return <div className="grid gap-2.5">
    <section className="grid gap-2.5 rounded-xl border bg-background/40 p-3" style={{ borderColor: "color-mix(in srgb, var(--primary) 25%, transparent)", backgroundImage: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 6%, transparent), transparent 45%)" }}>
      <div className="grid gap-2 sm:grid-cols-3">
        {field("skill", <div className={boxed}><LinkedChoicePicker multiple label={fieldLabels.skill} source={skillSource} value={fields.skill} onChange={(value) => setField("skill", value)} /></div>)}
        {field("action", <div className={boxed}><ChoicePicker allowCustom label={fieldLabels.action} options={actionOptions} value={fields.action} onChange={(value) => setField("action", value)} /></div>)}
        {field("reload", <div className={boxed}><ChoicePicker allowCustom label={fieldLabels.reload} options={actionOptions} value={fields.reload} onChange={(value) => setField("reload", value)} /></div>)}
      </div>
      {onSaveEffect && <div>
        <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${effect !== effectHtml ? "text-primary" : "text-muted-foreground"}`}>Effet</p>
        <RichTextField value={effectHtml} onCommit={setEffect} ariaLabel="Effet" minHeight="min-h-12" className="bg-background/70" />
      </div>}
      <div className="grid gap-2 sm:grid-cols-[8rem_7rem_minmax(0,1fr)]">
        {field("value", <Input value={fields.value} onChange={(event) => setField("value", event.target.value)} placeholder="1d20 | 2d6" className="h-8 bg-background/70 font-semibold" />)}
        {field("distance", <div className="relative"><Input value={fields.distance} onChange={(event) => setField("distance", event.target.value)} placeholder="12" className="h-8 bg-background/70 pr-7" /><span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">m</span></div>)}
        <div className="min-w-0">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title="Comptent dans les totaux quand l’objet est équipé">Compétences liées à l’objet</p>
          <LinksEditor tone="var(--primary)" links={ownLinks} onChange={(next) => setLinks([...next, ...links.filter((link) => link.from)])} compact />
        </div>
      </div>
    </section>
    {modifierFamilies.map((family) => <ModifierFamily
      key={family.kind}
      family={family}
      names={splitNames(fields[family.key])}
      modifiers={weaponModifiers}
      links={links}
      onNames={(names) => setField(family.key, names.join(", "))}
      onLinks={setLinks}
    />)}
    <div className="flex items-center justify-between gap-2">
      <p className="text-[11px] text-muted-foreground">Les compétences liées comptent quand l’objet est équipé.</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
        <Button type="button" disabled={pending} onClick={() => void save()}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
      </div>
    </div>
  </div>
}

/**
 * La fenêtre d'un exemplaire (bouton enclume de l'inventaire) : compétence, actions, effet,
 * valeur, distance et compétences liées de l'objet, puis ses attributs, matériaux et runes,
 * chacun avec ses propres compétences liées. `base` : les champs de l'objet dans l'Index des
 * objets ; `effective` : ceux de cet exemplaire, changements compris.
 */
export function ItemModifierDialog({ open, onOpenChange, itemName, base, effective, modifiers, effectHtml = "", pending, onSave, onSaveEffect }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  base: ItemOverrides
  effective: ItemOverrides
  modifiers: ItemModifier[]
  /** L'effet de l'exemplaire, modifiable ici comme dans l'inventaire. */
  effectHtml?: string
  pending: boolean
  onSave: (serialized: string) => Promise<boolean>
  onSaveEffect?: (html: string) => Promise<boolean>
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader className="gap-0.5">
        <DialogTitle className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Anvil className="size-4" /></span>{itemName}</DialogTitle>
        <DialogDescription className="text-xs">Pour cet exemplaire seulement : l’Index des objets ne bouge pas.</DialogDescription>
      </DialogHeader>
      {open && <ItemModifierForm base={base} effective={effective} modifiers={modifiers} effectHtml={effectHtml} pending={pending} onSave={onSave} onSaveEffect={onSaveEffect} onClose={() => onOpenChange(false)} />}
    </DialogContent>
  </Dialog>
}

/** Les compétences liées d'un exemplaire (ses attributs, matériaux et runes s'affichent sous son effet). */
export function ItemModifierSummary({ modifiers, className = "" }: { modifiers: ItemModifier[]; className?: string }) {
  const { byId } = useModifierTargets()
  if (!modifiers.length) return null
  return <div className={`flex flex-wrap items-center gap-1 ${className}`}>
    {modifiers.length > 0 && <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Liens</span>}
    {modifiers.map((modifier, index) => {
      const amount = parseModifierAmount(modifier.value)
      return <span
        key={`${modifier.target}:${index}`}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${amount < 0 ? "bg-rose-500/12 text-rose-400" : "bg-emerald-500/12 text-emerald-400"}`}
      >
        <span className="tabular-nums">{formatModifierAmount(amount)}</span>
        <span className="font-medium text-foreground/70">{itemModifierTargetLabel(modifier.target, byId)}</span>
      </span>
    })}
  </div>
}
