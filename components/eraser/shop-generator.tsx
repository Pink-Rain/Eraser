"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Beaker, BookOpen, Bookmark, Check, ChevronDown, Dices, Download, Gem, Landmark, LibraryBig, Link2, LoaderCircle, MapPinned, PackageOpen, Pencil, RefreshCw, Save, Search, Send, Shield, Store, Trash2, UserRound, UtensilsCrossed } from "lucide-react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { sanitizeRichText } from "@/components/eraser/rich-text-inline-editor"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CampaignNpcRecord, CityKey, GeneratedShop, GeneratedShopItem, ReusablePageOption, SavedShopRecord, ShopGeneratorItem, ShopKey, ShopRarity, ShopSize } from "@/lib/shop-schema"

export type { ShopGeneratorItem } from "@/lib/shop-schema"

const shopDefinitions: Array<{ key: ShopKey; name: string; Icon: typeof Store }> = [
  { key: "market", name: "Marché", Icon: Store },
  { key: "bookshop", name: "Librairie", Icon: BookOpen },
  { key: "antique", name: "Antiquaire", Icon: Gem },
  { key: "armory", name: "Armurerie", Icon: Shield },
  { key: "black-market", name: "Marché noir", Icon: Landmark },
  { key: "alchemist", name: "Alchimiste", Icon: Beaker },
  { key: "tavern", name: "Taverne", Icon: UtensilsCrossed },
]

const cityDefinitions: Record<CityKey, { name: string; population: string; chances: Record<ShopKey, number>; sizes: Array<{ value: ShopSize; weight: number }> }> = {
  bourg: { name: "Bourg", population: "1 000 habitants ou moins", chances: { market: 100, bookshop: 20, antique: 10, armory: 30, "black-market": 10, alchemist: 40, tavern: 100 }, sizes: [{ value: "Minuscule", weight: 80 }, { value: "Petit", weight: 20 }] },
  village: { name: "Village", population: "1 000 à 5 000 habitants", chances: { market: 100, bookshop: 20, antique: 30, armory: 50, "black-market": 20, alchemist: 50, tavern: 100 }, sizes: [{ value: "Minuscule", weight: 50 }, { value: "Petit", weight: 40 }, { value: "Moyen", weight: 10 }] },
  "small-city": { name: "Petite ville", population: "5 000 à 15 000 habitants", chances: { market: 100, bookshop: 40, antique: 50, armory: 70, "black-market": 30, alchemist: 60, tavern: 100 }, sizes: [{ value: "Minuscule", weight: 10 }, { value: "Petit", weight: 60 }, { value: "Moyen", weight: 30 }] },
  "medium-city": { name: "Ville moyenne", population: "15 000 à 50 000 habitants", chances: { market: 100, bookshop: 40, antique: 70, armory: 90, "black-market": 50, alchemist: 70, tavern: 100 }, sizes: [{ value: "Petit", weight: 30 }, { value: "Moyen", weight: 60 }, { value: "Grand", weight: 10 }] },
  "large-city": { name: "Grande ville", population: "50 000 à 100 000 habitants", chances: { market: 100, bookshop: 50, antique: 90, armory: 100, "black-market": 70, alchemist: 80, tavern: 100 }, sizes: [{ value: "Petit", weight: 10 }, { value: "Moyen", weight: 30 }, { value: "Grand", weight: 60 }] },
  capital: { name: "Capitale", population: "100 000 habitants ou plus", chances: { market: 100, bookshop: 70, antique: 100, armory: 100, "black-market": 100, alchemist: 100, tavern: 100 }, sizes: [{ value: "Moyen", weight: 10 }, { value: "Grand", weight: 60 }, { value: "Géant", weight: 30 }] },
}

const itemCounts: Record<ShopSize, number> = { Minuscule: 5, Petit: 6, Moyen: 7, Grand: 8, Géant: 9 }
const rarityWeights: Array<{ value: ShopRarity; weight: number }> = [{ value: "very-common", weight: 25 }, { value: "common", weight: 40 }, { value: "rare", weight: 20 }, { value: "very-rare", weight: 10 }, { value: "ultimate", weight: 5 }]
const rarityLabels: Record<ShopRarity, string> = { "very-common": "Très commun", common: "Commun", rare: "Rare", "very-rare": "Très rare", ultimate: "Ultime" }
const rarityClasses: Record<ShopRarity, string> = { "very-common": "border-stone-300 bg-stone-100 text-stone-700", common: "border-emerald-300 bg-emerald-50 text-emerald-800", rare: "border-sky-300 bg-sky-50 text-sky-800", "very-rare": "border-violet-300 bg-violet-50 text-violet-800", ultimate: "border-amber-400 bg-amber-50 text-amber-900" }

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, " ").trim() }
function rarityFrom(value: string): ShopRarity | null { const normalized = normalize(value); if (normalized.includes("ultime")) return "ultimate"; if (normalized.includes("tres rare")) return "very-rare"; if (normalized.includes("tres commun")) return "very-common"; if (normalized.includes("rare")) return "rare"; if (normalized.includes("commun")) return "common"; return null }
function placeMatches(value: string, key: ShopKey) { const place = normalize(value); if (key === "black-market") return place.includes("marche noir"); if (key === "market") return place.includes("marche") && !place.includes("marche noir"); if (key === "bookshop") return place.includes("librair"); if (key === "antique") return place.includes("antiqu"); if (key === "armory") return place.includes("armur"); if (key === "alchemist") return place.includes("alchimi"); return place.includes("tavern") }
function weightedChoice<T>(choices: Array<{ value: T; weight: number }>) { let roll = Math.random() * choices.reduce((sum, choice) => sum + choice.weight, 0); for (const choice of choices) { roll -= choice.weight; if (roll < 0) return choice.value } return choices[choices.length - 1].value }

