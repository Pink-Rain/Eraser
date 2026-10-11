"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Check, ChevronDown, Link2, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { loadWorldIndexNames } from "@/components/eraser/index-cells"
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

export const linkKindLabels: Record<SessionLinkKind, { one: string; many: string }> = {
  character: { one: "Personnage", many: "Groupe" },
  npc: { one: "PNJ", many: "PNJs" },
  place: { one: "Lieu", many: "Lieux" },
  creature: { one: "Créature", many: "Créatures" },
  item: { one: "Objet", many: "Objets" },
  shop: { one: "Magasin", many: "Magasins" },
  event: { one: "Événement", many: "Événements" },
  note: { one: "Note", many: "Notes" },
}

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").trim()

/* ---------- Échanges avec le serveur ---------- */

export async function saveSessionNoteRequest(campaignId: string, note: Partial<SessionNote>) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/session-notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }) })
  const payload = (await response.json().catch(() => ({}))) as { note?: SessionNote; error?: string }
  if (!response.ok || !payload.note) throw new Error(payload.error || "La note n’a pas pu être enregistrée.")
  return payload.note
}

async function deleteSessionNoteRequest(campaignId: string, noteId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/session-notes?note=${encodeURIComponent(noteId)}`, { method: "DELETE" })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(payload.error || "La note n’a pas pu être supprimée.")
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

export function LinkChip({ kind, label, onRemove, onClick }: { kind: SessionLinkKind; label: string; onRemove?: () => void; onClick?: () => void }) {
  const content = <><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{linkKindLabels[kind].one}</span><span className="truncate">{label}</span></>
  return <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-background/70 px-2 py-0.5 text-xs">
    {onClick ? <button type="button" onClick={onClick} className="flex min-w-0 items-center gap-1.5 hover:text-primary">{content}</button> : content}
    {onRemove && <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive" aria-label={`Retirer ${label}`}><X className="size-3" /></button>}
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
  return <div className="space-y-2">
    {value.length > 0 && <div className="flex flex-wrap gap-1.5">{value.map((link) => {
      const found = labelOf(link)
      return found ? <LinkChip key={link} kind={found.kind} label={found.label ?? "introuvable"} onRemove={() => toggle(link)} /> : null
    })}</div>}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button type="button" variant="outline" size="sm"><Link2 />Lier à…</Button></PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] p-2">
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un nom, un lieu, une note…" className="pl-8" /></div>
        <div className="mt-2 max-h-[min(22rem,55svh)] space-y-2 overflow-y-auto">
          {shown.map((group) => <div key={group.kind}>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{linkKindLabels[group.kind].many}</p>
            {group.items.map((item) => <button key={item.link} type="button" onClick={() => toggle(item.link)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent", selected.has(item.link) && "bg-accent/60")}>
              <span className="min-w-0 flex-1 truncate">{item.label}{item.hint && <span className="ml-2 text-xs text-muted-foreground">{item.hint}</span>}</span>
              {selected.has(item.link) && <Check className="size-4 shrink-0 text-primary" />}
            </button>)}
          </div>)}
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
        <DialogTitle>{editing ? "Modifier la note" : privateFor ? "Nouvelle note privée" : "Nouvelle note de session"}</DialogTitle>
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
        <p className="-mt-1 text-xs text-muted-foreground">{type.help}</p>
        {type.title && <label className="grid gap-1 text-sm font-medium">{type.title}<Input value={form.title ?? ""} maxLength={140} onChange={(event) => update({ title: event.target.value })} /></label>}
        {form.type === "evenement" && <label className="grid gap-1 text-sm font-medium">Moment <span className="text-xs font-normal text-muted-foreground">(facultatif : « À l’aube », « Pendant le combat »)</span><Input value={form.moment ?? ""} maxLength={60} onChange={(event) => update({ moment: event.target.value })} /></label>}
        <label className="grid gap-1 text-sm font-medium">{form.type === "citation" ? "La réplique" : "Texte"}<Textarea autoFocus value={form.text ?? ""} maxLength={4000} rows={4} onChange={(event) => update({ text: event.target.value })} /></label>
        {form.type === "quete" && <div className="grid gap-2 rounded-xl border bg-muted/30 p-3">
          <label className="grid gap-1 text-sm font-medium">Suite de
            <NativeSelect value={form.quest?.after ?? ""} onChange={(event) => update({ quest: { done: form.quest?.done ?? false, doneIn: form.quest?.doneIn ?? "", after: event.target.value } })} className="w-full">
              <NativeSelectOption value="">Aucune : c’est une nouvelle quête</NativeSelectOption>
              {chains.flatMap((chain) => chain.steps)
                .filter((step) => step.id !== form.id && (rank.get(step.sessionId) ?? 0) <= (rank.get(form.sessionId) ?? 0))
                .map((step) => <NativeSelectOption key={step.id} value={step.id}>S{(rank.get(step.sessionId) ?? 0) + 1} · {sessionNoteLabel(step, 52)}{step.quest?.done ? " ✓" : ""}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={form.quest?.done ?? false} onChange={(event) => update({ quest: { after: form.quest?.after ?? "", doneIn: event.target.checked ? form.quest?.doneIn || form.sessionId : "", done: event.target.checked } })} />Accomplie</label>
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

/* ---------- Liste des notes ---------- */

const openedKey = (scope: string) => `eraser-session-notes-open:${scope}`
function readOpened(scope: string) {
  try { const value = JSON.parse(window.localStorage.getItem(openedKey(scope)) || "[]") as unknown; return new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []) } catch { return new Set<string>() }
}
function writeOpened(scope: string, opened: Set<string>) {
  try { window.localStorage.setItem(openedKey(scope), JSON.stringify([...opened])) } catch { /* confort seulement */ }
}

function NoteRow({ note, sessionNumber, canEdit, linkLabel, onEdit, onDelete, onJump, expanded, onToggle, current }: {
  note: SessionNote
  sessionNumber: (id: string) => number
  canEdit: boolean
  linkLabel: ReturnType<typeof useLinkLabel>
  onEdit: () => void
  onDelete: () => void
  onJump: (noteId: string) => void
  expanded: boolean
  onToggle: () => void
  current: string
}) {
  const type = sessionNoteType(note.type)
  const links = note.links.flatMap((link) => { const found = linkLabel(link); return found?.label ? [{ link, ...found, label: found.label }] : [] })
  return <li id={`note-${note.id}`} className={cn("rounded-lg border border-transparent transition-colors", expanded && "border-border bg-background/70")}>
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent/60">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: type.color }} aria-hidden />
      {note.sessionId !== current && <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">S{sessionNumber(note.sessionId)}</span>}
      {note.type === "quete" && note.quest?.done && <Check className="size-3.5 shrink-0 text-emerald-600" aria-label="Accomplie" />}
      <span className={cn("min-w-0 flex-1", expanded ? "font-medium" : "truncate")}>{note.type === "citation" && !expanded ? `« ${sessionNoteLabel({ title: "", text: note.text }, 80)} »` : sessionNoteLabel(note, expanded ? 140 : 90)}</span>
      {!expanded && links.length > 0 && <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><Link2 className="size-3" />{links.length}</span>}
      <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
    </button>
    {expanded && <div className="space-y-2 px-3 pb-3 pt-0.5 text-sm">
      {note.moment && <p className="text-xs font-medium text-muted-foreground">{note.moment}</p>}
      {(note.title || note.type === "citation") && note.text && <p className="whitespace-pre-wrap leading-relaxed">{note.type === "citation" ? `« ${note.text} »` : note.text}</p>}
      {note.type === "citation" && note.title && <p className="text-xs text-muted-foreground">— {note.title}</p>}
      {!note.title && note.type !== "citation" && note.text.length > 90 && <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{note.text}</p>}
      {links.length > 0 && <div className="flex flex-wrap gap-1.5">{links.map((link) => <LinkChip key={link.link} kind={link.kind} label={link.label} onClick={link.kind === "note" ? () => onJump(link.link.slice(5)) : undefined} />)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
        <span>{type.label}{note.authorName ? ` · par ${note.authorName}` : ""}</span>
        {canEdit && <span className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onEdit}><Pencil className="size-3.5" />Modifier</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="size-3.5" />Supprimer</Button>
        </span>}
      </div>
    </div>}
  </li>
}

/**
 * Les notes d'une session, rangées par type, repliées à l'ouverture (on retient seulement les
 * groupes que tu ouvres). Le journal de la campagne y range les notes publiques ; la fiche d'un
 * personnage, ses notes privées (`privateFor`).
 */
export function SessionNotesBoard({ campaignId, sessions, sessionId, notes, onNotesChange, entities, viewer, privateFor, title = "Notes de session", className, newInLatest = false, toolbar }: {
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
  const [draft, setDraft] = useState<NoteDraft | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const linkLabel = useLinkLabel(entities, notes)
  const number = useMemo(() => new Map(sessions.map((session, index) => [session.id, index + 1])), [sessions])
  const sessionNumber = (id: string) => number.get(id) ?? 0
  const folded = fold(search)
  const visible = notes.filter((note) => note.sessionId === sessionId)
    .filter((note) => !folded || fold(`${note.title} ${note.text} ${note.moment} ${note.authorName}`).includes(folded))
  const groups = sessionNoteTypes.map((type) => ({ type, notes: visible.filter((note) => note.type === type.key) })).filter((group) => group.notes.length)
  const toggleGroup = (key: string, open: boolean) => setOpened((current) => {
    const next = new Set(current)
    if (open) next.add(key); else next.delete(key)
    writeOpened(scope, next)
    return next
  })
  const toggleNote = (id: string) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  function jump(noteId: string) {
    const note = notes.find((entry) => entry.id === noteId)
    if (!note) return
    if (note.sessionId !== sessionId) window.dispatchEvent(new CustomEvent("eraser-journal-go", { detail: note.sessionId }))
    toggleGroup(note.type, true)
    setExpanded((current) => new Set(current).add(noteId))
    window.setTimeout(() => document.getElementById(`note-${noteId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80)
  }
  async function remove(note: SessionNote) {
    if (!window.confirm(`Supprimer la note « ${sessionNoteLabel(note, 50)} » ?`)) return
    setPending(true); setError("")
    try {
      await deleteSessionNoteRequest(campaignId, note.id)
      onNotesChange(notes.filter((entry) => entry.id !== note.id))
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible.") }
    setPending(false)
  }
  function saved(note: SessionNote) {
    onNotesChange(notes.some((entry) => entry.id === note.id) ? notes.map((entry) => entry.id === note.id ? note : entry) : [...notes, note])
    toggleGroup(note.type, true)
    setExpanded((current) => new Set(current).add(note.id))
    setDraft(null)
  }
  return <section className={cn("rounded-2xl border bg-card/70 p-3 shadow-sm", className)} aria-label={title}>
    <div className="flex items-center justify-between gap-2 px-1">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <Button type="button" size="sm" disabled={!sessions.length || pending} onClick={() => setDraft({ sessionId: (newInLatest ? sessions.at(-1)?.id : sessionId) || sessions.at(-1)?.id || "", type: "resume", links: [] })}><Plus />Note</Button>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Chercher" className="h-8 pl-8 text-sm" aria-label="Chercher dans les notes" /></div>
      {toolbar}
    </div>
    {error && <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
    {groups.length ? <ul className="mt-2 space-y-1">{groups.map(({ type, notes: list }) => {
      const open = Boolean(folded) || opened.has(type.key)
      return <li key={type.key}>
        <details open={open} onToggle={(event) => { if (!folded) toggleGroup(type.key, (event.currentTarget as HTMLDetailsElement).open) }} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-accent/60 [&::-webkit-details-marker]:hidden">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: type.color }} aria-hidden />
            <span className="flex-1">{list.length > 1 ? type.many : type.label}</span>
            <span className="rounded-full bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground">{list.length}</span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <ul className="ml-2 border-l pl-2">{list.map((note) => <NoteRow key={note.id} note={note} current={sessionId} sessionNumber={sessionNumber} canEdit={canEditSessionNote(note, viewer)} linkLabel={linkLabel}
            expanded={expanded.has(note.id)} onToggle={() => toggleNote(note.id)} onJump={jump}
            onEdit={() => setDraft({ ...note })} onDelete={() => void remove(note)} />)}</ul>
        </details>
      </li>
    })}</ul>
      : <p className="mt-3 rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{search ? "Aucune note ne correspond." : privateFor ? "Aucune note privée pour cette session." : "Aucune note pour cette session."}</p>}
    <SessionNoteDialog draft={draft} onClose={() => setDraft(null)} onSaved={saved} campaignId={campaignId} sessions={sessions} notes={notes} entities={entities} privateFor={privateFor} />
  </section>
}

/* ---------- Quêtes ---------- */

/** Les quêtes en chaînes repliées : cocher une étape (son auteur ou le MJ), ajouter une étape. */
export function SessionQuestChains({ campaignId, sessions, sessionId, notes, onNotesChange, entities, viewer, privateFor }: {
  campaignId: string
  sessions: JournalSessionRef[]
  sessionId: string
  notes: SessionNote[]
  onNotesChange: (notes: SessionNote[]) => void
  entities: SessionNoteEntities
  viewer: SessionNotesViewer
  privateFor?: string
}) {
  const [draft, setDraft] = useState<NoteDraft | null>(null)
  const [error, setError] = useState("")
  const order = sessions.map((session) => session.id)
  const rank = new Map(order.map((id, index) => [id, index]))
  const here = rank.get(sessionId) ?? order.length
  const chains = sessionQuestChains(notes, order).filter((chain) => (rank.get(chain.root.sessionId) ?? 0) <= here)
  const touched = (chain: (typeof chains)[number]) => chain.steps.some((step) => step.sessionId === sessionId || step.quest?.doneIn === sessionId)
  const visible = chains.filter((chain) => touched(chain) || !chain.done)
  async function tick(step: SessionNote, done: boolean) {
    setError("")
    try {
      const saved = await saveSessionNoteRequest(campaignId, { ...step, quest: { after: step.quest?.after ?? "", done, doneIn: done ? sessionId : "" } })
      onNotesChange(notes.map((note) => note.id === saved.id ? saved : note))
    } catch (caught) { setError(caught instanceof Error ? caught.message : "La quête n’a pas pu être cochée.") }
  }
  if (!visible.length) return <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">Aucune quête en cours. Ajoute une note « Quête » pour en suivre une.</p>
  return <div className="space-y-2">
    {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
    {visible.map((chain) => {
      const done = chain.steps.filter((step) => step.quest?.done).length
      return <details key={chain.root.id} className="group rounded-xl border bg-card/70">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 truncate font-semibold">{sessionNoteLabel(chain.root, 70)}</span>
          <span className="hidden gap-0.5 sm:flex" aria-hidden>{chain.steps.map((step) => <i key={step.id} className={cn("h-1.5 w-4 rounded-full", step.quest?.done ? "bg-emerald-600" : "bg-muted-foreground/25", (step.sessionId === sessionId || step.quest?.doneIn === sessionId) && "ring-2 ring-primary/40")} />)}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{done}/{chain.steps.length}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", chain.done ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400")}>{chain.done ? "Terminée" : "En cours"}</span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <ol className="space-y-1 border-t px-3 py-2">{chain.steps.map((step) => {
          const later = (rank.get(step.sessionId) ?? 0) > here
          return <li key={step.id} className={cn("flex items-start gap-2 text-sm", later && "opacity-50")}>
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-emerald-600" checked={step.quest?.done ?? false} disabled={!canEditSessionNote(step, viewer)} onChange={(event) => void tick(step, event.target.checked)} aria-label={`${sessionNoteLabel(step, 60)} : accomplie`} />
            <span className="min-w-0 flex-1"><span className="mr-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">S{(rank.get(step.sessionId) ?? 0) + 1}</span><span className={cn(step.quest?.done && "text-muted-foreground line-through")}>{step.title || step.text}</span>
              {step.quest?.done && step.quest.doneIn && <span className="ml-1.5 text-[11px] text-muted-foreground">cochée en S{(rank.get(step.quest.doneIn) ?? 0) + 1}</span>}</span>
          </li>
        })}</ol>
        <div className="border-t px-3 py-1.5"><Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDraft({ sessionId, type: "quete", links: [], quest: { done: false, doneIn: "", after: chain.steps.filter((step) => (rank.get(step.sessionId) ?? 0) <= here).at(-1)?.id ?? chain.root.id } })}><Plus className="size-3.5" />Ajouter une étape</Button></div>
      </details>
    })}
    <SessionNoteDialog draft={draft} onClose={() => setDraft(null)} onSaved={(note) => { onNotesChange([...notes, note]); setDraft(null) }} campaignId={campaignId} sessions={sessions} notes={notes} entities={entities} privateFor={privateFor} />
  </div>
}
