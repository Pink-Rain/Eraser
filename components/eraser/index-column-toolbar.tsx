"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronDown, Lock, LockOpen, MessageSquareText, Plus, RotateCcw, TriangleAlert, X, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { indexColumnKinds, kindGroups, type IndexColumnKind, type IndexColumnSpec } from "@/lib/index-columns"
import { creatableKinds, freePolicy, type ColumnPolicy, type IndexEditorModel } from "@/lib/index-schema-shared"
import { cn } from "@/lib/utils"

/**
 * Un petit menu qui s'ouvre au survol de son bouton et reste ouvert tant qu'on y travaille :
 * un clic sur le bouton l'épingle (il ne se referme plus en sortant), Échap ou un clic
 * dehors le ferment. Sert au cadenas et à la description d'une colonne.
 */
function HoverPopover({ trigger, children, className, align = "end" }: { trigger: ReactNode; children: ReactNode; className?: string; align?: "start" | "end" | "center" }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const timer = useRef<number | null>(null)
  const cancel = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null } }
  const show = () => { cancel(); setOpen(true) }
  const hide = () => { cancel(); if (!pinned) timer.current = window.setTimeout(() => setOpen(false), 220) }
  useEffect(() => cancel, [])
  const change = (next: boolean) => { setOpen(next); if (!next) setPinned(false) }
  return <Popover open={open} onOpenChange={change}>
    <PopoverTrigger asChild>
      <span onMouseEnter={show} onMouseLeave={hide} onClick={() => { cancel(); setPinned(true); setOpen(true) }} className="inline-flex">{trigger}</span>
    </PopoverTrigger>
    <PopoverContent align={align} className={cn("w-80 p-3", className)} onMouseEnter={cancel} onMouseLeave={hide} onFocusCapture={() => setPinned(true)} onOpenAutoFocus={(event) => event.preventDefault()}>
      {children}
    </PopoverContent>
  </Popover>
}

/**
 * Le cadenas d'une colonne : au survol, ce qui lit la colonne (les usages d'Eraser et ceux
 * qu'on a écrits) ; on y ajoute ou retire des usages, on pose ou retire le cadenas. Nom et ID
 * restent toujours verrouillées. Retirer un cadenas d'Eraser libère la colonne pour de bon
 * (pour tout le monde, à « Enregistrer ») : un avertissement le dit, et un clic le remet.
 */
