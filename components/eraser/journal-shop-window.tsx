"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, Store } from "lucide-react"

import { SavedShopCollection } from "@/components/eraser/shop-generator"
import { SessionRevealProvider } from "@/components/eraser/session-reveal"
import { patchSession } from "@/components/eraser/session-picker"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ShopBuyer } from "@/lib/shop-access"
import type { CampaignNpcRecord, SavedShopRecord, ShopGeneratorItem } from "@/lib/shop-schema"
import type { ShopTypeDefinition } from "@/lib/shop-types"
import type { SessionRevealKind } from "@/lib/session-reveal"

type ShopView = { shop: SavedShopRecord; canManage: boolean; buyers: ShopBuyer[]; npcs: CampaignNpcRecord[]; types: ShopTypeDefinition[]; generatorItems: ShopGeneratorItem[] }

/**
 * La vitrine d'un magasin de la session, par-dessus le journal. Le MJ y a les mêmes choix que
 * dans le Créateur de session (relancer, choisir, prix, exemplaires, œil, retirer…) et peut
 * faire acheter un joueur ; un joueur y voit les items sans leur effet et peut acheter.
 */
export function JournalShopWindow({ campaignId, sessionId, sessionLabel, shopId, inEvents, hidden: initialHidden, style, onClose }: {
  campaignId: string
  sessionId: string
  /** « S3 - La forêt » : sous le titre de la fenêtre. */
  sessionLabel: string
  shopId: string
  /** Un marché ambulant rangé parmi les événements de la session (« event:shop:ID »). */
  inEvents: boolean
  /** Pour le MJ : ce que la session cache encore aux joueurs. */
  hidden: string[]
  style?: CSSProperties
  onClose: () => void
}) {
  const router = useRouter()
  const [view, setView] = useState<ShopView | null>(null)
  const [error, setError] = useState("")
  const [hidden, setHidden] = useState(initialHidden)
  const [saving, setSaving] = useState<string | null>(null)
  // La fenêtre reste ouverte et se met à jour sur place : le journal derrière n'est relu
  // qu'à sa fermeture (le relire tout de suite la refermait).
  const changed = useRef(false)
  const close = () => { onClose(); if (changed.current) router.refresh() }
  const initialShops = useMemo(() => view ? [view.shop] : [], [view])

  useEffect(() => {
    let active = true
    fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/shops/${encodeURIComponent(shopId)}?session=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json() as ShopView & { error?: string } }))
      .then(({ ok, payload }) => { if (!active) return; if (ok) setView(payload); else setError(payload.error || "Le magasin n’a pas pu être ouvert.") })
      .catch(() => { if (active) setError("Le magasin n’a pas pu être ouvert. Réessaie dans un instant.") })
    return () => { active = false }
  }, [campaignId, shopId, sessionId])

  const shopKey = (id: string) => inEvents ? `event:shop:${id}` : `shop:${id}`
  // L'œil du MJ, comme dans le Créateur de session : il révèle ou cache le magasin dans le journal.
  const reveal = {
    isHidden: (kind: SessionRevealKind, id: string) => kind === "shop" ? hidden.includes(`shop:${id}`) || hidden.includes(`event:shop:${id}`) : hidden.includes(`${kind}:${id}`),
    toggle: (kind: SessionRevealKind, id: string) => {
      if (kind !== "shop") return
      const key = shopKey(id)
      const hide = !reveal.isHidden(kind, id)
      setSaving(`shop:${id}`)
      setHidden((current) => hide ? [...current, key] : current.filter((entry) => entry !== key && entry !== `shop:${id}` && entry !== `event:shop:${id}`))
      patchSession(campaignId, sessionId, { visibility: hide ? { hide: [key] } : { reveal: [key] } })
        .then((session) => { setHidden(session.hidden ?? []); changed.current = true })
        .catch(() => setHidden(initialHidden))
        .finally(() => setSaving(null))
    },
    saving,
  }

  const content = view && <SavedShopCollection
    single
    initialShops={initialShops}
    salesSession={sessionId}
    refresh={() => { changed.current = true }}
    pageLinked={campaignId}
    npcs={view.npcs}
    generatorItems={view.generatorItems}
    types={view.types}
    mode={view.canManage ? "session" : "view"}
    session={view.canManage ? {
      currentId: sessionId,
      ids: [view.shop.id],
      onAdd: async () => {},
      // Retirer le magasin de la session : la fenêtre se ferme, le journal se relit.
      onRemove: async (id) => {
        await patchSession(campaignId, sessionId, inEvents ? { events: { remove: [`shop:${id}`] } } : { remove: { shopIds: [id] } })
        changed.current = true
        close()
      },
    } : undefined}
    purchase={{ campaignId, sessionId, buyers: view.buyers }}
  />

  return <Dialog open onOpenChange={(open) => { if (!open) close() }}>
    {/* Échap dans un champ (prix, exemplaires) annule la saisie, sans fermer la vitrine. */}
    <DialogContent style={style} onEscapeKeyDown={(event) => { if (document.activeElement?.closest("input, textarea, select")) event.preventDefault() }}
      className="flex max-h-[min(54rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-3xl">
      <DialogHeader className="flex-row items-center gap-2.5 border-b px-5 py-3 pr-12 text-left">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden><Store className="size-4" /></span>
        <div className="min-w-0">
          <DialogTitle className="truncate font-display text-lg leading-tight">{view?.shop.name ?? "Magasin"}</DialogTitle>
          <DialogDescription className="truncate text-xs">{sessionLabel}{view && !view.canManage ? " · les effets se découvrent à la table" : ""}</DialogDescription>
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 scrollbar-thin sm:p-5">
        {error ? <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>
          : !view ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Ouverture du magasin" /></div>
            : view.canManage ? <SessionRevealProvider value={reveal}>{content}</SessionRevealProvider> : content}
      </div>
    </DialogContent>
  </Dialog>
}
