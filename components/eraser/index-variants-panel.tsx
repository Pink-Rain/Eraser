"use client"

/**
 * Le menu des vues de « Modifier », sous les onglets : le même pour le formulaire, le survol,
 * les cartes et chaque vue (liste, kanban…). En tête, les versions de la vue (la liste,
 * l'étoile pour celle qu'Eraser montre, nouvelle, dupliquer, renommer, retirer) ; dessous,
 * les presets (appliquer, enregistrer, copier vers d'autres onglets, gérer). Les boutons sont
 * des icônes, expliquées au survol. Les fenêtres communes (enregistrer en preset, copier vers,
 * gérer les presets) sont ici aussi.
 */

import { useState, type ReactNode } from "react"
import { ArrowDown, ArrowUp, Bookmark, BookmarkPlus, Check, Copy, CopyPlus, LoaderCircle, Maximize2, Pencil, Plus, Send, Settings2, Star, Trash2, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select"
import { cn } from "@/lib/utils"

export type VariantOption = { id: string; name: string }
export type PresetOption = { id: string; name: string; group?: string }

const panelTitle = "flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground"
const iconButton = "size-7 text-muted-foreground hover:text-foreground"

/** Un bouton-icône du menu : son nom au survol (et pour les lecteurs d'écran). */
function Tool({ icon: Icon, label, onClick, disabled, className }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return <Button type="button" variant="ghost" size="icon-sm" className={cn(iconButton, className)} disabled={disabled} onClick={onClick} title={label} aria-label={label}><Icon /></Button>
}

export function VariantsPanel({ title, icon: Icon, noun, items, selectedId, starredId, onSelect, onStar, starHint, onRename, renameable = () => true, onMove, onNew, newHint, onDuplicate, onRemove, removable = () => true, full = false, empty, presets, onApplyPreset, onSavePreset, savePresetHint, onCopy, copyHint, onManagePresets, footer, disabled = false }: {
  /** « Formulaires », « Survols », « Cartes », « Listes »… */
  title: string
  icon: LucideIcon
  /** Le mot d'une version, pour les boutons : « formulaire », « survol », « carte », « vue ». */
  noun: string
  items: VariantOption[]
  selectedId: string
  /** La version qu'Eraser montre (l'étoile). */
  starredId: string
  onSelect: (id: string) => void
  /** Étoiler la version choisie ; absent : pas d'étoile. */
  onStar?: (id: string) => void
  /** Ce que fait l'étoile, au survol. */
  starHint: string
  onRename?: (id: string, name: string) => void
  renameable?: (id: string) => boolean
  /** Avancer ou reculer la version choisie dans la liste. */
  onMove?: (delta: number) => void
  onNew: () => void
  newHint: string
  onDuplicate: () => void
  onRemove?: () => void
  removable?: (id: string) => boolean
  /** Le nombre de versions est au plus : ni nouvelle, ni copie. */
  full?: boolean
  /** Sans aucune version (des cartes) : ce qui s'affiche à la place de la liste. */
  empty?: ReactNode
  presets: PresetOption[]
  onApplyPreset: (id: string) => void
  /** Enregistrer la version choisie en preset ; absent : bouton grisé (`savePresetHint` dit pourquoi). */
  onSavePreset?: () => void
  savePresetHint?: string
  /** Copier vers d'autres onglets ; absent : bouton grisé (`copyHint` dit pourquoi). */
  onCopy?: () => void
  copyHint?: string
  onManagePresets?: () => void
  /** Sous les presets : revenir à l'affichage d'Eraser, une note… */
  footer?: ReactNode
  disabled?: boolean
}) {
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const at = selected ? items.findIndex((item) => item.id === selected.id) : -1
  const starred = selected?.id === starredId
  const groups = [...new Set(presets.map((preset) => preset.group ?? ""))]
  // « ce formulaire », « ce survol » ; « cette carte », « cette vue ».
  const feminine = /^(carte|vue)$/.test(noun)
  const the = feminine ? "la" : "ce"
  const this_ = feminine ? "cette" : "ce"
  // Les listes déroulantes prennent toute la largeur du panneau (et rétrécissent à côté de l'étoile).
  return <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border bg-muted/20 p-2 [&_[data-slot=native-select-wrapper]]:w-full [&_[data-slot=native-select-wrapper]]:min-w-0" aria-label={title}>
    <div className="flex items-center justify-between gap-1">
      <p className={cn(panelTitle, "px-1")}><Icon className="size-3.5 shrink-0" /><span className="truncate">{title}</span></p>
      <span className="flex shrink-0 items-center">
        <Tool icon={Plus} label={full ? "Le nombre de versions est au plus" : newHint} disabled={disabled || full} onClick={onNew} />
        <Tool icon={CopyPlus} label={full ? "Le nombre de versions est au plus" : `Dupliquer : une copie de ${the} ${noun} affiché${feminine ? "e" : ""}`} disabled={disabled || full || !selected} onClick={onDuplicate} />
      </span>
    </div>

    {selected ? <>
      <div className="flex items-center gap-1">
        <NativeSelect value={selected.id} disabled={disabled} onChange={(event) => onSelect(event.target.value)} className="h-8 min-w-0 flex-1 py-0 text-xs" aria-label={`${noun[0].toLocaleUpperCase("fr")}${noun.slice(1)} modifié${feminine ? "e" : ""}`}>
          {items.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.id === starredId ? "★ " : ""}{item.name}</NativeSelectOption>)}
        </NativeSelect>
        {onStar && <Button type="button" variant="ghost" size="icon-sm" className={cn("size-7", starred ? "text-[#c9a227]" : "text-muted-foreground hover:text-[#c9a227]")} disabled={disabled || starred} onClick={() => onStar(selected.id)} title={starred ? `À l’étoile : ${starHint}` : `Mettre l’étoile : ${starHint}`} aria-label={starred ? "À l’étoile" : "Mettre l’étoile"}><Star fill={starred ? "currentColor" : "none"} /></Button>}
      </div>
      {(onRename && renameable(selected.id)) || onMove || (onRemove && removable(selected.id)) ? <div className="flex items-center gap-0.5">
        {onRename && renameable(selected.id)
          ? <Input value={selected.name} disabled={disabled} maxLength={60} onChange={(event) => onRename(selected.id, event.target.value)} className="h-7 min-w-0 flex-1 text-xs" aria-label={`Nom de ${the} ${noun}`} />
          : <span className="min-w-0 flex-1" />}
        {onMove && items.length > 1 && <>
          <Tool icon={ArrowUp} label="Avancer dans la liste" disabled={disabled || at <= 0} onClick={() => onMove(-1)} />
          <Tool icon={ArrowDown} label="Reculer dans la liste" disabled={disabled || at < 0 || at >= items.length - 1} onClick={() => onMove(1)} />
        </>}
        {onRemove && removable(selected.id) && <Tool icon={Trash2} label={`Retirer ${this_} ${noun}`} disabled={disabled} onClick={onRemove} className="text-destructive/70 hover:text-destructive" />}
      </div> : null}
    </> : empty}

    <div className="grid gap-1.5 border-t border-dashed pt-2">
      <div className="flex items-center justify-between gap-1">
        <p className={cn(panelTitle, "px-1")}><Bookmark className="size-3 shrink-0" />Presets</p>
        <span className="flex shrink-0 items-center">
          <Tool icon={BookmarkPlus} label={onSavePreset ? `Enregistrer ${this_} ${noun} en preset (pour tous les index)` : savePresetHint ?? "Rien à enregistrer"} disabled={disabled || !onSavePreset || !selected} onClick={() => onSavePreset?.()} />
          <Tool icon={Send} label={onCopy ? copyHint ?? "Copier vers d’autres onglets…" : copyHint ?? "Cet index n’a pas d’autre onglet"} disabled={disabled || !onCopy || !selected} onClick={() => onCopy?.()} />
          {onManagePresets && <Tool icon={Settings2} label="Gérer les presets (renommer, supprimer)" disabled={disabled} onClick={onManagePresets} />}
        </span>
      </div>
      <NativeSelect value="" disabled={disabled || !presets.length || !selected} onChange={(event) => { if (event.target.value) onApplyPreset(event.target.value) }} className="h-8 min-w-0 py-0 text-xs" aria-label="Appliquer un preset">
        <NativeSelectOption value="">{presets.length ? "Appliquer un preset…" : "Aucun preset enregistré"}</NativeSelectOption>
        {groups.map((group) => group
          ? <NativeSelectOptGroup key={group} label={group}>{presets.filter((preset) => preset.group === group).map((preset) => <NativeSelectOption key={preset.id} value={preset.id}>{preset.name}</NativeSelectOption>)}</NativeSelectOptGroup>
          : presets.filter((preset) => !preset.group).map((preset) => <NativeSelectOption key={preset.id} value={preset.id}>{preset.name}</NativeSelectOption>))}
      </NativeSelect>
    </div>
    {footer}
  </section>
}

