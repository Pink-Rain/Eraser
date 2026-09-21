"use client"

/* eslint-disable @next/next/no-img-element -- portraits use authenticated, dynamic API URLs */

import { ChevronDown, Heart, PackageOpen, Store, UserRound, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { TabletopEntityRecord, TabletopNpcDetail, TabletopShopDetail } from "@/lib/tabletop-schema"

const rarityLabels = { "very-common": "Très commun", common: "Commun", rare: "Rare", "very-rare": "Très rare", ultimate: "Ultime" }

export type TabletopDetailWindow = {
  id: string
  entity: TabletopEntityRecord
  kind: "shop" | "npc"
  portraitUrl: string
  shop: TabletopShopDetail | null
  npc: TabletopNpcDetail | null
  loading: boolean
  collapsed: boolean
}

type Props = {
  windows: TabletopDetailWindow[]
  onClose: (id: string) => void
  onToggle: (id: string) => void
}

function LifeBar({ current, total }: { current: number; total: number }) {
  const width = total > 0 ? Math.max(0, Math.min(100, current / total * 100)) : 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 font-semibold text-muted-foreground"><Heart className="size-3.5" />Vie</span>
        <span className="font-bold tabular-nums">{current}/{total}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-[#8f2e29] to-[#d46a4c]" style={{ width: `${width}%` }} /></div>
    </div>
  )
}

function WindowHeader({ window, onClose, onToggle }: { window: TabletopDetailWindow; onClose: () => void; onToggle: () => void }) {
  const Icon = window.kind === "shop" ? Store : UserRound
  const subtitle = window.kind === "shop"
    ? window.entity.linkedNpcName ? `Vendeur · ${window.entity.linkedNpcName}` : `${window.entity.shopCity || "Magasin"} · ${window.entity.shopSize || ""}`
    : window.entity.subtitle || "PNJ"
  return (
    <header
      className="grid cursor-pointer select-none grid-cols-[4rem_minmax(0,1fr)_auto] items-stretch border-b bg-primary/[0.07]"
      onDoubleClick={onToggle}
      title="Double-cliquer pour réduire"
    >
      <div className="relative grid min-h-16 place-items-center overflow-hidden border-r border-primary/15 bg-primary/[0.07] text-primary">
        <Icon className="size-5" />
        {window.portraitUrl && <img src={window.portraitUrl} alt="" className="absolute inset-0 size-full object-cover object-center" />}
        {window.kind === "shop" && window.portraitUrl && <span className="absolute bottom-1 right-1 grid size-6 place-items-center rounded-lg border bg-background/90"><Store className="size-3" /></span>}
      </div>
      <div className="min-w-0 px-3 py-2.5">
        <p className="font-display truncate text-lg font-semibold">{window.entity.name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-0.5 px-2">
        <Button type="button" variant="ghost" size="icon-sm" onClick={(event) => { event.stopPropagation(); onToggle() }} aria-label="Réduire"><ChevronDown /></Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={(event) => { event.stopPropagation(); onClose() }} aria-label="Fermer"><X /></Button>
      </div>
    </header>
  )
}

function ShopContent({ shop }: { shop: TabletopShopDetail | null }) {
  if (!shop?.items.length) return <div className="grid min-h-36 place-items-center p-5 text-center"><div><PackageOpen className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Aucun objet dans ce magasin.</p></div></div>
  return (
    <ul className="divide-y">
      {shop.items.map((item) => (
        <li key={item.id} className="px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-sm">{item.icon || "◇"}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5"><p className="font-semibold">{item.name}</p><Badge variant="outline" className="text-[9px]">{rarityLabels[item.rarity]}</Badge></div>
              <p className="text-[10px] text-muted-foreground">{[item.type, item.subtype].filter(Boolean).join(" · ")}</p>
              {item.description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>}
              {item.effect && <p className="mt-1 text-xs leading-5"><span className="font-semibold">Effet :</span> {item.effect}</p>}
            </div>
            {item.price && <Badge variant="secondary" className="shrink-0">{item.price}</Badge>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function NpcContent({ npc, entity }: { npc: TabletopNpcDetail | null; entity: TabletopEntityRecord }) {
  const detail = npc || {
    currentHp: entity.currentHp,
    totalHp: entity.totalHp,
    playerNotes: "",
    gmNotes: "",
    stats: [],
    inventory: [],
    canViewPrivate: false,
  }
  return (
    <div className="space-y-4 p-4">
      <LifeBar current={detail.currentHp} total={detail.totalHp} />
      {detail.playerNotes && <div><p className="text-[11px] font-semibold uppercase tracking-wider text-primary/70">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detail.playerNotes}</p></div>}
      {detail.stats.length > 0 && <div className="grid grid-cols-6 gap-1.5">{detail.stats.map((stat) => <div key={stat.short} title={stat.label} className="rounded-lg border bg-background/65 px-1.5 py-2 text-center"><p className="text-[9px] font-bold text-muted-foreground">{stat.short}</p><p className="font-display font-semibold tabular-nums">{stat.value}</p></div>)}</div>}
      {detail.inventory.length > 0 && <div><p className="text-[11px] font-semibold uppercase tracking-wider text-primary/70">Inventaire</p><div className="mt-2 space-y-1">{detail.inventory.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border bg-background/55 px-2.5 py-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{item.name}</span><Badge variant="outline">×{item.quantity}</Badge></div>)}</div></div>}
      {detail.gmNotes && <div><p className="text-[11px] font-semibold uppercase tracking-wider text-primary/70">Notes MJ</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detail.gmNotes}</p></div>}
    </div>
  )
}

export function TabletopDetailWindows({ windows, onClose, onToggle }: Props) {
  const expanded = windows.filter((window) => !window.collapsed)
  const collapsed = windows.filter((window) => window.collapsed)
  return (
    <>
      <div className="pointer-events-none fixed inset-x-4 bottom-20 z-[1180] flex max-h-[calc(100svh-7rem)] flex-row-reverse flex-wrap items-end gap-3 overflow-y-auto">
        {expanded.map((window) => (
          <section key={window.id} className="pointer-events-auto w-[min(25rem,calc(100vw-2rem))] shrink-0 overflow-hidden rounded-2xl border bg-card/97 shadow-2xl backdrop-blur">
            <WindowHeader window={window} onClose={() => onClose(window.id)} onToggle={() => onToggle(window.id)} />
            <div className="max-h-[min(32rem,62svh)] overflow-y-auto">
              {window.loading ? <div className="grid min-h-36 place-items-center"><span className="size-5 animate-spin rounded-full border-2 border-primary border-r-transparent" /></div> : window.kind === "shop" ? <ShopContent shop={window.shop} /> : <NpcContent npc={window.npc} entity={window.entity} />}
            </div>
          </section>
        ))}
      </div>

      {collapsed.length > 0 && (
        <div className="fixed bottom-4 left-4 right-20 z-[1240] flex min-w-0 gap-2 overflow-x-auto pr-2">
          {collapsed.map((window) => {
            const Icon = window.kind === "shop" ? Store : UserRound
            return (
              <div key={window.id} className="flex h-10 max-w-64 shrink-0 items-center rounded-xl border bg-card/97 shadow-xl backdrop-blur">
                <button type="button" onClick={() => onToggle(window.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-semibold">
                  <Icon className="size-4 shrink-0 text-primary" /><span className="truncate">{window.entity.name}</span>
                </button>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => onClose(window.id)} aria-label={`Fermer ${window.entity.name}`}><X /></Button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
