import { listAllCampaignsForAdmin, listCampaignsForMj } from "@/lib/google-sheets"
import type { AuthorizedUser } from "@/lib/server-auth"

/** Un MJ ou un administrateur : il mène des campagnes (et a un bac à sable). */
export function managesCampaigns(account: AuthorizedUser) {
  return account.role === "admin" || account.role === "mj"
}

/**
 * Les pages qu'un MJ mène : le bac à sable, puis ses campagnes (toutes pour un administrateur).
 * Rien pour un joueur. Le chat en fait ses canaux, le don d'items ses destinations.
 */
export async function listManagedPages(account: AuthorizedUser): Promise<Array<{ id: string; name: string }>> {
  if (!managesCampaigns(account)) return []
  const campaigns = account.role === "admin" ? await listAllCampaignsForAdmin() : await listCampaignsForMj(account.uid)
  return [{ id: "bac-a-sable", name: "Bac à sable" }, ...campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))]
}
