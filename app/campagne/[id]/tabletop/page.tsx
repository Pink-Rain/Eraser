import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { TabletopWorkspace } from "@/components/eraser/tabletop-workspace-v2"
import { getCampaignDashboard, getCampaignForPlayer } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function CampaignTabletopPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ map?: string; room?: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const [{ id }, query] = await Promise.all([params, searchParams])
  const campaign = await (account.role === "joueur" ? getCampaignForPlayer(account.uid, id) : getCampaignDashboard(account.role === "admin" ? null : account.uid, id)).catch(() => null)
  if (!campaign) notFound()
  const canManage = account.role === "admin" || account.role === "mj"
  return <AuthenticatedShell pageLabel={`${campaign.name} / Tabletop`}><TabletopWorkspace canManage={canManage} pageLinked={id} pageName={campaign.name} roomKey={query.room || ""} requestedMapId={query.map || ""} user={{ uid: account.uid, role: account.role }} /></AuthenticatedShell>
}
