"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { ArrowUpRight, Caravan, ChevronDown, CircleMinus, Dices, LoaderCircle, MapPinned, Pencil, PawPrint, Plus, Search, Send, Sparkles, Trash2, UsersRound } from "lucide-react"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { ImageField } from "@/components/eraser/index-cells"
import { IconPicker, IndexIconGlyph } from "@/components/eraser/index-gauge"
import { AddToSessionDialog, patchSession } from "@/components/eraser/session-picker"
import { countChoices, eventShopTypes, generateEventShop, SavedShopCollection, shopSummary } from "@/components/eraser/shop-generator"
import { persistShops } from "@/components/eraser/shop-persistence"
import type { CampaignEvent } from "@/lib/campaign-events"
import type { CampaignSessionRecord, SessionEvent, SessionEventKind } from "@/lib/campaign-sessions"
import { genericNpcIndexPage } from "@/lib/npc-pages"
import type { CampaignNpcRecord, SavedShopRecord, ShopGeneratorItem } from "@/lib/shop-schema"
import { builtinShopTypes, type ShopTypeDefinition } from "@/lib/shop-types"

/*
 * Les événements d'une campagne. La page Événements (menu › Créateur de session) les crée,
 * les nomme, change leur image et les envoie dans une session, comme les pages PNJs et
 * Magasins ; le Créateur de session montre ceux qu'on y a envoyés.
 */

const tagColors = ["#b45309", "#dc2626", "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#0d9488", "#525252"]
type CreatableKind = "creature" | "generic-npc" | "other"
const kindLabels: Record<SessionEventKind, string> = { creature: "Créature", npc: "PNJ", "generic-npc": "PNJ générique", market: "Marché ambulant", other: "Autre" }
const kindIcons: Record<SessionEventKind, typeof Sparkles> = { creature: PawPrint, npc: UsersRound, "generic-npc": UsersRound, market: Caravan, other: Sparkles }

type Candidate = { refId: string; name: string; detail: string; image: string }

function fold(value: string) { return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr") }
function plain(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }
function portraitOf(value: string) { const url = plain(value); return /^(https:\/\/|\/api\/)/.test(url) ? url : "" }
/** L'icône d'un événement « Autre » : une icône du moteur des index, ou « emoji:🐉 ». */
function iconParts(icon: string) { return icon.startsWith("emoji:") ? { emoji: icon.slice(6) } : { icon: icon || "sparkles" } }

// Lus une fois par page : l'index des créatures et les PNJs génériques ne changent pas pendant une préparation.
const loaded = new Map<string, Promise<Candidate[]>>()

function loadCreatures() {
  const cached = loaded.get("creature")
  if (cached) return cached
  const promise = fetch("/api/resources/world-indexes?key=creatures").then(async (response) => {
    const payload = (await response.json()) as { data?: { tables: Array<{ headers: string[]; rows: Array<{ values: string[] }> }> }; error?: string }
    if (!response.ok || !payload.data) throw new Error(payload.error || "L’index des créatures n’a pas pu être chargé.")
    return payload.data.tables.flatMap((table) => {
      const at = (name: string) => table.headers.findIndex((header) => fold(header).trim() === fold(name))
      const [name, type, rank, portrait, id] = [at("Nom"), at("Type"), at("Rang"), at("Portrait"), at("ID")]
      return table.rows.flatMap((row) => {
        const label = plain(row.values[name] ?? "")
        const refId = plain(row.values[id] ?? "")
        if (!label || !refId) return []
        return [{ refId, name: label, detail: [plain(row.values[type] ?? ""), rank >= 0 && plain(row.values[rank] ?? "") ? `Rang ${plain(row.values[rank] ?? "")}` : ""].filter(Boolean).join(" · "), image: portrait >= 0 ? portraitOf(row.values[portrait] ?? "") : "" }]
      })
    })
  })
  promise.catch(() => loaded.delete("creature"))
  loaded.set("creature", promise)
  return promise
}

function loadGenericNpcs() {
  const cached = loaded.get("generic-npc")
  if (cached) return cached
  const promise = fetch(`/api/npcs?pageLinked=${encodeURIComponent(genericNpcIndexPage)}`).then(async (response) => {
    const payload = (await response.json()) as { npcs?: CampaignNpcRecord[]; error?: string }
    if (!response.ok) throw new Error(payload.error || "Les PNJs génériques n’ont pas pu être chargés.")
    return (payload.npcs || []).map((npc) => ({ refId: npc.id, name: npc.name, detail: [plain(npc.title), plain(npc.occupation), npc.people].filter(Boolean).join(" · "), image: portraitOf(npc.portrait) }))
  })
  promise.catch(() => loaded.delete("generic-npc"))
  loaded.set("generic-npc", promise)
  return promise
}

async function saveEvent(campaignId: string, event: SessionEvent) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event }) })
  const payload = (await response.json().catch(() => ({}))) as { event?: CampaignEvent; error?: string }
  if (!response.ok || !payload.event) throw new Error(payload.error || "L’événement n’a pas pu être enregistré.")
  return payload.event
}

