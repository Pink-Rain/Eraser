import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { SearchGenerator } from "@/components/eraser/search-generator"
import { getCampaignDashboard } from "@/lib/google-sheets"
import { readSearchDraws } from "@/lib/search-draws-store"
import { authorizedAccount } from "@/lib/server-auth"
import { loadShopGeneratorItems } from "@/lib/shop-schema"

export const dynamic = "force-dynamic"

async function CampaignSearchData({ campaignId }: { campaignId: string }) {
  const [items, draws] = await Promise.all([
    loadShopGeneratorItems().catch(() => null),
    readSearchDraws(campaignId).catch(() => []),
  ])
  return <SearchGenerator
    campaignId={campaignId}
    items={items ?? []}
    initialDraws={draws}
    loadError={items ? "" : "Les index d’objets n’ont pas pu être chargés. Réessaie dans un instant."}
  />
}

export default async function CampaignSearchPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/connexion")

  const { id } = await params
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  if (!campaign) notFound()

  return (
    <AuthenticatedShell pageLabel={`${campaign.name} / Fouilles`}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{campaign.name}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Fouilles</h1>
        <Suspense fallback={<DeferredContentLoading label="Chargement des objets…" />}>
          <CampaignSearchData campaignId={campaign.id} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
