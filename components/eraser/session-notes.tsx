"use client"

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react"
import {
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  CircleEllipsis,
  CircleHelp,
  Flag,
  Gem,
  Hexagon,
  Link2,
  LoaderCircle,
  MapPin,
  MessageCircleMore,
  NotebookPen,
  PawPrint,
  Pencil,
  Plus,
  Quote,
  Search,
  Sparkles,
  Store,
  Trash2,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { loadWorldIndexNames } from "@/components/eraser/index-cells"
import { announceCampaignChange } from "@/lib/campaign-live"
import type { ChoiceSource } from "@/lib/index-columns"
import {
  canEditSessionNote,
  sessionLinkKind,
  sessionNoteLabel,
  sessionNoteType,
  sessionNoteTypes,
  sessionQuestChains,
  type SessionLinkKind,
  type SessionNote,
  type SessionNoteType,
} from "@/lib/session-note-rules"
import { cn } from "@/lib/utils"

export type JournalEntity = { id: string; name: string; image?: string; hint?: string }
/** Ce à quoi une note peut se lier, en plus des autres notes et des index (lieux, créatures). */
export type SessionNoteEntities = { characters: JournalEntity[]; npcs: JournalEntity[]; shops: JournalEntity[]; events: JournalEntity[] }
export type JournalSessionRef = { id: string; name: string; createdAt?: string }
export type SessionNotesViewer = { uid: string; manager: boolean; characterIds: string[] }

/** La teinte d'un élément (type de note, genre de lien) : lue par « text-tone », « bg-tone/10 »… */
export const tone = (color: string) => ({ "--tc": color }) as CSSProperties

/** Chaque genre de lien : son nom, son icône et sa teinte, les mêmes partout dans le journal. */
export const linkKindLabels: Record<SessionLinkKind, { one: string; many: string; icon: LucideIcon; color: string }> = {
  character: { one: "Personnage", many: "Groupe", icon: Users, color: "#8d6618" },
  npc: { one: "PNJ", many: "PNJs", icon: UserRound, color: "#3b5c8a" },
  place: { one: "Lieu", many: "Lieux", icon: MapPin, color: "#2f7558" },
  creature: { one: "Créature", many: "Créatures", icon: PawPrint, color: "#a3402f" },
  item: { one: "Objet", many: "Objets", icon: Gem, color: "#8a5a2b" },
  shop: { one: "Magasin", many: "Magasins", icon: Store, color: "#6a4a8a" },
  event: { one: "Événement", many: "Événements", icon: Sparkles, color: "#a1561d" },
  note: { one: "Note", many: "Notes", icon: NotebookPen, color: "#6d645a" },
}

/** L'icône de chaque type de note (la couleur vient de `sessionNoteTypes`). */
export const noteTypeIcons: Record<SessionNoteType, LucideIcon> = {
  resume: BookOpen,
  evenement: Sparkles,
  citation: Quote,
  quete: Flag,
  pense: Bookmark,
  indice: Search,
  butin: Gem,
  rumeur: MessageCircleMore,
  question: CircleHelp,
  mj: Hexagon,
  autre: CircleEllipsis,
}

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").trim()

/** Un emplacement vide : toujours le même cadre, une icône, une phrase et parfois un bouton. */
export function EmptyHint({ icon: Icon, children, action, className }: { icon?: LucideIcon; children: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-border/90 bg-card/40 px-4 py-3.5 text-sm text-muted-foreground", className)}>
    {Icon && <Icon className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />}
    <p className="min-w-0 flex-1">{children}</p>
    {action}
  </div>
}

/* ---------- Échanges avec le serveur ---------- */

export async function saveSessionNoteRequest(campaignId: string, note: Partial<SessionNote>) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/session-notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }) })
  const payload = (await response.json().catch(() => ({}))) as { note?: SessionNote; error?: string }
  if (!response.ok || !payload.note) throw new Error(payload.error || "La note n’a pas pu être enregistrée.")
  // Les autres pages ouvertes sur la campagne la reçoivent tout de suite (une note publique seulement).
  announceCampaignChange(campaignId, { kind: "note", note: payload.note })
  return payload.note
}

