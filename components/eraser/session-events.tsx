"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Anchor, ArrowUpRight, Bug, CalendarClock, Caravan, Castle, ChevronDown, CircleMinus, CloudLightning, Coins, Crown, Dices, Drama, Eye, Flame,
  Footprints, Gem, Ghost, HeartPulse, KeyRound, LoaderCircle, Map as MapIcon, MessageCircle, Moon, Mountain, PawPrint, Pencil, Plus, Scroll,
  Search, Send, Shield, Skull, Sparkles, Sun, Swords, Tent, Trees, UserRound, UsersRound, Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { AddToSessionDialog, patchSession } from "@/components/eraser/session-picker"
import { countChoices, eventShopTypes, generateEventShop, shopSummary } from "@/components/eraser/shop-generator"
import { builtinShopTypes, type ShopTypeDefinition } from "@/lib/shop-types"
import { persistShops } from "@/components/eraser/shop-persistence"
import { richTextPlainText } from "@/components/eraser/rich-text"
import type { CampaignSessionRecord, SessionEvent, SessionEventKind } from "@/lib/campaign-sessions"
import { genericNpcIndexPage } from "@/lib/npc-pages"
import type { CampaignNpcRecord, SavedShopRecord, ShopGeneratorItem } from "@/lib/shop-schema"

/** Les icônes proposées pour un événement « Autre ». */
const eventIcons = { Swords, Skull, Flame, Gem, Scroll, Map: MapIcon, Castle, Crown, Ghost, Sparkles, Shield, Tent, Trees, Mountain, Anchor, Coins, KeyRound, Eye, HeartPulse, Footprints, Zap, Moon, Sun, CloudLightning, MessageCircle, Drama, Bug, CalendarClock }
type EventIconName = keyof typeof eventIcons
const tagColors = ["#b45309", "#dc2626", "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#0d9488", "#525252"]

const kindLabels: Record<SessionEventKind, string> = { creature: "Créature", npc: "PNJ", "generic-npc": "PNJ générique", market: "Marché ambulant", other: "Autre" }
const kindIcons: Record<SessionEventKind, typeof Swords> = { creature: PawPrint, npc: UserRound, "generic-npc": UsersRound, market: Caravan, other: Sparkles }
const kindOrder: SessionEventKind[] = ["creature", "npc", "generic-npc", "market", "other"]

type Candidate = { refId: string; name: string; detail: string; image: string }

