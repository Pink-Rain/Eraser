"use client"

import { useState } from "react"
import { ChevronDown, Hand, Layers, MoreHorizontal, RotateCcw, Shuffle, Spade, Trash2, Undo2 } from "lucide-react"

import { IndexRichText } from "@/components/eraser/index-references"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { deckPiles, moveCard, randomCard, type ClassDeck, type DeckCard, type DeckPile, type DeckState } from "@/lib/class-decks"
import { isImageSource } from "@/lib/index-columns"

function CardIcon({ icon, className = "" }: { icon: string; className?: string }) {
  if (!icon) return <Spade className={`text-muted-foreground/60 ${className}`} />
  // eslint-disable-next-line @next/next/no-img-element
  if (isImageSource(icon)) return <img src={icon} alt="" className={`object-contain ${className}`} />
  return <span className={`leading-none ${className}`}>{icon}</span>
}

/** Une carte, façon carte à jouer ; son effet au survol. `actions` : les boutons sous la carte. */
export function DeckCardView({ card, color, actions, small = false }: { card: DeckCard; color: string; actions?: React.ReactNode; small?: boolean }) {
  const face = <div className={`relative flex flex-col items-center justify-between rounded-xl border bg-card px-2 py-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${small ? "h-24 w-[4.5rem]" : "h-36 w-24"}`} style={{ borderColor: `${color}66`, borderTop: `3px solid ${color}` }}>
    <span className="absolute left-1.5 top-1 text-[9px] font-semibold tabular-nums" style={{ color }}>{card.number}</span>
    <CardIcon icon={card.icon} className={small ? "mt-2 size-6 text-xl" : "mt-3 size-9 text-3xl"} />
    <span className={`line-clamp-3 font-medium leading-tight ${small ? "text-[9px]" : "text-[11px]"}`}>{card.name}</span>
  </div>
  return <div className="flex flex-col items-center gap-1">
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild><div className="cursor-default">{face}</div></HoverCardTrigger>
      <HoverCardContent side="top" collisionPadding={12} className="max-h-[min(28rem,70vh)] w-80 space-y-1.5 overflow-y-auto rounded-xl p-3 text-xs leading-5" style={{ borderColor: `${color}66` }}>
        <p className="flex items-center gap-2 font-display text-sm font-semibold" style={{ color }}><CardIcon icon={card.icon} className="size-5 text-lg" />{card.name}<span className="ml-auto text-[10px] font-normal text-muted-foreground">n° {card.number}</span></p>
        {card.effect ? <IndexRichText html={card.effect} /> : <p className="text-muted-foreground">Pas d’effet écrit.</p>}
      </HoverCardContent>
    </HoverCard>
    {actions}
  </div>
}

const pileLabels: Record<DeckPile, string> = { draw: "Pioche", hand: "Main", discard: "Défausse", removed: "Retirées" }

/**
 * Le deck d'une classe sur la fiche : la main (cartes visibles), la pioche, la défausse et
 * les cartes retirées. `onChange` absent : en lecture (aperçu de l'éditeur).
 */