async function removeEvent(campaignId: string, eventId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/events?event=${encodeURIComponent(eventId)}`, { method: "DELETE" })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(payload.error || "L’événement n’a pas pu être supprimé.")
}

/** La fiche d'origine d'une créature ou d'un PNJ générique. */
function sourceHref(event: SessionEvent) {
  if (!event.refId) return ""
  if (event.kind === "creature") return `/ressources/index-des-creatures?ligne=${encodeURIComponent(event.refId)}`
  if (event.kind === "npc" || event.kind === "generic-npc") return `/ressources/index-des-pnjs?ligne=${encodeURIComponent(event.refId)}`
  return ""
}

function EventGlyph({ event, className = "size-5" }: { event: Pick<SessionEvent, "kind" | "icon">; className?: string }) {
  if (event.kind === "other") return <IndexIconGlyph {...iconParts(event.icon)} className={className} />
  const Icon = kindIcons[event.kind]
  return <Icon className={className} />
}

function EventPortrait({ event, className = "size-16" }: { event: Pick<SessionEvent, "kind" | "icon" | "image" | "name">; className?: string }) {
  return <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl border bg-primary/[0.06] text-primary ${className}`}>
    <EventGlyph event={event} className="size-6" />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {event.image && <img src={event.image} alt={`Image de ${event.name}`} loading="lazy" className="absolute inset-0 size-full object-cover" onError={(error) => { error.currentTarget.style.display = "none" }} />}
  </span>
}

function TagChip({ event }: { event: Pick<SessionEvent, "tag" | "tagColor"> }) {
  return event.tag ? <span className="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: event.tagColor || "#525252" }}><span className="truncate">{event.tag}</span></span> : null
}

/* ---------- la fiche d'un événement : nom, image, icône, étiquette, description ---------- */

function EventEditor({ initial, pending, submitLabel, onCancel, onSubmit }: { initial: SessionEvent; pending: boolean; submitLabel: string; onCancel: () => void; onSubmit: (event: SessionEvent) => void }) {
  const [draft, setDraft] = useState(initial)
  const set = (patch: Partial<SessionEvent>) => setDraft((current) => ({ ...current, ...patch }))
  return <form className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]" onSubmit={(event) => { event.preventDefault(); if (draft.name.trim()) onSubmit({ ...draft, name: draft.name.trim(), tag: draft.tag.trim() }) }}>
    <ImageField label={`Image de ${draft.name || "l’événement"}`} value={draft.image} aspect="aspect-square" placeholder={<EventGlyph event={draft} className="size-12 text-primary/30" />} onChange={(image) => set({ image })} />
    <div className="grid content-start gap-4">
      <label className="grid gap-1.5 text-sm font-medium">Nom<Input autoFocus value={draft.name} onChange={(event) => set({ name: event.target.value })} maxLength={160} placeholder="Embuscade sur la route, orage, rumeur…" /></label>
      {draft.kind === "other" && <div className="grid gap-1.5 text-sm font-medium"><span>Icône</span><IconPicker icon={iconParts(draft.icon).icon} emoji={iconParts(draft.icon).emoji} onChange={(value) => set({ icon: value.emoji ? `emoji:${value.emoji}` : value.icon || "" })} /></div>}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium">Étiquette<Input value={draft.tag} onChange={(event) => set({ tag: event.target.value })} maxLength={60} placeholder="Combat, Indice, Rencontre…" /></label>
        <div className="flex items-center gap-1" aria-label="Couleur de l’étiquette">{tagColors.map((color) => <button key={color} type="button" aria-label={`Couleur ${color}`} aria-pressed={draft.tagColor === color} onClick={() => set({ tagColor: color })} className={`size-7 rounded-full border-2 transition ${draft.tagColor === color ? "scale-110 border-foreground" : "border-transparent"}`} style={{ backgroundColor: color }} />)}<input type="color" aria-label="Autre couleur" value={draft.tagColor || tagColors[0]} onChange={(event) => set({ tagColor: event.target.value })} className="size-7 cursor-pointer rounded-full border bg-transparent p-0" /></div>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">Description<Textarea value={draft.description} onChange={(event) => set({ description: event.target.value })} maxLength={4000} rows={5} placeholder="Ce qui se passe, ce que les joueurs peuvent trouver…" /></label>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Annuler</Button><Button type="submit" disabled={pending || !draft.name.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : <Pencil />}{submitLabel}</Button></div>
    </div>
  </form>
}

