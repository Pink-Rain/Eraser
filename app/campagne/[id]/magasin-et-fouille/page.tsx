import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { ShopGenerator } from "@/components/eraser/shop-generator"
import { getCampaignDashboard, listAllCampaignsForAdmin, listCampaignNpcs, listCampaignsForMj } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { loadShopGeneratorItems, type ShopGeneratorItem } from "@/lib/shop-schema"

export const dynamic = "force-dynamic"

async function CampaignShopsData({ campaignId, accountUid, isAdmin }: { campaignId: string; accountUid: string; isAdmin: boolean }) {
  let items: ShopGeneratorItem[] = []
  let loadError = ""
  const [loadedItems, npcs, campaigns] = await Promise.all([
    loadShopGeneratorItems().catch(() => null),
    listCampaignNpcs(campaignId),
    isAdmin ? listAllCampaignsForAdmin() : listCampaignsForMj(accountUid),
  ])
  if (loadedItems) items = loadedItems
  else loadError = "Les index d’objets n’ont pas pu être chargés. Réessaie dans un instant."
  const baseHref = `/campagne/${encodeURIComponent(campaignId)}/magasin-et-fouille`
  const sourcePages = [{ id: "bac-a-sable", name: "Bac à sable" }, ...campaigns.filter((item) => item.id !== campaignId).map((item) => ({ id: item.id, name: item.name }))]
  return (
    <ShopGenerator
      items={items}
      loadError={loadError}
      pageLinked={campaignId}
      campaignId={campaignId}
      savedHref={`${baseHref}/sauvegardes`}
      npcs={npcs}
      sourcePages={sourcePages}
    />
  )
}

export default async function CampaignShopsPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/connexion")

  const { id } = await params
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  if (!campaign) notFound()

  return (
    <AuthenticatedShell pageLabel={`${campaign.name} / Magasin et Fouille`}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{campaign.name}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Magasin et Fouille</h1>
        <Suspense fallback={<DeferredContentLoading label="Chargement du générateur…" />}>
          <CampaignShopsData campaignId={campaign.id} accountUid={account.uid} isAdmin={account.role === "admin"} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
