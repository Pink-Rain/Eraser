"use client"

import { useEffect, useState } from "react"
import { Coins, Handshake, LoaderCircle, Minus, Plus, ShoppingCart } from "lucide-react"

import { announceInventoryReceived } from "@/components/eraser/item-notifications"
import { ObjectIcon } from "@/components/eraser/object-icon"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ShopBuyer } from "@/lib/shop-access"
import { amountInCopper, coins, coinsText, coinTitle, formatCoins, planPayment, priceCoin, priceInCopper, shopItemQuantity, type Coin, type Purse } from "@/lib/shop-purchase"
import type { GeneratedShopItem, SavedShopRecord } from "@/lib/shop-schema"
import { cn } from "@/lib/utils"

/** Où un achat se fait : la campagne, la session affichée et pour qui le lecteur achète. */
export type ShopPurchaseBinding = { campaignId: string; sessionId: string; buyers: ShopBuyer[] }

const coinName: Record<Coin, string> = { PO: "or", PC: "cuivre", PN: "or noir" }

const coinTone: Record<Coin, string> = {
  PO: "border-amber-300 bg-amber-100 text-amber-900",
  PC: "border-orange-300 bg-orange-100 text-orange-900",
  PN: "border-zinc-700 bg-zinc-900 text-amber-200",
}

function PurseLine({ purse }: { purse: Purse }) {
  return <span className="inline-flex flex-wrap gap-1">
    {(["PN", "PO", "PC"] as Coin[]).map((coin) => <span key={coin} title={coinTitle[coin]} className={cn("rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums", coinTone[coin])}>{(coin === "PN" ? purse.orNoir : coin === "PO" ? purse.or : purse.cuivre).toLocaleString("fr-FR")} {coin}</span>)}
  </span>
}

/**
 * « Acheter cet item ? » : pour quel personnage, combien, avec quelles pièces (le prix est
 * converti au taux habituel), ou au prix négocié à l'oral avec le MJ. La bourse est lue à
 * l'ouverture : la fenêtre montre ce qui sera donné et la monnaie rendue.
 */
