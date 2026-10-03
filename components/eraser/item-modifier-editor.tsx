"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Anvil, Check, ChevronsUpDown, LoaderCircle, Plus, RotateCcw, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChoicePicker, LinkedChoicePicker } from "@/components/eraser/index-cells"
import { useCharacterCatalog } from "@/components/eraser/use-character-catalog"
import { WEAPON_MODIFIER_TYPE_HEADER, WEAPON_MODIFIERS_TAB } from "@/lib/world-index-definitions"
import { objectColumnSpec, type ChoiceSource } from "@/lib/index-columns"
import {
  buildItemModifierTargets,
  itemOverrideKeys,
  sameItemField,
  serializeItemLinks,
  type ItemAttachmentKind,
  type ItemOverrideKey,
  type ItemOverrides,
  formatModifierAmount,
  hasModifierAmount,
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

/**
 * D'où viennent les noms proposés : « Armes - Modificateurs », les lignes dont le Type
 * commence par Rune, Attribut ou Matériau (au singulier comme au pluriel).
 */
const attachmentSources: Record<ItemAttachmentKind, ChoiceSource> = {
  rune: { index: "weapon-modifiers", tab: WEAPON_MODIFIERS_TAB, include: { column: WEAPON_MODIFIER_TYPE_HEADER, value: "Rune" } },
  attribut: { index: "weapon-modifiers", tab: WEAPON_MODIFIERS_TAB, include: { column: WEAPON_MODIFIER_TYPE_HEADER, value: "Attribut" } },
  materiau: { index: "weapon-modifiers", tab: WEAPON_MODIFIERS_TAB, include: { column: WEAPON_MODIFIER_TYPE_HEADER, value: "Matériau" } },
}

/** Les champs d'un exemplaire, dans l'ordre du formulaire. */
const fieldLabels: Record<ItemOverrideKey, string> = {
  skill: "Compétence",
  value: "Valeur",
  distance: "Distance",
  action: "Action",
  reload: "Action de rechargement",
  attributes: "Attributs",
  materials: "Matériaux",
  runes: "Runes",
}

const skillSource = objectColumnSpec("Compétence", []).source!
const actionOptions = objectColumnSpec("Action", []).options ?? []
const modifierSources: Partial<Record<ItemOverrideKey, ChoiceSource>> = { attributes: attachmentSources.attribut, materials: attachmentSources.materiau, runes: attachmentSources.rune }

/** Un champ du formulaire : son titre et, s'il diffère de l'Index des objets, de quoi y revenir. */
function ForgeField({ label, changed, base, onReset, wide = false, children }: { label: string; changed: boolean; base: string; onReset: () => void; wide?: boolean; children: ReactNode }) {
  return <div className={wide ? "sm:col-span-2" : ""}>
    <div className="mb-1 flex min-h-5 items-center justify-between gap-2">
      <span className={`text-[11px] font-semibold uppercase tracking-wider ${changed ? "text-primary" : "text-muted-foreground"}`}>{label}</span>
      {changed && <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary" title={`Dans l’Index des objets : ${base.trim() || "vide"}`}><RotateCcw className="size-3" />Comme l’index</button>}
    </div>
    <div className={`rounded-md ${changed ? "ring-1 ring-primary/35" : ""}`}>{children}</div>
  </div>
}

function ForgeSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section className="rounded-xl border bg-background/40 p-3">
    <h3 className="font-display text-sm font-semibold">{title}</h3>
    {hint && <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
    <div className="mt-2.5">{children}</div>
  </section>
}

/** Monté seulement à l’ouverture : le brouillon repart de l'exemplaire enregistré à chaque fois. */
function ItemModifierForm({ base, effective, modifiers, pending, onSave, onClose }: { base: ItemOverrides; effective: ItemOverrides; modifiers: ItemModifier[]; pending: boolean; onSave: (serialized: string) => Promise<boolean>; onClose: () => void }) {
  const [draft, setDraft] = useState<ItemModifier[]>(() => modifiers.length ? modifiers : [{ value: "", target: "" }])
  const [fields, setFields] = useState<Record<ItemOverrideKey, string>>(() => Object.fromEntries(itemOverrideKeys.map((key) => [key, effective[key] ?? ""])) as Record<ItemOverrideKey, string>)
  const { byId } = useModifierTargets()
  const setField = (key: ItemOverrideKey, value: string) => setFields((current) => ({ ...current, [key]: value }))
  const changed = (key: ItemOverrideKey) => !sameItemField(key, fields[key], base[key])
  const field = (key: ItemOverrideKey, input: ReactNode, wide = false) => <ForgeField key={key} label={fieldLabels[key]} changed={changed(key)} base={base[key] ?? ""} onReset={() => setField(key, base[key] ?? "")} wide={wide}>{input}</ForgeField>
  const picker = (key: ItemOverrideKey, source: ChoiceSource) => <div className="rounded-md border bg-background/55"><LinkedChoicePicker compact={false} multiple label={fieldLabels[key]} source={source} value={fields[key]} onChange={(value) => setField(key, value)} /></div>

  function update(index: number, changes: Partial<ItemModifier>) {
    setDraft((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...changes } : entry))
  }

  const usable = draft.filter((entry) => entry.target && hasModifierAmount(entry.value))
  const incomplete = draft.some((entry) => (entry.target && !hasModifierAmount(entry.value)) || (!entry.target && entry.value.trim()))

  async function save() {
    // Seul ce qui diffère de l'Index des objets est gardé : le reste suit l'index.
    const overrides: ItemOverrides = Object.fromEntries(itemOverrideKeys.filter(changed).map((key) => [key, fields[key].trim()]))
    if (await onSave(serializeItemLinks(draft, [], overrides))) onClose()
  }

  return <div className="grid gap-3">
    <ForgeSection title="Utilisation">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("skill", <div className="rounded-md border bg-background/55"><LinkedChoicePicker compact={false} multiple label={fieldLabels.skill} source={skillSource} value={fields.skill} onChange={(value) => setField("skill", value)} /></div>, true)}
        {field("value", <Input value={fields.value} onChange={(event) => setField("value", event.target.value)} placeholder="1d20+5, ou 20 | 1d30 pour deux modes" className="h-9" />)}
        {field("distance", <div className="relative"><Input value={fields.distance} onChange={(event) => setField("distance", event.target.value)} placeholder="12, ou 60 | 1" className="h-9 pr-8" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">m</span></div>)}
        {field("action", <div className="rounded-md border bg-background/55"><ChoicePicker compact={false} allowCustom label={fieldLabels.action} options={actionOptions} value={fields.action} onChange={(value) => setField("action", value)} /></div>)}
        {field("reload", <div className="rounded-md border bg-background/55"><ChoicePicker compact={false} allowCustom label={fieldLabels.reload} options={actionOptions} value={fields.reload} onChange={(value) => setField("reload", value)} /></div>)}
      </div>
    </ForgeSection>
    <ForgeSection title="Attributs, matériaux et runes" hint="Choisis dans « Armes - Modificateurs ». Un nom tapé ici y est ajouté avec son Type.">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["attributes", "materials", "runes"] as const).map((key) => field(key, picker(key, modifierSources[key]!), key === "attributes"))}
      </div>
    </ForgeSection>
    <ForgeSection title="Compétences liées" hint="Ces modificateurs ne comptent dans les totaux que lorsque l’objet est équipé. Pour une caractéristique ou une compétence, choisis ensuite sa valeur ou l’un de ses seuils critiques.">
      <div className="grid gap-2">
        {draft.map((entry, index) => {
          const { baseId, aspect } = splitModifierTarget(entry.target)
          const target = byId.get(baseId)
          const hasCritical = target ? target.kind === "caracteristique" || target.kind === "competence" : /^(?:carac|comp):/.test(baseId)
          return <div key={index} className="grid grid-cols-[5rem_minmax(0,1fr)_2rem] items-start gap-x-2 gap-y-1.5">
            <Input
              value={entry.value}
              onChange={(event) => update(index, { value: event.target.value })}
              placeholder="+2"
              inputMode="text"
              className="h-9 text-center font-semibold tabular-nums"
              aria-label={`Modificateur ${index + 1}`}
            />
            <TargetPicker value={baseId} onChange={(next) => update(index, { target: joinModifierTarget(next, aspect) })} />
            <button
              type="button"
              onClick={() => setDraft((current) => current.length > 1 ? current.filter((_, entryIndex) => entryIndex !== index) : [{ value: "", target: "" }])}
              className="mt-0.5 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Retirer le lien ${index + 1}`}
            ><X className="size-3.5" /></button>
            {hasCritical && <div className="col-start-2 col-end-4"><AspectPicker value={aspect} onChange={(next) => update(index, { target: joinModifierTarget(baseId, next) })} /></div>}
          </div>
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((current) => [...current, { value: "", target: "" }])}><Plus />Ajouter un lien</Button>
        {usable.length > 0 && <p className="text-[11px] text-muted-foreground">{usable.length} lien{usable.length > 1 ? "s" : ""} actif{usable.length > 1 ? "s" : ""}</p>}
      </div>
      {incomplete && <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">Les lignes sans valeur chiffrée ou sans cible ne seront pas enregistrées.</p>}
    </ForgeSection>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
      <Button type="button" disabled={pending} onClick={() => void save()}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
    </div>
  </div>
}

/**
 * La fenêtre d'un exemplaire (bouton enclume de l'inventaire) : sa compétence, sa valeur,
 * sa distance, ses actions, ses attributs, matériaux et runes, et ses compétences liées.
 * `base` : les champs de l'objet dans l'Index des objets ; `effective` : ceux de cet
 * exemplaire, changements compris.
 */
export function ItemModifierDialog({ open, onOpenChange, itemName, base, effective, modifiers, pending, onSave }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  base: ItemOverrides
  effective: ItemOverrides
  modifiers: ItemModifier[]
  pending: boolean
  onSave: (serialized: string) => Promise<boolean>
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Anvil className="size-4 text-primary" />{itemName}</DialogTitle>
        <DialogDescription>Ce que tu changes ici ne vaut que pour cet exemplaire : l’Index des objets ne bouge pas.</DialogDescription>
      </DialogHeader>
      {open && <ItemModifierForm base={base} effective={effective} modifiers={modifiers} pending={pending} onSave={onSave} onClose={() => onOpenChange(false)} />}
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
