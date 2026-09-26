"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Backpack, Check, CloudOff, Dices, LoaderCircle, MapPin, MoveRight, PackageOpen, Pin, RefreshCw, Search, Shuffle, UserRound, Users, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ObjectIcon } from "@/components/eraser/object-icon"
import { sanitizeRichText } from "@/components/eraser/rich-text"
import { usePersistentState } from "@/hooks/use-persistent-state"
import type { InventoryTransferTarget } from "@/lib/inventory-schema"
import {
  keepSearchDraws,
  parseSearchDraws,
  rarityForRoll,
  searchPlaces,
  searchPlacesIn,
  searchRarityFrom,
  searchRarityLabels,
  searchResults,
  searchTables,
  type SearchDraw,
  type SearchPlace,
  type SearchResult,
} from "@/lib/search-draws"
import type { ShopGeneratorItem, ShopRarity } from "@/lib/shop-schema"

const rarityClasses: Record<ShopRarity, string> = {
  "very-common": "border-stone-300 bg-stone-100 text-stone-700",
  common: "border-emerald-300 bg-emerald-50 text-emerald-800",
  rare: "border-sky-300 bg-sky-50 text-sky-800",
  "very-rare": "border-violet-300 bg-violet-50 text-violet-800",
  ultimate: "border-amber-400 bg-amber-50 text-amber-900",
}

