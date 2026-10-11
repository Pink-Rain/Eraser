// Sans import : lu à la fois par google-sheets et par shop-schema (qui importe google-sheets).

/** Les magasins qui ont une devanture dessinée (tokens, tabletop, compagnon Roll20). */
export type VisualShopKey = "market" | "bookshop" | "antique" | "armory" | "black-market" | "alchemist" | "tavern"
export type ShopKey = VisualShopKey | "travelling-market"
export const shopKeyList: ShopKey[] = ["market", "bookshop", "antique", "armory", "black-market", "alchemist", "tavern", "travelling-market"]
const visualShopKeys = new Set<string>(["market", "bookshop", "antique", "armory", "black-market", "alchemist", "tavern"])

/** La devanture d'un magasin : un type sans dessin propre (Marché ambulant…) prend celle du Marché. */
export function visualShopKey(key: string): VisualShopKey {
  return visualShopKeys.has(key) ? key as VisualShopKey : "market"
}
