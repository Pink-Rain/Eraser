/**
 * L'achat d'un item dans un magasin : le prix en pièces de cuivre, et comment une bourse le
 * paie. Partagé par la fenêtre d'achat (aperçu) et le serveur (qui refait le calcul).
 *
 * Monnaie : 1 PO = 100 PC, 1 PN = 1,5 PO = 150 PC (lib/index-numbers.ts).
 */
import { parseIndexNumber, type NumberFormat } from "@/lib/index-numbers"

export type Coin = "PO" | "PC" | "PN"
/** La bourse d'un personnage : or (PO), cuivre (PC), or noir (PN). */
export type Purse = { or: number; cuivre: number; orNoir: number }

export const coins: Coin[] = ["PO", "PC", "PN"]
export const coinValue: Record<Coin, number> = { PC: 1, PO: 100, PN: 150 }
export const coinTitle: Record<Coin, string> = { PO: "Pièces d’or", PC: "Pièces de cuivre", PN: "Pièces d’or noir" }
const purseKey: Record<Coin, keyof Purse> = { PO: "or", PC: "cuivre", PN: "orNoir" }

const moneyFormat: NumberFormat = { unit: "money", defaultUnit: "PO" }

export const isCoin = (value: unknown): value is Coin => value === "PO" || value === "PC" || value === "PN"

/** Le prix d'une case (« 12 PO », « 1 PO 50 PC ») en PC, arrondi au cuivre près ; `null` : illisible. */
export function priceInCopper(price: string): number | null {
  const parsed = parseIndexNumber(price, moneyFormat)
  if (!parsed || parsed.unknown || !Number.isFinite(parsed.base) || parsed.base < 0) return null
  return Math.ceil(parsed.base - 1e-9)
}

/** La monnaie dans laquelle une case est écrite (celle que les joueurs voient). */
export function priceCoin(price: string): Coin {
  const unit = parseIndexNumber(price, moneyFormat)?.unit
  return isCoin(unit) ? unit : "PO"
}

/** Un montant en PC écrit dans une monnaie : « 12 PO », « 8 PN », « 1,33 PN ». */
export function formatCoins(copper: number, coin: Coin) {
  const value = copper / coinValue[coin]
  const rounded = Math.round(value * 100) / 100
  return `${rounded.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${coin}`
}

/** Un montant négocié (« 7,5 » en PO) en PC ; `null` si ce n'est pas un nombre positif. */
export function amountInCopper(amount: string | number, coin: Coin): number | null {
  const value = typeof amount === "number" ? amount : Number(String(amount).replace(/\s/g, "").replace(",", "."))
  if (!Number.isFinite(value) || value < 0) return null
  return Math.ceil(value * coinValue[coin] - 1e-9)
}

export const purseTotal = (purse: Purse) => purse.or * coinValue.PO + purse.cuivre + purse.orNoir * coinValue.PN

export type PaymentPlan =
  | { ok: true; cost: number; given: Record<Coin, number>; change: Record<Coin, number>; after: Purse }
  | { ok: false; cost: number; missing: number }

const clean = (value: number) => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))

/**
 * Comment la bourse paie `cost` PC : d'abord avec les pièces choisies, puis avec les autres,
 * du cuivre à l'or noir. La dernière pièce donnée peut dépasser : la différence est rendue en
 * PO et PC (« pas de cuivre : 1 PO donnée, 70 PC rendues »).
 */
