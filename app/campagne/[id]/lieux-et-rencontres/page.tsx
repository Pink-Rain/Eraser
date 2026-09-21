import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { NpcManager } from "@/components/eraser/npc-manager"
import { SavedShopCollection } from "@/components/eraser/shop-generator"
import { getCampaignDashboard, listNpcs, listSavedShops } from "@/lib/google-sheets"
import { loadShopGeneratorItems } from "@/lib/shop-schema"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function SessionCreatorData({ campaignId }: { campaignId: string }) {
  const [shops, npcs, generatorItems] = await Promise.all([
    listSavedShops(campaignId, true),
    listNpcs(campaignId, true),
    loadShopGeneratorItems(),
  ])
  return (
    <>
      <section className="mt-7">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Magasins</p>
        <SavedShopCollection initialShops={shops} pageLinked={campaignId} npcs={npcs} generatorItems={generatorItems} mode="locations" />
      </section>
      <section className="mt-10 border-t pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">PNJs</p>
        <NpcManager initialNpcs={npcs} pageLinked={campaignId} mode="locations" />
      </section>
    </>
  )
}

export default async function CampaignLocationsPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/connexion")

  const { id } = await params
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  if (!campaign) notFound()

  return (
    <AuthenticatedShell pageLabel={`${campaign.name} / Créateur de session`}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{campaign.name}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Créateur de session</h1>
        <Suspense fallback={<DeferredContentLoading label="Chargement du créateur de session…" />}>
          <SessionCreatorData campaignId={campaign.id} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