const resultStyles: Record<SearchResult, { button: string; badge: string }> = {
  "critical-failure": { button: "border-red-300 bg-red-50 text-red-800 hover:bg-red-100", badge: "border-red-300 bg-red-50 text-red-800" },
  failure: { button: "border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100", badge: "border-orange-300 bg-orange-50 text-orange-900" },
  success: { button: "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100", badge: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  "critical-success": { button: "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100", badge: "border-amber-400 bg-amber-50 text-amber-900" },
}

const richText = "[&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"

function isPlace(value: unknown): value is SearchPlace {
  return typeof value === "string" && (searchPlaces as readonly string[]).includes(value)
}

function d100() {
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return random[0] % 100 + 1
}

function pick<T>(pool: T[]): T | undefined {
  return pool[Math.floor(Math.random() * pool.length)]
}

function tableSummary(result: SearchResult) {
  return searchTables[result].map((range) => `${range.max === range.min ? range.min : `${range.max}–${range.min}`} ${searchRarityLabels[range.rarity]}`).join(" · ")
}

type Catalog = {
  byId: Map<string, ShopGeneratorItem>
  byPlace: Map<SearchPlace, Map<ShopRarity, ShopGeneratorItem[]>>
  byRarity: Map<ShopRarity, ShopGeneratorItem[]>
}

/**
 * Le catalogue est rangé une fois pour toutes par lieu et par rareté : un tirage n'est
 * ensuite qu'une lecture, sans attendre le réseau.
 */
function buildCatalog(items: ShopGeneratorItem[]): Catalog {
  const byId = new Map<string, ShopGeneratorItem>()
  const byPlace = new Map<SearchPlace, Map<ShopRarity, ShopGeneratorItem[]>>()
  const byRarity = new Map<ShopRarity, ShopGeneratorItem[]>()
  for (const item of items) {
    byId.set(item.id, item)
    const rarities = new Set<ShopRarity>()
    for (const location of item.locations) {
      const rarity = searchRarityFrom(location.rarity)
      if (!rarity) continue
      for (const place of searchPlacesIn(location.place)) {
        rarities.add(rarity)
        const forPlace = byPlace.get(place) ?? new Map<ShopRarity, ShopGeneratorItem[]>()
        const pool = forPlace.get(rarity) ?? []
        if (!pool.includes(item)) pool.push(item)
        forPlace.set(rarity, pool)
        byPlace.set(place, forPlace)
      }
    }
    for (const rarity of rarities) byRarity.set(rarity, [...(byRarity.get(rarity) ?? []), item])
  }
  return { byId, byPlace, byRarity }
}

function drawItem(catalog: Catalog, place: SearchPlace, rarity: ShopRarity, exclude = "") {
  const pool = (catalog.byPlace.get(place)?.get(rarity) ?? []).filter((item) => item.id !== exclude)
  return pick(pool)
}

function timeLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

function TransferPicker({ itemName, targets, loading, pending, onGive }: { itemName: string; targets: InventoryTransferTarget[] | null; loading: boolean; pending: boolean; onGive: (target: InventoryTransferTarget) => void }) {
  const [kind, setKind] = useState<"character" | "npc" | null>(null)
  const [query, setQuery] = useState("")
  const folded = query.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").trim()
  const campaignTargets = (targets ?? []).filter((target) => target.kind === "campaign")
  const people = kind ? (targets ?? []).filter((target) => target.kind === kind && (!folded || target.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").includes(folded))) : []
  if (loading || !targets) return <div className="grid min-h-24 place-items-center"><LoaderCircle className="size-4 animate-spin text-muted-foreground" /></div>
  return <div className="space-y-3">
    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><MoveRight className="size-3.5" />Transférer {itemName}</div>
    {!kind ? <>
      {campaignTargets.length > 0 && <div className="space-y-1">{campaignTargets.map((target) => <button key={target.id} type="button" disabled={pending} onClick={() => onGive(target)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"><Backpack className="size-4 text-primary" /><span className="min-w-0 flex-1 truncate">Inventaire de campagne{target.campaignName ? ` · ${target.campaignName}` : ""}</span></button>)}</div>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-auto justify-start px-3 py-3" onClick={() => { setKind("character"); setQuery("") }}><Users /><span className="text-left">Joueur·euses</span></Button>
        <Button type="button" variant="outline" className="h-auto justify-start px-3 py-3" onClick={() => { setKind("npc"); setQuery("") }}><UserRound /><span>PNJs</span></Button>
      </div>
    </> : <>
      <div className="flex items-center gap-2">
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => { setKind(null); setQuery("") }} aria-label="Revenir aux destinations"><ArrowLeft /></Button>
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-9" placeholder={kind === "npc" ? "Rechercher un PNJ…" : "Rechercher un·e joueur·euse…"} /></div>
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto">{people.length ? people.map((target) => <button key={target.id} type="button" disabled={pending} onClick={() => onGive(target)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-60">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{kind === "npc" ? <UserRound className="size-3.5" /> : <Users className="size-3.5" />}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{target.name}</span>
      </button>) : <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucun résultat.</p>}</div>
    </>}
  </div>
}

type DrawCardProps = {
  draw: SearchDraw
  item: ShopGeneratorItem | undefined
  fresh: boolean
  targets: InventoryTransferTarget[] | null
  targetsLoading: boolean
  giving: boolean
  onPin: (id: string) => void
  onRemove: (id: string) => void
  onReroll: (id: string) => void
  onElsewhere: (id: string) => void
  onOpenTargets: () => void
  onGive: (id: string, target: InventoryTransferTarget) => Promise<boolean>
}

const DrawCard = memo(function DrawCard({ draw, item, fresh, targets, targetsLoading, giving, onPin, onRemove, onReroll, onElsewhere, onOpenTargets, onGive }: DrawCardProps) {
  const [moving, setMoving] = useState(false)
  const result = searchResults.find((candidate) => candidate.key === draw.result)
  const name = item?.name || draw.itemName
  return <article className={`rounded-2xl border bg-card/80 p-4 shadow-sm transition ${fresh ? "ring-2 ring-primary/40" : ""} ${draw.pinned ? "border-primary/45" : ""}`}>
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Badge variant="outline" className={resultStyles[draw.result].badge}>{result?.label}</Badge>
      <span className="inline-flex items-center gap-1 font-medium text-muted-foreground"><MapPin className="size-3" />{draw.place}</span>
      <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold tabular-nums" title="Résultat du d100">d100 · {draw.roll}</span>
      <Badge variant="outline" className={rarityClasses[draw.rarity]}>{searchRarityLabels[draw.rarity]}</Badge>
      <span className="ml-auto tabular-nums text-muted-foreground">{timeLabel(draw.at)}</span>
    </div>
    {draw.itemId ? <div className="mt-3 flex items-start gap-3">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/70 text-muted-foreground">{item
        ? <ObjectIcon icon={item.icon} name={item.name} type={item.type} subtype={item.subtype} className="size-full p-0.5" emojiClassName="text-2xl" fallback={<PackageOpen className="size-4" />} />
        : <PackageOpen className="size-4" />}</div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold leading-tight">{item?.nameHtml?.trim() ? <span className={richText} dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.nameHtml) }} /> : name}</p>
        {item && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{[item.type, item.subtype].filter(Boolean).join(" · ")}{item.price ? ` · ${item.price}` : ""}</p>}
        {item && (item.descriptionHtml?.trim()
          ? <p className={`mt-1.5 text-xs leading-5 text-muted-foreground ${richText}`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.descriptionHtml) }} />
          : item.description && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.description}</p>)}
        {item && (item.effectHtml?.trim()
          ? <p className="mt-1 text-xs leading-5"><span className="font-semibold">Effet :</span> <span className={richText} dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.effectHtml) }} /></p>
          : item.effect && <p className="mt-1 text-xs leading-5"><span className="font-semibold">Effet :</span> {item.effect}</p>)}
        {!item && <p className="mt-1 text-xs text-muted-foreground">Cet objet n’est plus dans l’index Objets.</p>}
        {draw.elsewhere && <p className="mt-1.5 text-[11px] italic text-muted-foreground">Trouvé hors de ce lieu : aucun objet {searchRarityLabels[draw.rarity].toLocaleLowerCase("fr")} n’y est répertorié.</p>}
        {draw.givenTo && <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"><Check className="size-3" />Donné à {draw.givenTo}</p>}
      </div>
    </div> : <div className="mt-3 rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
      <p>Aucun objet {searchRarityLabels[draw.rarity].toLocaleLowerCase("fr")} n’est répertorié pour « {draw.place} » dans l’index Objets.</p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => onElsewhere(draw.id)}><Shuffle />Prendre un objet {searchRarityLabels[draw.rarity].toLocaleLowerCase("fr")} d’un autre lieu</Button>
    </div>}
    <div className="mt-3 flex items-center justify-end gap-1 border-t pt-2">
      <Button type="button" variant={draw.pinned ? "secondary" : "ghost"} size="icon-sm" onClick={() => onPin(draw.id)} aria-pressed={draw.pinned} aria-label={draw.pinned ? "Ne plus garder ce tirage" : "Garder ce tirage"} title={draw.pinned ? "Épinglé : ce tirage reste dans la liste" : "Épingler : ce tirage ne s’effacera pas"}><Pin className={draw.pinned ? "fill-current text-primary" : ""} /></Button>
      {draw.itemId && <Button type="button" variant="ghost" size="icon-sm" onClick={() => onReroll(draw.id)} aria-label="Relancer l’objet" title="Un autre objet de même rareté, au même lieu"><RefreshCw /></Button>}
      {draw.itemId && <Popover open={moving} onOpenChange={(open) => { setMoving(open); if (open) onOpenTargets() }}>
        <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon-sm" disabled={giving} aria-label={`Transférer ${name}`} title="Transférer">{giving ? <LoaderCircle className="animate-spin" /> : <MoveRight />}</Button></PopoverTrigger>
        <PopoverContent align="end" side="bottom" className="w-80 p-3"><TransferPicker itemName={name} targets={targets} loading={targetsLoading} pending={giving} onGive={(target) => void onGive(draw.id, target).then((done) => { if (done) setMoving(false) })} /></PopoverContent>
      </Popover>}
      <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => onRemove(draw.id)} aria-label="Retirer ce tirage" title="Retirer ce tirage"><X /></Button>
    </div>
  </article>
})

