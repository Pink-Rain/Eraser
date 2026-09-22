"use client"

import { useEffect, useMemo, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react"
import { ArrowLeft, Backpack, Check, Coins, Gem, LoaderCircle, Link2, Minus, MoveRight, PackageOpen, Pencil, Plus, Search, Shield, Sword, Trash2, UserRound, Users, X } from "lucide-react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { ItemModifierDialog, ItemModifierSummary } from "@/components/eraser/item-modifier-editor"
import { sanitizeRichText } from "@/components/eraser/rich-text-inline-editor"
import { canItemGoInInventoryCategory, emptyCharacterInventory, type CharacterInventoryRecord, type InventoryCategory, type InventoryContainerRecord, type InventorySlotRecord, type InventoryTransferTarget } from "@/lib/inventory-schema"
import { parseItemModifiers } from "@/lib/item-modifiers"
import { evaluateRelativeExpression } from "@/lib/math-expression"

const categoryPresentation: Record<InventoryCategory, { icon: typeof Sword; color: string; singular: string; label?: string }> = {
  Armes: { icon: Sword, color: "#b9504e", singular: "un rangement d’armes" },
  Équipement: { icon: Shield, color: "#648f4e", singular: "un rangement d’équipement" },
  Esthétique: { icon: Gem, color: "#a76f9d", singular: "un rangement esthétique", label: "Purement esthétique" },
  Inventaire: { icon: Backpack, color: "#397f88", singular: "un inventaire" },
  Bourse: { icon: Coins, color: "#b48745", singular: "une bourse" },
}

const categoryDefaults: Record<InventoryCategory, { name: string; capacity: number }> = {
  Armes: { name: "Nouveau rangement d’armes", capacity: 6 },
  Équipement: { name: "Nouvel équipement", capacity: 8 },
  Esthétique: { name: "Purement esthétique", capacity: 1 },
  Inventaire: { name: "Nouveau sac", capacity: 15 },
  Bourse: { name: "Nouvelle bourse", capacity: 300 },
}

type ItemFields = { name: string; description: string; type: string; subtype: string; effect: string }
type MutationBody =
  | { action: "create-container"; name: string; category: InventoryCategory; capacity: number }
  | { action: "update-container"; containerId: string; name: string; capacity: number }
  | { action: "delete-container"; containerId: string }
  | { action: "add-item"; itemId: string; containerId: string }
  | ({ action: "create-item"; containerId: string } & ItemFields)
  | { action: "set-quantity"; slotId: string; quantity: number }
  | { action: "set-equipped"; slotId: string; equipped: boolean }
  | { action: "set-modifiers"; slotId: string; modifiers: string }
  | ({ action: "update-item"; slotId: string } & ItemFields)
  | { action: "move-item"; slotId: string; containerId: string }
  | { action: "transfer-item"; slotId: string; targetId: string }
  | { action: "set-currency"; containerId: string; currency: string; amount: number }

type Mutate = (body: MutationBody, pendingKey: string) => Promise<boolean>

function normalizedSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
}

const richTextRendering = "[&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"

function InlineField({ label, value, html = "", multiline = false, className = "", readOnly = false, onCommit }: { label: string; value: string; html?: string; multiline?: boolean; className?: string; readOnly?: boolean; onCommit: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [pending, setPending] = useState(false)
  async function save() { setPending(true); await onCommit(draft); setPending(false); setEditing(false) }
  function keyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") { setDraft(value); setEditing(false) }
    if (!multiline && event.key === "Enter") void save()
  }
  // L'objet garde la mise en forme saisie dans l'Index des objets ; la modifier
  // ici revient à saisir du texte brut, qui remplace alors cette mise en forme.
  const safeHtml = html.trim() ? sanitizeRichText(html) : ""
  const display = safeHtml
    ? <span className={richTextRendering} dangerouslySetInnerHTML={{ __html: safeHtml }} />
    : value || <span className="text-muted-foreground/45">—</span>
  if (readOnly) return <span className={`min-w-0 ${className}`}>{display}</span>
  if (!editing) return <button type="button" onDoubleClick={() => { setDraft(value); setEditing(true) }} className={`min-w-0 text-left ${className}`} title={`Double-cliquer pour modifier ${label}`}>{display}</button>
  return <div className={`flex min-w-0 items-start gap-1 ${className}`}>
    {multiline ? <Textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} className="min-h-16 border-0 bg-background/45 shadow-none" /> : <Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} className="h-8 min-w-16 border-0 bg-background/45 px-2 shadow-none" />}
    <button type="button" onClick={() => void save()} disabled={pending} className="flex size-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10" aria-label={`Enregistrer ${label}`}>{pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}</button>
    <button type="button" onClick={() => { setDraft(value); setEditing(false) }} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Annuler"><X className="size-3.5" /></button>
  </div>
}

