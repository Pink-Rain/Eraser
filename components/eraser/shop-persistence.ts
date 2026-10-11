import type { GeneratedShop, SavedShopRecord } from "@/lib/shop-schema"

// Les appels à /api/shops, partagés par le générateur de magasins et les PNJs (« Lier un magasin »).

export async function persistShops(action: "replace" | "replace-latest" | "save" | "add-to-campaign" | "remove-from-campaign" | "link-npc" | "delete", pageLinked: string, shops: GeneratedShop[], npcId = "") {
  const response = await fetch("/api/shops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, pageLinked, shops, npcId }) })
  const payload = (await response.json()) as { shops?: SavedShopRecord[]; error?: string }
  if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
  return payload.shops || []
}

export async function fetchPersistedShops<T extends GeneratedShop = SavedShopRecord>(pageLinked: string, options: { latest?: boolean; inCampaign?: boolean } = {}): Promise<T[]> {
  const parameters = new URLSearchParams({ pageLinked })
  if (options.latest) parameters.set("view", "latest")
  if (options.inCampaign) parameters.set("inCampaign", "1")
  const response = await fetch(`/api/shops?${parameters.toString()}`, { cache: "no-store" })
  const payload = (await response.json()) as { shops?: T[]; error?: string }
  if (!response.ok) throw new Error(payload.error || "Relecture des magasins impossible.")
  return payload.shops || []
}
