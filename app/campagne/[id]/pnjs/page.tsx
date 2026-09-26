import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { NpcManager } from "@/components/eraser/npc-manager"
import { getCampaignDashboard, listAllCampaignsForAdmin, listCampaignsForMj, listNpcs } from "@/lib/google-sheets"
import { npcIndexTabs } from "@/lib/npc-pages"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function CampaignNpcsData({ campaignId, accountUid, isAdmin }: { campaignId: string; accountUid: string; isAdmin: boolean }) {
  const [npcs, campaigns] = await Promise.all([
    listNpcs(campaignId),
    isAdmin ? listAllCampaignsForAdmin() : listCampaignsForMj(accountUid),
  ])
  const sourcePages = [...npcIndexTabs.map((tab) => ({ id: tab.id, name: `PNJs · ${tab.label}` })), { id: "bac-a-sable", name: "Bac à sable" }, ...campaigns.filter((item) => item.id !== campaignId).map((item) => ({ id: item.id, name: item.name }))]
  return <NpcManager initialNpcs={npcs} pageLinked={campaignId} sourcePages={sourcePages} />
}

export default async function CampaignNpcsPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/connexion")

  const { id } = await params
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  if (!campaign) notFound()
  return (
    <AuthenticatedShell pageLabel={`${campaign.name} / PNJs`}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{campaign.name}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">PNJs</h1>
        <Suspense fallback={<DeferredContentLoading label="Chargement des PNJs…" />}>
          <CampaignNpcsData campaignId={campaign.id} accountUid={account.uid} isAdmin={account.role === "admin"} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
