// Sans import : lu à la fois par google-sheets et par shop-schema (qui importe google-sheets).

/** Les magasins qui ont une devanture dessinée (tokens, tabletop, compagnon Roll20). */
export type VisualShopKey = "market" | "bookshop" | "antique" | "armory" | "black-market" | "alchemist" | "tavern"
/** Le type d'un magasin : ceux d'Eraser (« market »…) ou ceux créés dans Lieux › Magasin. */
export type ShopKey = string
const visualShopKeys = new Set<string>(["market", "bookshop", "antique", "armory", "black-market", "alchemist", "tavern"])

/** Une clé de type lisible et sûre : minuscules, chiffres et tirets. */
export function isShopKey(value: unknown): value is ShopKey {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,59}$/.test(value)
}

/** La devanture d'un magasin : un type sans dessin propre (Marché ambulant…) prend celle du Marché. */
export function visualShopKey(key: string): VisualShopKey {
  return visualShopKeys.has(key) ? key as VisualShopKey : "market"
}