export function ClassDeckPanel({ deck, cards, state, onChange }: { deck: ClassDeck; cards: DeckCard[]; state: DeckState; onChange?: (state: DeckState) => void }) {
  const [open, setOpen] = useState<DeckPile | null>(null)
  const [choosing, setChoosing] = useState(false)
  const piles = deckPiles(cards, state)
  const color = deck.color
  const full = deck.handLimit > 0 && piles.hand.length >= deck.handLimit
  const live = Boolean(onChange)
  const move = (card: DeckCard, to: DeckPile) => onChange?.(moveCard(state, card.number, to))
  const draw = () => { const card = randomCard(piles.draw); if (card) move(card, "hand") }
  const fromDiscard = () => { const card = randomCard(piles.discard); if (card) move(card, "hand") }
  const small = "h-6 px-1.5 text-[10px]"

  const handActions = (card: DeckCard) => live && <div className="flex gap-0.5">
    <Button type="button" variant="ghost" size="xs" className={small} onClick={() => move(card, "discard")} title="Défausser (jouée)">Défausser</Button>
    <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(card, "removed")} title="Retirer du jeu" aria-label={`Retirer ${card.name} du jeu`}><Trash2 /></Button>
    <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(card, "draw")} title="Remettre dans la pioche" aria-label={`Remettre ${card.name} dans la pioche`}><Undo2 /></Button>
  </div>

  return <section className="space-y-3 rounded-xl px-3 py-2.5 shadow-sm" style={{ backgroundColor: `${color}10`, borderTop: `2px solid ${color}` }}>
    <div className="flex flex-wrap items-center gap-2">
      <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[.16em]" style={{ color }}><Layers className="size-3" />{deck.name}</p>
      <span className="text-[11px] text-muted-foreground">Pioche {piles.draw.length} · Main {piles.hand.length}{deck.handLimit ? `/${deck.handLimit}` : ""} · Défausse {piles.discard.length}{piles.removed.length ? ` · Retirées ${piles.removed.length}` : ""}</span>
      {live && <div className="ml-auto flex items-center gap-1">
        {deck.drawMode === "choix"
          ? <Popover open={choosing} onOpenChange={setChoosing}>
            <PopoverTrigger asChild><Button type="button" size="sm" disabled={!piles.draw.length || full} style={{ backgroundColor: color }} title={full ? "La main est pleine" : undefined}><Hand />Piocher</Button></PopoverTrigger>
            <PopoverContent align="end" className="max-h-80 w-72 overflow-y-auto p-1.5">
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Choisir une carte de la pioche</p>
              {piles.draw.map((card) => <button key={card.number} type="button" onClick={() => { move(card, "hand"); setChoosing(false) }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"><CardIcon icon={card.icon} className="size-4 text-sm" /><span className="truncate">{card.name}</span><span className="ml-auto text-[10px] text-muted-foreground">n° {card.number}</span></button>)}
            </PopoverContent>
          </Popover>
          : <Button type="button" size="sm" disabled={!piles.draw.length || full} onClick={draw} style={{ backgroundColor: color }} title={full ? "La main est pleine" : !piles.draw.length ? "La pioche est vide" : "Tirer une carte au hasard"}><Shuffle />Piocher</Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="Autres actions du deck"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem disabled={!piles.discard.length || full} onSelect={fromDiscard}><Shuffle />Tirer au hasard dans la défausse</DropdownMenuItem>
            <DropdownMenuItem disabled={!piles.discard.length} onSelect={() => onChange?.({ ...state, discard: [] })}><RotateCcw />Remettre la défausse dans la pioche</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!state.hand.length && !state.discard.length && !state.removed.length} onSelect={() => onChange?.({ hand: [], discard: [], removed: [] })}><Undo2 />Tout remettre dans la pioche</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
    </div>

    {piles.hand.length
      ? <div className="flex flex-wrap gap-2">{piles.hand.map((card) => <DeckCardView key={card.number} card={card} color={color} actions={handActions(card)} />)}</div>
      : <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">{cards.length ? "Aucune carte en main." : "Ce deck n’a pas encore de cartes."}</p>}

    {(["discard", "removed", ...(deck.drawMode === "hasard" ? [] : ["draw"])] as DeckPile[]).map((pile) => {
      const list = piles[pile]
      if (!list.length) return null
      return <div key={pile} className="rounded-lg border border-border/50 bg-background/30">
        <button type="button" onClick={() => setOpen((current) => current === pile ? null : pile)} className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs font-medium" aria-expanded={open === pile}>{pileLabels[pile]} ({list.length})<ChevronDown className={`size-3.5 transition-transform ${open === pile ? "rotate-180" : ""}`} /></button>
        {open === pile && <div className="flex flex-wrap gap-2 px-2.5 pb-2.5">{list.map((card) => <DeckCardView key={card.number} small card={card} color={color} actions={live && <div className="flex gap-0.5">
          {pile !== "hand" && <Button type="button" variant="ghost" size="xs" className={small} disabled={full} onClick={() => move(card, "hand")}>En main</Button>}
          {pile !== "draw" && <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(card, "draw")} title="Remettre dans la pioche" aria-label={`Remettre ${card.name} dans la pioche`}><Undo2 /></Button>}
        </div>} />)}</div>}
      </div>
    })}

    {deck.description && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Règles du deck</summary><IndexRichText html={deck.description} className="mt-1 leading-5" /></details>}
  </section>
}