export function planPayment(purse: Purse, cost: number, prefer: Coin): PaymentPlan {
  const have: Record<Coin, number> = { PO: clean(purse.or), PC: clean(purse.cuivre), PN: clean(purse.orNoir) }
  const due = clean(cost)
  const total = have.PO * coinValue.PO + have.PC + have.PN * coinValue.PN
  if (total < due) return { ok: false, cost: due, missing: due - total }
  const given: Record<Coin, number> = { PO: 0, PC: 0, PN: 0 }
  // Les pièces choisies d'abord…
  given[prefer] = Math.min(have[prefer], Math.ceil(due / coinValue[prefer]))
  let remaining = due - given[prefer] * coinValue[prefer]
  if (remaining > 0) {
    // … puis le reste : la combinaison des autres pièces qui rend le moins de monnaie, puis
    // celle qui donne le moins de pièces (le cuivre comble ce que l'or ne fait pas pile).
    const [first, second] = (["PO", "PN", "PC"] as Coin[]).filter((coin) => coin !== prefer && coin !== "PC")
    const copper = prefer === "PC" ? 0 : have.PC
    let best: { a: number; b: number; pc: number; over: number; count: number } | null = null
    const maxA = Math.min(have[first], Math.ceil(remaining / coinValue[first]))
    const maxB = second ? Math.min(have[second], Math.ceil(remaining / coinValue[second])) : 0
    for (let a = 0; a <= maxA; a += 1) {
      // Pour un nombre de pièces `a`, seules comptent : aucune, toutes, ou juste en dessous et
      // au-dessus de ce qu'il reste à payer.
      const left = remaining - a * coinValue[first]
      const near = second ? [0, maxB, Math.floor(left / coinValue[second]), Math.ceil(left / coinValue[second])] : [0]
      for (const b of new Set(near.map((value) => Math.max(0, Math.min(maxB, value))))) {
        const rest = left - (second ? b * coinValue[second] : 0)
        const pc = Math.max(0, rest)
        if (pc > copper) continue
        const over = Math.max(0, -rest)
        const count = a + b + pc
        if (!best || over < best.over || (over === best.over && count < best.count)) best = { a, b, pc, over, count }
      }
    }
    // Toujours trouvée : la bourse vaut au moins le prix.
    if (best) {
      given[first] += best.a
      if (second) given[second] += best.b
      given.PC += best.pc
      remaining = -best.over
    }
  }
  const back = -remaining
  const change: Record<Coin, number> = { PO: Math.floor(back / coinValue.PO), PC: back % coinValue.PO, PN: 0 }
  const after: Purse = { or: have.PO - given.PO + change.PO, cuivre: have.PC - given.PC + change.PC, orNoir: have.PN - given.PN }
  return { ok: true, cost: due, given, change, after }
}

/** « 1 PO et 20 PC » : des pièces écrites pour une phrase (vide si aucune). */
export function coinsText(amounts: Record<Coin, number>) {
  const parts = (["PN", "PO", "PC"] as Coin[]).filter((coin) => amounts[coin] > 0).map((coin) => `${amounts[coin].toLocaleString("fr-FR")} ${coin}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}` : parts[0] ?? ""
}

export const purseCoin = (purse: Purse, coin: Coin) => purse[purseKey[coin]]

/** Une vente gardée dans le magasin : ce qui est parti, à quel prix et à qui. */
export type ShopSale = {
  itemId: string
  name: string
  icon: string
  type: string
  subtype: string
  quantity: number
  /** Le prix payé, écrit (« 24 PO »). */
  price: string
  /** Le joueur a payé un prix décidé à l'oral avec le MJ. */
  negotiated: boolean
  characterId: string
  characterName: string
  sessionId: string
  at: string
}

/** Le nombre d'exemplaires d'une ligne : écrit, sinon le « Nombre max » de l'item, sinon 1. */
export function shopItemQuantity(item: { quantity?: number; maxQuantity?: number }) {
  const value = item.quantity ?? item.maxQuantity ?? 1
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 1
}

/** Ce qui s'affiche avec l'effet d'un item (compétence, dégâts, distance…) : au MJ seul. */
const effectKeys = ["skill", "distance", "action", "reload", "value", "attributes", "materials", "runes", "looks"]

/**
 * Ce que voit un joueur d'un magasin : la description des items, jamais leur effet (ni ce qui
 * s'affiche avec). Le MJ voit tout.
 */
export function shopForPlayers<T extends { items: Array<{ effect: string; effectHtml: string }> }>(shop: T): T {
  return {
    ...shop,
    items: shop.items.map((item) => {
      const copy: Record<string, unknown> = { ...item, effect: "", effectHtml: "" }
      for (const key of effectKeys) delete copy[key]
      return copy as typeof item
    }),
  }
}