function InventoryTransferPicker({ itemName, slotId, internalTargets, transferTargets, loading, pending, mutate, onDone }: { itemName: string; slotId: string; internalTargets: InventoryContainerRecord[]; transferTargets: InventoryTransferTarget[]; loading: boolean; pending: boolean; mutate: Mutate; onDone: () => void }) {
  const [kind, setKind] = useState<"character" | "npc" | null>(null)
  const [search, setSearch] = useState("")
  const campaignTargets = transferTargets.filter((target) => target.kind === "campaign")
  const peopleTargets = kind ? transferTargets.filter((target) => target.kind === kind && (!normalizedSearch(search) || normalizedSearch(target.name).includes(normalizedSearch(search)))) : []
  async function moveTo(targetId: string, internal = false) {
    const saved = internal
      ? await mutate({ action: "move-item", slotId, containerId: targetId }, `slot:${slotId}`)
      : await mutate({ action: "transfer-item", slotId, targetId }, `slot:${slotId}`)
    if (saved) onDone()
  }
  if (loading) return <div className="grid min-h-24 place-items-center"><LoaderCircle className="size-4 animate-spin text-muted-foreground" /></div>
  return <div className="space-y-3">
    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><MoveRight className="size-3.5" />Transférer {itemName}</div>
    {!kind ? <>
      {(internalTargets.length > 0 || campaignTargets.length > 0) && <div className="space-y-1">{internalTargets.map((target) => <button key={target.id} type="button" disabled={pending} onClick={() => void moveTo(target.id, true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><Backpack className="size-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">Dans cet inventaire · {target.name}</span></button>)}{campaignTargets.map((target) => <button key={target.id} type="button" disabled={pending} onClick={() => void moveTo(target.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><Backpack className="size-4 text-primary" /><span className="min-w-0 flex-1 truncate">Inventaire de campagne{target.campaignName ? ` · ${target.campaignName}` : ""}</span></button>)}</div>}
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" className="h-auto justify-start px-3 py-3" onClick={() => { setKind("character"); setSearch("") }}><Users /><span className="text-left">Joueur·euses</span></Button><Button type="button" variant="outline" className="h-auto justify-start px-3 py-3" onClick={() => { setKind("npc"); setSearch("") }}><UserRound /><span>PNJs</span></Button></div>
    </> : <>
      <div className="flex items-center gap-2"><Button type="button" size="icon-sm" variant="ghost" onClick={() => { setKind(null); setSearch("") }} aria-label="Revenir aux destinations"><ArrowLeft /></Button><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 pl-9" placeholder={kind === "npc" ? "Rechercher un PNJ…" : "Rechercher un·e joueur·euse…"} /></div></div>
      <div className="max-h-56 space-y-1 overflow-y-auto">{peopleTargets.length ? peopleTargets.map((target) => <button key={`${target.campaignId}:${target.id}`} type="button" disabled={pending} onClick={() => void moveTo(target.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{kind === "npc" ? <UserRound className="size-3.5" /> : <Users className="size-3.5" />}</span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{target.name}</span>{target.campaignName && <span className="block truncate text-[11px] text-muted-foreground">{target.campaignName}</span>}</span></button>) : <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucun résultat.</p>}</div>
    </>}
  </div>
}

function InventoryItemLine({ slot, container, compatibleContainers, transferTargets, targetsLoading, pending, readOnly, flat, ensureTargets, mutate }: { slot: InventorySlotRecord; container: InventoryContainerRecord; compatibleContainers: InventoryContainerRecord[]; transferTargets: InventoryTransferTarget[]; targetsLoading: boolean; pending: boolean; readOnly: boolean; flat: boolean; ensureTargets: () => Promise<void>; mutate: Mutate }) {
  const item = slot.item
  const [moving, setMoving] = useState(false)
  const [linking, setLinking] = useState(false)
  const modifiers = parseItemModifiers(slot.modifiers)
  // Équiper et lier n’ont de sens que sur une fiche de personnage : les inventaires
  // plats (campagne, PNJ) n’alimentent aucun total de compétence.
  const equippable = !readOnly && !flat && container.category !== "Bourse"
  if (!item) return null
  const visual = item.image || item.icon
  const visualIsImage = /^(?:https?:\/\/|\/)/i.test(visual)
  const update = (changes: Partial<ItemFields>) => mutate({ action: "update-item", slotId: slot.id, name: changes.name ?? item.name, description: changes.description ?? item.description, type: changes.type ?? item.type, subtype: changes.subtype ?? item.subtype, effect: changes.effect ?? item.effect }, `slot:${slot.id}`)
  const internalTargets = compatibleContainers.filter((candidate) => candidate.id !== container.id)
  return <article className="rounded-xl border border-border/55 bg-background/40 p-3 shadow-sm">
    <div className="flex items-start gap-3">
      {equippable && <Checkbox checked={slot.equipped} disabled={pending} onCheckedChange={(checked) => void mutate({ action: "set-equipped", slotId: slot.id, equipped: checked === true }, `slot:${slot.id}`)} className="mt-3" aria-label={`${slot.equipped ? "Déséquiper" : "Équiper"} ${item.name}`} title={slot.equipped ? (modifiers.length ? "Équipé — ses liens comptent dans les totaux" : "Équipé") : "Non équipé"} />}
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/70 text-muted-foreground">{visualIsImage ? <img src={visual} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : item.icon ? <span className="text-xl" aria-hidden="true">{item.icon}</span> : <PackageOpen className="size-4" />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><InlineField readOnly={readOnly} label="le nom" value={item.name} html={item.nameHtml} className="block max-w-full text-sm font-semibold" onCommit={(name) => update({ name }).then(() => undefined)} /><div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><InlineField readOnly={readOnly} label="le type" value={item.type} onCommit={(type) => update({ type }).then(() => undefined)} /><span>·</span><InlineField readOnly={readOnly} label="le sous-type" value={item.subtype} onCommit={(subtype) => update({ subtype }).then(() => undefined)} /></div></div>
          {!readOnly && <div className="inline-flex items-center gap-0.5"><button type="button" disabled={pending} onClick={() => void mutate({ action: "set-quantity", slotId: slot.id, quantity: slot.quantity - 1 }, `slot:${slot.id}`)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={`Retirer un ${item.name}`}><Minus className="size-3" /></button><span className="min-w-7 text-center text-sm font-semibold tabular-nums">{slot.quantity}<span className="text-[9px] font-normal text-muted-foreground">/{item.maxQuantity}</span></span><button type="button" disabled={pending || slot.quantity >= item.maxQuantity} onClick={() => void mutate({ action: "set-quantity", slotId: slot.id, quantity: slot.quantity + 1 }, `slot:${slot.id}`)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Ajouter un ${item.name}`}><Plus className="size-3" /></button></div>}
          {readOnly && <span className="shrink-0 text-sm font-semibold tabular-nums">×{slot.quantity}</span>}
          {equippable && <button type="button" disabled={pending} onClick={() => setLinking(true)} className={`flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-muted ${modifiers.length ? "text-primary" : "text-muted-foreground"}`} aria-label={`Lier ${item.name} à une caractéristique`} title={modifiers.length ? `${modifiers.length} lien${modifiers.length > 1 ? "s" : ""} vers des caractéristiques` : "Lier à une caractéristique ou une compétence"}><Link2 className="size-3.5" /></button>}
          {!readOnly && <Popover open={moving} onOpenChange={(open) => { setMoving(open); if (open) void ensureTargets() }}><PopoverTrigger asChild><button type="button" disabled={pending} className={`flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted ${moving ? "bg-muted text-foreground" : ""}`} aria-label={`Transférer ${item.name}`} title="Transférer"><MoveRight className="size-3.5" /></button></PopoverTrigger><PopoverContent align="end" side="bottom" className="w-80 p-3"><InventoryTransferPicker itemName={item.name} slotId={slot.id} internalTargets={internalTargets} transferTargets={transferTargets} loading={targetsLoading} pending={pending} mutate={mutate} onDone={() => setMoving(false)} /></PopoverContent></Popover>}
          {!readOnly && <AlertDialog><AlertDialogTrigger asChild><button type="button" disabled={pending} className="flex size-7 shrink-0 items-center justify-center rounded-md text-destructive/75 hover:bg-destructive/10" aria-label={`Retirer complètement ${item.name}`}><Trash2 className="size-3.5" /></button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Retirer « {item.name} » ?</AlertDialogTitle><AlertDialogDescription>Cet objet sera retiré de cet inventaire.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void mutate({ action: "set-quantity", slotId: slot.id, quantity: 0 }, `slot:${slot.id}`)}>Retirer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        </div>
        <div className="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground"><InlineField readOnly={readOnly} multiline label="la description" value={item.description} html={item.descriptionHtml} className="w-full" onCommit={(description) => update({ description }).then(() => undefined)} />{(container.category !== "Esthétique" || item.effect.trim()) && <div className="flex gap-1"><span className="font-semibold text-foreground/65">Effet :</span><InlineField readOnly={readOnly} multiline label="l’effet" value={item.effect} html={item.effectHtml} className="min-w-0 flex-1" onCommit={(effect) => update({ effect }).then(() => undefined)} /></div>}<ItemModifierSummary modifiers={modifiers} className={slot.equipped ? "" : "opacity-55"} /></div>
      </div>
    </div>
    {equippable && <ItemModifierDialog open={linking} onOpenChange={setLinking} itemName={item.name} modifiers={modifiers} pending={pending} onSave={(serialized) => mutate({ action: "set-modifiers", slotId: slot.id, modifiers: serialized }, `slot:${slot.id}`)} />}
  </article>
}

function CurrencyLine({ slot, container, readOnly, mutate }: { slot: InventorySlotRecord; container: InventoryContainerRecord; readOnly: boolean; mutate: Mutate }) {
  const currency = slot.item?.name || slot.item?.subtype || `Monnaie ${slot.index}`
  const [editing, setEditing] = useState(false)
  const [expression, setExpression] = useState(String(slot.quantity))
  const [pending, setPending] = useState(false)
  function amountFromExpression(raw: string) { try { return evaluateRelativeExpression(raw, slot.quantity) } catch { return slot.quantity } }
  async function save() { setPending(true); await mutate({ action: "set-currency", containerId: container.id, currency, amount: Math.max(0, Math.trunc(amountFromExpression(expression))) }, `currency:${slot.id}`); setPending(false); setEditing(false) }
  return <div className="flex min-w-0 flex-1 flex-col items-center rounded-xl border border-[#b4874540] bg-background/35 px-3 py-2 text-center"><span className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{currency}</span>{readOnly ? <span className="mt-1 text-lg font-semibold tabular-nums text-[#b48745]">{slot.quantity}</span> : editing ? <div className="mt-1 flex items-center gap-1"><Input autoFocus onFocus={(event) => event.currentTarget.select()} value={expression} onChange={(event) => setExpression(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") setEditing(false) }} className="h-8 w-24 border-0 bg-background/45 text-center shadow-none" placeholder="-10%, *2…" /><button type="button" onClick={() => void save()} disabled={pending} className="flex size-8 items-center justify-center rounded-md text-[#b48745] hover:bg-[#b4874515]">{pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}</button></div> : <button type="button" onClick={() => { setExpression(String(slot.quantity)); setEditing(true) }} className="mt-1 text-lg font-semibold tabular-nums text-[#b48745]" title="Valeur, +10, -10%, *2 ou /3">{slot.quantity}</button>}</div>
}

type ContainerCardProps = { container: InventoryContainerRecord; inventory: CharacterInventoryRecord; pendingKey: string; searchOpen: boolean; catalogLoading: boolean; search: string; flat: boolean; readOnly: boolean; transferTargets: InventoryTransferTarget[]; targetsLoading: boolean; setSearch: (value: string) => void; setSearchOpen: (open: boolean) => void; onCreateItem: () => void; onEdit: () => void; ensureTargets: () => Promise<void>; mutate: Mutate }

function ContainerCard({ container, inventory, pendingKey, searchOpen, catalogLoading, search, flat, readOnly, transferTargets, targetsLoading, setSearch, setSearchOpen, onCreateItem, onEdit, ensureTargets, mutate }: ContainerCardProps) {
  const presentation = categoryPresentation[container.category]
  const occupiedSlots = container.slots.filter((slot) => slot.item && slot.quantity > 0)
  const normalizedQuery = normalizedSearch(search)
  const compatibleItems = useMemo(() => inventory.items.filter((item) => flat || canItemGoInInventoryCategory(`${item.type} ${item.subtype}`, container.category)).filter((item) => !normalizedQuery || normalizedSearch(`${item.name} ${item.type} ${item.subtype}`).includes(normalizedQuery)).slice(0, 20), [container.category, flat, inventory.items, normalizedQuery])
  const pending = pendingKey.startsWith(`container:${container.id}`) || container.slots.some((slot) => pendingKey.endsWith(slot.id))
  const purse = container.category === "Bourse" && !flat
  const unlimited = container.category === "Esthétique" && !flat
  const addLabel = container.category === "Armes" ? "Arme" : container.category === "Inventaire" || flat ? "Objet" : "Équipement"
  return <article className={`${purse ? "rounded-[2rem_2rem_1.35rem_1.35rem] px-4 pb-4 pt-3" : "rounded-2xl p-3"} border bg-card/70 shadow-sm`} style={{ borderColor: `${presentation.color}55`, background: purse ? `linear-gradient(165deg, ${presentation.color}20, rgba(255,255,255,.02))` : undefined }}>
    <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-display text-lg font-semibold">{container.name}</h4>{!unlimited && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums" style={{ color: presentation.color, backgroundColor: `${presentation.color}16` }}>{container.used}/{container.capacity}</span>}{unlimited && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: presentation.color, backgroundColor: `${presentation.color}16` }}>∞</span>}</div>{!unlimited && <Progress value={Math.min(100, (container.used / Math.max(1, container.capacity)) * 100)} className="mt-2 h-1.5" />}</div>{!readOnly && !purse && <Button type="button" variant="ghost" size="sm" onClick={() => setSearchOpen(!searchOpen)} disabled={pending} className="shrink-0" style={{ color: presentation.color }}>{searchOpen ? <X /> : <Plus />}{searchOpen ? "Fermer" : addLabel}</Button>}{!readOnly && !flat && !unlimited && <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} disabled={pending} aria-label={`Modifier ${container.name}`}><Pencil /></Button>}{!readOnly && !flat && !unlimited && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" disabled={pending} className="text-destructive/75" aria-label={`Supprimer ${container.name}`}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Supprimer « {container.name} » ?</AlertDialogTitle><AlertDialogDescription>Le contenant doit être vide.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void mutate({ action: "delete-container", containerId: container.id }, `container:${container.id}:delete`)}>Supprimer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div>
    {searchOpen && !purse && <div className="mt-3 rounded-xl border bg-background/45 p-3"><div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="border-0 bg-background/55 pl-9 shadow-none" placeholder="Nom, type ou sous-type…" autoFocus disabled={catalogLoading} /></div><Button type="button" variant="outline" onClick={onCreateItem}><Plus />Créer un objet</Button></div><div className="mt-2 max-h-52 space-y-1 overflow-y-auto">{catalogLoading ? <div className="grid min-h-20 place-items-center"><LoaderCircle className="size-4 animate-spin text-muted-foreground" /></div> : compatibleItems.length ? compatibleItems.map((item) => <button type="button" key={item.id} disabled={pending} onClick={async () => { const saved = await mutate({ action: "add-item", itemId: item.id, containerId: container.id }, `container:${container.id}:item`); if (saved) setSearch("") }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"><span className="text-base">{item.icon || "◇"}</span><span className="min-w-0 flex-1 font-medium">{item.nameHtml.trim() ? <span className={richTextRendering} dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.nameHtml) }} /> : item.name}</span><span className="text-[10px] text-muted-foreground">{[item.type, item.subtype].filter(Boolean).join(" · ")}</span><Plus className="size-3.5" /></button>) : <p className="px-3 py-5 text-center text-xs text-muted-foreground">Aucun objet ne correspond à cette recherche.</p>}</div></div>}
    <div className={`${purse ? "mt-3 grid grid-cols-3 gap-2" : "mt-3 space-y-2"}`}>{purse ? container.slots.map((slot) => <CurrencyLine key={slot.id} slot={slot} container={container} readOnly={readOnly} mutate={mutate} />) : occupiedSlots.length ? occupiedSlots.map((slot) => <InventoryItemLine key={slot.id} slot={slot} container={container} compatibleContainers={inventory.containers.filter((candidate) => flat || (slot.item && canItemGoInInventoryCategory(`${slot.item.type} ${slot.item.subtype}`, candidate.category)))} transferTargets={transferTargets} targetsLoading={targetsLoading} pending={pending} readOnly={readOnly} flat={flat} ensureTargets={ensureTargets} mutate={mutate} />) : <div className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">Tous les emplacements sont libres.</div>}</div>{!purse && !unlimited && <p className="mt-2 text-right text-[10px] text-muted-foreground">{Math.max(0, container.capacity - container.used)} emplacement{container.capacity - container.used > 1 ? "s" : ""} libre{container.capacity - container.used > 1 ? "s" : ""}</p>}
  </article>
}

function CategorySection({ category, inventory, pendingKey, openSearch, catalogLoading, searches, flat, readOnly, transferTargets, targetsLoading, setSearches, openItemSearch, closeItemSearch, openContainerCreation, openContainerEdition, openItemCreation, ensureTargets, mutate }: { category: InventoryCategory; inventory: CharacterInventoryRecord; pendingKey: string; openSearch: string | null; catalogLoading: boolean; searches: Record<string, string>; flat: boolean; readOnly: boolean; transferTargets: InventoryTransferTarget[]; targetsLoading: boolean; setSearches: Dispatch<SetStateAction<Record<string, string>>>; openItemSearch: (containerId: string) => void; closeItemSearch: () => void; openContainerCreation: (category: InventoryCategory) => void; openContainerEdition: (container: InventoryContainerRecord) => void; openItemCreation: (container: InventoryContainerRecord) => void; ensureTargets: () => Promise<void>; mutate: Mutate }) {
  const presentation = categoryPresentation[category]
  const Icon = presentation.icon
  const containers = inventory.containers.filter((container) => container.category === category)
  const fixed = category === "Esthétique"
  const cards = containers.length ? containers.map((container) => <ContainerCard key={container.id} container={container} inventory={inventory} pendingKey={pendingKey} searchOpen={openSearch === container.id} catalogLoading={catalogLoading && openSearch === container.id} search={searches[container.id] || ""} flat={flat} readOnly={readOnly} transferTargets={transferTargets} targetsLoading={targetsLoading} setSearch={(value) => setSearches((current) => ({ ...current, [container.id]: value }))} setSearchOpen={(open) => open ? openItemSearch(container.id) : closeItemSearch()} onCreateItem={() => openItemCreation(container)} onEdit={() => openContainerEdition(container)} ensureTargets={ensureTargets} mutate={mutate} />) : <div className="rounded-xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">Aucun contenant.</div>
  if (flat) return <div className="space-y-3">{cards}</div>
  return <div className="rounded-[1.4rem] border p-3" style={{ borderColor: `${presentation.color}42`, background: `linear-gradient(145deg, ${presentation.color}12, rgba(255,255,255,.015))` }}><div className="mb-3 flex items-center gap-3 px-1"><div className="flex size-9 items-center justify-center rounded-xl" style={{ color: presentation.color, backgroundColor: `${presentation.color}18` }}><Icon className="size-4.5" /></div><h3 className="font-display flex-1 text-xl font-semibold" style={{ color: presentation.color }}>{presentation.label || category}</h3>{!readOnly && !fixed && <Button type="button" variant="ghost" size="icon-sm" onClick={() => openContainerCreation(category)} aria-label={`Ajouter ${presentation.singular}`}><Plus /></Button>}</div><div className="space-y-3">{cards}</div></div>
}

export function CharacterInventory({ characterId, initialInventory, endpoint, flat = false, readOnly = false, mode = "character", inventory: controlledInventory, onInventoryChange }: { characterId: string; initialInventory?: CharacterInventoryRecord; endpoint?: string; flat?: boolean; readOnly?: boolean; mode?: "character" | "npc"; inventory?: CharacterInventoryRecord | null; onInventoryChange?: (inventory: CharacterInventoryRecord) => void }) {
  // Mode contrôlé : la fiche de personnage détient l’inventaire pour que l’onglet
  // Compétences voie les mêmes objets équipés. Sinon le composant gère son état.
  const controlled = Boolean(onInventoryChange)
  const [ownInventory, setOwnInventory] = useState(initialInventory || emptyCharacterInventory())
  const inventory = controlled ? controlledInventory || emptyCharacterInventory() : ownInventory
  const [initialLoading, setInitialLoading] = useState(!initialInventory && !controlled)

  function applyInventory(next: CharacterInventoryRecord | ((current: CharacterInventoryRecord) => CharacterInventoryRecord)) {
    const resolved = typeof next === "function" ? next(inventory) : next
    if (onInventoryChange) onInventoryChange(resolved)
    else setOwnInventory(resolved)
  }
  const [pendingKey, setPendingKey] = useState("")
  const [error, setError] = useState("")
  const [addingCategory, setAddingCategory] = useState<InventoryCategory | null>(null)
  const [newContainer, setNewContainer] = useState({ name: "", capacity: "" })
  const [editingContainer, setEditingContainer] = useState<InventoryContainerRecord | null>(null)
  const [editedContainer, setEditedContainer] = useState({ name: "", capacity: "" })
  const [creatingItemFor, setCreatingItemFor] = useState<InventoryContainerRecord | null>(null)
  const [newItem, setNewItem] = useState<ItemFields>({ name: "", description: "", type: "Objet", subtype: "", effect: "" })
  const [openSearch, setOpenSearch] = useState<string | null>(null)
  const [searches, setSearches] = useState<Record<string, string>>({})
  const [catalogLoaded, setCatalogLoaded] = useState(Boolean((controlledInventory || initialInventory)?.items.length))
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [transferTargets, setTransferTargets] = useState<InventoryTransferTarget[]>([])
  const [targetsLoaded, setTargetsLoaded] = useState(false)
  const [targetsLoading, setTargetsLoading] = useState(false)
  const inventoryEndpoint = endpoint || `/api/characters/${encodeURIComponent(characterId)}/inventory`

  useEffect(() => {
    if (initialInventory || controlled) return
    let active = true
    fetch(`${inventoryEndpoint}?summary=1`).then(async (response) => ({ response, payload: (await response.json()) as { inventory?: CharacterInventoryRecord; error?: string } })).then(({ response, payload }) => { if (!active) return; if (response.ok && payload.inventory) setOwnInventory(payload.inventory); else setError(payload.error || "L’inventaire n’a pas pu être chargé.") }).catch(() => { if (active) setError("L’inventaire n’a pas pu être chargé.") }).finally(() => { if (active) setInitialLoading(false) })
    // Le résumé arrive sans le catalogue : on le complète ensuite en tâche de fond,
    // pour les objets rangés avant que leur mise en forme ne soit conservée.
    fetch(inventoryEndpoint).then(async (response) => ({ response, payload: (await response.json()) as { inventory?: CharacterInventoryRecord } })).then(({ response, payload }) => { if (active && response.ok && payload.inventory) { setOwnInventory(payload.inventory); setCatalogLoaded(true) } }).catch(() => { /* le résumé suffit à travailler */ })
    return () => { active = false }
  }, [controlled, initialInventory, inventoryEndpoint])

  async function mutate(body: MutationBody, key: string) {
    if (readOnly) return false
    setPendingKey(key); setError("")
    const response = await fetch(inventoryEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const payload = (await response.json()) as { inventory?: CharacterInventoryRecord; error?: string }
    setPendingKey("")
    if (!response.ok || !payload.inventory) { setError(payload.error || "La modification n’a pas pu être enregistrée."); return false }
    applyInventory((current) => ({ ...payload.inventory!, items: payload.inventory!.items.length ? payload.inventory!.items : current.items })); return true
  }

  async function openItemSearch(containerId: string) {
    setOpenSearch(containerId)
    if (catalogLoaded || catalogLoading) return
    setCatalogLoading(true)
    try { const response = await fetch(inventoryEndpoint); const payload = (await response.json()) as { inventory?: CharacterInventoryRecord; error?: string }; if (!response.ok || !payload.inventory) throw new Error(payload.error || "Chargement impossible."); applyInventory(payload.inventory); setCatalogLoaded(true) }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Le catalogue d’objets n’a pas pu être chargé.") }
    finally { setCatalogLoading(false) }
  }

  async function ensureTargets() {
    if (targetsLoaded || targetsLoading || readOnly) return
    setTargetsLoading(true)
    try { const response = await fetch(`${inventoryEndpoint}?targets=1`); const payload = (await response.json()) as { transferTargets?: InventoryTransferTarget[]; error?: string }; if (!response.ok) throw new Error(payload.error || "Chargement impossible."); setTransferTargets(payload.transferTargets || []); setTargetsLoaded(true) }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Les destinations n’ont pas pu être chargées.") }
    finally { setTargetsLoading(false) }
  }

  function openContainerCreation(category: InventoryCategory) { const preset = inventory.containerTypes.find((type) => type.category === category); const fallback = categoryDefaults[category]; setNewContainer({ name: preset?.name || fallback.name, capacity: String(preset?.capacity || fallback.capacity) }); setAddingCategory(category) }
  function openContainerEdition(container: InventoryContainerRecord) { setEditedContainer({ name: container.name, capacity: String(container.capacity) }); setEditingContainer(container) }
  function openItemCreation(container: InventoryContainerRecord) { const type = container.category === "Armes" ? "Arme" : container.category === "Équipement" || container.category === "Esthétique" ? "Équipement" : "Objet"; setNewItem({ name: "", description: "", type, subtype: "", effect: "" }); setCreatingItemFor(container) }
  const effectiveFlat = flat || mode === "npc"
  const sectionProps = { inventory, pendingKey, openSearch, catalogLoading, searches, flat: effectiveFlat, readOnly, transferTargets, targetsLoading, setSearches, openItemSearch: (containerId: string) => void openItemSearch(containerId), closeItemSearch: () => setOpenSearch(null), openContainerCreation, openContainerEdition, openItemCreation, ensureTargets, mutate }
  if (initialLoading) return <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
  return <section>
    {pendingKey && <div className="mb-3 flex justify-end"><LoaderCircle className="size-4 animate-spin text-muted-foreground" /></div>}
    {error && <p className="mb-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
    {effectiveFlat ? <CategorySection category="Inventaire" {...sectionProps} /> : <div className="grid items-start gap-4 xl:grid-cols-2"><div className="space-y-4"><CategorySection category="Armes" {...sectionProps} /><CategorySection category="Équipement" {...sectionProps} /><CategorySection category="Esthétique" {...sectionProps} /></div><div className="space-y-4"><CategorySection category="Bourse" {...sectionProps} /><CategorySection category="Inventaire" {...sectionProps} /></div></div>}
    <Dialog open={addingCategory !== null} onOpenChange={(open) => { if (!open) setAddingCategory(null) }}><DialogContent><DialogHeader><DialogTitle>Ajouter {addingCategory ? categoryPresentation[addingCategory].singular : "un contenant"}</DialogTitle></DialogHeader><div className="mt-2 grid gap-4">{addingCategory && inventory.containerTypes.some((type) => type.category === addingCategory) && <Label className="grid gap-1.5 text-sm font-medium">Modèle<NativeSelect value="" onChange={(event) => { const preset = inventory.containerTypes.find((type) => type.id === event.target.value); if (preset) setNewContainer({ name: preset.name, capacity: String(preset.capacity) }) }}><NativeSelectOption value="">Choisir…</NativeSelectOption>{inventory.containerTypes.filter((type) => type.category === addingCategory).map((type) => <NativeSelectOption key={type.id} value={type.id}>{type.name} · {type.capacity}</NativeSelectOption>)}</NativeSelect></Label>}<Label className="grid gap-1.5 text-sm font-medium">Nom<Input value={newContainer.name} onChange={(event) => setNewContainer((current) => ({ ...current, name: event.target.value }))} maxLength={120} /></Label><Label className="grid gap-1.5 text-sm font-medium">{addingCategory === "Bourse" ? "Capacité" : "Emplacements"}<Input type="number" min={1} max={10000} value={newContainer.capacity} onChange={(event) => setNewContainer((current) => ({ ...current, capacity: event.target.value }))} /></Label><Button type="button" disabled={!addingCategory || !newContainer.name.trim() || !Number(newContainer.capacity) || Boolean(pendingKey)} onClick={async () => { if (!addingCategory) return; const saved = await mutate({ action: "create-container", name: newContainer.name, category: addingCategory, capacity: Number(newContainer.capacity) }, `create:${addingCategory}`); if (saved) setAddingCategory(null) }}><Plus />Ajouter</Button></div></DialogContent></Dialog>
    <Dialog open={editingContainer !== null} onOpenChange={(open) => { if (!open) setEditingContainer(null) }}><DialogContent><DialogHeader><DialogTitle>Modifier le contenant</DialogTitle></DialogHeader><div className="mt-2 grid gap-4"><Label className="grid gap-1.5 text-sm font-medium">Nom<Input value={editedContainer.name} onChange={(event) => setEditedContainer((current) => ({ ...current, name: event.target.value }))} maxLength={120} /></Label><Label className="grid gap-1.5 text-sm font-medium">{editingContainer?.category === "Bourse" ? "Capacité" : "Emplacements"}<Input type="number" min={1} max={10000} value={editedContainer.capacity} onChange={(event) => setEditedContainer((current) => ({ ...current, capacity: event.target.value }))} /></Label><Button type="button" disabled={!editingContainer || !editedContainer.name.trim() || !Number(editedContainer.capacity) || Boolean(pendingKey)} onClick={async () => { if (!editingContainer) return; const saved = await mutate({ action: "update-container", containerId: editingContainer.id, name: editedContainer.name, capacity: Number(editedContainer.capacity) }, `container:${editingContainer.id}:edit`); if (saved) setEditingContainer(null) }}><Check />Enregistrer</Button></div></DialogContent></Dialog>
    <Dialog open={creatingItemFor !== null} onOpenChange={(open) => { if (!open) setCreatingItemFor(null) }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Créer un objet</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Label className="grid gap-1.5 text-sm font-medium">Nom<Input value={newItem.name} onChange={(event) => setNewItem((current) => ({ ...current, name: event.target.value }))} maxLength={160} autoFocus /></Label><Label className="grid gap-1.5 text-sm font-medium">Type<Input value={newItem.type} onChange={(event) => setNewItem((current) => ({ ...current, type: event.target.value }))} placeholder="Arme, équipement, ressource…" /></Label><Label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Sous-type<Input value={newItem.subtype} onChange={(event) => setNewItem((current) => ({ ...current, subtype: event.target.value }))} /></Label><Label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Description<Textarea value={newItem.description} onChange={(event) => setNewItem((current) => ({ ...current, description: event.target.value }))} className="min-h-24" maxLength={1200} /></Label><Label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Effet<Textarea value={newItem.effect} onChange={(event) => setNewItem((current) => ({ ...current, effect: event.target.value }))} className="min-h-24" maxLength={1200} /></Label><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setCreatingItemFor(null)}>Annuler</Button><Button type="button" disabled={!creatingItemFor || !newItem.name.trim() || Boolean(pendingKey)} onClick={async () => { if (!creatingItemFor) return; const saved = await mutate({ action: "create-item", containerId: creatingItemFor.id, ...newItem }, `container:${creatingItemFor.id}:item`); if (saved) { setCreatingItemFor(null); setOpenSearch(null) } }}><Plus />Créer et ajouter</Button></div></div></DialogContent></Dialog>
  </section>
}
