/**
 * Spécificité « Deck » : les cartes d'une classe (onglet « Cartes » du classeur « Sorts de
 * classe » : Carte, Nom, Effet, Icone, Classe — l'onglet existant, gardé tel quel), et le
 * réglage du deck (onglet « Decks » : nom, couleur, emplacement, taille de main, tirage).
 *
 * Sur la fiche, chaque carte est dans une pile : pioche, main, défausse ou retirée. Seules la
 * main, la défausse et les cartes retirées sont rangées dans la fiche (`specifics[deck]`,
 * par numéro de carte) ; la pioche, c'est tout le reste : une carte ajoutée au deck par le
 * MJ arrive d'elle-même dans la pioche.
 *
 * Sans dépendance au serveur.
 */
import { gaugePlacements, plainTextOf, type GaugePlacement } from "@/lib/class-specifics"

export const DECKS_TAB = "Decks"
export const CARDS_TAB = "Cartes"

export type DeckDrawMode = "hasard" | "choix"
export type ClassDeck = { id: string; classId: string; className: string; name: string; color: string; placement: GaugePlacement; handLimit: number; drawMode: DeckDrawMode; description: string; order: number }
/** `number` : la colonne « Carte », l'identifiant de la carte dans sa classe. */
export type DeckCard = { number: string; name: string; effect: string; icon: string; className: string }
export type DeckState = { hand: string[]; discard: string[]; removed: string[] }

export const DECK_HEADERS = ["ID", "Classe", "Nom", "Couleur", "Emplacement", "Main maximum", "Tirage", "Description", "Ordre", "Classe ID"] as const
export type DeckHeader = (typeof DECK_HEADERS)[number]
export const DECK_RICH_HEADERS = ["Description"] as const satisfies readonly DeckHeader[]
export const CARD_HEADERS = ["Carte", "Nom", "Effet", "Icone", "Classe"] as const
export type CardHeader = (typeof CARD_HEADERS)[number]
export const CARD_RICH_HEADERS = ["Effet"] as const satisfies readonly CardHeader[]

export const deckDrawModes: Array<{ value: DeckDrawMode; label: string; hint: string }> = [
  { value: "hasard", label: "Au hasard", hint: "« Piocher » tire une carte au hasard" },
  { value: "choix", label: "Au choix", hint: "Le joueur choisit la carte à piocher" },
]
export const deckColors = ["#6b4c9a", "#b9504e", "#285f8f", "#315b55", "#b7791f", "#7d7f86"]

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** La clé d'une carte dans l'onglet « Cartes » : sa classe et son numéro. */
export const cardKey = (className: string, number: string) => `${fold(className)}|${number.trim()}`

export function emptyDeck(classId: string, className: string, order = 0): ClassDeck {
  return { id: "", classId, className, name: "Deck", color: deckColors[0], placement: "sorts", handLimit: 0, drawMode: "hasard", description: "", order }
}

export function deckFromCells(cell: (header: DeckHeader) => string, rich?: (header: (typeof DECK_RICH_HEADERS)[number]) => string): ClassDeck | null {
  const id = cell("ID").trim()
  const name = cell("Nom").trim()
  if (!id || !name) return null
  const color = cell("Couleur").trim()
  const limit = Math.trunc(Number(cell("Main maximum").replace(",", ".")))
  const order = Number.parseFloat(cell("Ordre").replace(",", "."))
  const description = rich?.("Description") ?? escapeHtml(cell("Description")).replace(/\n/g, "<br>")
  const placementText = fold(cell("Emplacement"))
  return {
    id, name,
    classId: cell("Classe ID").trim(),
    className: cell("Classe").trim(),
    color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : deckColors[0],
    placement: gaugePlacements.find((option) => fold(option.label) === placementText || option.value === placementText)?.value ?? "sorts",
    handLimit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 99) : 0,
    drawMode: fold(cell("Tirage")).startsWith("au choix") || fold(cell("Tirage")) === "choix" ? "choix" : "hasard",
    description: plainTextOf(description) ? description : "",
    order: Number.isFinite(order) ? order : 0,
  }
}

export function deckCells(deck: ClassDeck): Record<DeckHeader, string> {
  return {
    "ID": deck.id,
    "Classe": deck.className,
    "Nom": deck.name.trim(),
    "Couleur": deck.color,
    "Emplacement": gaugePlacements.find((option) => option.value === deck.placement)?.label ?? deck.placement,
    "Main maximum": deck.handLimit > 0 ? String(deck.handLimit) : "",
    "Tirage": deckDrawModes.find((option) => option.value === deck.drawMode)?.label ?? "Au hasard",
    "Description": plainTextOf(deck.description) ? deck.description : "",
    "Ordre": String(deck.order),
    "Classe ID": deck.classId,
  }
}

export function cardFromCells(cell: (header: CardHeader) => string, rich?: (header: (typeof CARD_RICH_HEADERS)[number]) => string): DeckCard | null {
  const number = cell("Carte").trim()
  const name = cell("Nom").trim()
  if (!number || !name) return null
  const effect = rich?.("Effet") ?? escapeHtml(cell("Effet")).replace(/\n/g, "<br>")
  return { number, name, effect: plainTextOf(effect) ? effect : "", icon: cell("Icone").trim(), className: cell("Classe").trim() }
}

export function cardCells(card: DeckCard): Record<CardHeader, string> {
  return { "Carte": card.number, "Nom": card.name.trim(), "Effet": plainTextOf(card.effect) ? card.effect : "", "Icone": card.icon.trim(), "Classe": card.className }
}

