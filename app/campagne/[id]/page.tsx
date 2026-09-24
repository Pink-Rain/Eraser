import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CampaignDashboard } from "@/components/eraser/campaign-dashboard"
import { DeferredPageLoading } from "@/components/eraser/deferred-content-loading"
import { getCampaignDashboard, getCampaignForPlayer, listCampaignMembers, listNpcs, type CampaignRecord } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { identityUidsForUser } from "@/lib/identity-links"

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
  const identities = await identityUidsForUser(accountUid)
  // Les joueurs ne voient ni les notes MJ ni la note de fond du PNJ.
  const visibleNpcs = canManage ? groupNpcs : groupNpcs.map((npc) => ({ ...npc, gmNotes: "", lore: "" }))
  return <CampaignDashboard initialCampaign={campaign} initialMembers={members} initialGroupNpcs={visibleNpcs} canManage={canManage} ownedCharacterIds={members.filter((character) => identities.includes(character.ownerUid)).map((character) => character.id)} userEmail={userEmail} />
}

export default async function CampaignDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")

  const { id } = await params
  let canManage = account.role === "admin" || account.role === "mj"
  let campaign = await (account.role === "joueur"
    ? getCampaignForPlayer(account.uid, id)
    : getCampaignDashboard(account.role === "admin" ? null : account.uid, id)).catch(() => null)
  // Un MJ qui ne mène pas cette campagne (lien de l'Index des PNJs) la voit comme un
  // joueur : sans outils de MJ ni notes privées.
  if (!campaign && account.role === "mj") {
    campaign = await getCampaignDashboard(null, id).catch(() => null)
    canManage = false
  }
  if (!campaign) notFound()

  return (
    <AuthenticatedShell pageLabel={`Campagne - ${campaign.name}`}>
      <Suspense fallback={<DeferredPageLoading label="Chargement de la campagne…" />}>
        <CampaignDashboardData campaign={campaign} canManage={canManage} accountUid={account.uid} userEmail={account.email} />
      </Suspense>
    </AuthenticatedShell>
  )
}
