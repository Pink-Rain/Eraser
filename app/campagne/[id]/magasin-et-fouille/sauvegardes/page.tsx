import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { BackToShopGenerator, SavedShopCollection } from "@/components/eraser/shop-generator"
import { getCampaignDashboard, getCampaignForPlayer, listCampaignNpcs, listSavedShops } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { loadShopGeneratorItems } from "@/lib/shop-schema"

export const dynamic = "force-dynamic"

async function SavedCampaignShopsData({ campaignId, shopId, canManage }: { campaignId: string; shopId: string; canManage: boolean }) {
  const [shops, npcs, items] = await Promise.all([
    listSavedShops(campaignId),
    listCampaignNpcs(campaignId),
    canManage ? loadShopGeneratorItems().catch(() => []) : Promise.resolve([]),
  ])
  return <SavedShopCollection initialShops={shopId ? shops.filter((shop) => shop.id === shopId) : shops} pageLinked={campaignId} npcs={npcs} generatorItems={canManage ? items : []} mode={canManage ? "saved" : "view"} />
}

export default async function SavedCampaignShopsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ shop?: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")

  const [{ id }, query] = await Promise.all([params, searchParams])
  const canManage = account.role === "admin" || account.role === "mj"
  const campaign = await (account.role === "joueur" ? getCampaignForPlayer(account.uid, id) : getCampaignDashboard(account.role === "admin" ? null : account.uid, id)).catch(() => null)
  if (!campaign) notFound()

  const generatorHref = `/campagne/${encodeURIComponent(campaign.id)}/magasin-et-fouille`

  return (
    <AuthenticatedShell pageLabel={`${campaign.name} / Magasins sauvegardés`}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        {canManage && <BackToShopGenerator href={generatorHref} />}
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{campaign.name}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Magasins sauvegardés</h1>
        <div className="mt-7">
          <Suspense fallback={<DeferredContentLoading className="mt-0" label="Chargement des magasins sauvegardés…" />}>
          <SavedCampaignShopsData campaignId={campaign.id} shopId={query.shop || ""} canManage={canManage} />
          </Suspense>
        </div>
      </div>
    </AuthenticatedShell>
  )
}
