import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CampaignDashboard } from "@/components/eraser/campaign-dashboard"
import { DeferredPageLoading } from "@/components/eraser/deferred-content-loading"
import { getCampaignDashboard, getCampaignForPlayer, listCampaignMembers, listNpcs, type CampaignRecord } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function CampaignDashboardData({
  campaign,
  canManage,
  accountUid,
  userEmail,
}: {
  campaign: CampaignRecord
  canManage: boolean
  accountUid: string
  userEmail: string
}) {
  const [members, groupNpcs] = await Promise.all([
    listCampaignMembers(campaign.id),
    listNpcs(campaign.id).then((npcs) => npcs.filter((npc) => npc.inPlayerGroup)),
  ])
  return <CampaignDashboard initialCampaign={campaign} initialMembers={members} initialGroupNpcs={groupNpcs} canManage={canManage} ownedCharacterIds={members.filter((character) => character.ownerUid === accountUid).map((character) => character.id)} userEmail={userEmail} />
}

export default async function CampaignDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")

  const { id } = await params
  const canManage = account.role === "admin" || account.role === "mj"
  const campaign = await (account.role === "joueur"
    ? getCampaignForPlayer(account.uid, id)
    : getCampaignDashboard(account.role === "admin" ? null : account.uid, id)).catch(() => null)
  if (!campaign) notFound()

  return (
    <AuthenticatedShell pageLabel={`Campagne - ${campaign.name}`}>
      <Suspense fallback={<DeferredPageLoading label="Chargement de la campagne…" />}>
        <CampaignDashboardData campaign={campaign} canManage={canManage} accountUid={account.uid} userEmail={account.email} />
      </Suspense>
    </AuthenticatedShell>
  )
}