/** Un deck et ses cartes reçus de l'éditeur, ramenés à des valeurs sûres. Les cartes sans numéro en reçoivent un. */
export function sanitizeDeck(raw: unknown, newId: () => string): { deck: ClassDeck; cards: DeckCard[] } | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const text = (item: unknown, limit = 200) => typeof item === "string" ? item.slice(0, limit) : typeof item === "number" ? String(item) : ""
  const deckRaw = value.deck && typeof value.deck === "object" ? value.deck as Record<string, unknown> : {}
  const classId = text(deckRaw.classId, 80).trim()
  const className = text(deckRaw.className).trim()
  if (!classId || !className) return null
  const id = text(deckRaw.id, 40)
  const limit = Math.trunc(Number(deckRaw.handLimit))
  const color = text(deckRaw.color, 16)
  const deck: ClassDeck = {
    id: /^DCK-[A-Z0-9]{4,16}$/.test(id) ? id : `DCK-${newId()}`,
    classId, className,
    name: text(deckRaw.name).trim() || "Deck",
    color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : deckColors[0],
    placement: gaugePlacements.some((option) => option.value === deckRaw.placement) ? deckRaw.placement as GaugePlacement : "sorts",
    handLimit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 99) : 0,
    drawMode: deckRaw.drawMode === "choix" ? "choix" : "hasard",
    description: text(deckRaw.description, 20_000),
    order: typeof deckRaw.order === "number" && Number.isFinite(deckRaw.order) ? deckRaw.order : 0,
  }
  const used = new Set<string>()
  const list = Array.isArray(value.cards) ? value.cards.slice(0, 200) : []
  let next = Math.max(0, ...list.map((item) => Math.trunc(Number((item as DeckCard | null)?.number)) || 0)) + 1
  const cards = list.flatMap((item): DeckCard[] => {
    if (!item || typeof item !== "object") return []
    const card = item as Record<string, unknown>
    const name = text(card.name).trim()
    if (!name) return []
    let number = text(card.number, 20).trim()
    if (!number || used.has(number)) number = String(next++)
    used.add(number)
    return [{ number, name, effect: text(card.effect, 20_000), icon: text(card.icon, 2000).trim(), className }]
  })
  return { deck, cards }
}

/** Les decks d'une classe, puis ses cartes ; retrouvés par l'identifiant, sinon par le nom de la classe. */
export function decksOfClass(decks: ClassDeck[], classItem: { id: string; name: string }) {
  return decks.filter((deck) => deck.classId ? deck.classId === classItem.id : fold(deck.className) === fold(classItem.name)).sort((a, b) => a.order - b.order)
}
export function cardsOfClass(cards: DeckCard[], className: string) {
  return cards.filter((card) => fold(card.className) === fold(className)).sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0) || a.number.localeCompare(b.number, "fr"))
}

/* ─────────────────────────────── Jeu ─────────────────────────────── */

export function parseDeckState(raw: unknown): DeckState {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const list = (item: unknown) => Array.isArray(item) ? [...new Set(item.filter((entry): entry is string => typeof entry === "string"))] : []
  return { hand: list(value.hand), discard: list(value.discard), removed: list(value.removed) }
}

export function deckStatesOf(choicesJson: string): Record<string, DeckState> {
  try {
    const parsed = JSON.parse(choicesJson || "{}") as { specifics?: Record<string, unknown> }
    const specifics = parsed?.specifics && typeof parsed.specifics === "object" ? parsed.specifics : {}
    return Object.fromEntries(Object.entries(specifics).map(([id, raw]) => [id, parseDeckState(raw)]))
  } catch {
    return {}
  }
}

export type DeckPiles = { draw: DeckCard[]; hand: DeckCard[]; discard: DeckCard[]; removed: DeckCard[] }

/** Les quatre piles : une carte disparue du deck est oubliée ; une carte nouvelle est dans la pioche. */
export function deckPiles(cards: DeckCard[], state: DeckState): DeckPiles {
  const byNumber = new Map(cards.map((card) => [card.number, card]))
  const pick = (numbers: string[]) => numbers.flatMap((number) => byNumber.get(number) ?? [])
  const placed = new Set([...state.hand, ...state.discard, ...state.removed])
  return { draw: cards.filter((card) => !placed.has(card.number)), hand: pick(state.hand), discard: pick(state.discard), removed: pick(state.removed) }
}

export type DeckPile = "draw" | "hand" | "discard" | "removed"

/** Déplace une carte vers une pile (la pioche : elle n'est plus nulle part ailleurs). */
export function moveCard(state: DeckState, number: string, to: DeckPile): DeckState {
  const without = (list: string[]) => list.filter((item) => item !== number)
  const next = { hand: without(state.hand), discard: without(state.discard), removed: without(state.removed) }
  if (to !== "draw") next[to] = [...next[to], number]
  return next
}

/** Une carte au hasard d'une liste ; `random` : pour les tests. */
export function randomCard(cards: DeckCard[], random: () => number = Math.random) {
  return cards.length ? cards[Math.min(cards.length - 1, Math.floor(random() * cards.length))] : null
}

/** La case des sorts choisis après un changement de deck ; tout le reste est gardé. */
export function withDeckState(choicesJson: string, deckId: string, state: DeckState) {
  let parsed: Record<string, unknown> = {}
  try {
    const value = JSON.parse(choicesJson || "{}") as unknown
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>
  } catch { /* case vide ou illisible : on part de rien */ }
  const specifics = parsed.specifics && typeof parsed.specifics === "object" && !Array.isArray(parsed.specifics) ? { ...(parsed.specifics as Record<string, unknown>) } : {}
  if (state.hand.length || state.discard.length || state.removed.length) specifics[deckId] = { hand: state.hand, discard: state.discard, removed: state.removed }
  else delete specifics[deckId]
  return JSON.stringify({ ...parsed, specifics })
}
