"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, LoaderCircle, Plus, Search, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  formatModifierAmount,
  hasModifierAmount,
  itemModifierTargets,
  itemModifierTargetById,
  parseModifierAmount,
  serializeItemModifiers,
  type ItemModifier,
} from "@/lib/item-modifiers"

function normalized(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").trim()
}

const targetGroups = [...new Set(itemModifierTargets.map((target) => target.group))]

function TargetPicker({ value, onChange }: { value: string; onChange: (target: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const search = normalized(query)
  const matches = useMemo(
    () => itemModifierTargets.filter((target) => !search || normalized(`${target.label} ${target.group}`).includes(search)),
    [search],
  )
  const selected = itemModifierTargetById.get(value)
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setQuery("") }}>
    <PopoverTrigger asChild>
      <button type="button" className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-background/55 px-3 text-left text-sm shadow-sm hover:bg-accent/45">
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-muted-foreground"}`}>{selected?.label || "Choisir…"}</span>
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

/** Monté seulement à l’ouverture : le brouillon repart des liens enregistrés à chaque fois. */
function ItemModifierForm({ modifiers, pending, onSave, onClose }: { modifiers: ItemModifier[]; pending: boolean; onSave: (serialized: string) => Promise<boolean>; onClose: () => void }) {
  const [draft, setDraft] = useState<ItemModifier[]>(() => modifiers.length ? modifiers : [{ value: "", target: "" }])

  function update(index: number, changes: Partial<ItemModifier>) {
    setDraft((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...changes } : entry))
  }

  const usable = draft.filter((entry) => entry.target && hasModifierAmount(entry.value))
  const incomplete = draft.some((entry) => (entry.target && !hasModifierAmount(entry.value)) || (!entry.target && entry.value.trim()))

  async function save() {
    if (await onSave(serializeItemModifiers(draft))) onClose()
  }

  return <>
      <p className="-mt-1 text-xs leading-5 text-muted-foreground">Ces modificateurs ne comptent dans les totaux que lorsque la case de l’objet est cochée.</p>
      <div className="grid gap-2">
        {draft.map((entry, index) => <div key={index} className="grid grid-cols-[5rem_minmax(0,1fr)_2rem] items-center gap-2">
          <Input
            value={entry.value}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder="+2"
            inputMode="text"
            className="h-9 text-center font-semibold tabular-nums"
            aria-label={`Modificateur ${index + 1}`}
          />
          <TargetPicker value={entry.target} onChange={(target) => update(index, { target })} />
          <button
            type="button"
            onClick={() => setDraft((current) => current.length > 1 ? current.filter((_, entryIndex) => entryIndex !== index) : [{ value: "", target: "" }])}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Retirer le lien ${index + 1}`}
          ><X className="size-3.5" /></button>
        </div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((current) => [...current, { value: "", target: "" }])}><Plus />Ajouter un lien</Button>
        {usable.length > 0 && <p className="text-[11px] text-muted-foreground">{usable.length} lien{usable.length > 1 ? "s" : ""} actif{usable.length > 1 ? "s" : ""}</p>}
      </div>
      {incomplete && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">Les lignes sans valeur chiffrée ou sans cible ne seront pas enregistrées.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
        <Button type="button" disabled={pending} onClick={() => void save()}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
      </div>
  </>
}

export function ItemModifierDialog({ open, onOpenChange, itemName, modifiers, pending, onSave }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  modifiers: ItemModifier[]
  pending: boolean
  onSave: (serialized: string) => Promise<boolean>
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />Lier « {itemName} »</DialogTitle></DialogHeader>
      {open && <ItemModifierForm modifiers={modifiers} pending={pending} onSave={onSave} onClose={() => onOpenChange(false)} />}
    </DialogContent>
  </Dialog>
}

export function ItemModifierSummary({ modifiers, className = "" }: { modifiers: ItemModifier[]; className?: string }) {
  if (!modifiers.length) return null
  return <div className={`flex flex-wrap items-center gap-1 ${className}`}>
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Liens</span>
    {modifiers.map((modifier, index) => {
      const amount = parseModifierAmount(modifier.value)
      return <span
        key={`${modifier.target}:${index}`}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${amount < 0 ? "bg-rose-500/12 text-rose-400" : "bg-emerald-500/12 text-emerald-400"}`}
      >
        <span className="tabular-nums">{formatModifierAmount(amount)}</span>
        <span className="font-medium text-foreground/70">{itemModifierTargetById.get(modifier.target)?.label || modifier.target}</span>
      </span>
    })}
  </div>
}
