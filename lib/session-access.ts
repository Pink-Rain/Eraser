import { getCampaignDashboard, getCampaignForPlayer } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

/** Seuls le MJ de la campagne et les administrateurs préparent ses sessions. */
export async function sessionManager(campaignId: string) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return null
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, campaignId).catch(() => null)
  return campaign ? { account, campaign } : null
}

/**
 * Qui lit le journal d'une campagne : ses joueurs, son MJ et les administrateurs (un MJ qui
 * ne la mène pas la lit comme un joueur s'il y joue). `manager` : MJ de la campagne ou admin.
 */
export async function campaignReader(campaignId: string) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return null
  if (account.role !== "joueur") {
    const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, campaignId).catch(() => null)
    if (campaign) return { account, campaign: { id: campaign.id, name: campaign.name, accentColor: campaign.accentColor || "" }, manager: true }
  }
  const played = await getCampaignForPlayer(account.uid, campaignId).catch(() => null)
  if (played) return { account, campaign: { id: played.id, name: played.name, accentColor: played.accentColor || "" }, manager: false }
  // Comme l'ancienne page Journal : un MJ qui ne mène pas la campagne la lit, sans droits de MJ.
  const read = account.role === "mj" ? await getCampaignDashboard(null, campaignId).catch(() => null) : null
  return read ? { account, campaign: { id: read.id, name: read.name, accentColor: read.accentColor || "" }, manager: false } : null
}
