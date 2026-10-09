"use client"

import { useState } from "react"
import { ChevronDown, Hand, Layers, MoreHorizontal, RotateCcw, Shuffle, Spade, Trash2, Undo2 } from "lucide-react"

import { IndexRichText } from "@/components/eraser/index-references"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { deckPiles, moveCard, randomCard, type ClassDeck, type DeckCard, type DeckPile, type DeckState } from "@/lib/class-decks"
import { ImageEditor } from "@/components/eraser/index-cells"
import { IconPicker, IndexIconGlyph } from "@/components/eraser/index-gauge"
import { isImageSource, parseGlyphValue } from "@/lib/index-columns"

/** L'icône d'une carte : une image (importée ou par adresse), une icône d'Eraser (« skull ») ou un émoji. */
export function CardIcon({ icon, className = "" }: { icon: string; className?: string }) {
  if (!icon.trim()) return <Spade className={`text-muted-foreground/60 ${className}`} />
  // eslint-disable-next-line @next/next/no-img-element
  if (isImageSource(icon)) return <img src={icon} alt="" className={`object-contain ${className}`} />
  const glyph = parseGlyphValue(icon)
  // Un émoji prend la taille demandée (le glyphe d'index le dessine à la taille du texte autour).
  if (glyph.emoji) return <span aria-hidden="true" className={`inline-flex items-center justify-center leading-none ${className}`}>{glyph.emoji}</span>
  return <IndexIconGlyph icon={glyph.icon} emoji={glyph.emoji} filled={false} className={`leading-none ${className}`} />
}

/**
 * Le choix de l'icône d'une carte, comme une colonne Icône ou Image des index : une icône
 * d'Eraser (recherche en français ou en anglais) ou un émoji, une image importée, ou
 * l'adresse d'une image.
 */
export function CardIconField({ value, onChange, label, text = "Icône" }: { value: string; onChange: (value: string) => void; label: string; text?: string }) {
  const [open, setOpen] = useState(false)
  const image = isImageSource(value)
  const glyph = image ? {} : parseGlyphValue(value)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" aria-label={label} title="Changer l’icône">
        <CardIcon icon={value} className="size-4 text-base" /><span className="text-xs">{text}</span>
      </Button>
    </PopoverTrigger>
    {open && <PopoverContent align="end" className="w-80 space-y-3 p-3">
      <div className="grid gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Icône d’Eraser ou émoji</p>
        <IconPicker icon={glyph.icon} emoji={glyph.emoji} allowNone onChange={(next) => onChange(next.emoji?.trim() || next.icon || "")} />
      </div>
      <div className="grid gap-1.5 border-t pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Ou une image</p>
        {image && <div className="grid h-24 place-items-center overflow-hidden rounded-lg border bg-muted/40"><CardIcon icon={value} className="max-h-full max-w-full" /></div>}
        <ImageEditor key={image ? value : ""} value={image ? value : ""} alt={label} onChange={onChange} />
      </div>
      {value.trim() && <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => { onChange(""); setOpen(false) }}><Trash2 />Sans icône</Button>}
    </PopoverContent>}
  </Popover>
}

/** Une carte, façon carte à jouer ; son effet au survol. `actions` : les boutons sous la carte. */
export function DeckCardView({ card, color: deckColor, actions, small = false }: { card: DeckCard; color: string; actions?: React.ReactNode; small?: boolean }) {
  const color = card.color || deckColor
  const face = <div className={`relative flex flex-col items-center justify-between rounded-xl border bg-card px-2 py-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${small ? "h-24 w-[4.5rem]" : "h-36 w-24"}`} style={{ borderColor: `${color}66`, borderTop: `3px solid ${color}` }}>
    {/* Le coin, comme une carte à jouer : le numéro, et sous lui la petite icône. */}
    <span className="absolute left-1.5 top-1 flex flex-col items-center gap-0.5" style={{ color }}>
      <span className="text-[9px] font-semibold leading-none tabular-nums">{card.number}</span>
      {card.icon.trim() && <CardIcon icon={card.icon} className={small ? "size-2.5 text-[8px]" : "size-3 text-[10px]"} />}
    </span>
    {/* Au centre, l'illustration ; à défaut, l'icône en grand. */}
    {isImageSource(card.illustration)
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={card.illustration} alt="" className={`mt-3 w-full rounded-md object-contain ${small ? "h-10" : "h-16"}`} />
      : <span style={card.illustration.trim() ? undefined : { color }}><CardIcon icon={card.illustration.trim() || card.icon} className={small ? "mt-2 size-6 text-xl" : "mt-3 size-9 text-3xl"} /></span>}
    <span className={`line-clamp-3 font-medium leading-tight ${small ? "text-[9px]" : "text-[11px]"}`}>{card.name}</span>
  </div>
  return <div className="flex flex-col items-center gap-1">
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild><div className="cursor-default">{face}</div></HoverCardTrigger>
      <HoverCardContent side="top" collisionPadding={12} className="max-h-[min(28rem,70vh)] w-80 space-y-1.5 overflow-y-auto rounded-xl p-3 text-xs leading-5" style={{ borderColor: `${color}66` }}>
        <p className="flex items-center gap-2 font-display text-sm font-semibold" style={{ color }}><CardIcon icon={card.icon || card.illustration} className="size-5 text-lg" />{card.name}<span className="ml-auto text-[10px] font-normal text-muted-foreground">n° {card.number}</span></p>
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
        {deck.drawMode !== "choix" && <Button type="button" size="sm" disabled={!piles.draw.length || full} onClick={draw} style={{ backgroundColor: color }} title={full ? "La main est pleine" : !piles.draw.length ? "La pioche est vide" : "Tirer une carte au hasard"}><Shuffle />Piocher</Button>}
        {deck.drawMode !== "hasard" && <Popover open={choosing} onOpenChange={setChoosing}>
            <PopoverTrigger asChild>{deck.drawMode === "choix"
              ? <Button type="button" size="sm" disabled={!piles.draw.length || full} style={{ backgroundColor: color }} title={full ? "La main est pleine" : undefined}><Hand />Piocher</Button>
              : <Button type="button" size="sm" variant="outline" disabled={!piles.draw.length || full} style={{ borderColor: `${color}88`, color }} title={full ? "La main est pleine" : "Prendre la carte de son choix dans la pioche"}><Hand />Choisir</Button>}</PopoverTrigger>
            <PopoverContent align="end" className="max-h-80 w-72 overflow-y-auto p-1.5">
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Choisir une carte de la pioche</p>
              {piles.draw.map((card) => <button key={card.number} type="button" onClick={() => { move(card, "hand"); setChoosing(false) }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"><span style={{ color: card.color || color }}><CardIcon icon={card.icon || card.illustration} className="size-4 text-sm" /></span><span className="truncate">{card.name}</span><span className="ml-auto text-[10px] text-muted-foreground">n° {card.number}</span></button>)}
            </PopoverContent>
          </Popover>}
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