function drawItems(items: ShopGeneratorItem[], key: ShopKey, count: number) {
  const available = items.flatMap((item) => item.locations.flatMap((location) => { const rarity = rarityFrom(location.rarity); return rarity && placeMatches(location.place, key) ? [{ ...item, rarity }] : [] }))
  const selected: GeneratedShopItem[] = []
  while (selected.length < count) { const remaining = available.filter((item) => !selected.some((chosen) => chosen.id === item.id)); const availableRarities = rarityWeights.filter(({ value }) => remaining.some((item) => item.rarity === value)); if (!remaining.length || !availableRarities.length) break; const rarity = weightedChoice(availableRarities); const pool = remaining.filter((item) => item.rarity === rarity); selected.push(pool[Math.floor(Math.random() * pool.length)]) }
  return selected
}

function rerollShopItem(items: ShopGeneratorItem[], shop: GeneratedShop) {
  const usedIds = new Set(shop.items.map((item) => item.id))
  return drawItems(items.filter((item) => !usedIds.has(item.id)), shop.key, 1)[0] || null
}

const shopRichText = "[&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"

/**
 * Les magasins enregistrés avant que la mise en forme ne soit conservée n'ont que du
 * texte brut. On la retrouve dans le catalogue, tant que le texte n'a pas été réécrit
 * entre-temps.
 */
export function shopItemsWithCatalogRichText<T extends { items: GeneratedShopItem[] }>(shops: T[], catalog: ShopGeneratorItem[]): T[] {
  if (!catalog.length) return shops
  const byId = new Map(catalog.map((item) => [item.id, item]))
  return shops.map((shop) => ({
    ...shop,
    items: shop.items.map((item) => {
      if (item.nameHtml || item.descriptionHtml || item.effectHtml) return item
      const source = byId.get(item.id)
      if (!source) return item
      return {
        ...item,
        nameHtml: source.name === item.name ? source.nameHtml : "",
        descriptionHtml: source.description === item.description ? source.descriptionHtml : "",
        effectHtml: source.effect === item.effect ? source.effectHtml : "",
      }
    }),
  }))
}

export function rerollShop(items: ShopGeneratorItem[], shop: GeneratedShop) {
  return { ...shop, items: drawItems(items, shop.key, itemCounts[shop.size]) }
}

function generateShops(cityKey: CityKey, items: ShopGeneratorItem[]) {
  const city = cityDefinitions[cityKey]
  return shopDefinitions.flatMap<GeneratedShop>((definition) => { if (Math.random() * 100 >= city.chances[definition.key]) return []; const size = weightedChoice(city.sizes); return [{ id: crypto.randomUUID(), key: definition.key, name: cityKey === "capital" && definition.key === "market" ? "Grand marché" : definition.name, size, cityKey, cityName: city.name, items: drawItems(items, definition.key, itemCounts[size]) }] })
}

