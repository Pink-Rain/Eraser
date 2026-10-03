"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, LoaderCircle, Plus, Search, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LinkedChoicePicker } from "@/components/eraser/index-cells"
import { useCharacterCatalog } from "@/components/eraser/use-character-catalog"
import { splitNames, WEAPON_MODIFIER_TYPE_HEADER, WEAPON_MODIFIERS_TAB } from "@/lib/world-index-definitions"
import type { ChoiceSource } from "@/lib/index-columns"
import {
  buildItemModifierTargets,
  itemAttachmentKinds,
  itemAttachmentLabels,
  serializeItemLinks,
  type ItemAttachment,
  type ItemAttachmentKind,
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

/** Monté seulement à l’ouverture : le brouillon repart des liens enregistrés à chaque fois. */
function ItemModifierForm({ modifiers, attachments, pending, onSave, onClose }: { modifiers: ItemModifier[]; attachments: ItemAttachment[]; pending: boolean; onSave: (serialized: string) => Promise<boolean>; onClose: () => void }) {
  const [draft, setDraft] = useState<ItemModifier[]>(() => modifiers.length ? modifiers : [{ value: "", target: "" }])
  const [extras, setExtras] = useState<ItemAttachment[]>(attachments)
  const { byId } = useModifierTargets()
  const namesOf = (kind: ItemAttachmentKind) => extras.filter((entry) => entry.kind === kind).map((entry) => entry.name)
  const setNames = (kind: ItemAttachmentKind, value: string) => setExtras((current) => [...current.filter((entry) => entry.kind !== kind), ...splitNames(value).map((name) => ({ kind, name }))])

  function update(index: number, changes: Partial<ItemModifier>) {
    setDraft((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...changes } : entry))
  }

  const usable = draft.filter((entry) => entry.target && hasModifierAmount(entry.value))
  const incomplete = draft.some((entry) => (entry.target && !hasModifierAmount(entry.value)) || (!entry.target && entry.value.trim()))

  async function save() {
    if (await onSave(serializeItemLinks(draft, extras))) onClose()
  }

  return <Tabs defaultValue="liens" className="gap-3">
    <TabsList className="h-auto w-full flex-wrap justify-start">
      <TabsTrigger value="liens">Caractéristiques et compétences{usable.length > 0 && <span className="ml-1 tabular-nums text-muted-foreground">{usable.length}</span>}</TabsTrigger>
      {itemAttachmentKinds.map((kind) => <TabsTrigger key={kind} value={kind}>{itemAttachmentLabels[kind].plural}{namesOf(kind).length > 0 && <span className="ml-1 tabular-nums text-muted-foreground">{namesOf(kind).length}</span>}</TabsTrigger>)}
    </TabsList>
    {itemAttachmentKinds.map((kind) => <TabsContent key={kind} value={kind} className="grid gap-2">
      <p className="text-xs leading-5 text-muted-foreground">Choisis dans « Armes - Modificateurs » (Type : {itemAttachmentLabels[kind].singular}). Un nom tapé ici y est ajouté avec ce Type.</p>
      <div className="rounded-md border bg-background/55"><LinkedChoicePicker compact={false} multiple label={itemAttachmentLabels[kind].plural} source={attachmentSources[kind]} value={namesOf(kind).join(", ")} onChange={(value) => setNames(kind, value)} /></div>
    </TabsContent>)}
    <TabsContent value="liens" className="grid gap-3">
      <p className="-mt-1 text-xs leading-5 text-muted-foreground">Ces modificateurs ne comptent dans les totaux que lorsque la case de l’objet est cochée. Pour une caractéristique ou une compétence, choisis ensuite sa valeur ou l’un de ses seuils critiques.</p>
      <div className="grid gap-2">
        {draft.map((entry, index) => {
          const { baseId, aspect } = splitModifierTarget(entry.target)
          const base = byId.get(baseId)
          const hasCritical = base ? base.kind === "caracteristique" || base.kind === "competence" : /^(?:carac|comp):/.test(baseId)
          return <div key={index} className="grid grid-cols-[5rem_minmax(0,1fr)_2rem] items-start gap-x-2 gap-y-1.5">
          <Input
            value={entry.value}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder="+2"
            inputMode="text"
            className="h-9 text-center font-semibold tabular-nums"
            aria-label={`Modificateur ${index + 1}`}
          />
          <TargetPicker value={baseId} onChange={(target) => update(index, { target: joinModifierTarget(target, aspect) })} />
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((current) => [...current, { value: "", target: "" }])}><Plus />Ajouter un lien</Button>
        {usable.length > 0 && <p className="text-[11px] text-muted-foreground">{usable.length} lien{usable.length > 1 ? "s" : ""} actif{usable.length > 1 ? "s" : ""}</p>}
      </div>
      {incomplete && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">Les lignes sans valeur chiffrée ou sans cible ne seront pas enregistrées.</p>}
    </TabsContent>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
      <Button type="button" disabled={pending} onClick={() => void save()}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
    </div>
  </Tabs>
}

export function ItemModifierDialog({ open, onOpenChange, itemName, modifiers, attachments, pending, onSave }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  modifiers: ItemModifier[]
  attachments: ItemAttachment[]
  pending: boolean
  onSave: (serialized: string) => Promise<boolean>
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />Lier « {itemName} »</DialogTitle></DialogHeader>
      {open && <ItemModifierForm modifiers={modifiers} attachments={attachments} pending={pending} onSave={onSave} onClose={() => onOpenChange(false)} />}
    </DialogContent>
  </Dialog>
}

export function ItemModifierSummary({ modifiers, attachments = [], className = "" }: { modifiers: ItemModifier[]; attachments?: ItemAttachment[]; className?: string }) {
  const { byId } = useModifierTargets()
  if (!modifiers.length && !attachments.length) return null
  return <div className={`flex flex-wrap items-center gap-1 ${className}`}>
    {itemAttachmentKinds.map((kind) => {
      const names = attachments.filter((entry) => entry.kind === kind).map((entry) => entry.name)
      return names.length ? <span key={kind} className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[10px] font-semibold text-primary"><span className="uppercase tracking-wider text-primary/70">{itemAttachmentLabels[kind].singular}{names.length > 1 ? "s" : ""}</span>{names.join(" · ")}</span> : null
    })}
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
