import { getCampaignDashboard } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

/** Seuls le MJ de la campagne et les administrateurs préparent ses sessions. */
export async function sessionManager(campaignId: string) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return null
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, campaignId).catch(() => null)
  return campaign ? { account, campaign } : null
}