/** « Créature » ou « PNJ générique » : chercher dans l'index, puis l'événement naît avec ce nom et cette image. */
function SourcePicker({ kind, onPick }: { kind: "creature" | "generic-npc"; onPick: (candidate: Candidate) => void }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  useEffect(() => {
    let active = true
    ;(kind === "creature" ? loadCreatures() : loadGenericNpcs())
      .then((list) => { if (active) setCandidates(list) })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Chargement impossible.") })
    return () => { active = false }
  }, [kind])
  const words = fold(query).split(/\s+/).filter(Boolean)
  const filtered = (candidates || []).filter((candidate) => words.every((word) => fold(`${candidate.name} ${candidate.detail}`).includes(word)))
  return <div className="space-y-3">
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder={kind === "creature" ? "Rechercher une créature…" : "Rechercher un PNJ générique…"} /></div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    <div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border p-2">
      {candidates === null && !error ? <div className="grid min-h-28 place-items-center"><LoaderCircle className="animate-spin text-muted-foreground" /></div>
        : filtered.length ? filtered.slice(0, 150).map((candidate) => <button key={candidate.refId} type="button" onClick={() => onPick(candidate)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent">
          <EventPortrait event={{ kind, icon: "", image: candidate.image, name: candidate.name }} className="size-9" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{candidate.name}</span>{candidate.detail && <span className="block truncate text-xs text-muted-foreground">{candidate.detail}</span>}</span>
          <Plus className="size-4 text-muted-foreground" />
        </button>)
        : <p className="px-3 py-8 text-center text-sm text-muted-foreground">Rien ne correspond.</p>}
    </div>
  </div>
}

function blankEvent(kind: CreatableKind, candidate?: Candidate): SessionEvent {
  return { id: crypto.randomUUID(), kind, refId: candidate?.refId ?? "", name: candidate?.name ?? "", icon: kind === "other" ? "sparkles" : "", image: candidate?.image ?? "", tag: "", tagColor: tagColors[0], description: "" }
}

type CardAction = { label: string; icon: typeof Sparkles; onClick?: () => void; href?: string; destructive?: boolean }

function EventCard({ event, pending, actions, children }: { event: SessionEvent; pending: boolean; actions: CardAction[]; children?: ReactNode }) {
  return <article id={event.id} className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card/80 shadow-sm target:ring-2 target:ring-primary">
    <div className="flex gap-3 p-3 pr-2">
      <EventPortrait event={event} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary/65">{kindLabels[event.kind]}</p>
        <h3 className="font-display truncate text-lg font-semibold leading-tight">{event.name}</h3>
        <TagChip event={event} />
      </div>
      <div className="flex max-w-[5.5rem] shrink-0 flex-wrap content-start justify-end gap-0.5 self-start">
        {actions.map((action) => action.href
          ? <Button key={action.label} asChild size="icon-sm" variant="ghost" title={action.label} aria-label={`${action.label} : ${event.name}`}><Link href={action.href} prefetch={false}><action.icon /></Link></Button>
          : <Button key={action.label} type="button" size="icon-sm" variant="ghost" disabled={pending} title={action.label} aria-label={`${action.label} : ${event.name}`} onClick={action.onClick} className={action.destructive ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : undefined}><action.icon /></Button>)}
      </div>
    </div>
    {event.description && <p className="whitespace-pre-line px-3 pb-3 text-sm text-muted-foreground">{event.description}</p>}
    {children}
  </article>
}

/* ---------- la page Événements ---------- */

/**
 * La page Événements : créatures, PNJs génériques et événements libres (sauvegardés,
 * nommés, avec leur image), et les marchés ambulants (des magasins). Chacun s'envoie dans
 * une session du Créateur de session.
 */
export function CampaignEventManager({ campaignId, initialEvents, shops, npcs, generatorItems, shopTypes = builtinShopTypes, loadError = "" }: { campaignId: string; initialEvents: CampaignEvent[]; shops: SavedShopRecord[]; npcs: CampaignNpcRecord[]; generatorItems: ShopGeneratorItem[]; shopTypes?: ShopTypeDefinition[]; loadError?: string }) {
  const router = useRouter()
  const [events, setEvents] = useState<SessionEvent[]>(initialEvents)
  const [creating, setCreating] = useState<CreatableKind | null>(null)
  const [editing, setEditing] = useState<SessionEvent | null>(null)
  const [sending, setSending] = useState<SessionEvent | null>(null)
  const [deleting, setDeleting] = useState<SessionEvent | null>(null)
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(loadError)
  const [notice, setNotice] = useState("")
  const eventTypes = eventShopTypes(shopTypes)
  const [typeKey, setTypeKey] = useState("")
  const eventType = eventTypes.find((type) => type.key === typeKey) ?? eventTypes[0]
  const [count, setCount] = useState("random")

  async function guarded(task: () => Promise<void>) {
    setPending(true); setError(""); setNotice("")
    try { await task() } catch (caught) { setError(caught instanceof Error ? caught.message : "L’opération n’a pas pu aboutir.") }
    setPending(false)
  }
  const save = (event: SessionEvent, success: string) => guarded(async () => {
    const saved = await saveEvent(campaignId, event)
    setEvents((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved])
    setCreating(null); setEditing(null); setNotice(success)
  })
  const sendTo = (sessionId: string) => guarded(async () => {
    if (!sending) return
    await patchSession(campaignId, sessionId, { events: { add: [sending.id] } })
    setNotice(`${sending.name} a été envoyé dans la session.`); setSending(null)
  })
  const remove = () => guarded(async () => {
    if (!deleting) return
    await removeEvent(campaignId, deleting.id)
    setEvents((current) => current.filter((item) => item.id !== deleting.id))
    setNotice(`${deleting.name} a été supprimé.`); setDeleting(null)
  })
  /** Un marché ambulant (ou un autre magasin d'événement) : tiré, sauvegardé dans la campagne. */
  const generateMarket = () => guarded(async () => {
    if (!eventType) return
    const market = generateEventShop(generatorItems, shopTypes, eventType.key, count === "random" ? "random" : Number(count))
    if (!market.items.length) throw new Error(`Rien dans les index ne se vend ici (emplacements de « ${eventType.name} » dans Lieux › Magasin).`)
    await persistShops("save", campaignId, [market])
    router.refresh()
    setNotice(`${market.name} sauvegardé : renomme-le, lie-le à un PNJ ou envoie-le dans une session ci-dessous.`)
  })

  const words = fold(query).split(/\s+/).filter(Boolean)
  const shown = events.filter((event) => words.every((word) => fold(`${event.name} ${event.tag} ${event.description} ${kindLabels[event.kind]}`).includes(word)))
  const eventKeys = new Set(eventTypes.map((type) => type.key))

  return <div className="mt-7 space-y-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher un événement…" /></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setCreating("creature")} disabled={pending}><PawPrint />Créature</Button>
        <Button type="button" variant="outline" onClick={() => setCreating("generic-npc")} disabled={pending}><UsersRound />PNJ générique</Button>
        <Button type="button" onClick={() => setCreating("other")} disabled={pending}><Plus />Autre</Button>
      </div>
    </div>
    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
    {notice && <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</p>}

    <section>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Événements<span className="ml-2 text-muted-foreground">{events.length}</span></p>
      {shown.length
        ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map((event) => <EventCard key={event.id} event={event} pending={pending} actions={[
          ...(sourceHref(event) ? [{ label: "Ouvrir la fiche d’origine", icon: ArrowUpRight, href: sourceHref(event) }] : []),
          { label: "Modifier (nom, image, étiquette)", icon: Pencil, onClick: () => setEditing(event) },
          { label: "Envoyer dans une session", icon: MapPinned, onClick: () => setSending(event) },
          { label: "Supprimer", icon: Trash2, onClick: () => setDeleting(event), destructive: true },
        ]} />)}</div>
        : <p className="rounded-2xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">{events.length ? "Aucun événement ne correspond." : "Aucun événement : ajoute une créature, un PNJ générique ou un événement libre."}</p>}
    </section>

    {eventType && <section className="border-t pt-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">{eventTypes.length === 1 && eventType.key === "travelling-market" ? "Marchés ambulants" : eventTypes.length === 1 ? eventType.name : "Magasins d’événement"}</p>
      <div className="mb-4 flex flex-col gap-2 rounded-2xl border bg-card/65 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        {eventTypes.length > 1 && <NativeSelect value={eventType.key} onChange={(event) => { setTypeKey(event.target.value); setCount("random") }} aria-label="Magasin d’événement" className="w-full sm:w-auto">{eventTypes.map((type) => <NativeSelectOption key={type.key} value={type.key}>{type.name}</NativeSelectOption>)}</NativeSelect>}
        {eventType.count && <NativeSelect value={count} onChange={(event) => setCount(event.target.value)} aria-label="Nombre d’items" className="w-full sm:w-auto"><NativeSelectOption value="random">Au hasard ({eventType.count.min} à {eventType.count.max} items)</NativeSelectOption>{countChoices(eventType).map((value) => <NativeSelectOption key={value} value={String(value)}>{value} items</NativeSelectOption>)}</NativeSelect>}
        <Button type="button" disabled={pending || !generatorItems.length} onClick={() => void generateMarket()}>{pending ? <LoaderCircle className="animate-spin" /> : <Dices />}Générer : {eventType.name}</Button>
      </div>
      <SavedShopCollection initialShops={shops} pageLinked={campaignId} npcs={npcs} generatorItems={generatorItems} types={shopTypes} only={(shop) => eventKeys.has(shop.key)} sessionList="events" emptyLabel={`Aucun ${eventType.name.toLocaleLowerCase("fr")} sauvegardé`} />
    </section>}

    <Dialog open={Boolean(creating)} onOpenChange={(open) => { if (!open && !pending) setCreating(null) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{creating === "creature" ? "Ajouter une créature" : creating === "generic-npc" ? "Ajouter un PNJ générique" : "Nouvel événement"}</DialogTitle></DialogHeader>
        {creating === "other" && <EventEditor initial={blankEvent("other")} pending={pending} submitLabel="Créer" onCancel={() => setCreating(null)} onSubmit={(event) => void save(event, `${event.name} créé.`)} />}
        {(creating === "creature" || creating === "generic-npc") && <SourcePicker kind={creating} onPick={(candidate) => { setCreating(null); setEditing(blankEvent(creating, candidate)) }} />}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !pending) setEditing(null) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editing && events.some((event) => event.id === editing.id) ? `Modifier ${editing.name}` : "Sauvegarder l’événement"}</DialogTitle></DialogHeader>
        {editing && <EventEditor key={editing.id} initial={editing} pending={pending} submitLabel="Sauvegarder" onCancel={() => setEditing(null)} onSubmit={(event) => void save(event, `${event.name} sauvegardé.`)} />}
      </DialogContent>
    </Dialog>
    <AddToSessionDialog open={Boolean(sending)} campaignId={campaignId} title="Envoyer dans une session" confirmLabel="Envoyer" subject={sending ? `${sending.name} rejoint les événements de la session choisie.` : ""} pending={pending} onClose={() => setSending(null)} onConfirm={(sessionId) => void sendTo(sessionId)} />
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !pending) setDeleting(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Supprimer « {deleting?.name} » ?</AlertDialogTitle><AlertDialogDescription>L’événement disparaît de la campagne et des sessions où il était.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={(event) => { event.preventDefault(); void remove() }}>{pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Supprimer</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}

/* ---------- les événements d'une session (Créateur de session) ---------- */

/** Un événement d'une session : un événement de campagne, un marché ambulant (« shop:ID »), ou un ancien événement complet. */
type SessionEntry = { id: string; event: SessionEvent; shop?: SavedShopRecord }

function ShopItems({ shop }: { shop: SavedShopRecord }) {
  const [open, setOpen] = useState(false)
  if (!shop.items.length) return null
  return <div className="border-t">
    <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/35" aria-expanded={open} onClick={() => setOpen((value) => !value)}>Items<ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /></button>
    {open && <ul className="divide-y border-t text-sm">{shop.items.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-1.5"><span className="min-w-0 truncate">{item.name}</span><span className="shrink-0 text-xs text-muted-foreground">{item.price}</span></li>)}</ul>}
  </div>
}

/** « Ajouter un événement » : parmi ceux préparés dans la page Événements. */
function AddSessionEventDialog({ open, candidates, pending, eventsHref, onClose, onAdd }: { open: boolean; candidates: SessionEntry[]; pending: boolean; eventsHref: string; onClose: () => void; onAdd: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState("")
  const words = fold(query).split(/\s+/).filter(Boolean)
  const filtered = candidates.filter((entry) => words.every((word) => fold(`${entry.event.name} ${entry.event.tag} ${kindLabels[entry.event.kind]}`).includes(word)))
  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  function close() { setSelected(new Set()); setQuery(""); onClose() }
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) close() }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Ajouter un événement</DialogTitle></DialogHeader><div className="space-y-4">
    <div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher un événement préparé…" /></div><Button asChild variant="outline"><Link href={eventsHref} prefetch={false}><Plus />Préparer des événements</Link></Button></div>
    <div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border p-2">{filtered.length ? filtered.map((entry) => <button key={entry.id} type="button" onClick={() => toggle(entry.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent ${selected.has(entry.id) ? "bg-primary/10" : ""}`}><Checkbox checked={selected.has(entry.id)} aria-label={`Sélectionner ${entry.event.name}`} /><EventPortrait event={entry.event} className="size-8" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.event.name}</span><span className="text-xs text-muted-foreground">{kindLabels[entry.event.kind]}</span></button>) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">{candidates.length ? "Rien ne correspond." : "Aucun autre événement préparé : crée-en dans la page Événements."}</p>}</div>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={close}>Annuler</Button><Button type="button" disabled={pending || !selected.size} onClick={() => { onAdd([...selected]); setSelected(new Set()); setQuery("") }}>{pending ? <LoaderCircle className="animate-spin" /> : <MapPinned />}Ajouter {selected.size || ""}</Button></div>
  </div></DialogContent></Dialog>
}

/**
 * Les événements d'une session, dans le Créateur de session : ceux qu'on y a envoyés depuis
 * la page Événements. On les retire, on les envoie dans une autre session ; on les prépare
 * (nom, image, texte) dans la page Événements.
 */
export function SessionEvents({ campaignId, session, events, shops, shopTypes = builtinShopTypes, onUpdated }: { campaignId: string; session: CampaignSessionRecord; events: CampaignEvent[]; shops: SavedShopRecord[]; shopTypes?: ShopTypeDefinition[]; onUpdated: (session: CampaignSessionRecord) => void }) {
  const [picking, setPicking] = useState(false)
  const [sending, setSending] = useState<SessionEntry | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const eventsHref = `/campagne/${encodeURIComponent(campaignId)}/evenements`
  const eventKeys = new Set(eventShopTypes(shopTypes).map((type) => type.key))
  const typeOf = (shop: SavedShopRecord) => shopTypes.find((type) => type.key === shop.key)
  const shopEntry = (shop: SavedShopRecord): SessionEntry => ({ id: `shop:${shop.id}`, shop, event: { id: `shop:${shop.id}`, kind: "market", refId: shop.id, name: shop.name, icon: "", image: "", tag: typeOf(shop)?.name ?? "", tagColor: typeOf(shop)?.color || "#b45309", description: "" } })
  const all: SessionEntry[] = [...events.map((event) => ({ id: event.id, event })), ...shops.filter((shop) => eventKeys.has(shop.key) || session.eventIds.includes(`shop:${shop.id}`)).map(shopEntry)]
  const byId = new Map(all.map((entry) => [entry.id, entry]))
  // Un événement supprimé depuis n'apparaît plus ; les anciens événements complets restent visibles.
  const inSession: SessionEntry[] = [...session.legacyEvents.map((event) => ({ id: event.id, event })), ...session.eventIds.flatMap((id) => byId.get(id) ?? [])]
  const candidates = all.filter((entry) => !session.eventIds.includes(entry.id))

  async function guarded(task: () => Promise<void>) {
    setPending(true); setError(""); setNotice("")
    try { await task() } catch (caught) { setError(caught instanceof Error ? caught.message : "La session n’a pas pu être modifiée.") }
    setPending(false)
  }

  return <div className="space-y-4">
    <div className="flex justify-end gap-2">
      <Button asChild variant="outline"><Link href={eventsHref} prefetch={false}><ArrowUpRight />Page Événements</Link></Button>
      <Button type="button" onClick={() => setPicking(true)} disabled={pending}><Plus />Ajouter un événement</Button>
    </div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    {notice && <p className="text-sm text-primary">{notice}</p>}
    {inSession.length
      ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{inSession.map((entry) => <EventCard key={entry.id} event={entry.event} pending={pending} actions={[
          { label: "Ouvrir", icon: ArrowUpRight, href: entry.shop ? `/campagne/${encodeURIComponent(campaignId)}/magasin-et-fouille/sauvegardes?shop=${encodeURIComponent(entry.shop.id)}` : `${eventsHref}#${encodeURIComponent(entry.id)}` },
          { label: "Envoyer dans une autre session (il reste aussi dans celle-ci)", icon: Send, onClick: () => setSending(entry) },
          { label: "Retirer de la session", icon: CircleMinus, onClick: () => void guarded(async () => { onUpdated(await patchSession(campaignId, session.id, { events: { remove: [entry.id] } })) }), destructive: true },
        ]}>
        {entry.shop && <><p className="-mt-1 px-3 pb-2 text-xs text-muted-foreground">{shopSummary(entry.shop, shopTypes)}</p><ShopItems shop={entry.shop} /></>}
      </EventCard>)}</div>
      : <p className="rounded-2xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">Aucun événement dans cette session : prépare-les dans la page Événements, puis ajoute-les ici.</p>}
    <AddSessionEventDialog open={picking} candidates={candidates} pending={pending} eventsHref={eventsHref} onClose={() => setPicking(false)} onAdd={(ids) => void guarded(async () => { onUpdated(await patchSession(campaignId, session.id, { events: { add: ids } })); setPicking(false) })} />
    <AddToSessionDialog open={Boolean(sending)} campaignId={campaignId} title="Envoyer dans une autre session" confirmLabel="Envoyer" excludeId={session.id} subject={sending ? `${sending.event.name} reste dans cette session et rejoint celle choisie.` : ""} pending={pending} onClose={() => setSending(null)} onConfirm={(sessionId) => void guarded(async () => {
      if (!sending) return
      // Un ancien événement complet n'a pas d'identifiant ailleurs : il devient un événement de la page Événements.
      const id = session.legacyEvents.some((event) => event.id === sending.id) ? (await saveEvent(campaignId, { ...sending.event, id: crypto.randomUUID() })).id : sending.id
      await patchSession(campaignId, sessionId, { events: { add: [id] } })
      setNotice(`${sending.event.name} a aussi été ajouté à l’autre session.`); setSending(null)
    })} />
  </div>
}