/**
 * Les Fouilles : le MJ choisit le lieu, puis le résultat du test du joueur. Le d100 et
 * l'objet sont tirés sur place, sans attendre le réseau ; les 20 derniers tirages (et
 * ceux qu'on épingle) sont enregistrés en arrière-plan.
 */
export function SearchGenerator({ campaignId, items, initialDraws, loadError }: { campaignId: string; items: ShopGeneratorItem[]; initialDraws: SearchDraw[] | null; loadError: string }) {
  const catalog = useMemo(() => buildCatalog(items), [items])
  const shared = initialDraws !== null
  const localKey = `eraser:fouilles:${campaignId}`
  const [place, setPlace] = usePersistentState<SearchPlace>(`eraser:fouilles:place:${campaignId}`, "Forêt", isPlace)
  const [draws, setDraws] = useState<SearchDraw[]>(initialDraws ?? [])
  const [freshId, setFreshId] = useState("")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [targets, setTargets] = useState<InventoryTransferTarget[] | null>(null)
  const [targetsLoading, setTargetsLoading] = useState(false)
  const [giving, setGiving] = useState("")
  const [error, setError] = useState("")
  const dirty = useRef(false)
  const latest = useRef(draws)
  useEffect(() => { latest.current = draws }, [draws])

  // Sans serveur partagé, les tirages restent dans ce navigateur.
  useEffect(() => {
    if (shared) return
    const timer = window.setTimeout(() => {
      try { setDraws(parseSearchDraws(JSON.parse(window.localStorage.getItem(localKey) || "[]"))) } catch { /* stockage indisponible */ }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [localKey, shared])

  // Enregistré peu après le dernier geste ; en quittant la page, tout de suite.
  const pendingSave = useRef(false)
  const send = useCallback(() => {
    pendingSave.current = false
    return fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/search-draws`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", draws: latest.current }), keepalive: true })
  }, [campaignId])

  useEffect(() => {
    if (!dirty.current) return
    if (!shared) {
      try { window.localStorage.setItem(localKey, JSON.stringify(draws)) } catch { /* stockage indisponible */ }
      return
    }
    pendingSave.current = true
    const timer = window.setTimeout(() => {
      send().then((response) => setSaveState(response.ok ? "saved" : "error")).catch(() => setSaveState("error"))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [draws, localKey, send, shared])

  useEffect(() => {
    const flush = () => { if (pendingSave.current) void send().catch(() => undefined) }
    window.addEventListener("pagehide", flush)
    return () => { window.removeEventListener("pagehide", flush); flush() }
  }, [send])

  const change = useCallback((update: (current: SearchDraw[]) => SearchDraw[]) => {
    dirty.current = true
    if (shared) setSaveState("saving")
    setDraws((current) => keepSearchDraws(update(current)))
  }, [shared])

  const search = useCallback((result: SearchResult) => {
    const roll = d100()
    const rarity = rarityForRoll(result, roll)
    const item = drawItem(catalog, place, rarity)
    const draw: SearchDraw = { id: crypto.randomUUID(), at: new Date().toISOString(), result, place, roll, rarity, itemId: item?.id ?? "", itemName: item?.name ?? "", elsewhere: false, pinned: false, givenTo: "" }
    setFreshId(draw.id)
    change((current) => [draw, ...current])
  }, [catalog, change, place])

  // Raccourcis 1 à 4 : échec critique, échec, réussite, réussite critique.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return
      const result = searchResults.find((candidate) => candidate.shortcut === event.key)
      if (!result) return
      event.preventDefault()
      search(result.key)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [search])

  const onPin = useCallback((id: string) => change((current) => current.map((draw) => draw.id === id ? { ...draw, pinned: !draw.pinned } : draw)), [change])
  const onRemove = useCallback((id: string) => change((current) => current.filter((draw) => draw.id !== id)), [change])
  const onReroll = useCallback((id: string) => change((current) => current.map((draw) => {
    if (draw.id !== id) return draw
    const pool = draw.elsewhere ? catalog.byRarity.get(draw.rarity) ?? [] : catalog.byPlace.get(draw.place)?.get(draw.rarity) ?? []
    const item = pick(pool.filter((candidate) => candidate.id !== draw.itemId))
    return item ? { ...draw, itemId: item.id, itemName: item.name, givenTo: "" } : draw
  })), [catalog, change])
  const onElsewhere = useCallback((id: string) => change((current) => current.map((draw) => {
    if (draw.id !== id) return draw
    const item = pick(catalog.byRarity.get(draw.rarity) ?? [])
    return item ? { ...draw, itemId: item.id, itemName: item.name, elsewhere: true } : draw
  })), [catalog, change])

  const onOpenTargets = useCallback(() => {
    if (targets || targetsLoading) return
    setTargetsLoading(true)
    fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/inventory?targets=1`)
      .then(async (response) => {
        const payload = (await response.json()) as { transferTargets?: InventoryTransferTarget[]; error?: string }
        if (!response.ok) throw new Error(payload.error || "Les destinataires n’ont pas pu être chargés.")
        setTargets(payload.transferTargets ?? [])
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Les destinataires n’ont pas pu être chargés."))
      .finally(() => setTargetsLoading(false))
  }, [campaignId, targets, targetsLoading])

  const onGive = useCallback(async (id: string, target: InventoryTransferTarget) => {
    const draw = latest.current.find((candidate) => candidate.id === id)
    if (!draw?.itemId) return false
    setGiving(id); setError("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/search-draws`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "give", itemId: draw.itemId, targetId: target.id }) })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "Le transfert a échoué.")
      const label = target.kind === "campaign" ? "l’inventaire de campagne" : target.name
      change((current) => current.map((candidate) => candidate.id === id ? { ...candidate, givenTo: label } : candidate))
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le transfert a échoué.")
      return false
    } finally {
      setGiving("")
    }
  }, [campaignId, change])

  const available = useMemo(() => new Set((catalog.byPlace.get(place) ? [...catalog.byPlace.get(place)!.entries()].filter(([, pool]) => pool.length).map(([rarity]) => rarity) : [])), [catalog, place])
  const unpinned = draws.filter((draw) => !draw.pinned).length

  return <div className="mt-7 space-y-6">
    {loadError && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{loadError}</p>}
    <section className="rounded-2xl border bg-card/70 p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Lieu de fouille</p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Lieu de fouille">
        {searchPlaces.map((candidate) => {
          const count = [...(catalog.byPlace.get(candidate)?.values() ?? [])].reduce((sum, pool) => sum + pool.length, 0)
          return <button key={candidate} type="button" role="radio" aria-checked={candidate === place} onClick={() => setPlace(candidate)} title={`${count} objet${count > 1 ? "s" : ""} répertorié${count > 1 ? "s" : ""} ici`} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${candidate === place ? "border-primary bg-primary text-primary-foreground" : "bg-background/60 hover:bg-muted"} ${count ? "" : "opacity-60"}`}>{candidate}</button>
        })}
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Résultat du test de Fouille</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {searchResults.map((result) => <button key={result.key} type="button" onClick={() => search(result.key)} disabled={!items.length} className={`group flex min-h-20 flex-col items-start justify-between rounded-xl border px-4 py-3 text-left shadow-sm transition active:scale-[.98] disabled:opacity-50 ${resultStyles[result.key].button}`}>
          <span className="flex w-full items-center justify-between gap-2"><span className="font-display text-lg font-semibold">{result.label}</span><span className="flex items-center gap-1.5 text-xs opacity-70"><kbd className="rounded border border-current/30 px-1.5 font-sans text-[10px]">{result.shortcut}</kbd><Dices className="size-4" /></span></span>
          <span className="mt-1 text-[11px] leading-4 opacity-80">{tableSummary(result.key)}</span>
          <span className="mt-1 flex flex-wrap gap-1">{[...new Set(searchTables[result.key].map((range) => range.rarity))].filter((rarity) => !available.has(rarity)).map((rarity) => <span key={rarity} className="text-[10px] italic opacity-70">Aucun objet {searchRarityLabels[rarity].toLocaleLowerCase("fr")} ici</span>)}</span>
        </button>)}
      </div>
    </section>

    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}

    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Tirages</p><p className="text-sm text-muted-foreground">Les {Math.min(unpinned, 20)} derniers sur 20{draws.length - unpinned ? ` · ${draws.length - unpinned} épinglé${draws.length - unpinned > 1 ? "s" : ""}` : ""}</p></div>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{!shared ? <><CloudOff className="size-3" />Gardés dans ce navigateur</> : saveState === "saving" ? <><LoaderCircle className="size-3 animate-spin" />Enregistrement…</> : saveState === "error" ? <span className="text-destructive">Non enregistré</span> : saveState === "saved" ? <><Check className="size-3" />Enregistré</> : null}</span>
      </div>
      {draws.length
        ? <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">{draws.map((draw) => <DrawCard key={draw.id} draw={draw} item={draw.itemId ? catalog.byId.get(draw.itemId) : undefined} fresh={draw.id === freshId} targets={targets} targetsLoading={targetsLoading} giving={giving === draw.id} onPin={onPin} onRemove={onRemove} onReroll={onReroll} onElsewhere={onElsewhere} onOpenTargets={onOpenTargets} onGive={onGive} />)}</div>
        : <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed bg-card/35 p-8 text-center"><div><Dices className="mx-auto size-8 text-primary/45" /><p className="mt-3 font-display text-xl font-semibold">Aucun tirage</p><p className="mt-1 text-sm text-muted-foreground">Choisis le lieu, puis le résultat du test : le d100 et l’objet sont tirés aussitôt.</p></div></div>}
    </section>
  </div>
}