export function ShopBuyDialog({ shop, item, purchase, onClose, onBought }: {
  shop: SavedShopRecord
  item: GeneratedShopItem
  purchase: ShopPurchaseBinding
  onClose: () => void
  /** Le magasin tel que le serveur l'a écrit après la vente, et une phrase pour la page. */
  onBought: (shop: SavedShopRecord, message: string) => void
}) {
  const stock = shopItemQuantity(item)
  const unit = priceInCopper(item.price)
  const shown = priceCoin(item.price)
  const [buyerId, setBuyerId] = useState(purchase.buyers[0]?.id ?? "")
  const [quantity, setQuantity] = useState(1)
  const [pay, setPay] = useState<Coin>(shown)
  const [negotiating, setNegotiating] = useState(unit === null)
  const [amount, setAmount] = useState("")
  const [amountCoin, setAmountCoin] = useState<Coin>(shown)
  const [purses, setPurses] = useState<Record<string, Purse | null | "error">>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const purse = purses[buyerId]
  const buyer = purchase.buyers.find((candidate) => candidate.id === buyerId)

  // La bourse du personnage choisi, lue une fois par personnage.
  useEffect(() => {
    if (!buyerId || purses[buyerId] !== undefined) return
    let active = true
    const query = new URLSearchParams({ characterId: buyerId, session: purchase.sessionId })
    fetch(`/api/campaigns/${encodeURIComponent(purchase.campaignId)}/shops/${encodeURIComponent(shop.id)}/buy?${query}`, { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json() as { purse?: Purse | null; error?: string } }))
      .then(({ ok, payload }) => { if (active) setPurses((current) => ({ ...current, [buyerId]: ok ? payload.purse ?? null : "error" })) })
      .catch(() => { if (active) setPurses((current) => ({ ...current, [buyerId]: "error" })) })
    return () => { active = false }
  }, [buyerId, purses, purchase.campaignId, purchase.sessionId, shop.id])

  const negotiated = negotiating ? amountInCopper(amount, amountCoin) : null
  const cost = negotiating ? (amount.trim() ? negotiated : null) : unit === null ? null : unit * quantity
  const paidWith = negotiating ? amountCoin : pay
  const plan = cost !== null && purse && purse !== "error" ? planPayment(purse, cost, paidWith) : null
  const canBuy = Boolean(buyer && plan?.ok && !pending)

  async function buy() {
    if (!buyer || cost === null) return
    setPending(true); setError("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(purchase.campaignId)}/shops/${encodeURIComponent(shop.id)}/buy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId: buyer.id, itemId: item.id, quantity, sessionId: purchase.sessionId, ...(negotiating ? { negotiated: { amount, coin: amountCoin } } : { pay, expectedPrice: item.price }) }),
      })
      const payload = await response.json().catch(() => ({})) as { shop?: SavedShopRecord; error?: string; landedOnGround?: boolean }
      if (!response.ok || !payload.shop) throw new Error(payload.error || "L’achat n’a pas pu se faire.")
      announceInventoryReceived(buyer.id)
      const what = `${quantity > 1 ? `${quantity} × ` : ""}${item.name}`
      onBought(payload.shop, `${buyer.name} a acheté ${what} pour ${formatCoins(cost, paidWith)}.${payload.landedOnGround ? " Plus de place : c’est posé au sol." : ""}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L’achat n’a pas pu se faire.")
      // La bourse a pu changer : elle sera relue.
      setPurses((current) => { const next = { ...current }; delete next[buyerId]; return next })
    }
    setPending(false)
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
    <DialogContent className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md">
      <DialogHeader className="flex-row items-center gap-3 border-b bg-primary/[0.045] px-5 py-4 pr-12 text-left">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background p-1"><ObjectIcon icon={item.icon} name={item.name} type={item.type} subtype={item.subtype} className="size-full" emojiClassName="text-2xl" fallback={<ShoppingCart className="size-5 text-primary/60" />} /></span>
        <div className="min-w-0">
          <DialogTitle className="font-display text-xl leading-tight">Acheter {item.name} ?</DialogTitle>
          <DialogDescription className="truncate">{shop.name}{stock > 1 ? ` · ${stock} en vente` : ""}</DialogDescription>
        </div>
      </DialogHeader>

      <div className="space-y-4 px-5 py-4">
        {purchase.buyers.length === 0
          ? <p className="rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground">Aucun personnage ne peut acheter ici : il faut un personnage de cette campagne.</p>
          : purchase.buyers.length > 1 && <label className="grid gap-1.5 text-sm font-medium">Pour
            <NativeSelect value={buyerId} onChange={(event) => { setBuyerId(event.target.value); setError("") }} disabled={pending}>
              {purchase.buyers.map((candidate) => <NativeSelectOption key={candidate.id} value={candidate.id}>{candidate.name}</NativeSelectOption>)}
            </NativeSelect>
          </label>}

        {stock > 1 && <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Combien ?</span>
          <div className="flex items-center gap-1.5">
            <Button type="button" size="icon-sm" variant="outline" disabled={pending || quantity <= 1} onClick={() => setQuantity(quantity - 1)} aria-label="Un de moins"><Minus /></Button>
            <Input type="number" inputMode="numeric" min={1} max={stock} value={quantity} disabled={pending} aria-label="Nombre d’exemplaires"
              onChange={(event) => setQuantity(Math.max(1, Math.min(stock, Math.floor(Number(event.target.value) || 1))))} className="h-8 w-16 text-center tabular-nums" />
            <Button type="button" size="icon-sm" variant="outline" disabled={pending || quantity >= stock} onClick={() => setQuantity(quantity + 1)} aria-label="Un de plus"><Plus /></Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending || quantity === stock} onClick={() => setQuantity(stock)}>Tout ({stock})</Button>
          </div>
        </div>}

        {negotiating
          ? <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Handshake className="size-4 text-primary" />Prix convenu avec le MJ</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{unit === null ? "Le prix de cet item est illisible : note celui décidé à la table." : `Prix affiché : ${formatCoins(unit * quantity, shown)}${quantity > 1 ? ` pour ${quantity}` : ""}. Note le prix décidé à l’oral.`}</p>
            <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_9.5rem] gap-2">
              <Input autoFocus type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Montant" aria-label="Prix négocié" disabled={pending}
                onKeyDown={(event) => { if (event.key === "Enter" && canBuy) { event.preventDefault(); void buy() } }} />
              <NativeSelect value={amountCoin} onChange={(event) => setAmountCoin(event.target.value as Coin)} aria-label="Pièces avec lesquelles payer" disabled={pending}>
                {coins.map((coin) => <NativeSelectOption key={coin} value={coin}>{coin} · {coinName[coin]}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            {amount.trim() && negotiated === null && <p className="mt-1.5 text-xs text-destructive">Écris un nombre (« 7 » ou « 7,5 »).</p>}
          </div>
          : unit !== null && <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Payer en</span>
              <span className="text-xs text-muted-foreground">{quantity > 1 ? `${quantity} × ${formatCoins(unit, shown)}` : "au taux habituel"}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Pièces avec lesquelles payer">
              {coins.map((coin) => <button key={coin} type="button" role="radio" aria-checked={pay === coin} disabled={pending} onClick={() => setPay(coin)}
                className={cn("flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50", pay === coin ? "border-primary bg-primary/[0.07] ring-1 ring-primary/40" : "border-border bg-card hover:border-primary/40")}>
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[11px] font-bold tabular-nums", coinTone[coin])}>{formatCoins(unit * quantity, coin)}</span>
                <span className="text-[10.5px] text-muted-foreground">{coinName[coin]}</span>
              </button>)}
            </div>
          </div>}

        {buyer && <div className="rounded-xl border bg-muted/30 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium"><Coins className="size-4 text-primary" />Bourse de {buyer.name}</span>
            {purse === undefined ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Lecture de la bourse" />
              : purse === "error" ? <span className="text-xs text-destructive">illisible</span>
                : purse ? <PurseLine purse={purse} /> : <span className="text-xs text-muted-foreground">aucune bourse</span>}
          </div>
          {plan && (plan.ok
            ? <p className="mt-1.5 text-[13px] text-muted-foreground">
              {coinsText(plan.given) ? <>Tu donnes <b className="font-semibold text-foreground">{coinsText(plan.given)}</b>{coinsText(plan.change) ? <>, on te rend <b className="font-semibold text-foreground">{coinsText(plan.change)}</b></> : null}.</> : "C’est gratuit."}
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">Il restera <PurseLine purse={plan.after} /></span>
            </p>
            : <p className="mt-1.5 text-[13px] font-medium text-destructive">Il manque {formatCoins(plan.missing, plan.missing >= 100 ? "PO" : "PC")}.</p>)}
        </div>}

        {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      </div>

      <DialogFooter className="gap-2 border-t bg-muted/20 px-5 py-3 sm:justify-between">
        {negotiating
          ? <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Annuler</Button>
          : <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Non</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setNegotiating(true); setAmountCoin(shown); setError("") }}><Handshake />Négocier</Button>
          </div>}
        <Button type="button" disabled={!canBuy} onClick={() => void buy()}>{pending ? <LoaderCircle className="animate-spin" /> : <ShoppingCart />}Acheter{cost !== null && plan?.ok ? ` · ${formatCoins(cost, paidWith)}` : ""}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