/** Le petit bouton à droite du mot « Aperçu » : l'aperçu en grand, avec son vrai rendu. */
export function PreviewExpandButton({ onClick }: { onClick: () => void }) {
  return <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground" onClick={onClick} title="Voir l’aperçu en grand, avec son vrai rendu" aria-label="Agrandir l’aperçu"><Maximize2 /></Button>
}

/** La fenêtre de l'aperçu en grand : le titre, quelques réglages (ligne montrée, écran), et le rendu. */
export function PreviewDialog({ title, description, tools, onClose, children, className }: { title: string; description?: ReactNode; tools?: ReactNode; onClose: () => void; children: ReactNode; className?: string }) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className={cn("flex max-h-[94svh] flex-col gap-3 sm:max-w-[min(96vw,1280px)]", className)}>
      <DialogHeader className="shrink-0 pr-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
          {tools && <div className="flex flex-wrap items-center gap-1.5">{tools}</div>}
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border bg-background p-4">{children}</div>
    </DialogContent>
  </Dialog>
}

/** « Enregistrer en preset » : un nom ; un preset du même nom est remplacé. */
export function NamePresetDialog({ title, description, initialName, existing, onSave, onClose }: {
  title: string
  description: ReactNode
  initialName: string
  /** Les presets du même genre : un nom déjà pris remplace celui-là. */
  existing: VariantOption[]
  onSave: (name: string, replaceId?: string) => Promise<unknown>
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const same = existing.find((preset) => preset.name.toLocaleLowerCase("fr") === name.trim().toLocaleLowerCase("fr"))
  async function save() {
    if (!name.trim() || pending) return
    setPending(true); setError("")
    try { await onSave(name.trim(), same?.id); onClose() } catch (caught) { setError(caught instanceof Error ? caught.message : "Le preset n’a pas pu être enregistré.") }
    setPending(false)
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><BookmarkPlus className="size-4 text-primary" />{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <label className="grid gap-1.5 text-sm font-medium">Nom du preset<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus /></label>
        {same && <p className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-950">Un preset « {same.name} » existe déjà : il sera remplacé par celui-ci.</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button type="submit" disabled={pending || !name.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}{same ? "Remplacer" : "Enregistrer"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}

/** « Copier vers… » : les autres onglets de l'index, à cocher. Rien n'est écrit avant « Enregistrer ». */
export function CopyToTabsDialog({ title, description, tabs, onCopy, onClose }: { title: string; description: ReactNode; tabs: VariantOption[]; onCopy: (ids: string[]) => void; onClose: () => void }) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) => setChosen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Send className="size-4 text-primary" />{title}</DialogTitle>
        <DialogDescription>{description} Rien n’est écrit avant « Enregistrer ».</DialogDescription>
      </DialogHeader>
      <div className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border p-2">
        {tabs.map((tab) => <label key={tab.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"><Checkbox checked={chosen.has(tab.id)} onCheckedChange={() => toggle(tab.id)} />{tab.name}</label>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setChosen(new Set(tabs.map((tab) => tab.id)))}>Tout cocher</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setChosen(new Set())}>Tout décocher</Button>
        </span>
        <span className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="button" disabled={!chosen.size} onClick={() => onCopy([...chosen])}><Copy />Copier vers {chosen.size || ""} onglet{chosen.size > 1 ? "s" : ""}</Button>
        </span>
      </div>
    </DialogContent>
  </Dialog>
}

/** « Gérer » : les presets enregistrés, à renommer ou supprimer (aucun onglet n'en dépend). */
export function ManagePresetsDialog({ title, description, presets, onRename, onDelete, onClose }: { title: string; description: ReactNode; presets: Array<VariantOption & { hint?: string }>; onRename?: (id: string, name: string) => Promise<unknown>; onDelete: (id: string) => Promise<unknown>; onClose: () => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")
  async function run(key: string, action: () => Promise<unknown>) {
    setPending(key); setError("")
    try { await action() } catch (caught) { setError(caught instanceof Error ? caught.message : "Le preset n’a pas pu être modifié.") }
    setPending("")
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
    <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Bookmark className="size-4 text-primary" />{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {!presets.length && <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Aucun preset pour l’instant.</p>}
      <div className="grid gap-2">
        {presets.map((preset) => <article key={preset.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/60 p-2.5">
          {editing === preset.id && onRename
            ? <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) void run(`edit:${preset.id}`, async () => { await onRename(preset.id, draft.trim()); setEditing(null) }) }}>
              <Input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={60} aria-label="Nom du preset" className="h-8 min-w-0 flex-1" autoFocus />
              <Button type="submit" size="sm" disabled={Boolean(pending) || !draft.trim()}>{pending === `edit:${preset.id}` ? <LoaderCircle className="animate-spin" /> : <Check />}OK</Button>
            </form>
            : <>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{preset.name}</span>{preset.hint && <span className="block text-[11px] text-muted-foreground">{preset.hint}</span>}</span>
              {onRename && <Button type="button" variant="ghost" size="icon-sm" onClick={() => { setEditing(preset.id); setDraft(preset.name) }} title="Renommer" aria-label={`Renommer ${preset.name}`}><Pencil /></Button>}
              <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" disabled={Boolean(pending)} onClick={() => { if (window.confirm(`Supprimer le preset « ${preset.name} » ?`)) void run(`delete:${preset.id}`, () => onDelete(preset.id)) }} title="Supprimer" aria-label={`Supprimer ${preset.name}`}>{pending === `delete:${preset.id}` ? <LoaderCircle className="animate-spin" /> : <Trash2 />}</Button>
            </>}
        </article>)}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end"><Button type="button" variant="ghost" onClick={onClose}>Fermer</Button></div>
    </DialogContent>
  </Dialog>
}
