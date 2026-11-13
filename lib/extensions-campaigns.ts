/**
 * Les campagnes, pour la partie serveur d'une extension (API 6, `eraser.campaigns`) : celles que
 * le compte mène, et ce qu'il peut faire dans une campagne. Une extension y range ce qui
 * appartient à une campagne (le carnet du MJ…) : ses données suivent la campagne, pas le compte,
 * et tous ceux qui la mènent (son MJ, les administrateurs) les retrouvent.
 *
 * Mêmes règles que les pages d'Eraser (lib/session-access.ts) : `manager` est vrai pour le MJ de
 * la campagne et les administrateurs ; un joueur de la campagne, ou un MJ qui ne la mène pas, la
 * lit sans la mener.
 */
import { getCampaignDashboard, getCampaignForPlayer, listAllCampaignsForAdmin, listCampaignsForMj } from "@/lib/google-sheets"

export type ExtensionCampaign = { id: string; name: string; accentColor: string; manager: boolean }
type Account = { uid: string; role: string }

const shown = (campaign: { id: string; name: string; accentColor?: string | null }, manager: boolean): ExtensionCampaign => ({ id: campaign.id, name: campaign.name, accentColor: campaign.accentColor || "", manager })

/** Les campagnes que ce compte mène : les siennes pour un MJ, toutes pour un administrateur. */
export async function extensionManagedCampaigns(account: Account): Promise<ExtensionCampaign[]> {
  if (account.role === "admin") return (await listAllCampaignsForAdmin()).map((campaign) => shown(campaign, true))
  if (account.role === "mj") return (await listCampaignsForMj(account.uid)).map((campaign) => shown(campaign, true))
  return []
}

/** Ce compte et cette campagne : null s'il n'y a pas accès ; `manager` s'il la mène. */
export async function extensionCampaignAccess(account: Account, id: string): Promise<ExtensionCampaign | null> {
  if (!id) return null
  if (account.role === "admin" || account.role === "mj") {
    const led = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
    if (led) return shown(led, true)
  }
  const played = await getCampaignForPlayer(account.uid, id).catch(() => null)
  if (played) return shown(played, false)
  // Comme ses pages : un MJ qui ne mène pas la campagne la lit, sans la mener.
  const read = account.role === "mj" ? await getCampaignDashboard(null, id).catch(() => null) : null
  return read ? shown(read, false) : null
}