async function deleteSessionNoteRequest(campaignId: string, noteId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/session-notes?note=${encodeURIComponent(noteId)}`, { method: "DELETE" })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(payload.error || "La note n’a pas pu être supprimée.")
  announceCampaignChange(campaignId, { kind: "note-deleted", noteId })
}

/** Cocher ou décocher une étape de quête : cochée dans la session affichée. */
/** L'étape de quête cochée (ou décochée) telle qu'elle sera enregistrée. */
function tickedQuest(step: SessionNote, done: boolean, sessionId: string): SessionNote {
  return { ...step, quest: { after: step.quest?.after ?? "", done, doneIn: done ? sessionId : "" } }
}

function tickQuestRequest(campaignId: string, step: SessionNote, done: boolean, sessionId: string) {
  return saveSessionNoteRequest(campaignId, tickedQuest(step, done, sessionId))
}

/* ---------- Liens ---------- */

/** Le nom affiché d'un lien (« npc:ID » → nom du PNJ) ; `null` si l'élément a disparu. */
export function useLinkLabel(entities: SessionNoteEntities, notes: SessionNote[]) {
  return useMemo(() => {
    const byKind: Partial<Record<SessionLinkKind, Map<string, string>>> = {
      character: new Map(entities.characters.map((entry) => [entry.id, entry.name])),
      npc: new Map(entities.npcs.map((entry) => [entry.id, entry.name])),
      shop: new Map(entities.shops.map((entry) => [entry.id, entry.name])),
      event: new Map(entities.events.map((entry) => [entry.id, entry.name])),
      note: new Map(notes.map((note) => [note.id, sessionNoteLabel(note, 40)])),
    }
    return (link: string) => {
      const kind = sessionLinkKind(link)
      if (!kind) return null
      const value = link.slice(kind.length + 1)
      const map = byKind[kind]
      return { kind, label: map ? map.get(value) ?? null : value }
    }
  }, [entities, notes])
}

/** Une puce de lien : l'icône et la teinte du genre, le nom ; cliquable ou retirable au besoin. */
export function LinkChip({ kind, label, onRemove, onClick }: { kind: SessionLinkKind; label: string; onRemove?: () => void; onClick?: () => void }) {
  const meta = linkKindLabels[kind]
  const content = <>
    <meta.icon className="size-3 shrink-0 text-tone" aria-hidden />
    <span className="sr-only">{meta.one} : </span>
    <span className="truncate">{label}</span>
  </>
  return <span title={`${meta.one} · ${label}`} style={tone(meta.color)} className={cn("inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-border/80 bg-card px-1.5 text-[11.5px] leading-[1.35rem] text-foreground/80 transition-colors hover:border-tone/50 hover:text-foreground", kind === "note" && "border-dashed")}>
    {onClick ? <button type="button" onClick={onClick} className="flex min-w-0 items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">{content}</button> : content}
    {onRemove && <button type="button" onClick={onRemove} className="-mr-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label={`Retirer ${label}`}><X className="size-3" /></button>}
  </span>
}

const indexSource = (index: "places" | "creatures") => ({ index, tab: "" }) as ChoiceSource

/** Choisir des liens : le groupe, les PNJs, les lieux et créatures des index, les magasins, les événements, les autres notes. */
function LinkPicker({ value, onChange, entities, notes, sessions, selfId }: { value: string[]; onChange: (links: string[]) => void; entities: SessionNoteEntities; notes: SessionNote[]; sessions: JournalSessionRef[]; selfId: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [indexNames, setIndexNames] = useState<{ place: string[]; creature: string[] } | null>(null)
  const labelOf = useLinkLabel(entities, notes)
  useEffect(() => {
    if (!open || indexNames) return
    let alive = true
    void Promise.all([loadWorldIndexNames(indexSource("places")).catch(() => []), loadWorldIndexNames(indexSource("creatures")).catch(() => [])])
      .then(([place, creature]) => { if (alive) setIndexNames({ place, creature }) })
    return () => { alive = false }
  }, [open, indexNames])
  const number = new Map(sessions.map((session, index) => [session.id, index + 1]))
  const groups: Array<{ kind: SessionLinkKind; items: Array<{ link: string; label: string; hint?: string }> }> = [
    { kind: "character", items: entities.characters.map((entry) => ({ link: `character:${entry.id}`, label: entry.name, hint: entry.hint })) },
    { kind: "npc", items: entities.npcs.map((entry) => ({ link: `npc:${entry.id}`, label: entry.name, hint: entry.hint })) },
    { kind: "place", items: (indexNames?.place ?? []).map((name) => ({ link: `place:${name}`, label: name })) },
    { kind: "creature", items: (indexNames?.creature ?? []).map((name) => ({ link: `creature:${name}`, label: name })) },
    { kind: "shop", items: entities.shops.map((entry) => ({ link: `shop:${entry.id}`, label: entry.name })) },
    { kind: "event", items: entities.events.map((entry) => ({ link: `event:${entry.id}`, label: entry.name, hint: entry.hint })) },
    { kind: "note", items: notes.filter((note) => note.id !== selfId).map((note) => ({ link: `note:${note.id}`, label: sessionNoteLabel(note, 70), hint: `S${number.get(note.sessionId) ?? "?"} · ${sessionNoteType(note.type).label}` })) },
  ]
  const folded = fold(query)
  const shown = groups.map((group) => ({ ...group, items: group.items.filter((item) => !folded || fold(`${item.label} ${item.hint ?? ""}`).includes(folded)).slice(0, folded ? 40 : 12) })).filter((group) => group.items.length)
  const selected = new Set(value)
  const toggle = (link: string) => onChange(selected.has(link) ? value.filter((entry) => entry !== link) : [...value, link])
  return <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card/60 p-1.5">
    {value.map((link) => {
      const found = labelOf(link)
      return found ? <LinkChip key={link} kind={found.kind} label={found.label ?? "introuvable"} onRemove={() => toggle(link)} /> : null
    })}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button type="button" variant="outline" size="xs" className="border-dashed"><Link2 />{value.length ? "Ajouter un lien" : "Lier à…"}</Button></PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] rounded-xl border-border/80 p-2">
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un nom, un lieu, une note…" className="pl-8" aria-label="Chercher un élément ou une note à lier" /></div>
        <div className="mt-2 max-h-[min(22rem,55svh)] space-y-2 overflow-y-auto overscroll-contain scrollbar-thin">
          {shown.map((group) => {
            const meta = linkKindLabels[group.kind]
            return <div key={group.kind} style={tone(meta.color)}>
              <p className="sticky top-0 z-[1] flex items-center gap-1.5 bg-popover px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><meta.icon className="size-3 text-tone" aria-hidden />{meta.many}</p>
              {group.items.map((item) => <button key={item.link} type="button" onClick={() => toggle(item.link)} aria-pressed={selected.has(item.link)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/70", selected.has(item.link) && "bg-tone/10")}>
                <span className="min-w-0 flex-1 truncate">{item.label}{item.hint && <span className="ml-2 text-xs text-muted-foreground">{item.hint}</span>}</span>
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", selected.has(item.link) ? "border-tone bg-tone text-white" : "border-border")} aria-hidden>{selected.has(item.link) && <Check className="size-3" strokeWidth={3} />}</span>
              </button>)}
            </div>
          })}
          {!indexNames && <p className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Lieux et créatures des index…</p>}
          {query.trim() && <button type="button" onClick={() => { toggle(`item:${query.trim()}`); setQuery("") }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"><Plus className="size-4" />Lier l’objet « {query.trim()} »</button>}
        </div>
      </PopoverContent>
    </Popover>
  </div>
}

/* ---------- Fenêtre d'une note ---------- */

export type NoteDraft = Partial<SessionNote> & { sessionId: string; type: SessionNoteType }

export function SessionNoteDialog({ draft, onClose, onSaved, campaignId, sessions, notes, entities, privateFor }: {
  draft: NoteDraft | null
  onClose: () => void
  onSaved: (note: SessionNote) => void
  campaignId: string
  sessions: JournalSessionRef[]
  notes: SessionNote[]
  entities: SessionNoteEntities
  /** Note privée de ce personnage (fiche) ; sinon une note publique du journal. */
  privateFor?: string
}) {
  const [form, setForm] = useState<NoteDraft | null>(draft)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [seen, setSeen] = useState(draft)
  if (seen !== draft) { setSeen(draft); setForm(draft); setError("") }
  if (!form) return null
  const type = sessionNoteType(form.type)
  const TypeIcon = noteTypeIcons[type.key]
  const editing = Boolean(form.id && notes.some((note) => note.id === form.id))
  const rank = new Map(sessions.map((session, index) => [session.id, index]))
  const chains = sessionQuestChains(notes, sessions.map((session) => session.id))
  const update = (patch: Partial<NoteDraft>) => setForm((current) => current ? { ...current, ...patch } : current)
  async function submit() {
    if (!form) return
    setPending(true); setError("")
    try {
      const saved = await saveSessionNoteRequest(campaignId, {
        ...form,
        id: form.id || crypto.randomUUID(),
        private: Boolean(privateFor),
        characterId: privateFor || form.characterId || "",
        quest: form.type === "quete" ? { done: form.quest?.done ?? false, doneIn: form.quest?.done ? form.quest?.doneIn || form.sessionId : "", after: form.quest?.after ?? "" } : null,
      })
      onSaved(saved)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "La note n’a pas pu être enregistrée.") }
    setPending(false)
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
    <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-display text-xl">{editing ? "Modifier la note" : privateFor ? "Nouvelle note privée" : "Nouvelle note de session"}</DialogTitle>
        <DialogDescription>{privateFor ? "Seul toi la liras, dans la fiche de ton personnage." : "Elle va dans le journal de la campagne : toute la table la lit."}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">Session
            <NativeSelect value={form.sessionId} onChange={(event) => update({ sessionId: event.target.value })} className="w-full">
              {sessions.map((session, index) => ({ session, index })).reverse().map(({ session, index }) => <NativeSelectOption key={session.id} value={session.id}>S{index + 1} · {session.name}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm font-medium">Type
            <NativeSelect value={form.type} onChange={(event) => update({ type: event.target.value as SessionNoteType })} className="w-full">
              {sessionNoteTypes.map((entry) => <NativeSelectOption key={entry.key} value={entry.key}>{entry.label}</NativeSelectOption>)}
            </NativeSelect>
          </label>
        </div>
        <p className="-mt-1 flex items-center gap-2 text-xs text-muted-foreground" style={tone(type.color)}>
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-tone/12 text-tone" aria-hidden><TypeIcon className="size-3" /></span>{type.help}
        </p>
        {type.title && <label className="grid gap-1 text-sm font-medium">{type.title}<Input value={form.title ?? ""} maxLength={140} onChange={(event) => update({ title: event.target.value })} /></label>}
        {form.type === "evenement" && <label className="grid gap-1 text-sm font-medium">Moment <span className="text-xs font-normal text-muted-foreground">(facultatif : « À l’aube », « Pendant le combat »)</span><Input value={form.moment ?? ""} maxLength={60} onChange={(event) => update({ moment: event.target.value })} /></label>}
        <label className="grid gap-1 text-sm font-medium">{form.type === "citation" ? "La réplique" : "Texte"}<Textarea autoFocus value={form.text ?? ""} maxLength={4000} rows={4} onChange={(event) => update({ text: event.target.value })} /></label>
        {form.type === "quete" && <div className="grid gap-2 rounded-xl border border-tone/25 bg-tone/5 p-3" style={tone(type.color)}>
          <label className="grid gap-1 text-sm font-medium">Suite de
            <NativeSelect value={form.quest?.after ?? ""} onChange={(event) => update({ quest: { done: form.quest?.done ?? false, doneIn: form.quest?.doneIn ?? "", after: event.target.value } })} className="w-full">
              <NativeSelectOption value="">Aucune : c’est une nouvelle quête</NativeSelectOption>
              {chains.flatMap((chain) => chain.steps)
                .filter((step) => step.id !== form.id && (rank.get(step.sessionId) ?? 0) <= (rank.get(form.sessionId) ?? 0))
                .map((step) => <NativeSelectOption key={step.id} value={step.id}>S{(rank.get(step.sessionId) ?? 0) + 1} · {sessionNoteLabel(step, 52)}{step.quest?.done ? " ✓" : ""}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-done" checked={form.quest?.done ?? false} onChange={(event) => update({ quest: { after: form.quest?.after ?? "", doneIn: event.target.checked ? form.quest?.doneIn || form.sessionId : "", done: event.target.checked } })} />Accomplie</label>
        </div>}
        <div className="grid gap-1 text-sm font-medium">Liens
          <LinkPicker value={form.links ?? []} onChange={(links) => update({ links })} entities={entities} notes={notes} sessions={sessions} selfId={form.id ?? ""} />
        </div>
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Annuler</Button>
        <Button type="button" disabled={pending || !(form.text?.trim() || form.title?.trim())} onClick={() => void submit()}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}{editing ? "Enregistrer" : "Ajouter"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

/* ---------- Case de quête ---------- */

/** Une case à cocher ronde aux couleurs des quêtes ; verte une fois accomplie. */
export function QuestCheckbox({ checked, disabled, label, onChange, className }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void; className?: string }) {
  return <span className={cn("relative inline-flex size-5 shrink-0", className)} style={tone(sessionNoteType("quete").color)}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} aria-label={label}
      className="peer size-5 cursor-pointer appearance-none rounded-md border-[1.5px] border-tone/80 bg-card transition-colors checked:border-done checked:bg-done hover:border-tone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60" />
    <Check className="pointer-events-none absolute inset-0 m-auto hidden size-3.5 text-white peer-checked:block" strokeWidth={3} aria-hidden />
  </span>
}

/* ---------- Liste des notes ---------- */

const openedKey = (scope: string) => `eraser-session-notes-open:${scope}`
function readOpened(scope: string) {
  try { const value = JSON.parse(window.localStorage.getItem(openedKey(scope)) || "[]") as unknown; return new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []) } catch { return new Set<string>() }
}
function writeOpened(scope: string, opened: Set<string>) {
  try { window.localStorage.setItem(openedKey(scope), JSON.stringify([...opened])) } catch { /* confort seulement */ }
}

function NoteRow({ note, sessionNumber, canEdit, linkLabel, onEdit, onDelete, onJump, onTick, expanded, onToggle, flash, order, author }: {
  /** Qui l'a écrite, en étiquette : le personnage de l'auteur dans la session, ou « MJ - pseudo ». */
  author: string
  note: SessionNote
  sessionNumber: (id: string) => number
  canEdit: boolean
  linkLabel: ReturnType<typeof useLinkLabel>
  onEdit: () => void
  onDelete: () => void
  onJump: (noteId: string) => void
  onTick: (done: boolean) => void
  expanded: boolean
  onToggle: () => void
  flash: boolean
  /** Événement : sa place dans la frise de la session. */
  order: number
}) {
  const type = sessionNoteType(note.type)
  const TypeIcon = noteTypeIcons[note.type]
  const links = note.links.flatMap((link) => { const found = linkLabel(link); return found?.label ? [{ link, ...found, label: found.label }] : [] })
  const quest = note.type === "quete" ? note.quest : null
  const citation = note.type === "citation"
  // La deuxième ligne, propre au type : place dans la frise, auteur d'une réplique, état d'une quête.
  const second = note.type === "evenement" ? `n°${order}${note.moment ? ` · ${note.moment}` : ""}`
    : citation && note.title ? `— ${note.title}`
    : quest ? (quest.done ? (quest.doneIn && quest.doneIn !== note.sessionId ? `accomplie · cochée en S${sessionNumber(quest.doneIn)}` : "accomplie") : "en cours")
    : ""
  return <li id={`note-${note.id}`} tabIndex={-1} style={tone(type.color)} className={cn("scroll-mt-6 rounded-lg border border-transparent outline-none transition-colors", expanded ? "border-border/80 bg-background/80 shadow-xs" : "hover:bg-background/60", flash && "journal-flash")}>
    <div className="flex items-start gap-2 py-1.5 pl-1.5 pr-1">
      {quest ? <QuestCheckbox className="mt-px" checked={quest.done} disabled={!canEdit} onChange={onTick} label={`${sessionNoteLabel(note, 60)} : accomplie`} />
        : <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md bg-tone/12 text-tone" aria-hidden><TypeIcon className="size-3" /></span>}
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="group/row flex min-w-0 flex-1 items-start gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <span className="min-w-0 flex-1">
          {citation
            ? <span className={cn("block font-display text-[13.5px] italic leading-snug", !expanded && "line-clamp-2")}>« {note.text || note.title} »</span>
            : <span className={cn("block text-[13px] leading-snug", !expanded && "line-clamp-2")}>
              {note.title && <span className={cn("font-semibold", expanded && "mb-0.5 block font-display text-[15px] leading-tight")}>{note.title}{!expanded && note.text ? " " : ""}</span>}
              {note.text && <span className={cn(expanded ? "whitespace-pre-wrap" : note.title && "text-muted-foreground")}>{note.text}</span>}
            </span>}
          {second && <span className={cn("mt-0.5 block truncate text-[11.5px] text-muted-foreground", (note.type === "evenement" || quest) && "font-medium text-tone", quest?.done && "text-done")}>{second}</span>}
        </span>
        {!expanded && links.length > 0 && <span className="mt-0.5 flex shrink-0 items-center gap-0.5 rounded px-1 text-[11px] tabular-nums text-muted-foreground" title={`${links.length} lien${links.length > 1 ? "s" : ""}`}><Link2 className="size-3" aria-hidden />{links.length}<span className="sr-only"> lien{links.length > 1 ? "s" : ""}</span></span>}
        <ChevronDown className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-40 transition-[transform,opacity] group-hover/row:opacity-100", expanded ? "opacity-100" : "-rotate-90")} aria-hidden />
      </button>
    </div>
    {expanded && <div className="space-y-2 pb-2.5 pl-9 pr-2.5 text-sm">
      {links.length > 0 && <div className="flex flex-wrap gap-1">{links.map((link) => <LinkChip key={link.link} kind={link.kind} label={link.label} onClick={link.kind === "note" ? () => onJump(link.link.slice(5)) : undefined} />)}</div>}
      {/* Le type est déjà le nom du groupe : seuls l'auteur et deux icônes restent. */}
      <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
        {author ? <span title={`${citation ? "Notée" : "Écrite"} par ${author}`} className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-2 leading-5"><UserRound className="size-3 shrink-0" aria-hidden /><span className="truncate">{author}</span></span> : <span />}
        {canEdit && <span className="-mr-1 flex shrink-0 gap-0.5">
          <Button type="button" size="icon-xs" variant="ghost" onClick={onEdit} aria-label="Modifier la note" title="Modifier"><Pencil /></Button>
          <Button type="button" size="icon-xs" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} aria-label="Supprimer la note" title="Supprimer"><Trash2 /></Button>
        </span>}
      </div>
    </div>}
  </li>
}

/** Ce que le journal demande à la liste des notes : montrer une note, en écrire une, chercher. */
export type SessionNotesHandle = {
  focusNote: (noteId: string) => void
  newNote: (type: SessionNoteType, patch?: Partial<NoteDraft>) => void
  focusSearch: () => void
}

/**
 * Les notes d'une session, rangées par type, repliées à l'ouverture (on retient seulement les
 * groupes que tu ouvres). Le journal de la campagne y range les notes publiques ; la fiche d'un
 * personnage, ses notes privées (`privateFor`).
 */
export function SessionNotesBoard({ campaignId, sessions, sessionId, notes, onNotesChange, entities, viewer, privateFor, title = "Notes de session", className, newInLatest = false, toolbar, id, handle, authorLabel }: {
  /** L'étiquette de l'auteur d'une note (le journal : son personnage dans la session) ; sinon son nom. */
  authorLabel?: (note: SessionNote) => string
  campaignId: string
  sessions: JournalSessionRef[]
  sessionId: string
  notes: SessionNote[]
  onNotesChange: (notes: SessionNote[]) => void
  entities: SessionNoteEntities
  viewer: SessionNotesViewer
  privateFor?: string
  title?: string
  className?: string
  /** Ce qui se place à côté de la recherche (le choix « Mon perso / Campagne » de la fiche). */
  toolbar?: ReactNode
  /** Une nouvelle note va par défaut dans la dernière session (fiche), sinon dans celle affichée. */
  newInLatest?: boolean
  /** L'ancre du panneau (le journal y renvoie depuis son bilan). */
  id?: string
  handle?: Ref<SessionNotesHandle>
}) {
  const scope = privateFor ? `private:${privateFor}` : `campaign:${campaignId}`
  const [opened, setOpened] = useState<Set<string>>(() => new Set())
  // Les groupes ouverts la dernière fois, lus après l'affichage (le serveur ne les connaît pas).
  useEffect(() => {
    const timer = window.setTimeout(() => setOpened(readOpened(scope)), 0)
    return () => window.clearTimeout(timer)
  }, [scope])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<SessionNoteType | "">("")
  const [draft, setDraft] = useState<NoteDraft | null>(null)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const linkLabel = useLinkLabel(entities, notes)
  const number = useMemo(() => new Map(sessions.map((session, index) => [session.id, index + 1])), [sessions])
  const sessionNumber = (value: string) => number.get(value) ?? 0
  const folded = fold(search)
  const here = notes.filter((note) => note.sessionId === sessionId)
  const counts = new Map<SessionNoteType, number>()
  for (const note of here) counts.set(note.type, (counts.get(note.type) ?? 0) + 1)
  // Un filtre sans note dans cette session (après un changement de session) ne cache rien.
  const activeFilter = filter && counts.has(filter) ? filter : ""
  const visible = here
    .filter((note) => !activeFilter || note.type === activeFilter)
    .filter((note) => !folded || fold(`${note.title} ${note.text} ${note.moment} ${note.authorName} ${authorLabel ? authorLabel(note) : ""}`).includes(folded))
  const groups = sessionNoteTypes.map((type) => ({ type, notes: visible.filter((note) => note.type === type.key) })).filter((group) => group.notes.length)
  const eventOrder = new Map(here.filter((note) => note.type === "evenement").map((note, index) => [note.id, index + 1]))
  const toggleGroup = (key: string, open: boolean) => setOpened((current) => {
    const next = new Set(current)
    if (open) next.add(key); else next.delete(key)
    writeOpened(scope, next)
    return next
  })
  const toggleNote = (noteId: string) => setExpanded((current) => { const next = new Set(current); if (next.has(noteId)) next.delete(noteId); else next.add(noteId); return next })
  const newDraft = (type: SessionNoteType, patch: Partial<NoteDraft> = {}) => setDraft({ sessionId: (newInLatest ? sessions.at(-1)?.id : sessionId) || sessions.at(-1)?.id || "", type, links: [], ...patch })
  function jump(noteId: string) {
    const note = notes.find((entry) => entry.id === noteId)
    if (!note) return
    if (note.sessionId !== sessionId) window.dispatchEvent(new CustomEvent("eraser-journal-go", { detail: note.sessionId }))
    // La note doit se voir : on lève le filtre et la recherche qui la cacheraient.
    if (filter && filter !== note.type) setFilter("")
    if (folded) setSearch("")
    toggleGroup(note.type, true)
    setExpanded((current) => new Set(current).add(noteId))
    setFlash(noteId)
    window.setTimeout(() => setFlash((current) => current === noteId ? "" : current), 1700)
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    window.setTimeout(() => {
      const row = document.getElementById(`note-${noteId}`)
      row?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" })
      row?.focus({ preventScroll: true })
    }, 80)
  }
  useImperativeHandle(handle, () => ({
    focusNote: jump,
    newNote: newDraft,
    focusSearch: () => searchRef.current?.focus({ preventScroll: true }),
  }))
  async function remove(note: SessionNote) {
    if (!window.confirm(`Supprimer la note « ${sessionNoteLabel(note, 50)} » ?`)) return
    setError("")
    // Retirée tout de suite ; un refus la remet à sa place.
    const before = notes
    onNotesChange(notes.filter((entry) => entry.id !== note.id))
    try {
      await deleteSessionNoteRequest(campaignId, note.id)
    } catch (caught) {
      onNotesChange(before)
      setError(caught instanceof Error ? caught.message : "Suppression impossible.")
    }
  }
  async function tick(note: SessionNote, done: boolean) {
    setError("")
    // Cochée tout de suite ; un refus remet la case comme elle était.
    const shown = notes.map((entry) => entry.id === note.id ? tickedQuest(note, done, sessionId) : entry)
    onNotesChange(shown)
    try {
      const saved = await tickQuestRequest(campaignId, note, done, sessionId)
      onNotesChange(shown.map((entry) => entry.id === saved.id ? saved : entry))
    } catch (caught) {
      onNotesChange(shown.map((entry) => entry.id === note.id ? note : entry))
      setError(caught instanceof Error ? caught.message : "La quête n’a pas pu être cochée.")
    }
  }
  function saved(note: SessionNote) {
    onNotesChange(notes.some((entry) => entry.id === note.id) ? notes.map((entry) => entry.id === note.id ? note : entry) : [...notes, note])
    toggleGroup(note.type, true)
    setExpanded((current) => new Set(current).add(note.id))
    setDraft(null)
    setFlash(note.id)
    window.setTimeout(() => setFlash((current) => current === note.id ? "" : current), 1700)
  }
  const filtering = Boolean(folded || activeFilter)
  return <section id={id} tabIndex={-1} className={cn("journal-notes scroll-mt-6 rounded-2xl border border-border/70 bg-card p-3.5 shadow-[0_1px_2px_rgb(67_50_31/0.06)] outline-none", className)} aria-label={title}>
    <div className="flex items-center gap-2.5 border-b border-border/70 pb-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-journal/10 text-journal-ink" aria-hidden><NotebookPen className="size-4" /></span>
      <h2 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{title}</h2>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{here.length}<span className="sr-only"> note{here.length > 1 ? "s" : ""}</span></span>
    </div>
    <Button type="button" className="mt-3 w-full" disabled={!sessions.length} onClick={() => newDraft("resume")}><Plus />Ajouter une note</Button>
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <div className="relative min-w-[8rem] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input ref={searchRef} id={id ? `${id}-search` : undefined} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Chercher…" className="h-8 bg-background/60 pl-8 text-sm" aria-label="Chercher dans les notes" /></div>
      {counts.size > 1 && <span style={activeFilter ? tone(sessionNoteType(activeFilter).color) : undefined}>
        <NativeSelect size="sm" value={activeFilter} onChange={(event) => setFilter(event.target.value as SessionNoteType | "")} aria-label="Filtrer les notes par type" className={cn("max-w-[9.5rem] bg-background/60 text-sm", activeFilter && "border-tone/60 bg-tone/10 font-semibold")}>
          <NativeSelectOption value="">Tous · {here.length}</NativeSelectOption>
          {sessionNoteTypes.filter((type) => counts.has(type.key)).map((type) => <NativeSelectOption key={type.key} value={type.key}>{type.many} · {counts.get(type.key)}</NativeSelectOption>)}
        </NativeSelect>
      </span>}
      {toolbar}
    </div>
    {error && <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
    {groups.length ? <ul className="mt-2.5 space-y-0.5">{groups.map(({ type, notes: list }) => {
      const open = filtering || opened.has(type.key)
      const GroupIcon = noteTypeIcons[type.key]
      return <li key={type.key} style={tone(type.color)}>
        <details open={open} onToggle={(event) => { if (!filtering) toggleGroup(type.key, (event.currentTarget as HTMLDetailsElement).open) }} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground outline-none select-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" aria-hidden />
            <GroupIcon className="size-3.5 text-tone" aria-hidden />
            <span className="flex-1 text-foreground/80">{list.length > 1 ? type.many : type.label}</span>
            <span className="font-semibold tracking-normal tabular-nums">{list.length}</span>
          </summary>
          <ul className="mb-1.5 space-y-px">{list.map((note) => <NoteRow key={note.id} note={note} sessionNumber={sessionNumber} canEdit={canEditSessionNote(note, viewer)} linkLabel={linkLabel}
            expanded={expanded.has(note.id)} onToggle={() => toggleNote(note.id)} onJump={jump} flash={flash === note.id} order={eventOrder.get(note.id) ?? 0}
            onTick={(done) => void tick(note, done)} onEdit={() => setDraft({ ...note })} onDelete={() => void remove(note)} author={authorLabel ? authorLabel(note) : note.authorName} />)}</ul>
        </details>
      </li>
    })}</ul>
      : <EmptyHint icon={folded ? Search : NotebookPen} className="mt-3">{folded ? `Aucune note ne contient « ${search.trim()} ».` : privateFor ? "Aucune note privée pour cette session." : "Aucune note pour cette session. La première peut être un résumé."}</EmptyHint>}
    <SessionNoteDialog draft={draft} onClose={() => setDraft(null)} onSaved={saved} campaignId={campaignId} sessions={sessions} notes={notes} entities={entities} privateFor={privateFor} />
  </section>
}

/* ---------- Quêtes ---------- */

/** Les quêtes en chaînes repliées : cocher une étape (son auteur ou le MJ), ajouter une étape. */
export function SessionQuestChains({ campaignId, sessions, sessionId, notes, onNotesChange, entities, viewer, privateFor, onOpenNote }: {
  campaignId: string
  sessions: JournalSessionRef[]
  sessionId: string
  notes: SessionNote[]
  onNotesChange: (notes: SessionNote[]) => void
  entities: SessionNoteEntities
  viewer: SessionNotesViewer
  privateFor?: string
  /** Montrer une étape dans la liste des notes (journal). */
  onOpenNote?: (noteId: string) => void
}) {
  const [draft, setDraft] = useState<NoteDraft | null>(null)
  const [error, setError] = useState("")
  const order = sessions.map((session) => session.id)
  const rank = new Map(order.map((id, index) => [id, index]))
  const here = rank.get(sessionId) ?? order.length
  const chains = sessionQuestChains(notes, order).filter((chain) => (rank.get(chain.root.sessionId) ?? 0) <= here)
  const touched = (chain: (typeof chains)[number]) => chain.steps.some((step) => step.sessionId === sessionId || step.quest?.doneIn === sessionId)
  const moved = chains.filter(touched)
  const ongoing = chains.filter((chain) => !touched(chain) && !chain.done)
  const questTone = tone(sessionNoteType("quete").color)
  async function tick(step: SessionNote, done: boolean) {
    setError("")
    // Cochée tout de suite ; un refus remet la case comme elle était.
    const shown = notes.map((note) => note.id === step.id ? tickedQuest(step, done, sessionId) : note)
    onNotesChange(shown)
    try {
      const saved = await tickQuestRequest(campaignId, step, done, sessionId)
      onNotesChange(shown.map((note) => note.id === saved.id ? saved : note))
    } catch (caught) {
      onNotesChange(shown.map((note) => note.id === step.id ? step : note))
      setError(caught instanceof Error ? caught.message : "La quête n’a pas pu être cochée.")
    }
  }
  if (!moved.length && !ongoing.length) return <EmptyHint icon={Flag}>Aucune quête en cours. Ajoute une note « Quête » pour en suivre une.</EmptyHint>
  const row = (chain: (typeof chains)[number]) => {
    const done = chain.steps.filter((step) => step.quest?.done).length
    return <details key={chain.root.id} className="group/quest rounded-xl border border-border/70 bg-card transition-shadow open:shadow-[0_1px_2px_rgb(67_50_31/0.08)]" style={questTone}>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-3 py-2.5 outline-none hover:bg-tone/5 focus-visible:ring-2 focus-visible:ring-ring/50 group-open/quest:rounded-b-none group-open/quest:border-b group-open/quest:border-border/70 [&::-webkit-details-marker]:hidden">
        <Flag className={cn("size-4 shrink-0", chain.done ? "text-done" : "text-tone")} aria-hidden />
        <span className="min-w-0 flex-1 truncate font-display text-[15.5px] font-semibold">{sessionNoteLabel(chain.root, 70)}</span>
        <span className="hidden w-[clamp(3rem,18%,9rem)] items-center gap-[3px] sm:flex" aria-hidden>{chain.steps.map((step) => {
          const now = step.sessionId === sessionId || step.quest?.doneIn === sessionId
          return <i key={step.id} className={cn("h-[5px] flex-1 rounded-full", step.quest?.done ? "bg-done" : now ? "bg-tone/45" : "bg-border", now && "h-2")} />
        })}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{done}/{chain.steps.length}<span className="sr-only"> étapes accomplies</span></span>
        <span className={cn("hidden shrink-0 text-[10.5px] font-bold uppercase tracking-[0.08em] min-[440px]:inline", chain.done ? "text-done" : "text-pending")}>{chain.done ? "Terminée" : "En cours"}</span>
        <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open/quest:rotate-0" aria-hidden />
      </summary>
      <ol className="px-3.5 pt-3">{chain.steps.map((step, position) => {
        const later = (rank.get(step.sessionId) ?? 0) > here
        const noted = step.sessionId === sessionId
        const ticked = Boolean(step.quest?.done && step.quest.doneIn === sessionId && !noted)
        const last = position === chain.steps.length - 1
        return <li key={step.id} className={cn("grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5", later && "opacity-60")}>
          <div className="flex flex-col items-center">
            <QuestCheckbox checked={step.quest?.done ?? false} disabled={!canEditSessionNote(step, viewer)} onChange={(checked) => void tick(step, checked)} label={`${sessionNoteLabel(step, 60)} : accomplie`} />
            {!last && <span className={cn("my-1 w-px flex-1", step.quest?.done ? "bg-done/45" : "bg-border")} aria-hidden />}
          </div>
          <div className={cn("min-w-0 pb-3", (noted || ticked) && "-mt-0.5 rounded-lg bg-gradient-to-r from-tone/10 to-transparent px-2 pt-0.5")}>
            {onOpenNote
              ? <button type="button" onClick={() => onOpenNote(step.id)} className={cn("rounded-sm text-left text-[13px] leading-snug outline-none hover:underline hover:decoration-border hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring/50", step.quest?.done && "text-muted-foreground")}><span className="mr-1.5 text-[10.5px] font-bold tabular-nums text-journal-ink">S{(rank.get(step.sessionId) ?? 0) + 1}</span>{step.title || step.text}</button>
              : <p className={cn("text-[13px] leading-snug", step.quest?.done && "text-muted-foreground")}><span className="mr-1.5 text-[10.5px] font-bold tabular-nums text-journal-ink">S{(rank.get(step.sessionId) ?? 0) + 1}</span>{step.title || step.text}</p>}
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
              <span>{step.quest?.done ? (step.quest.doneIn && step.quest.doneIn !== step.sessionId ? `cochée en S${(rank.get(step.quest.doneIn) ?? 0) + 1}` : "accomplie") : "en cours"}</span>
              {noted && <span className="font-semibold text-tone">notée cette session</span>}
              {ticked && <span className="font-semibold text-tone">cochée cette session</span>}
              {later && <span className="italic">plus tard</span>}
            </p>
          </div>
        </li>
      })}</ol>
      <div className="px-3.5 pb-3">
        <button type="button" onClick={() => setDraft({ sessionId, type: "quete", links: [], quest: { done: false, doneIn: "", after: chain.steps.filter((step) => (rank.get(step.sessionId) ?? 0) <= here).at(-1)?.id ?? chain.root.id } })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-tone/50 px-2.5 py-1 text-xs font-semibold text-tone outline-none transition-colors hover:bg-tone/8 focus-visible:ring-2 focus-visible:ring-ring/50"><Plus className="size-3.5" />Ajouter une étape</button>
      </div>
    </details>
  }
  return <div className="space-y-2">
    {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
    {moved.length > 0 && <div className="space-y-2">{moved.map(row)}</div>}
    {ongoing.length > 0 && <>
      {moved.length > 0 && <p className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">Autres quêtes en cours</p>}
      <div className="space-y-2">{ongoing.map(row)}</div>
    </>}
    <SessionNoteDialog draft={draft} onClose={() => setDraft(null)} onSaved={(note) => { onNotesChange([...notes, note]); setDraft(null) }} campaignId={campaignId} sessions={sessions} notes={notes} entities={entities} privateFor={privateFor} />
  </div>
}