function PriceTags({ price }: { price: string }) {
  const matches = [...price.matchAll(/(\d+(?:[.,]\d+)?)\s*(PON|PO|PC)\b/gi)]
  const entries = matches.length ? matches.map((match) => ({ value: `${match[1]} ${match[2].toUpperCase()}`, currency: match[2].toUpperCase() })) : [{ value: price, currency: /or noir|pon/i.test(price) ? "PON" : /cuivre|pc/i.test(price) ? "PC" : "PO" }]
  return <span className="flex shrink-0 flex-wrap justify-end gap-1">{entries.map((entry, index) => { const style = entry.currency === "PON" ? "border-zinc-700 bg-zinc-900 text-amber-200" : entry.currency === "PC" ? "border-orange-300 bg-orange-100 text-orange-900" : "border-amber-300 bg-amber-100 text-amber-900"; const title = entry.currency === "PON" ? "Pièce d’or noir" : entry.currency === "PC" ? "Pièce de cuivre" : "Pièce d’or"; return <span key={`${entry.value}:${index}`} title={title} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${style}`}>{entry.value}</span> })}</span>
}

function EditablePrice({ item, pending, onCommit }: { item: GeneratedShopItem; pending: boolean; onCommit?: (price: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.price)

  function commit() {
    setEditing(false)
    if (draft !== item.price) onCommit?.(draft)
  }

  if (!onCommit) return item.price ? <PriceTags price={item.price} /> : <span />
  if (editing) {
    return <Input
      autoFocus
      disabled={pending}
      value={draft}
      maxLength={500}
      aria-label={`Prix de ${item.name}`}
      className="h-8 min-w-24 text-right text-xs"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); commit() }
        if (event.key === "Escape") { event.preventDefault(); setDraft(item.price); setEditing(false) }
      }}
    />
  }
  return <button
    type="button"
    className="rounded-md text-right outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    title="Double-cliquer pour modifier le prix"
    aria-label={`Modifier le prix de ${item.name}`}
    onDoubleClick={() => { setDraft(item.price); setEditing(true) }}
    onKeyDown={(event) => { if (event.key === "Enter") setEditing(true) }}
  >{item.price ? <PriceTags price={item.price} /> : <span className="text-xs text-muted-foreground">Prix vide</span>}</button>
}

async function persistShops(action: "replace" | "replace-latest" | "save" | "add-to-campaign" | "remove-from-campaign" | "link-npc" | "delete", pageLinked: string, shops: GeneratedShop[], npcId = "") {
  const response = await fetch("/api/shops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, pageLinked, shops, npcId }) })
  const payload = (await response.json()) as { shops?: SavedShopRecord[]; error?: string }
  if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
  return payload.shops || []
}

async function fetchPersistedShops<T extends GeneratedShop = SavedShopRecord>(pageLinked: string, options: { latest?: boolean; inCampaign?: boolean } = {}): Promise<T[]> {
  const parameters = new URLSearchParams({ pageLinked })
  if (options.latest) parameters.set("view", "latest")
  if (options.inCampaign) parameters.set("inCampaign", "1")
  const response = await fetch(`/api/shops?${parameters.toString()}`, { cache: "no-store" })
  const payload = (await response.json()) as { shops?: T[]; error?: string }
  if (!response.ok) throw new Error(payload.error || "Relecture des magasins impossible.")
  return payload.shops || []
}

function requirePersistedShops(expected: GeneratedShop[], stored: GeneratedShop[], message: string, predicate: (shop: GeneratedShop) => boolean = () => true) {
  if (expected.some((shop) => !stored.some((candidate) => candidate.id === shop.id && predicate(candidate)))) throw new Error(message)
}

async function importShops(pageLinked: string, sourcePageLinked: string, shopIds: string[]) {
  const response = await fetch("/api/shops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "import", pageLinked, sourcePageLinked, shopIds }) })
  const payload = (await response.json()) as { shops?: GeneratedShop[]; error?: string }
  if (!response.ok) throw new Error(payload.error || "Import impossible.")
  return payload.shops || []
}

function ImportShopsDialog({ open, sourcePages, pending, onClose, onImport }: { open: boolean; sourcePages: ReusablePageOption[]; pending: boolean; onClose: () => void; onImport: (sourcePageLinked: string, ids: string[]) => void }) {
  const [sourcePageLinked, setSourcePageLinked] = useState(sourcePages[0]?.id || "")
  const [records, setRecords] = useState<SavedShopRecord[]>([])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!open || !sourcePageLinked) return
    let active = true
    fetch(`/api/shops?pageLinked=${encodeURIComponent(sourcePageLinked)}`).then(async (response) => ({ response, payload: (await response.json()) as { shops?: SavedShopRecord[]; error?: string } })).then(({ response, payload }) => {
      if (!active) return
      if (response.ok) setRecords(payload.shops || [])
      else setError(payload.error || "Chargement impossible.")
    }).catch(() => { if (active) setError("Chargement impossible.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, sourcePageLinked])
  const filtered = records.filter((shop) => !query.trim() || `${shop.name} ${shop.cityName} ${shop.size}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")))
  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose() }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Récupérer des magasins</DialogTitle></DialogHeader><div className="space-y-4"><label className="grid gap-1.5 text-sm font-medium">Source<NativeSelect value={sourcePageLinked} onChange={(event) => { setLoading(true); setError(""); setSelected(new Set()); setSourcePageLinked(event.target.value) }}>{sourcePages.map((source) => <NativeSelectOption key={source.id} value={source.id}>{source.name}</NativeSelectOption>)}</NativeSelect></label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher un magasin…" /></div>{error && <p className="text-sm text-destructive">{error}</p>}<div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border p-2">{loading ? <div className="grid min-h-28 place-items-center"><LoaderCircle className="animate-spin text-muted-foreground" /></div> : filtered.length ? filtered.map((shop) => <button key={shop.id} type="button" onClick={() => toggle(shop.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent ${selected.has(shop.id) ? "bg-primary/10" : ""}`}><Checkbox checked={selected.has(shop.id)} aria-label={`Sélectionner ${shop.name}`} /><Store className="size-4 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{shop.name}</span><span className="block truncate text-xs text-muted-foreground">{shop.cityName} · {shop.size}</span></span></button>) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun magasin dans cette source.</p>}</div><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button><Button type="button" disabled={pending || !selected.size} onClick={() => onImport(sourcePageLinked, [...selected])}>{pending ? <LoaderCircle className="animate-spin" /> : <Download />}Récupérer {selected.size || ""}</Button></div></div></DialogContent></Dialog>
}

function RenameShopDialog({ shop, pending, onClose, onConfirm }: { shop: GeneratedShop; pending: boolean; onClose: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(shop.name)
  const trimmedName = name.trim()
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Nommer le magasin</DialogTitle></DialogHeader><div className="space-y-4"><label className="grid gap-1.5 text-sm font-medium">Nom<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} autoFocus /></label><div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Annuler</Button><Button type="button" disabled={pending || !trimmedName} onClick={() => onConfirm(trimmedName)}>{pending ? <LoaderCircle className="animate-spin" /> : <Pencil />}Enregistrer</Button></div></div></DialogContent></Dialog>
}

function CampaignDestinationDialog({ shops, campaigns, pending, onClose, onConfirm }: { shops: GeneratedShop[]; campaigns: ReusablePageOption[]; pending: boolean; onClose: () => void; onConfirm: (campaignId: string) => void }) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "")
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Envoyer dans une campagne</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">{shops.length} magasin{shops.length > 1 ? "s" : ""} seront copiés dans les magasins sauvegardés de la campagne.</p><label className="grid gap-1.5 text-sm font-medium">Campagne<NativeSelect value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>{campaigns.map((campaign) => <NativeSelectOption key={campaign.id} value={campaign.id}>{campaign.name}</NativeSelectOption>)}</NativeSelect></label><div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Annuler</Button><Button type="button" disabled={pending || !campaignId} onClick={() => onConfirm(campaignId)}>{pending ? <LoaderCircle className="animate-spin" /> : <Send />}Copier</Button></div></div></DialogContent></Dialog>
}

function ShopCards({ shops, actions, pending, npcs = [], onSave, onSend, onAdd, onLink, onRename, onDelete, onReroll, onRerollShop, onPriceChange }: { shops: GeneratedShop[]; actions: "none" | "sandbox" | "campaign" | "saved" | "locations"; pending: boolean; npcs?: CampaignNpcRecord[]; onSave?: (shop: GeneratedShop) => void; onSend?: (shop: GeneratedShop) => void; onAdd?: (shop: GeneratedShop) => void; onLink?: (shop: GeneratedShop) => void; onRename?: (shop: GeneratedShop) => void; onDelete?: (shop: GeneratedShop) => void; onReroll?: (shop: GeneratedShop, item: GeneratedShopItem) => void; onRerollShop?: (shop: GeneratedShop) => void; onPriceChange?: (shop: GeneratedShop, item: GeneratedShopItem, price: string) => void }) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set())
  const [collapsedShops, setCollapsedShops] = useState<Set<string>>(() => new Set())
  function toggleItem(key: string) {
    setExpandedItems((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function toggleShop(id: string) { setCollapsedShops((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  return <div className="grid gap-4 xl:grid-cols-2">{shops.map((shop) => { const definition = shopDefinitions.find((candidate) => candidate.key === shop.key) ?? shopDefinitions[0]; const Icon = definition.Icon; const linkedNpcId = "npcId" in shop && typeof shop.npcId === "string" ? shop.npcId : ""; const vendor = npcs.find((npc) => npc.id === linkedNpcId); const collapsed = collapsedShops.has(shop.id); return <article key={shop.id} data-shop-id={shop.id} className="deferred-section scroll-mt-24 overflow-hidden rounded-2xl border bg-card/90 shadow-sm target:ring-2 target:ring-primary">
    <header className={`grid grid-cols-[4.75rem_minmax(0,1fr)_auto] items-stretch bg-primary/[0.055] sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] ${collapsed ? "" : "border-b"}`}>
      <div className="relative min-h-28 overflow-hidden border-r border-primary/15 bg-primary/[0.06]">
        {linkedNpcId ? <>
          <div className="absolute inset-0 grid place-items-center"><UserRound className="size-8 text-primary/25" /></div>
          {vendor?.portrait && <img src={vendor.portrait} alt={`Portrait de ${vendor.name}`} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />}
          <span className="absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-lg border border-white/35 bg-background/85 text-primary shadow-sm backdrop-blur-sm"><Icon className="size-3.5" /></span>
        </> : <span className="absolute inset-0 flex items-center justify-center text-primary"><Icon className="size-6" /></span>}
      </div>
      <div className="min-w-0 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-xl font-semibold leading-tight sm:text-2xl">{shop.name}</h3><Badge className="bg-primary/10 text-primary" variant="secondary">{shop.size}</Badge></div>
        {linkedNpcId && <div className="mt-2 min-w-0 border-l-2 border-primary/25 pl-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary/65">Vendeur</p>
          <p className="font-display truncate text-lg font-semibold leading-tight text-foreground">{vendor?.name || "PNJ introuvable"}</p>
        </div>}
        <p className={`${linkedNpcId ? "mt-2" : "mt-1"} text-xs text-muted-foreground`}>{shop.cityName} · {itemCounts[shop.size]} emplacements</p>
      </div>
      {actions !== "none" && <div className="flex shrink-0 flex-col items-center gap-1 border-l border-primary/15 p-2">
        {actions === "locations" && <Button type="button" variant="ghost" size="icon-sm" onClick={() => toggleShop(shop.id)} aria-expanded={!collapsed} aria-label={collapsed ? `Développer ${shop.name}` : `Réduire ${shop.name}`} title={collapsed ? "Développer" : "Réduire"}><ChevronDown className={`transition-transform ${collapsed ? "-rotate-90" : ""}`} /></Button>}
        {onRerollShop && <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={() => onRerollShop(shop)} aria-label={`Relancer le magasin ${shop.name}`} title="Relancer le magasin"><RefreshCw /></Button>}
        {onRename && <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={() => onRename(shop)} aria-label={`Nommer ${shop.name}`} title="Nommer"><Pencil /></Button>}
        {actions === "campaign" && <Button type="button" size="icon-sm" variant="outline" disabled={pending} onClick={() => onSave?.(shop)} aria-label={`Sauvegarder ${shop.name}`} title="Sauvegarder"><Bookmark /></Button>}
        {actions === "sandbox" && onSend && <Button type="button" size="icon-sm" variant="outline" disabled={pending} onClick={() => onSend(shop)} aria-label={`Envoyer ${shop.name} vers une campagne`} title="Vers une campagne"><Send /></Button>}
        {onAdd && actions !== "locations" && <Button type="button" size="icon-sm" variant="outline" disabled={pending} onClick={() => onAdd(shop)} aria-label={`Ajouter ${shop.name} à la campagne`} title="Ajouter à la campagne"><MapPinned /></Button>}
        {onLink && <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={() => onLink(shop)} aria-label={`Lier ${shop.name} à un PNJ`} title="Lier à un PNJ"><Link2 /></Button>}
        {(actions === "saved" || actions === "locations") && <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending} onClick={() => onDelete?.(shop)} aria-label={`Supprimer ${shop.name}`} title="Supprimer"><Trash2 /></Button>}
      </div>}
    </header>
    {!collapsed && (shop.items.length ? <ul className="divide-y">{shop.items.map((item) => { const itemKey = `${shop.id}:${item.id}`; const expanded = expandedItems.has(itemKey); return <li key={item.id} className="px-4 py-2"><div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto_1.75rem_1.75rem] items-center gap-2"><span className="flex size-7 items-center justify-center rounded-md border bg-background text-sm">{item.icon || "◇"}</span><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-1.5"><p className="truncate text-sm font-semibold">{item.nameHtml?.trim() ? <span className={shopRichText} dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.nameHtml) }} /> : item.name}</p><Badge variant="outline" className={`px-1.5 py-0 text-[9px] ${rarityClasses[item.rarity]}`}>{rarityLabels[item.rarity]}</Badge></div><p className="mt-0.5 truncate text-[10px] text-muted-foreground"><span className="font-semibold text-foreground/65">{item.type || "Objet"}</span>{item.subtype ? ` · ${item.subtype}` : ""}</p></div><EditablePrice item={item} pending={pending} onCommit={onPriceChange ? (price) => onPriceChange(shop, item, price) : undefined} />{onReroll ? <Button type="button" variant="ghost" size="icon-xs" disabled={pending} aria-label={`Relancer ${item.name}`} title="Relancer cette ligne" onClick={() => onReroll(shop, item)}><RefreshCw /></Button> : <span />}<Button type="button" variant="ghost" size="icon-xs" aria-expanded={expanded} aria-label={expanded ? `Masquer les détails de ${item.name}` : `Afficher les détails de ${item.name}`} onClick={() => toggleItem(itemKey)}><ChevronDown className={`transition-transform ${expanded ? "rotate-180" : ""}`} /></Button></div>{expanded && <div className="ml-9 mt-2 grid gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs leading-5"><div><p className="font-semibold text-foreground">Description</p>{item.descriptionHtml?.trim() ? <p className={`mt-0.5 text-muted-foreground ${shopRichText}`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.descriptionHtml) }} /> : <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{item.description || "Aucune description renseignée."}</p>}</div>{actions !== "locations" && <div><p className="font-semibold text-foreground">Effet</p>{item.effectHtml?.trim() ? <p className={`mt-0.5 text-muted-foreground ${shopRichText}`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.effectHtml) }} /> : <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{item.effect || "Aucun effet renseigné."}</p>}</div>}</div>}</li> })}</ul> : <div className="grid min-h-28 place-items-center p-5 text-center"><div><PackageOpen className="mx-auto size-6 text-muted-foreground/60" /><p className="mt-2 text-xs text-muted-foreground">Aucun objet compatible.</p></div></div>)}
  </article> })}</div>
}

function NpcDialog({ state, npcs, pending, onClose, onConfirm }: { state: { action: "add-to-campaign" | "link-npc"; shops: GeneratedShop[] } | null; npcs: CampaignNpcRecord[]; pending: boolean; onClose: () => void; onConfirm: (npcId: string) => void }) {
  const [withNpc, setWithNpc] = useState(false); const [query, setQuery] = useState(""); const [npcId, setNpcId] = useState("")
  const filtered = useMemo(() => npcs.filter((npc) => !query.trim() || npc.name.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr"))), [npcs, query]); const forceNpc = state?.action === "link-npc"
  return <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{forceNpc ? "Lier à un PNJ" : "Ajouter à la campagne"}</DialogTitle></DialogHeader>{state && <div className="space-y-4"><div className="max-h-28 overflow-y-auto rounded-xl border bg-muted/35 p-3 text-sm">{state.shops.map((shop) => <div key={shop.id} className="flex items-center justify-between gap-3 py-1"><span className="font-medium">{shop.name}</span><span className="text-xs text-muted-foreground">{shop.cityName} · {shop.size}</span></div>)}</div>{!forceNpc && <div className="flex gap-2"><Button type="button" variant={!withNpc ? "default" : "outline"} onClick={() => { setWithNpc(false); setNpcId("") }}><Check />Sans PNJ</Button><Button type="button" variant={withNpc ? "default" : "outline"} onClick={() => setWithNpc(true)}><UserRound />Lier à un PNJ</Button></div>}{(forceNpc || withNpc) && <div className="rounded-xl border p-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher un PNJ de la campagne…" /></div><div className="mt-2 max-h-52 space-y-1 overflow-y-auto">{filtered.length ? filtered.map((npc) => <button key={npc.id} type="button" onClick={() => setNpcId(npc.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${npcId === npc.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}><UserRound className="size-4" /><span className="flex-1 font-medium">{npc.name}</span></button>) : <p className="px-3 py-7 text-center text-sm text-muted-foreground">Aucun PNJ n’a encore été créé dans cette campagne.</p>}</div></div>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button><Button type="button" disabled={pending || ((forceNpc || withNpc) && !npcId)} onClick={() => onConfirm(forceNpc || withNpc ? npcId : "")}>{pending ? <LoaderCircle className="animate-spin" /> : forceNpc ? <Link2 /> : <MapPinned />}{forceNpc ? "Lier" : "Ajouter"}</Button></div></div>}</DialogContent></Dialog>
}

export function ShopGenerator({ items, loadError = "", pageLinked = "bac-a-sable", campaignId, savedHref, npcs = [], sourcePages = [], destinationPages = [], initialDraw = [] }: { items: ShopGeneratorItem[]; loadError?: string; pageLinked?: string; campaignId?: string; savedHref?: string; npcs?: CampaignNpcRecord[]; sourcePages?: ReusablePageOption[]; destinationPages?: ReusablePageOption[]; initialDraw?: GeneratedShop[] }) {
  const router = useRouter()
  const [cityKey, setCityKey] = useState<CityKey>(initialDraw[0]?.cityKey || "village"); const [shops, setShops] = useState<GeneratedShop[] | null>(initialDraw.length ? initialDraw : null); const [pending, setPending] = useState(false); const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [dialog, setDialog] = useState<{ action: "add-to-campaign" | "link-npc"; shops: GeneratedShop[] } | null>(null); const [importOpen, setImportOpen] = useState(false); const [renameTarget, setRenameTarget] = useState<GeneratedShop | null>(null); const [destinationShops, setDestinationShops] = useState<GeneratedShop[] | null>(null); const city = cityDefinitions[cityKey]

  async function persistDraw(nextShops: GeneratedShop[]) {
    if (pageLinked === "bac-a-sable") await persistShops("replace", pageLinked, nextShops)
    else await persistShops("replace-latest", pageLinked, nextShops.map((shop) => ({ ...shop, id: `latest:${shop.id}` })))
    const stored = pageLinked === "bac-a-sable"
      ? await fetchPersistedShops<GeneratedShop>(pageLinked)
      : await fetchPersistedShops<GeneratedShop>(pageLinked, { latest: true })
    requirePersistedShops(nextShops, stored, "Le tirage n’est pas revenu de Google Sheets après son enregistrement.")
    setShops(stored)
  }

  async function create() {
    const generated = generateShops(cityKey, items)
    setShops(generated); setNotice(""); setError(""); setPending(true)
    try {
      await persistDraw(generated)
      router.refresh()
      setNotice("Dernier tirage sauvegardé.")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Sauvegarde impossible.") }
    setPending(false)
  }

  async function run(action: "save" | "add-to-campaign" | "link-npc", selected: GeneratedShop[], npcId = "") {
    setPending(true); setError(""); setNotice("")
    try {
      await persistShops(action, pageLinked, selected, npcId)
      const stored = await fetchPersistedShops<SavedShopRecord>(pageLinked, { inCampaign: action === "add-to-campaign" })
      requirePersistedShops(selected, stored, "Les magasins ne sont pas retrouvés après leur enregistrement.", (candidate) => {
        const saved = candidate as SavedShopRecord
        if (action === "add-to-campaign" && !saved.inCampaign) return false
        return !npcId || saved.npcId === npcId
      })
      router.refresh()
      setNotice(action === "save" ? "Magasin(s) sauvegardé(s)." : action === "link-npc" ? "Lien avec le PNJ enregistré." : "Magasin(s) ajouté(s) à la campagne.")
      setDialog(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Enregistrement impossible.") }
    setPending(false)
  }

  async function rerollLine(shop: GeneratedShop, item: GeneratedShopItem) {
    const replacement = rerollShopItem(items, shop)
    if (!replacement || !shops) return
    const nextShops = shops.map((candidate) => candidate.id === shop.id ? { ...candidate, items: candidate.items.map((candidateItem) => candidateItem.id === item.id ? replacement : candidateItem) } : candidate)
    setShops(nextShops); setPending(true); setError(""); setNotice("")
    try { await persistDraw(nextShops); router.refresh(); setNotice("Ligne relancée et dernier tirage sauvegardé.") }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Relance impossible.") }
    setPending(false)
  }

  async function rerollWholeShop(shop: GeneratedShop) {
    if (!shops) return
    const updated = rerollShop(items, shop)
    const nextShops = shops.map((candidate) => candidate.id === shop.id ? updated : candidate)
    setShops(nextShops); setPending(true); setError(""); setNotice("")
    try { await persistDraw(nextShops); router.refresh(); setNotice("Magasin relancé et dernier tirage sauvegardé.") }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Relance impossible.") }
    setPending(false)
  }

  async function runImport(source: string, ids: string[]) {
    setPending(true); setError(""); setNotice("")
    try {
      const imported = await importShops(pageLinked, source, ids)
      const stored = await fetchPersistedShops(pageLinked)
      requirePersistedShops(imported, stored, "Les magasins importés ne sont pas retrouvés après leur enregistrement.")
      router.refresh(); setImportOpen(false)
      setNotice(`${imported.length} magasin${imported.length > 1 ? "s" : ""} récupéré${imported.length > 1 ? "s" : ""} dans les magasins sauvegardés.`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Import impossible.") }
    setPending(false)
  }

  async function renameShop(name: string) {
    if (!renameTarget || !shops) return
    const nextShops = shops.map((shop) => shop.id === renameTarget.id ? { ...shop, name } : shop)
    setShops(nextShops); setPending(true); setError(""); setNotice("")
    try { await persistDraw(nextShops); router.refresh(); setNotice("Nom du magasin enregistré."); setRenameTarget(null) }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Le nom n’a pas pu être enregistré.") }
    setPending(false)
  }

  async function sendToCampaign(destinationId: string) {
    if (!destinationShops) return
    setPending(true); setError(""); setNotice("")
    try {
      const copies = destinationShops.map((shop) => ({ ...shop, id: crypto.randomUUID() }))
      await persistShops("save", destinationId, copies)
      const stored = await fetchPersistedShops(destinationId)
      requirePersistedShops(copies, stored, "Les magasins copiés ne sont pas retrouvés dans la campagne.")
      router.refresh()
      setNotice(`${copies.length} magasin${copies.length > 1 ? "s ont" : " a"} été copié${copies.length > 1 ? "s" : ""} dans la campagne.`)
      setDestinationShops(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Copie vers la campagne impossible.") }
    setPending(false)
  }
  return <div className="mt-7 space-y-5"><section className="overflow-hidden rounded-2xl border bg-card/85 shadow-sm"><div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]"><div className="p-5 sm:p-6"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Dices className="size-5" /></span><h2 className="font-display text-2xl font-semibold">Générer une ville marchande</h2></div><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="grid flex-1 gap-1.5 text-sm font-medium">Taille de la ville<Select value={cityKey} onValueChange={(value) => { setCityKey(value as CityKey); setShops(null); setNotice("") }}><SelectTrigger className="h-11 w-full bg-background/70"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(cityDefinitions).map(([key, definition]) => <SelectItem key={key} value={key}>{definition.name} · {definition.population}</SelectItem>)}</SelectContent></Select></label><Button className="h-11 px-5" onClick={() => void create()} disabled={!items.length || pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Dices />}{shops ? "Relancer" : "Créer les magasins"}</Button></div></div><div className="border-t bg-primary/[0.045] p-5 lg:border-l lg:border-t-0 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Sélection actuelle</p><p className="font-display mt-2 text-3xl font-semibold">{city.name}</p><p className="mt-1 text-sm text-muted-foreground">{city.population}</p><div className="mt-4 flex flex-wrap gap-1.5">{shopDefinitions.map((shop) => <Badge key={shop.key} variant="outline" className="bg-background/55">{shop.name} {city.chances[shop.key]}%</Badge>)}</div></div></div></section>
    {loadError && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}{error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}{notice && <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</p>}
    {campaignId && <div className="flex flex-wrap gap-2 rounded-xl border bg-card/65 p-3"><Button disabled={!shops?.length || pending} onClick={() => shops && void run("save", shops)}><Save />Sauvegarder les magasins</Button>{savedHref && <Button asChild variant="outline"><Link href={savedHref} prefetch={false}><LibraryBig />Voir les magasins sauvegardés</Link></Button>}{sourcePages.length > 0 && <Button variant="outline" disabled={pending} onClick={() => setImportOpen(true)}><Download />Récupérer des magasins</Button>}<Button disabled={!shops?.length || pending} variant="secondary" onClick={() => shops && setDialog({ action: "add-to-campaign", shops })}><MapPinned />Ajouter à la campagne</Button></div>}
    {!campaignId && destinationPages.length > 0 && <div className="flex flex-wrap gap-2 rounded-xl border bg-card/65 p-3"><Button disabled={!shops?.length || pending} onClick={() => shops && setDestinationShops(shops)}><Send />Envoyer le tirage dans une campagne</Button></div>}
    {shops === null ? <section className="grid min-h-44 place-items-center rounded-2xl border border-dashed bg-card/35 p-8 text-center"><div><Store className="mx-auto size-8 text-primary/45" /><p className="font-display mt-3 text-xl font-semibold">Aucun tirage</p></div></section> : <section><div className="mb-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Résultat du tirage</p><h2 className="font-display mt-1 text-3xl font-semibold">{shops.length} magasin{shops.length > 1 ? "s" : ""} · {city.name}</h2></div><ShopCards shops={shops} actions={campaignId ? "campaign" : "sandbox"} pending={pending} onSave={(shop) => void run("save", [shop])} onSend={destinationPages.length ? (shop) => setDestinationShops([shop]) : undefined} onAdd={campaignId ? (shop) => setDialog({ action: "add-to-campaign", shops: [shop] }) : undefined} onLink={campaignId ? (shop) => setDialog({ action: "link-npc", shops: [shop] }) : undefined} onRename={setRenameTarget} onReroll={(shop, item) => void rerollLine(shop, item)} onRerollShop={(shop) => void rerollWholeShop(shop)} /></section>}
    {renameTarget && <RenameShopDialog key={renameTarget.id} shop={renameTarget} pending={pending} onClose={() => setRenameTarget(null)} onConfirm={(name) => void renameShop(name)} />}{destinationShops && <CampaignDestinationDialog shops={destinationShops} campaigns={destinationPages} pending={pending} onClose={() => setDestinationShops(null)} onConfirm={(destinationId) => void sendToCampaign(destinationId)} />}<NpcDialog state={dialog} npcs={npcs} pending={pending} onClose={() => setDialog(null)} onConfirm={(npcId) => dialog && void run(dialog.action, dialog.shops, npcId)} />{importOpen && <ImportShopsDialog open sourcePages={sourcePages} pending={pending} onClose={() => setImportOpen(false)} onImport={(source, ids) => void runImport(source, ids)} />}</div>
}

export function SavedShopCollection({ initialShops, pageLinked, npcs = [], generatorItems = [], mode = "saved" }: { initialShops: SavedShopRecord[]; pageLinked: string; npcs?: CampaignNpcRecord[]; generatorItems?: ShopGeneratorItem[]; mode?: "saved" | "locations" | "view" }) {
  const router = useRouter()
  const [shops, setShops] = useState(() => shopItemsWithCatalogRichText(initialShops, generatorItems)); const [pending, setPending] = useState(false); const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [dialog, setDialog] = useState<{ action: "add-to-campaign" | "link-npc"; shops: GeneratedShop[] } | null>(null); const [deleteTarget, setDeleteTarget] = useState<GeneratedShop | null>(null); const [renameTarget, setRenameTarget] = useState<GeneratedShop | null>(null)

  async function reloadCollection(expected: GeneratedShop[] = []) {
    const loaded = await fetchPersistedShops<SavedShopRecord>(pageLinked, { inCampaign: mode === "locations" })
    if (expected.length) requirePersistedShops(expected, loaded, "Le magasin n’est pas retrouvé dans Google Sheets après son enregistrement.")
    const focusedId = new URLSearchParams(window.location.search).get("shop")
    setShops(shopItemsWithCatalogRichText(focusedId ? loaded.filter((shop) => shop.id === focusedId) : loaded, generatorItems))
    return loaded
  }

  async function saveAndReload(updated: GeneratedShop, success: string) {
    await persistShops("save", pageLinked, [updated])
    await reloadCollection([updated])
    router.refresh()
    setNotice(success)
  }

  async function run(action: "add-to-campaign" | "link-npc", selected: GeneratedShop[], npcId = "") {
    setPending(true); setError(""); setNotice("")
    try {
      await persistShops(action, pageLinked, selected, npcId)
      const persisted = await fetchPersistedShops<SavedShopRecord>(pageLinked, { inCampaign: action === "add-to-campaign" || mode === "locations" })
      requirePersistedShops(selected, persisted, "Le magasin n’est pas retrouvé avec son état de campagne après l’enregistrement.", (candidate) => {
        const saved = candidate as SavedShopRecord
        if (action === "add-to-campaign" && !saved.inCampaign) return false
        return !npcId || saved.npcId === npcId
      })
      await reloadCollection()
      router.refresh()
      setNotice(action === "add-to-campaign" ? "Ajouté à la campagne." : "Lien avec le PNJ enregistré.")
      setDialog(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Enregistrement impossible.") }
    setPending(false)
  }

  async function remove(shop: GeneratedShop) {
    setPending(true); setError(""); setNotice("")
    try {
      await persistShops(mode === "locations" ? "remove-from-campaign" : "delete", pageLinked, [shop])
      const loaded = await reloadCollection()
      if (loaded.some((candidate) => candidate.id === shop.id)) throw new Error(mode === "locations" ? "Le magasin apparaît encore dans le Créateur de session après son retrait." : "Le magasin existe encore après sa suppression.")
      router.refresh()
      setNotice(mode === "locations" ? "Magasin retiré de Lieux et rencontres." : "Magasin supprimé.")
      setDeleteTarget(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible.") }
    setPending(false)
  }

  async function rerollLine(shop: GeneratedShop, item: GeneratedShopItem) {
    const replacement = rerollShopItem(generatorItems, shop)
    if (!replacement) return
    const updated = { ...shop, items: shop.items.map((candidate) => candidate.id === item.id ? replacement : candidate) }
    setPending(true); setError(""); setNotice("")
    try { await saveAndReload(updated, "Ligne relancée et magasin sauvegardé.") }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Relance impossible.") }
    setPending(false)
  }

  async function rerollWholeShop(shop: GeneratedShop) {
    const updated = rerollShop(generatorItems, shop)
    setPending(true); setError(""); setNotice("")
    try { await saveAndReload(updated, "Magasin relancé et sauvegardé.") }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Relance impossible.") }
    setPending(false)
  }

  async function changePrice(shop: GeneratedShop, item: GeneratedShopItem, price: string) {
    const updated = { ...shop, items: shop.items.map((candidate) => candidate.id === item.id ? { ...candidate, price } : candidate) }
    setPending(true); setError(""); setNotice("")
    try { await saveAndReload(updated, "Prix du magasin enregistré sans modifier l’objet source.") }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Le prix n’a pas pu être enregistré.") }
    setPending(false)
  }

  async function renameShop(name: string) {
    if (!renameTarget) return
    const updated = { ...renameTarget, name }
    setPending(true); setError(""); setNotice("")
    try { await saveAndReload(updated, "Nom du magasin enregistré."); setRenameTarget(null) }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Le nom n’a pas pu être enregistré.") }
    setPending(false)
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("shop")
    if (!id) return
    const timer = window.setTimeout(() => document.querySelector(`[data-shop-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120)
    return () => window.clearTimeout(timer)
  }, [])
  return <div className="space-y-4">{error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}{notice && <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</p>}{shops.length ? <ShopCards shops={shops} actions={mode === "view" ? "none" : mode} pending={pending} npcs={npcs} onAdd={mode === "view" ? undefined : (shop) => setDialog({ action: "add-to-campaign", shops: [shop] })} onLink={mode === "view" ? undefined : (shop) => setDialog({ action: "link-npc", shops: [shop] })} onRename={mode === "view" ? undefined : setRenameTarget} onDelete={mode === "view" ? undefined : setDeleteTarget} onReroll={mode !== "view" && generatorItems.length ? (shop, item) => void rerollLine(shop, item) : undefined} onRerollShop={mode !== "view" && generatorItems.length ? (shop) => void rerollWholeShop(shop) : undefined} onPriceChange={mode === "saved" || mode === "locations" ? (shop, item, price) => void changePrice(shop, item, price) : undefined} /> : <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed bg-card/35 p-8 text-center"><div><LibraryBig className="mx-auto size-8 text-muted-foreground/60" /><p className="font-display mt-3 text-xl font-semibold">Aucun magasin</p></div></div>}{renameTarget && <RenameShopDialog key={renameTarget.id} shop={renameTarget} pending={pending} onClose={() => setRenameTarget(null)} onConfirm={(name) => void renameShop(name)} />}<NpcDialog state={dialog} npcs={npcs} pending={pending} onClose={() => setDialog(null)} onConfirm={(npcId) => dialog && void run(dialog.action, dialog.shops, npcId)} /><AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !pending) setDeleteTarget(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{mode === "locations" ? "Retirer ce magasin ?" : "Supprimer ce magasin ?"}</AlertDialogTitle><AlertDialogDescription>{deleteTarget ? mode === "locations" ? `${deleteTarget.name} sera retiré du Créateur de session, mais restera dans les magasins sauvegardés.` : `${deleteTarget.name} sera supprimé des magasins sauvegardés.` : "Cette action est définitive."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={() => deleteTarget && void remove(deleteTarget)}>{pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}{mode === "locations" ? "Retirer" : "Supprimer"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
}

export function BackToShopGenerator({ href }: { href: string }) { return <Button asChild variant="ghost" className="-ml-3"><Link href={href}><ArrowLeft />Revenir à la création</Link></Button> }