export function ColumnLockButton({ policy, onChange, disabled }: { policy: ColumnPolicy; onChange: (policy: ColumnPolicy) => void; disabled: boolean }) {
  const [draft, setDraft] = useState("")
  const builtin = policy.builtin ?? policy.reasons
  const manual = policy.manual ?? []
  const hidden = new Set(policy.hidden ?? [])
  const locked = policy.reasons.length > 0 || (!policy.rename && !policy.type && !policy.remove)
  const kept = builtin.filter((reason) => !hidden.has(reason))
  const uses = locked ? [...kept.map((text) => ({ text, builtin: true })), ...manual.map((text) => ({ text, builtin: false }))] : []
  // Le cadenas d'Eraser gardé garde ses droits ; un cadenas posé à la main ferme nom, type et suppression.
  const lockedWith = (nextManual: string[], nextHidden: Set<string>): ColumnPolicy => {
    const nextKept = builtin.filter((reason) => !nextHidden.has(reason))
    const base = nextKept.length && builtin.length ? { rename: policy.rename && locked ? policy.rename : false, type: locked && nextKept.length === kept.length ? policy.type : false, remove: false, allowed: policy.allowed } : { rename: false, type: false, remove: false, allowed: "L’affichage : description, « Masquée », style imposé, couleurs et ordre des options." }
    return { ...policy, ...base, reasons: [...nextKept, ...nextManual], builtin, manual: nextManual, hidden: [...nextHidden], unlocked: false }
  }
  const unlock = () => onChange({ ...freePolicy, builtin, manual, hidden: [...hidden], unlocked: builtin.length > 0, permanent: false })
  const relock = () => onChange(lockedWith(manual, new Set()))
  const addUse = () => {
    const text = draft.replace(/\s+/g, " ").trim()
    if (!text || manual.includes(text)) return
    onChange(lockedWith([...manual, text], hidden))
    setDraft("")
  }
  const removeUse = (use: { text: string; builtin: boolean }) => {
    const nextManual = use.builtin ? manual : manual.filter((item) => item !== use.text)
    const nextHidden = new Set(hidden)
    if (use.builtin) nextHidden.add(use.text)
    const remaining = builtin.filter((reason) => !nextHidden.has(reason)).length + nextManual.length
    // Plus aucun usage : le cadenas tombe, sauf pour Nom et ID.
    if (!remaining) onChange({ ...freePolicy, builtin, manual: nextManual, hidden: [...nextHidden], unlocked: builtin.length > 0 })
    else onChange(lockedWith(nextManual, nextHidden))
  }
  const Icon: LucideIcon = locked ? Lock : LockOpen
  const tone = policy.permanent ? "text-foreground" : locked ? "text-amber-700" : policy.unlocked ? "text-destructive" : "text-muted-foreground/60"
  const title = policy.permanent ? "Toujours verrouillée : chaque ligne est retrouvée par elle" : locked ? `Verrouillée : ${uses.length} usage${uses.length > 1 ? "s" : ""}` : policy.unlocked ? "Cadenas d’Eraser retiré : la colonne est libre" : "Libre : poser un cadenas"
  return <HoverPopover trigger={<Button type="button" variant={locked ? "secondary" : "ghost"} size="icon-sm" className={cn(tone, policy.unlocked && "bg-destructive/10")} aria-label={title} title={title} disabled={disabled && !locked}><Icon /></Button>}>
    <div className="grid gap-2 text-xs">
      <p className="flex items-center gap-1.5 font-semibold"><Icon className={cn("size-3.5", tone)} />{policy.permanent ? "Toujours verrouillée" : locked ? "Verrouillée" : "Libre"}</p>
      {policy.permanent && <p className="text-muted-foreground">Chaque ligne est retrouvée par cette colonne : son nom, son type et sa présence ne se changent pas. Son affichage reste libre.</p>}
      {!policy.permanent && policy.unlocked && <p className="flex gap-1.5 rounded-lg border border-destructive/35 bg-destructive/[.06] px-2 py-1.5 leading-4"><TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />Eraser lit cette colonne par son nom. Renommer, retyper ou supprimer la colonne peut casser ce qui la lit. Remettre son nom et son type d’origine répare.</p>}
      {locked && <ul className="grid gap-1">
        {uses.map((use) => <li key={`${use.builtin ? "e" : "m"}:${use.text}`} className="flex items-start gap-1.5 rounded-lg border bg-background/60 px-2 py-1 leading-4">
          <span className="min-w-0 flex-1">{use.text}{use.builtin && <span className="ml-1 text-[10px] text-muted-foreground">· Eraser</span>}</span>
          {!policy.permanent && !disabled && <button type="button" onClick={() => removeUse(use)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Retirer l’usage « ${use.text} »`} title="Retirer de la liste"><X className="size-3" /></button>}
        </li>)}
      </ul>}
      {!locked && !policy.permanent && builtin.length > 0 && <p className="text-muted-foreground">Usages d’Eraser écartés : {builtin.length}.</p>}
      {!policy.permanent && !disabled && <>
        <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); addUse() }}>
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ajouter un usage (ce qui lit cette colonne)" className="h-7 text-xs" maxLength={200} aria-label="Nouvel usage" />
          <Button type="submit" size="icon-sm" variant="outline" className="h-7 w-7" disabled={!draft.trim()} aria-label="Ajouter l’usage"><Plus /></Button>
        </form>
        <div className="flex flex-wrap gap-1">
          {locked
            ? <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={unlock}><LockOpen />Retirer le cadenas</Button>
            : <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange(lockedWith(manual, new Set()))}><Lock />Poser un cadenas</Button>}
          {!locked && builtin.length > 0 && hidden.size < builtin.length + 1 && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={relock}><RotateCcw />Remettre le cadenas d’Eraser</Button>}
        </div>
        <p className="text-[10px] leading-4 text-muted-foreground">Un cadenas protège le nom, le type et la présence de la colonne ; son affichage reste modifiable. Gardé pour tout le monde à « Enregistrer ».</p>
      </>}
    </div>
  </HoverPopover>
}

/** La description d'une colonne (au survol de son en-tête, dans la fiche) : un petit champ par-dessus le reste. */
export function ColumnDescriptionButton({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const filled = Boolean(value.trim())
  return <HoverPopover trigger={<Button type="button" variant={filled ? "secondary" : "ghost"} size="icon-sm" className={filled ? "text-primary" : "text-muted-foreground/60"} aria-label="Description de la colonne" title={filled ? value : "Décrire la colonne : à quoi elle sert, comment la remplir"}><MessageSquareText /></Button>}>
    <label className="grid gap-1.5 text-xs">
      <span className="font-semibold">Description et utilité</span>
      <Textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="À quoi sert cette colonne ? Comment la remplir ?" className="min-h-24 text-xs" maxLength={600} />
      <span className="text-[10px] text-muted-foreground">Affichée au survol de l’en-tête de la colonne et dans la fiche.</span>
    </label>
  </HoverPopover>
}

/** L'icône de chaque type, pour le repérer d'un coup d'œil. */
export function ColumnTypeMenu({ spec, onPick, policy, disabled, family, icons }: { spec: IndexColumnSpec; onPick: (kind: IndexColumnKind) => void; policy: ColumnPolicy; disabled: boolean; family: IndexEditorModel["family"]; icons: Partial<Record<IndexColumnKind, LucideIcon>> }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<IndexColumnKind | null>(null)
  const objects = family === "objects"
  const blocked = (kind: IndexColumnKind) => {
    if (kind === spec.kind) return ""
    if (!policy.type && !(["name", "name-form"].includes(kind) && ["name", "name-form"].includes(spec.kind))) return "Type verrouillé : voir le cadenas."
    if (objects && ["linked", "linked-choice", "lookup", "rollup", "tab-sort"].includes(kind)) return "Pas encore dans l’index des items : l’inventaire et les boutiques lisent leurs cases comme du texte."
    return ""
  }
  const current = indexColumnKinds[spec.kind]
  const CurrentIcon = icons[spec.kind] ?? MessageSquareText
  const detail = indexColumnKinds[hovered ?? spec.kind]
  const locked = !policy.type
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setHovered(null) }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size="sm" className="h-9 max-w-[13rem] justify-start gap-1.5 px-2" disabled={disabled} title={locked ? "Type verrouillé : voir le cadenas. L’affichage reste modifiable." : `Type : ${current.label}. Cliquer pour changer.`}>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><CurrentIcon className="size-3.5" /></span>
        <span className="min-w-0 truncate text-xs font-semibold">{current.label}</span>
        {locked ? <Lock className="ml-auto size-3 shrink-0 text-muted-foreground" /> : <ChevronDown className="ml-auto size-3 shrink-0 text-muted-foreground" />}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[min(92vw,38rem)] p-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-2" onMouseLeave={() => setHovered(null)}>
          {kindGroups.map((group) => {
            const kinds = creatableKinds.filter((kind) => indexColumnKinds[kind].group === group)
            if (!kinds.length) return null
            return <div key={group} className="grid content-start gap-0.5">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{group}</p>
              {kinds.map((kind) => {
                const reason = blocked(kind)
                const Icon = icons[kind] ?? MessageSquareText
                return <button key={kind} type="button" disabled={Boolean(reason)} title={reason || indexColumnKinds[kind].short} onMouseEnter={() => setHovered(kind)} onFocus={() => setHovered(kind)} onClick={() => { onPick(kind); setOpen(false) }} className={cn("flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs disabled:opacity-40", kind === spec.kind ? "bg-primary/12 text-primary" : "hover:bg-muted")}>
                  <Icon className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate font-medium">{indexColumnKinds[kind].label}</span>
                  {reason && <Lock className="ml-auto size-3 shrink-0" />}
                </button>
              })}
            </div>
          })}
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5">
          <b>{detail.label}</b> — {detail.description}
          {detail.example && <span className="mt-1 block text-muted-foreground">Exemple : {detail.example}</span>}
        </div>
      </div>
    </PopoverContent>
  </Popover>
}