function fold(value: string) { return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr") }
function plain(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }
function portraitOf(value: string) { const url = plain(value); return /^(https:\/\/|\/api\/)/.test(url) ? url : "" }

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

function npcCandidate(npc: CampaignNpcRecord): Candidate {
  return { refId: npc.id, name: npc.name, detail: [richTextPlainText(npc.title), richTextPlainText(npc.occupation), npc.people].filter(Boolean).join(" · "), image: portraitOf(npc.portrait) }
}

function loadGenericNpcs() {
  const cached = loaded.get("generic-npc")
  if (cached) return cached
  const promise = fetch(`/api/npcs?pageLinked=${encodeURIComponent(genericNpcIndexPage)}`).then(async (response) => {
    const payload = (await response.json()) as { npcs?: CampaignNpcRecord[]; error?: string }
    if (!response.ok) throw new Error(payload.error || "Les PNJs génériques n’ont pas pu être chargés.")
    return (payload.npcs || []).map(npcCandidate)
  })
  promise.catch(() => loaded.delete("generic-npc"))
  loaded.set("generic-npc", promise)
  return promise
}

/** L'adresse de ce que montre un événement : la fiche de la créature, du PNJ ou le magasin. */
function eventHref(event: SessionEvent, campaignId: string) {
  if (!event.refId) return ""
  if (event.kind === "creature") return `/ressources/index-des-creatures?ligne=${encodeURIComponent(event.refId)}`
  if (event.kind === "npc" || event.kind === "generic-npc") return `/ressources/index-des-pnjs?ligne=${encodeURIComponent(event.refId)}`
  if (event.kind === "market") return `/campagne/${encodeURIComponent(campaignId)}/magasin-et-fouille/sauvegardes?shop=${encodeURIComponent(event.refId)}`
  return ""
}

function EventGlyph({ event, className = "size-5" }: { event: Pick<SessionEvent, "kind" | "icon">; className?: string }) {
  const Icon = event.kind === "other" ? eventIcons[event.icon as EventIconName] || Sparkles : kindIcons[event.kind]
  return <Icon className={className} />
}

/** Ajouter un événement : une créature, un PNJ, un PNJ générique, un marché ambulant ou « Autre ». */
function AddEventDialog({ open, campaignId, npcs, shops, generatorItems, shopTypes, pending, onClose, onAdd }: { open: boolean; campaignId: string; npcs: CampaignNpcRecord[]; shops: SavedShopRecord[]; generatorItems: ShopGeneratorItem[]; shopTypes: ShopTypeDefinition[]; pending: boolean; onClose: () => void; onAdd: (event: SessionEvent) => Promise<void> }) {
  const router = useRouter()
  const [kind, setKind] = useState<SessionEventKind>("creature")
  const [query, setQuery] = useState("")
  const [remote, setRemote] = useState<Partial<Record<SessionEventKind, Candidate[]>>>({})
  const [loadError, setLoadError] = useState("")
  const [count, setCount] = useState("random")
  // Les magasins d'événement : « Apparaît dans » Événements ou Les deux (Lieux › Magasin).
  const eventTypes = eventShopTypes(shopTypes)
  const [typeKey, setTypeKey] = useState("")
  const eventType = eventTypes.find((type) => type.key === typeKey) ?? eventTypes[0]
  const marketLabel = eventTypes.length === 1 ? eventTypes[0].name : "Magasins"
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || (kind !== "creature" && kind !== "generic-npc") || remote[kind]) return
    let active = true
    ;(kind === "creature" ? loadCreatures() : loadGenericNpcs())
      .then((candidates) => { if (active) setRemote((current) => ({ ...current, [kind]: candidates })) })
      .catch((caught) => { if (active) setLoadError(caught instanceof Error ? caught.message : "Chargement impossible.") })
    return () => { active = false }
  }, [kind, open, remote])

  const candidates = ((): Candidate[] | null => {
    if (kind === "npc") return npcs.map(npcCandidate)
    if (kind === "market") return shops.filter((shop) => eventTypes.some((type) => type.key === shop.key)).map((shop) => ({ refId: shop.id, name: shop.name, detail: shopSummary(shop, shopTypes), image: "" }))
    if (kind === "other") return []
    return remote[kind] ?? null
  })()
  const words = fold(query).split(/\s+/).filter(Boolean)
  const filtered = (candidates || []).filter((candidate) => words.every((word) => fold(`${candidate.name} ${candidate.detail}`).includes(word)))

  function close() { setQuery(""); setError(""); setLoadError(""); onClose() }
  async function add(candidate: Candidate) {
    setError("")
    try { await onAdd({ id: crypto.randomUUID(), kind, refId: candidate.refId, name: candidate.name, icon: "", image: candidate.image, tag: "", tagColor: "", description: "" }); close() }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Ajout impossible.") }
  }
  /** Un nouveau Marché ambulant : sauvegardé dans la campagne, puis ajouté comme événement. */
  async function generateMarket() {
    setGenerating(true); setError("")
    try {
      if (!eventType) throw new Error("Aucun magasin n’apparaît dans les événements (colonne « Apparaît dans » de Lieux › Magasin).")
      const market = generateEventShop(generatorItems, shopTypes, eventType.key, count === "random" ? "random" : Number(count))
      if (!market.items.length) throw new Error(`Rien dans les index ne se vend ici (emplacements de « ${eventType.name} » dans Lieux › Magasin).`)
      await persistShops("save", campaignId, [market])
      router.refresh()
      await add({ refId: market.id, name: market.name, detail: "", image: "" })
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Le marché ambulant n’a pas pu être créé.") }
    setGenerating(false)
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending && !generating) close() }}>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader><DialogTitle>Ajouter un événement</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Type d’événement">
          {kindOrder.map((candidate) => { const Icon = kindIcons[candidate]; return <Button key={candidate} type="button" role="tab" aria-selected={kind === candidate} size="sm" variant={kind === candidate ? "default" : "outline"} onClick={() => { setKind(candidate); setQuery(""); setError(""); setLoadError("") }}><Icon />{candidate === "market" ? marketLabel : kindLabels[candidate]}</Button> })}
        </div>
        {kind === "other"
          ? <EventForm key="new" submitLabel="Ajouter" pending={pending} onCancel={close} onSubmit={async (fields) => { setError(""); try { await onAdd({ id: crypto.randomUUID(), kind: "other", refId: "", image: "", ...fields }); close() } catch (caught) { setError(caught instanceof Error ? caught.message : "Ajout impossible.") } }} />
          : <>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder={`Rechercher ${kind === "creature" ? "une créature" : kind === "market" ? `parmi : ${eventTypes.map((type) => type.name).join(", ") || "magasins"}` : "un PNJ"}…`} /></div>
            {kind === "market" && eventType && <div className="flex flex-col gap-2 rounded-xl border bg-muted/25 p-3 sm:flex-row sm:flex-wrap sm:items-center">
              {eventTypes.length > 1 && <NativeSelect value={eventType.key} onChange={(event) => { setTypeKey(event.target.value); setCount("random") }} aria-label="Magasin d’événement" className="w-full sm:w-auto">{eventTypes.map((type) => <NativeSelectOption key={type.key} value={type.key}>{type.name}</NativeSelectOption>)}</NativeSelect>}
              {eventType.count && <NativeSelect value={count} onChange={(event) => setCount(event.target.value)} aria-label="Nombre d’items" className="w-full sm:w-auto"><NativeSelectOption value="random">Au hasard ({eventType.count.min} à {eventType.count.max} items)</NativeSelectOption>{countChoices(eventType).map((value) => <NativeSelectOption key={value} value={String(value)}>{value} items</NativeSelectOption>)}</NativeSelect>}
              <Button type="button" disabled={pending || generating || !generatorItems.length} onClick={() => void generateMarket()}>{generating ? <LoaderCircle className="animate-spin" /> : <Dices />}Générer : {eventType.name}</Button>
            </div>}
            {loadError && <p className="text-sm text-destructive">{loadError}</p>}
            <div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border p-2">
              {candidates === null && !loadError ? <div className="grid min-h-28 place-items-center"><LoaderCircle className="animate-spin text-muted-foreground" /></div>
                : filtered.length ? filtered.slice(0, 150).map((candidate) => <button key={candidate.refId} type="button" disabled={pending} onClick={() => void add(candidate)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent disabled:opacity-60">
                  <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted text-primary"><EventGlyph event={{ kind, icon: "" }} className="size-4" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {candidate.image && <img src={candidate.image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{candidate.name}</span>{candidate.detail && <span className="block truncate text-xs text-muted-foreground">{candidate.detail}</span>}</span>
                  <Plus className="size-4 text-muted-foreground" />
                </button>)
                : <p className="px-3 py-8 text-center text-sm text-muted-foreground">{(candidates || []).length ? "Rien ne correspond." : kind === "market" ? (eventType ? "Aucun magasin d’événement sauvegardé : génère-en un ci-dessus." : "Aucun magasin n’apparaît dans les événements : règle « Apparaît dans » dans Lieux › Magasin.") : kind === "npc" ? "Aucun PNJ dans cette campagne." : "Rien à proposer."}</p>}
            </div>
          </>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </DialogContent>
  </Dialog>
}

type EventFields = Pick<SessionEvent, "name" | "icon" | "tag" | "tagColor" | "description">

/** Nom, icône, étiquette colorée et description ; `fixedName` pour une créature ou un PNJ, dont le nom vient de sa fiche. */
function EventForm({ initial, fixedName = false, submitLabel, pending, onCancel, onSubmit }: { initial?: EventFields; fixedName?: boolean; submitLabel: string; pending: boolean; onCancel: () => void; onSubmit: (fields: EventFields) => Promise<void> }) {
  const [fields, setFields] = useState<EventFields>(initial ?? { name: "", icon: "Swords", tag: "", tagColor: tagColors[0], description: "" })
  const set = (patch: Partial<EventFields>) => setFields((current) => ({ ...current, ...patch }))
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (fields.name.trim()) void onSubmit({ ...fields, name: fields.name.trim(), tag: fields.tag.trim() }) }}>
    {!fixedName && <>
      <label className="grid gap-1.5 text-sm font-medium">Nom<Input autoFocus value={fields.name} onChange={(event) => set({ name: event.target.value })} maxLength={160} placeholder="Embuscade sur la route, orage, rumeur…" /></label>
      <div className="grid gap-1.5 text-sm font-medium"><span>Icône</span><div className="flex flex-wrap gap-1">{(Object.keys(eventIcons) as EventIconName[]).map((name) => { const Icon = eventIcons[name]; return <button key={name} type="button" aria-label={name} aria-pressed={fields.icon === name} onClick={() => set({ icon: name })} className={`grid size-8 place-items-center rounded-lg border transition ${fields.icon === name ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}><Icon className="size-4" /></button> })}</div></div>
    </>}
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1.5 text-sm font-medium">Étiquette<Input value={fields.tag} onChange={(event) => set({ tag: event.target.value })} maxLength={60} placeholder="Combat, Indice, Rencontre…" /></label>
      <div className="flex items-center gap-1" aria-label="Couleur de l’étiquette">{tagColors.map((color) => <button key={color} type="button" aria-label={`Couleur ${color}`} aria-pressed={fields.tagColor === color} onClick={() => set({ tagColor: color })} className={`size-7 rounded-full border-2 transition ${fields.tagColor === color ? "border-foreground scale-110" : "border-transparent"}`} style={{ backgroundColor: color }} />)}<input type="color" aria-label="Autre couleur" value={fields.tagColor || tagColors[0]} onChange={(event) => set({ tagColor: event.target.value })} className="size-7 cursor-pointer rounded-full border bg-transparent p-0" /></div>
    </div>
    <label className="grid gap-1.5 text-sm font-medium">Description<Textarea value={fields.description} onChange={(event) => set({ description: event.target.value })} maxLength={4000} rows={4} placeholder="Ce qui se passe, ce que les joueurs peuvent trouver…" /></label>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Annuler</Button><Button type="submit" disabled={pending || !fields.name.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : <Plus />}{submitLabel}</Button></div>
  </form>
}

function EventCard({ event, campaignId, shop, shopTypes, pending, onEdit, onSend, onRemove }: { event: SessionEvent; campaignId: string; shop?: SavedShopRecord; shopTypes: ShopTypeDefinition[]; pending: boolean; onEdit: () => void; onSend: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const href = eventHref(event, campaignId)
  return <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card/80 shadow-sm">
    <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 p-3 pr-24">
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-xl border bg-primary/[0.06] text-primary">
        <EventGlyph event={event} className="size-6" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {event.image && <img src={event.image} alt={`Portrait de ${event.name}`} loading="lazy" className="absolute inset-0 size-full object-cover" onError={(error) => { error.currentTarget.style.display = "none" }} />}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary/65">{event.kind === "market" && shop ? shopTypes.find((type) => type.key === shop.key)?.name ?? kindLabels.market : kindLabels[event.kind]}</p>
        <h3 className="font-display truncate text-lg font-semibold leading-tight">{event.name || "Sans nom"}</h3>
        {event.tag && <span className="mt-1 inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: event.tagColor || "#525252" }}><span className="truncate">{event.tag}</span></span>}
        {event.kind === "market" && <p className="mt-1 text-xs text-muted-foreground">{shop ? shopSummary(shop, shopTypes) : "Magasin introuvable (supprimé ?)"}</p>}
      </div>
    </div>
    {event.description && <p className="whitespace-pre-line px-3 pb-3 text-sm text-muted-foreground">{event.description}</p>}
    {event.kind === "market" && shop && shop.items.length > 0 && <div className="border-t">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/35" aria-expanded={open} onClick={() => setOpen((value) => !value)}>Items<ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /></button>
      {open && <ul className="divide-y border-t text-sm">{shop.items.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-1.5"><span className="min-w-0 truncate">{item.name}</span><span className="shrink-0 text-xs text-muted-foreground">{item.price}</span></li>)}</ul>}
    </div>}
    <div className="absolute right-2 top-2 flex gap-0.5">
      {href && <Button asChild size="icon-sm" variant="ghost" title="Ouvrir la fiche" aria-label={`Ouvrir ${event.name}`}><Link href={href} prefetch={false}><ArrowUpRight /></Link></Button>}
      <Button type="button" size="icon-sm" variant="ghost" disabled={pending} title="Modifier" aria-label={`Modifier ${event.name}`} onClick={onEdit}><Pencil /></Button>
      <Button type="button" size="icon-sm" variant="ghost" disabled={pending} title="Envoyer dans une autre session (il reste aussi dans celle-ci)" aria-label={`Envoyer ${event.name} dans une autre session`} onClick={onSend}><Send /></Button>
      <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending} title="Retirer de la session" aria-label={`Retirer ${event.name} de la session`} onClick={onRemove}><CircleMinus /></Button>
    </div>
  </article>
}

/**
 * Les événements d'une session : créatures, PNJs, PNJs génériques, marchés ambulants et
 * événements libres. Ils vivent dans la ligne de la session (« Événements (JSON) »).
 */
export function SessionEvents({ campaignId, session, npcs, shops, generatorItems, shopTypes = builtinShopTypes, onUpdated }: { campaignId: string; session: CampaignSessionRecord; npcs: CampaignNpcRecord[]; shops: SavedShopRecord[]; generatorItems: ShopGeneratorItem[]; shopTypes?: ShopTypeDefinition[]; onUpdated: (session: CampaignSessionRecord) => void }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<SessionEvent | null>(null)
  const [sending, setSending] = useState<SessionEvent | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function patch(body: NonNullable<Parameters<typeof patchSession>[2]>, success = "") {
    setPending(true); setError(""); setNotice("")
    try { onUpdated(await patchSession(campaignId, session.id, body)); if (success) setNotice(success) }
    catch (caught) { setError(caught instanceof Error ? caught.message : "La session n’a pas pu être modifiée."); throw caught }
    finally { setPending(false) }
  }

  async function sendTo(sessionId: string) {
    if (!sending) return
    setPending(true); setError(""); setNotice("")
    try { await patchSession(campaignId, sessionId, { events: { add: [{ ...sending, id: crypto.randomUUID() }] } }); setNotice(`${sending.name} a aussi été ajouté à l’autre session.`); setSending(null) }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Envoi impossible.") }
    setPending(false)
  }

  return <div className="space-y-4">
    <div className="flex justify-end"><Button type="button" onClick={() => setAdding(true)} disabled={pending}><Plus />Ajouter un événement</Button></div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    {notice && <p className="text-sm text-primary">{notice}</p>}
    {session.events.length
      ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{session.events.map((event) => <EventCard key={event.id} event={event} campaignId={campaignId} shop={event.kind === "market" ? shops.find((shop) => shop.id === event.refId) : undefined} shopTypes={shopTypes} pending={pending} onEdit={() => setEditing(event)} onSend={() => setSending(event)} onRemove={() => void patch({ events: { remove: [event.id] } }).catch(() => undefined)} />)}</div>
      : <p className="rounded-2xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">Aucun événement : ajoute une créature, un PNJ, un marché ambulant ou un événement libre.</p>}
    <AddEventDialog open={adding} campaignId={campaignId} npcs={npcs} shops={shops} generatorItems={generatorItems} shopTypes={shopTypes} pending={pending} onClose={() => setAdding(false)} onAdd={(event) => patch({ events: { add: [event] } }, `${event.name} ajouté aux événements.`)} />
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !pending) setEditing(null) }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Modifier {editing?.name}</DialogTitle></DialogHeader>
        {editing && <EventForm key={editing.id} initial={editing} fixedName={editing.kind !== "other"} submitLabel="Enregistrer" pending={pending} onCancel={() => setEditing(null)} onSubmit={async (fields) => { try { await patch({ events: { update: [{ ...editing, ...fields }] } }); setEditing(null) } catch { /* l'erreur est affichée */ } }} />}
      </DialogContent>
    </Dialog>
    <AddToSessionDialog open={Boolean(sending)} campaignId={campaignId} title="Envoyer dans une autre session" confirmLabel="Envoyer" excludeId={session.id} subject={sending ? `${sending.name} reste dans cette session et rejoint celle choisie.` : ""} pending={pending} onClose={() => setSending(null)} onConfirm={(sessionId) => void sendTo(sessionId)} />
  </div>
}
